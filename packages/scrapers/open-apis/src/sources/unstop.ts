import type { JobType, RawJob, WorkMode } from "@easyjobs/contract";
import type { ScrapeContext, Scraper } from "@easyjobs/contract/node";
import { fetchJson } from "../lib/http";
import { makeSalary } from "../lib/salary";
import { cleanList, cleanText, envInt, httpUrl, isDisabledByEnv, pause, prune, reachedLimit, textOrNull, toIso, uniq } from "../lib/util";

/* ─────────── API shapes (only what we read) ─────────── */

interface UnstopCourse {
  course?: string;
  type?: string;
  passoutYear?: (number | string)[];
  specialization?: string[];
}

/** Course lists per stream; also nested under professionalEligibility / fresherEligibility. */
export interface UnstopCourseGroups {
  engineering?: (UnstopCourse | string)[];
  bSchools?: (UnstopCourse | string)[];
  arts?: (UnstopCourse | string)[];
  medicine?: (UnstopCourse | string)[];
  law?: (UnstopCourse | string)[];
}

export interface UnstopEligibility extends UnstopCourseGroups {
  sector?: string[];
  others?: string[];
  professionalEligibility?: UnstopCourseGroups | null;
  fresherEligibility?: UnstopCourseGroups | null;
  experience?: string[];
  studentPassoutYearsSelected?: (number | string)[];
  fresherPassoutYearsSelected?: (number | string)[];
}

export interface UnstopOpportunity {
  id: number;
  title?: string;
  type?: string;
  public_url?: string;
  seo_url?: string;
  short_url?: string;
  details?: string | null;
  updated_at?: string;
  approved_date?: string;
  end_date?: string | null;
  status?: string;
  tags?: unknown[];
  organisation?: { name?: string; logoUrl?: string | null; logoUrl2?: string | null } | null;
  logoUrl2?: string | null;
  filters?: { name?: string; type?: string }[];
  required_skills?: { skill_name?: string; skill?: string }[];
  workfunction?: { name?: string }[];
  locations?: { city?: string | null; state?: string | null; country?: string | null }[];
  jobDetail?: {
    min_salary?: number | null;
    max_salary?: number | null;
    currency?: string | null;
    pay_in?: string | null;
    show_salary?: number | boolean | null;
    not_disclosed?: boolean | null;
    paid_unpaid?: string | null;
    type?: string | null;
    timing?: string | null;
    min_experience?: number | string | null;
    max_experience?: number | string | null;
    locations?: string[];
  } | null;
  regnRequirements?: { eligibility?: string | null; start_regn_dt?: string; end_regn_dt?: string } | null;
}

export interface UnstopPage {
  data?: { current_page?: number; last_page?: number; total?: number; data?: UnstopOpportunity[] };
}

export type UnstopKind = "jobs" | "internships";

/* ─────────── Mapping ─────────── */

const DEGREES: Record<string, string[]> = {
  btech: ["B.E/B.Tech"], mtech: ["M.E/M.Tech"], integrated: ["B.E/B.Tech", "M.E/M.Tech"], bca: ["BCA"], mca: ["MCA"],
  mca1: ["MCA"], mcm: ["MCM"], phdEng: ["PhD"], diploma: ["Diploma"],
  mba1: ["MBA"], mba2: ["MBA"], execMba: ["Executive MBA"], pgdm: ["PGDM"], ipm: ["IPM"], bba: ["BBA"], bcom: ["B.Com"],
  mcom: ["M.Com"], bhm: ["BHM"], ca: ["CA"], cs: ["CS"], phdManagement: ["PhD"],
  bsc: ["B.Sc"], msc: ["M.Sc"], ba: ["BA"], ma: ["MA"], bdes: ["B.Des"], mdes: ["M.Des"], barch: ["B.Arch"],
  march: ["M.Arch"], bftech: ["B.FTech"], mftech: ["M.FTech"], bplan: ["B.Plan"], mplan: ["M.Plan"], bfa: ["BFA"],
  mfa: ["MFA"], bs: ["BS"], ms: ["MS"], bed: ["B.Ed"], med: ["M.Ed"], beled: ["B.El.Ed"], bped: ["B.P.Ed"], phdArts: ["PhD"],
  bPharma: ["B.Pharm"], mPharma: ["M.Pharm"], pharmaD: ["Pharm.D"], mbbs: ["MBBS"], bds: ["BDS"], mds: ["MDS"],
  bams: ["BAMS"], bhms: ["BHMS"], bums: ["BUMS"], bvsc: ["B.V.Sc"], mvsc: ["M.V.Sc"], msmd: ["MS/MD"], dm: ["DM"],
  llb: ["LLB"], llm: ["LLM"],
};

const ANY_COURSE: Record<string, string> = {
  engineering: "Any engineering course",
  bSchools: "Any management course",
  arts: "Any arts/science/commerce course",
  medicine: "Any medical course",
  law: "Any law course",
};

const COURSE_GROUPS = ["engineering", "bSchools", "arts", "medicine", "law"] as const;

/** Parses the eligibility JSON string; returns {} on bad input. */
export function parseEligibility(raw: string | null | undefined): UnstopEligibility {
  if (!raw) return {};
  try {
    const v = JSON.parse(raw) as unknown;
    return v && typeof v === "object" ? (v as UnstopEligibility) : {};
  } catch {
    return {};
  }
}

const asYear = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" && /^\d{4}$/.test(v) ? Number(v) : NaN;
  return Number.isInteger(n) && n >= 2000 && n <= 2100 ? n : null;
};

/** Every (stream, course) entry, from the top level and the nested professional/fresher blocks. */
function courseEntries(e: UnstopEligibility): { group: (typeof COURSE_GROUPS)[number]; course: UnstopCourse | string }[] {
  const out: { group: (typeof COURSE_GROUPS)[number]; course: UnstopCourse | string }[] = [];
  for (const block of [e, e.professionalEligibility, e.fresherEligibility]) {
    if (!block || typeof block !== "object") continue;
    for (const group of COURSE_GROUPS) for (const course of block[group] ?? []) if (course) out.push({ group, course });
  }
  return out;
}

const pushYears = (into: number[], values: unknown[] | undefined): void => {
  for (const v of values ?? []) {
    const y = asYear(v);
    if (y !== null) into.push(y);
  }
};

/**
 * Graduation years. Student/fresher passout picklists only count when that sector is eligible
 * (Unstop keeps stale values for de-selected sectors); per-course passout years always count.
 */
export function eligibilityBatches(e: UnstopEligibility): number[] {
  const sectors = e.sector ?? [];
  const years: number[] = [];
  if (sectors.length === 0 || sectors.includes("students")) pushYears(years, e.studentPassoutYearsSelected);
  if (sectors.length === 0 || sectors.includes("fresher")) pushYears(years, e.fresherPassoutYearsSelected);
  for (const { course } of courseEntries(e)) if (typeof course === "object") pushYears(years, course.passoutYear);
  return uniq(years).sort((a, b) => a - b);
}

/** Readable degree labels; "Any graduate" when no course restriction applies. */
export function eligibilityDegrees(e: UnstopEligibility): string[] {
  const out: string[] = [];
  const entries = courseEntries(e);
  for (const { group, course } of entries) {
    const code = typeof course === "string" ? course : course.course;
    if (!code) continue;
    if (code === "allCourses") out.push(ANY_COURSE[group] ?? "Any graduate");
    else out.push(...(DEGREES[code] ?? []));
  }
  if (entries.length === 0 && (e.others ?? []).includes("all")) out.push("Any graduate");
  return uniq(out);
}

/** Specialisations named in course eligibility ("Electrical Engineering", …). */
export function eligibilitySpecializations(e: UnstopEligibility): string[] {
  return cleanList(
    courseEntries(e).flatMap(({ course }) => (typeof course === "object" ? (course.specialization ?? []) : [])).filter((s) => s !== "all"),
    20,
  );
}

/** Years range from the experience picklist ("1 year", "3 years", …); null bounds when "all"/unknown. */
export function eligibilityExperience(e: UnstopEligibility): { min: number | null; max: number | null } {
  const years = (e.experience ?? [])
    .map((s) => /^(\d{1,2})\s*years?$/i.exec(String(s).trim()))
    .filter((m): m is RegExpExecArray => m !== null)
    .map((m) => Number(m[1]));
  if (years.length === 0) return { min: null, max: null };
  return { min: Math.min(...years), max: Math.max(...years) };
}

const WORK_MODE: Record<string, WorkMode> = { in_office: "onsite", on_field: "onsite", wfh: "remote", hybrid: "hybrid" };
const TIMING: Record<string, JobType> = { full_time: "full_time", part_time: "part_time", contractual: "contract" };

const num = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  return Number.isFinite(n) && n >= 0 ? n : null;
};

function cleanCity(city: string): string {
  return city.replace(/\s+(Urban|Rural|District)$/i, "").trim();
}

function unstopLocations(o: UnstopOpportunity, remote: boolean): string[] {
  const out = (o.locations ?? [])
    .map((l) => [cleanCity(cleanText(l.city)), cleanText(l.state), cleanText(l.country)].filter(Boolean).join(", "))
    .filter(Boolean);
  if (out.length === 0) out.push(...cleanList(o.jobDetail?.locations).map(cleanCity));
  if (remote) out.unshift("Remote (India)");
  return uniq(out);
}

/** One Unstop opportunity → RawJob (null when unusable). */
export function mapUnstopOpportunity(o: UnstopOpportunity, kind: UnstopKind, target: string | null): RawJob | null {
  const title = cleanText(o.title);
  const company = cleanText(o.organisation?.name);
  const sourceUrl = httpUrl(o.seo_url) ?? (o.public_url ? httpUrl(o.public_url, "https://unstop.com/") : null);
  if (!o.id || !title || !company || !sourceUrl) return null;

  const d = o.jobDetail ?? {};
  const e = parseEligibility(o.regnRequirements?.eligibility);
  const workMode = d.type ? WORK_MODE[d.type] : undefined;
  const remote = workMode === "remote";
  const isInternship = kind === "internships" || o.type === "internships";

  const unpaid = d.paid_unpaid === "unpaid";
  const hidden = d.not_disclosed === true || d.show_salary === 0 || d.show_salary === false;
  const salary = unpaid || hidden ? null : makeSalary({ min: d.min_salary, max: d.max_salary, currency: d.currency ?? "INR", period: d.pay_in });

  const minExp = num(d.min_experience);
  const maxExp = num(d.max_experience);
  const listed = eligibilityExperience(e);
  const expMin = minExp ?? listed.min;
  const expMax = maxExp ?? listed.max;
  const sectors = cleanList(e.sector);
  const freshersOnly = sectors.length > 0 && sectors.every((s) => s === "fresher" || s === "students");
  const filterNames = cleanList((o.filters ?? []).filter((f) => f.type === "eligible").map((f) => f.name));

  const tags: string[] = [];
  if (remote) tags.push("wfh");
  if (unpaid) tags.push("unpaid");
  if (filterNames.some((n) => /women|female/i.test(n))) tags.push("women");
  for (const t of o.tags ?? []) if (typeof t === "string" && t.trim()) tags.push(t.trim().toLowerCase());

  const expRaw =
    expMin !== null || expMax !== null
      ? `${expMin ?? 0}${expMax !== null && expMax !== expMin ? `–${expMax}` : ""} years`
      : freshersOnly
        ? "Fresher"
        : null;

  return prune<RawJob>({
    source: "unstop",
    sourceKind: "job_board",
    sourceJobId: String(o.id),
    sourceUrl,
    target,
    // Applications happen on Unstop itself; there is no external apply link in the API.
    applyUrl: sourceUrl,
    title,
    company,
    locations: unstopLocations(o, remote),
    descriptionHtml: textOrNull(o.details) ? (o.details as string) : null,
    postedAt: toIso(o.approved_date) ?? toIso(o.regnRequirements?.start_regn_dt) ?? toIso(o.updated_at),
    companyLogoUrl: httpUrl(o.organisation?.logoUrl) ?? httpUrl(o.organisation?.logoUrl2) ?? httpUrl(o.logoUrl2),
    validThrough: toIso(o.end_date) ?? toIso(o.regnRequirements?.end_regn_dt),
    department: textOrNull(o.workfunction?.[0]?.name),
    employmentTypeRaw: textOrNull([d.timing, d.type].filter(Boolean).join(", ")),
    experienceRaw: expRaw,
    salaryRaw: unpaid ? "Unpaid" : hidden ? "Not disclosed" : (salary?.raw ?? null),
    jobType: isInternship ? "internship" : d.timing ? TIMING[d.timing] : undefined,
    experienceLevel: isInternship ? "intern" : freshersOnly ? "fresher" : undefined,
    experienceMin: isInternship ? undefined : expMin,
    experienceMax: isInternship ? undefined : expMax,
    workMode,
    isRemote: remote,
    salary,
    batches: eligibilityBatches(e),
    degrees: eligibilityDegrees(e),
    skills: cleanList((o.required_skills ?? []).map((s) => s.skill_name ?? s.skill), 20),
    tags: uniq(tags),
    extra: prune({
      unstopKind: isInternship ? "internships" : "jobs",
      shortUrl: httpUrl(o.short_url) ?? undefined,
      sectors: sectors.length > 0 ? sectors : undefined,
      eligibleFor: filterNames.length > 0 ? filterNames : undefined,
      workFunctions: cleanList((o.workfunction ?? []).map((w) => w.name)),
      specializations: eligibilitySpecializations(e),
    }),
  });
}

/* ─────────── Scraper ─────────── */

const API = "https://unstop.com/api/public/opportunity/search-result";

export function unstopPageUrl(kind: UnstopKind, page: number, perPage: number): string {
  return `${API}?opportunity=${kind}&page=${page}&per_page=${perPage}&oppstatus=open`;
}

async function* scrapeUnstop(ctx: ScrapeContext): AsyncGenerator<RawJob> {
  const perPage = envInt(ctx.env, "UNSTOP_PER_PAGE", 50, 10, 50);
  const maxPages = envInt(ctx.env, "UNSTOP_MAX_PAGES", 40, 1, 200);
  const kinds: UnstopKind[] = ["internships", "jobs"];
  const seen = new Set<string>();
  let emitted = 0;
  for (const kind of kinds) {
    let target: string | null = null;
    for (let page = 1; page <= maxPages; page++) {
      if (page > 1) await pause(ctx, 1000);
      // robots.txt explicitly allows /api/public/* — keep the check on.
      const body = await fetchJson<UnstopPage>(ctx, "unstop", unstopPageUrl(kind, page, perPage));
      const items = body.data?.data ?? [];
      const lastPage = body.data?.last_page ?? page;
      // A kind is sweepable only when this run can cover every page of it.
      if (page === 1) target = lastPage <= maxPages ? `unstop:${kind}` : null;
      for (const item of items) {
        const job = mapUnstopOpportunity(item, kind, target);
        if (!job || seen.has(job.sourceJobId)) continue;
        seen.add(job.sourceJobId);
        yield job;
        if (reachedLimit(ctx, ++emitted)) return;
      }
      if (items.length === 0 || page >= lastPage) break;
    }
    ctx.log.debug(`unstop: ${kind} done`, { emitted });
  }
}

export const unstopScraper: Scraper = {
  id: "unstop",
  name: "Unstop",
  kind: "job_board",
  // ~34 requests for a full sweep of jobs + internships; the API caches for 5 min anyway.
  intervalMinutes: 120,
  isEnabled: (env) => !isDisabledByEnv(env, "unstop"),
  scrape: scrapeUnstop,
};
