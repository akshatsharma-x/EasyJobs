import {
  slugify,
  SOURCE_KINDS,
  type CompanyTarget,
  type ExperienceLevel,
  type JobInput,
  type JobLocation,
  type JobType,
  type RawJob,
  type SourceKind,
} from "@easyjobs/contract";
import { cleanBatches, extractBatches } from "./batches";
import { categorizeDetailed } from "./category";
import { companyLogoUrl, deriveCompanyDomain, resolveCompany } from "./company";
import { cleanDegreeList, extractDegrees } from "./degrees";
import { parseExperience, type ExperienceRange } from "./experience";
import { fingerprintDetailed, sha1 } from "./fingerprint";
import { sanitizeWithText, summarize, textToHtml } from "./html";
import { detectJobTypeDetailed } from "./job-type";
import { classifyLevelDetailed, type Confidence } from "./level";
import { currencyForCountry, detectWorkMode, isLocationOnly, normalizeLocations, type NormalizedLocations } from "./locations";
import { parseDate, parsePostedAt } from "./posted-at";
import { qualityScore } from "./quality";
import { cleanSalaryHint, parseSalary, toInrYearly } from "./salary";
import { cleanSkillList, extractSkills } from "./skills";
import { detectTags } from "./tags";
import { cleanLine, asString, asStringList, isRecord, titleCase, truncateWords, uniq } from "./text";
import { cleanTitle } from "./title";
import { canonicalUrl, isJobSpecificUrl, isOfficialHost, normalizeHttpUrl, stripTracking } from "./url";

export const NORMALIZER_VERSION = "1.0.0";

export interface NormalizeOptions {
  /** Display name of the source ("CourseJoiner"); defaults to a prettified RawJob.source. */
  sourceName?: string;
  /** Registry entry for the job's company: canonical name, slug, domain and tags win over scraped values. */
  company?: CompanyTarget | null;
  /** Reference time for relative dates, recency and fallbacks (default: now). Makes output deterministic. */
  now?: Date;
}

/** Normalization metadata stored in JobInput.extra.normalize (consumed by enrichWithLLM and debugging). */
export interface NormalizeMeta {
  version: string;
  fingerprintRule: "k" | "t";
  confidence: { level: Confidence; category: Confidence };
  sources: { level: string; jobType: string; workMode: string; experience: string | null };
  /** Fields holding a default rather than evidence — the API merge should not let them overwrite stored values. */
  defaulted?: string[];
  warnings?: string[];
  llm?: { model: string; cached: boolean };
}

const KNOWN_SOURCE_NAMES: Readonly<Record<string, string>> = {
  greenhouse: "Greenhouse", lever: "Lever", ashby: "Ashby", smartrecruiters: "SmartRecruiters", workable: "Workable",
  recruitee: "Recruitee", bamboohr: "BambooHR", personio: "Personio", breezy: "Breezy HR", teamtailor: "Teamtailor",
  workday: "Workday", oracle: "Oracle Recruiting", successfactors: "SuccessFactors", eightfold: "Eightfold",
  phenom: "Phenom", icims: "iCIMS", avature: "Avature", taleo: "Taleo", coursejoiner: "CourseJoiner",
  internshala: "Internshala", linkedin: "LinkedIn", naukri: "Naukri", unstop: "Unstop", remoteok: "Remote OK",
  remotive: "Remotive", arbeitnow: "Arbeitnow", adzuna: "Adzuna", jooble: "Jooble", himalayas: "Himalayas",
  jobicy: "Jobicy", amazon: "Amazon Jobs", google: "Google Careers", microsoft: "Microsoft Careers",
  tcs: "TCS Careers", infosys: "Infosys Careers", wipro: "Wipro Careers", jsonld: "Company career site",
};

function prettySource(source: string): string {
  return KNOWN_SOURCE_NAMES[source.toLowerCase()] ?? (titleCase(source.replace(/[-_.]+/g, " ")) || "Unknown source");
}

function finiteYears(v: unknown): number | null {
  const n = typeof v === "string" && v.trim() !== "" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 50 ? Math.round(n * 10) / 10 : null;
}

function validDate(d: unknown): Date | null {
  return d instanceof Date && Number.isFinite(d.getTime()) ? d : null;
}

const LOCATION_LINE = /(?:^|\n)\s*(?:job\s+)?(?:work\s+)?locations?\s*[:\-–]\s*([^\n]{2,120})/i;

/** When the source has no location strings: try title parts ("… - Bangalore") and a "Location:" line. */
function fallbackLocations(title: string, description: string | null): NormalizedLocations | null {
  const parts = title.split(/\s+[-–—|]\s+|\s*[|(),]\s*/).map((p) => p.trim()).filter(Boolean).slice(1);
  const fromTitle = parts.filter((p) => isLocationOnly(p));
  if (fromTitle.length > 0) {
    const loc = normalizeLocations(fromTitle);
    if (loc.locations.length > 0 || loc.workMode) return loc;
  }
  if (description) {
    const m = LOCATION_LINE.exec(description.slice(0, 6000));
    if (m) {
      const loc = normalizeLocations([(m[1] as string).trim()]);
      if (loc.locations.some((l) => l.city || l.country) || loc.workMode) return loc;
    }
  }
  return null;
}

function companyTagList(company: CompanyTarget | null | undefined): string[] {
  if (!company || !Array.isArray(company.tags)) return [];
  return uniq(company.tags.filter((t): t is string => typeof t === "string" && t.trim() !== "").map((t) => t.trim()));
}

function placeholderUrl(source: string, id: string): string {
  return `https://unknown.invalid/${encodeURIComponent(source)}/${encodeURIComponent(id || "job")}`;
}

function normalizeInner(rawInput: RawJob, opts: NormalizeOptions): JobInput {
  const now = validDate(opts.now) ?? new Date();
  const r: Record<string, unknown> = isRecord(rawInput) ? (rawInput as unknown as Record<string, unknown>) : {};
  const warnings: string[] = [];
  const registry = isRecord(opts.company) ? opts.company : null;

  /* identity & links */
  const source = cleanLine(r.source).slice(0, 80) || "unknown";
  const sourceKind: SourceKind = (SOURCE_KINDS as readonly string[]).includes(asString(r.sourceKind))
    ? (r.sourceKind as SourceKind)
    : "aggregator";
  if (sourceKind !== r.sourceKind) warnings.push("sourceKind invalid → aggregator");
  const titleRaw = cleanLine(r.title).slice(0, 500);
  const companyRawLine = cleanLine(r.company).slice(0, 200);
  const sourceUrlParsed = normalizeHttpUrl(r.sourceUrl);
  const applyParsed = normalizeHttpUrl(r.applyUrl, sourceUrlParsed);
  let sourceJobId = cleanLine(r.sourceJobId).slice(0, 300);
  if (!sourceJobId) {
    sourceJobId = sha1(sourceUrlParsed ? canonicalUrl(sourceUrlParsed) : `${source}|${titleRaw}|${companyRawLine}`).slice(0, 16);
    warnings.push("sourceJobId missing → derived");
  }
  if (!sourceUrlParsed) warnings.push(applyParsed ? "sourceUrl invalid → applyUrl" : "sourceUrl invalid → placeholder");
  const sourceUrl = sourceUrlParsed ?? applyParsed ?? placeholderUrl(source, sourceJobId);
  const applyUrl = stripTracking(applyParsed ?? sourceUrl);
  const sourceName = cleanLine(opts.sourceName) || prettySource(source);

  /* company */
  const resolved = resolveCompany(companyRawLine);
  const registryName = registry ? cleanLine(registry.name) : "";
  let company = registryName || resolved.name;
  const domain = deriveCompanyDomain({
    hint: r.companyDomain,
    registry: registry?.domain ?? null,
    alias: resolved.domain,
    urls: [isOfficialHost(applyUrl) ? applyUrl : null, sourceKind === "ats" || sourceKind === "career_site" ? sourceUrl : null],
  });
  if (!company) {
    company = domain ? titleCase(domain.split(".")[0] ?? "") : "";
    if (!company) company = "Unknown company";
    warnings.push("company missing");
  }
  const companySlug =
    slugify(asString(registry?.slug)) || slugify(asString(r.companySlug)) || slugify(company) || "unknown-company";

  /* text */
  const title = cleanTitle(titleRaw, { company: [companyRawLine, resolved.name, registryName] }) || "Untitled role";
  if (!titleRaw) warnings.push("title missing");
  const rawText = asString(r.descriptionText).trim();
  const desc = sanitizeWithText(r.descriptionHtml, { baseUrl: sourceUrlParsed }) ?? (rawText ? sanitizeWithText(textToHtml(rawText)) : null);
  const descriptionHtml = desc?.html ?? null;
  const descriptionText = desc ? desc.text.slice(0, 60_000) || null : rawText ? rawText.slice(0, 60_000) : null;
  const department = cleanLine(r.department).slice(0, 120) || null;
  const rawTags = asStringList(r.tags);

  /* locations & work mode */
  const rawLocations = asStringList(r.locations).slice(0, 60);
  let loc = normalizeLocations(rawLocations);
  if (loc.locations.length === 0 && !loc.workMode) loc = fallbackLocations(titleRaw, descriptionText) ?? loc;
  const mode = detectWorkMode({
    hint: r.workMode,
    isRemoteHint: r.isRemote,
    locationWorkMode: loc.workMode,
    title: titleRaw,
    employmentTypeRaw: asString(r.employmentTypeRaw),
    tags: rawTags,
    description: descriptionText,
  });
  const locations: JobLocation[] = loc.locations;

  /* job type */
  const jt = detectJobTypeDetailed({
    hint: r.jobType,
    employmentTypeRaw: asString(r.employmentTypeRaw),
    title: titleRaw,
    description: descriptionText,
    tags: rawTags,
  });
  let jobType: JobType = jt.jobType;

  /* experience (structured hints > experienceRaw > title > description) */
  let exp: ExperienceRange | null = null;
  let experienceSource: "hint" | "raw" | "title" | "description" | null = null;
  const hintMin = finiteYears(r.experienceMin);
  const hintMax = finiteYears(r.experienceMax);
  if (hintMin !== null || hintMax !== null) {
    exp = hintMin !== null && hintMax !== null && hintMin > hintMax ? { min: hintMax, max: hintMin } : { min: hintMin, max: hintMax };
    experienceSource = "hint";
  }
  if (!exp) {
    exp = parseExperience(r.experienceRaw);
    if (exp) experienceSource = "raw";
  }
  if (!exp && /\d|fresher|experience/i.test(titleRaw)) {
    exp = parseExperience(titleRaw, { strict: false });
    // Month-only figures in titles are durations ("(6 months Contract)", "3-month internship"), not experience.
    if (exp && !/\b(?:yrs?|years?|freshers?|experience|exp)\b/i.test(titleRaw)) exp = null;
    if (exp) experienceSource = "title";
  }
  if (!exp && descriptionText) {
    exp = parseExperience(descriptionText, { strict: true });
    if (exp) experienceSource = "description";
  }

  /* batches */
  const hintBatches = cleanBatches(r.batches, { now });
  const batches = hintBatches.length > 0 ? hintBatches : extractBatches([titleRaw, asString(r.experienceRaw), descriptionText ?? ""], { now });

  /* level */
  const lv = classifyLevelDetailed({
    title: titleRaw,
    description: descriptionText,
    jobType,
    hint: r.experienceLevel,
    experienceMin: exp?.min ?? null,
    experienceMax: exp?.max ?? null,
    experienceSource,
    batches,
    tags: rawTags.map((t) => t.toLowerCase()),
    company,
  });
  const experienceLevel: ExperienceLevel = lv.level;
  if (experienceLevel === "intern" && jt.source === "default") jobType = "internship";
  let experienceMin = exp?.min ?? null;
  const experienceMax = exp?.max ?? null;
  if (experienceMin === null && (experienceLevel === "intern" || experienceLevel === "fresher")) experienceMin = 0;

  /* salary */
  const primaryCountry = locations.find((l) => l.country)?.country ?? null;
  const defaultCurrency = currencyForCountry(primaryCountry ?? "IN");
  const salary =
    cleanSalaryHint(r.salary) ??
    parseSalary(r.salaryRaw, { defaultCurrency }) ??
    (/\d/.test(titleRaw) ? parseSalary(titleRaw, { defaultCurrency, strict: true }) : null) ??
    (descriptionText ? parseSalary(descriptionText, { defaultCurrency, strict: true }) : null);
  const inr = toInrYearly(salary);

  /* skills, degrees, category */
  const hintSkills = cleanSkillList(r.skills);
  // "Postman is the world's leading API platform" must not make Postman a skill on Postman's own postings.
  const companyNames = new Set([company, resolved.name, companyRawLine].map((c) => c.toLowerCase()).filter(Boolean));
  const skills =
    hintSkills.length > 0
      ? hintSkills
      : extractSkills({ title: titleRaw, description: descriptionText, department }, 16)
          .filter((s) => !companyNames.has(s.toLowerCase()))
          .slice(0, 12);
  const hintDegrees = cleanDegreeList(r.degrees);
  const degrees: string[] = hintDegrees.length > 0 ? hintDegrees : extractDegrees([titleRaw, descriptionText ?? ""]);
  const cat = categorizeDetailed({ title, department, skills });

  /* dates */
  const postedAt = parsePostedAt(r.postedAt, now);
  const validThrough = parseDate(r.validThrough, { now });

  /* tags */
  const tags = detectTags({
    title: titleRaw,
    description: descriptionText,
    locations: rawLocations,
    hints: rawTags,
    isRemote: mode.isRemote,
    level: experienceLevel,
    sourceKind,
    applyUrl,
    officialApply: isOfficialHost(applyUrl) && isJobSpecificUrl(applyUrl),
    salaryCurrency: salary?.currency ?? null,
    salaryInrYearlyMin: inr.min,
    salaryInrYearlyMax: inr.max,
  });

  /* identity */
  const rawExtra = isRecord(r.extra) ? r.extra : {};
  const fp = fingerprintDetailed({
    applyUrl,
    companySlug,
    title,
    titleIsClean: true,
    locations,
    isRemote: mode.isRemote,
    jobType,
    applyUrlSpecific:
      typeof (r as { applyUrlSpecific?: unknown }).applyUrlSpecific === "boolean"
        ? ((r as { applyUrlSpecific?: boolean }).applyUrlSpecific ?? null)
        : typeof rawExtra.applyUrlSpecific === "boolean"
          ? rawExtra.applyUrlSpecific
          : null,
  });
  const summary = descriptionText ? summarize(descriptionText) : null;
  const score = qualityScore({
    sourceKind,
    applyUrl: applyParsed ?? (sourceUrlParsed ? sourceUrl : null),
    sourceUrl: sourceUrlParsed,
    descriptionText,
    salary,
    locations,
    isRemote: mode.isRemote,
    postedAt,
    tags,
    now,
  });

  const defaulted = [
    ...(lv.source === "default" ? ["experienceLevel"] : []),
    ...(jt.source === "default" ? ["jobType"] : []),
    ...(cat.category === "other" ? ["category"] : []),
  ];
  const meta: NormalizeMeta = {
    version: NORMALIZER_VERSION,
    fingerprintRule: fp.rule,
    confidence: { level: lv.confidence, category: cat.confidence },
    sources: { level: lv.source, jobType: jt.source, workMode: mode.source, experience: experienceSource },
    ...(defaulted.length > 0 ? { defaulted } : {}),
    ...(warnings.length > 0 ? { warnings } : {}),
  };
  // Light record (P05/P06): a re-sighting of a known job without its description. Description-derived fields
  // (level, category, skills, degrees, summary, qualityScore) are weaker than the stored ones; the API merge
  // should keep stored values for those. Marked when the scraper says so or when there is no description at all.
  const light = rawExtra.light === true || (r as { light?: unknown }).light === true || (!descriptionHtml && !descriptionText);
  const extra: Record<string, unknown> = { ...rawExtra, ...(light ? { light: true } : {}), normalize: meta };

  return {
    fingerprint: fp.fingerprint,
    source,
    sourceName,
    sourceKind,
    sourceJobId,
    sourceUrl,
    target: typeof r.target === "string" && r.target.trim() ? r.target.trim() : null,
    applyUrl,
    title,
    company: truncateWords(company, 120),
    companySlug,
    companyDomain: domain,
    companyLogoUrl: companyLogoUrl(domain, { sourceLogoUrl: asString(r.companyLogoUrl) || null }),
    companyTags: companyTagList(registry),
    locations,
    workMode: mode.workMode,
    isRemote: mode.isRemote,
    jobType,
    experienceLevel,
    experienceMin,
    experienceMax,
    batches,
    degrees,
    salary,
    salaryInrYearlyMin: inr.min,
    salaryInrYearlyMax: inr.max,
    skills,
    category: cat.category,
    department,
    descriptionHtml,
    descriptionText,
    summary,
    postedAt,
    validThrough,
    qualityScore: score,
    tags,
    extra,
  };
}

/** Last-resort output built only from trivially safe operations (used if a bug ever throws). */
function minimalJobInput(raw: unknown, opts: NormalizeOptions, error: unknown): JobInput {
  const r = isRecord(raw) ? raw : {};
  const now = validDate(opts.now) ?? new Date();
  const source = asString(r.source).trim() || "unknown";
  const id = asString(r.sourceJobId).trim() || "unknown";
  const sourceUrl = normalizeHttpUrl(r.sourceUrl) ?? placeholderUrl(source, id);
  const title = asString(r.title).trim().slice(0, 200) || "Untitled role";
  const company = asString(r.company).trim().slice(0, 120) || "Unknown company";
  return {
    fingerprint: `t:${sha1(`${source}|${id}|${title}|${company}`)}`,
    source,
    sourceName: asString(opts.sourceName).trim() || source,
    sourceKind: (SOURCE_KINDS as readonly string[]).includes(asString(r.sourceKind)) ? (r.sourceKind as SourceKind) : "aggregator",
    sourceJobId: id,
    sourceUrl,
    target: typeof r.target === "string" ? r.target : null,
    applyUrl: normalizeHttpUrl(r.applyUrl) ?? sourceUrl,
    title,
    company,
    companySlug: slugify(company) || "unknown-company",
    companyDomain: null,
    companyLogoUrl: null,
    companyTags: [],
    locations: [],
    workMode: null,
    isRemote: false,
    jobType: "full_time",
    experienceLevel: "entry",
    experienceMin: null,
    experienceMax: null,
    batches: [],
    degrees: [],
    salary: null,
    salaryInrYearlyMin: null,
    salaryInrYearlyMax: null,
    skills: [],
    category: "other",
    department: null,
    descriptionHtml: null,
    descriptionText: null,
    summary: null,
    postedAt: now.toISOString(),
    validThrough: null,
    qualityScore: 0,
    tags: [],
    extra: { normalize: { version: NORMALIZER_VERSION, error: error instanceof Error ? error.message : String(error) } },
  };
}

/**
 * RawJob → JobInput. Pure, synchronous, deterministic given `opts.now`, no network. Never throws; the output
 * always passes validateJobInput (garbage input yields placeholders and extra.normalize.warnings).
 */
export function normalizeJob(raw: RawJob, options: NormalizeOptions | null = {}): JobInput {
  const opts: NormalizeOptions = isRecord(options) ? options : {};
  try {
    return normalizeInner(raw, opts);
  } catch (error) {
    return minimalJobInput(raw, opts, error);
  }
}
