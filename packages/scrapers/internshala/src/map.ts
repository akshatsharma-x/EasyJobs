import type { ExperienceLevel, JobType, RawJob, Salary, WorkMode } from "@easyjobs/contract";
import { parseDurationMonths, parseIstDateTime, parseShortDate, resolvePostedAt, urlTimestampMs } from "./parse/dates";
import { cleanFragment } from "./parse/html";
import { parsePay, parsePpoAmount, type ParsedPay } from "./parse/money";
import { cleanText, companyDomainFromUrl, escapeHtml, stripListNumber, uniqueCi } from "./parse/text";
import type { DetailPage, DetailSection, InternshalaKind, ListingCard } from "./types";

export interface MapOptions {
  /** Scraper id → RawJob.source. */
  source: string;
  now: Date;
  /** Listing feed the card came from ("main", "wfh", "women", "fresher"). */
  feed: string;
  /** Tags implied by the feed — e.g. ["women"] for the …-for-women listings. */
  feedTags?: readonly string[];
  /** ctx.isKnown() said the job is already stored (light record: no description). */
  known?: boolean;
}

/** WFH postings are open to candidates across India (JSON-LD applicantLocationRequirements = IN). */
export const REMOTE_INDIA = "Remote - India";

export interface ExperienceInfo {
  min: number | null;
  max: number | null;
  level: ExperienceLevel | undefined;
}

/**
 * Internshala job experience → years + level.
 * "No experience required" / "Fresher Job" → 0 (fresher) · "1 year(s)" → min 1 (entry) · "2 year(s)"…"4" → mid ·
 * "5"…"7" → senior · 8+ → lead. Internshala states a minimum only, so `max` stays null (open-ended).
 */
export function parseJobExperience(text: string | null | undefined, monthsOfExperience?: number | null, fresherLabel = false): ExperienceInfo {
  const t = cleanText(text).toLowerCase();
  let min: number | null = null;
  let max: number | null = null;
  if (/no experience|fresher/.test(t)) min = 0;
  else {
    const range = t.match(/(\d+(?:\.\d+)?)\s*(?:-|–|to)\s*(\d+(?:\.\d+)?)\s*(?:year|yr)/);
    const single = t.match(/(\d+(?:\.\d+)?)\s*\+?\s*(?:year|yr)/);
    if (range) {
      min = Number(range[1]);
      max = Number(range[2]);
    } else if (single) {
      min = Number(single[1]);
    }
  }
  if (min === null && typeof monthsOfExperience === "number" && monthsOfExperience >= 0) {
    min = Math.round((monthsOfExperience / 12) * 10) / 10;
  }
  if (min === null && fresherLabel) min = 0;
  let level: ExperienceLevel | undefined;
  if (min !== null) level = min < 1 ? "fresher" : min < 2 ? "entry" : min < 5 ? "mid" : min < 8 ? "senior" : "lead";
  return { min, max, level };
}

function jobTypeFor(kind: InternshalaKind, partTime: boolean, ldEmploymentType: string | null): JobType {
  if (kind === "internship") return "internship";
  const ld = (ldEmploymentType ?? "").toUpperCase();
  if (partTime || (/PART_TIME/.test(ld) && !/FULL_TIME/.test(ld))) return "part_time";
  if (/CONTRACT/.test(ld)) return "contract";
  if (/TEMPORARY/.test(ld)) return "temporary";
  return "full_time";
}

/** "We are seeking a skilled IoT engin" → "We are seeking a skilled IoT…" (cards cut the preview mid-word). */
export function snippetText(snippet: string | null | undefined): string | null {
  const s = cleanText(snippet);
  if (s.length < 20) return null;
  const cut = s.replace(/\s+\S*$/, "").replace(/[\s,;:.–-]+$/, "");
  return `${cut || s}…`;
}

/** Salary from the JSON-LD `baseSalary` — used only when the displayed text could not be read. */
function salaryFromLd(d: DetailPage | null, raw: string | null): Salary | null {
  const b = d?.jsonLd?.baseSalary;
  if (!b || (b.min === null && b.max === null)) return null;
  const unit = (b.unit ?? "").toUpperCase();
  const perWeek = unit === "WEEK";
  const period: Salary["period"] | null = unit === "MONTH" || perWeek ? "month" : unit === "YEAR" ? "year" : unit === "HOUR" ? "hour" : null;
  if (!period) return null;
  const k = perWeek ? 52 / 12 : 1;
  const conv = (n: number | null): number | null => (n === null ? null : Math.round(n * k));
  return { min: conv(b.min ?? b.max), max: conv(b.max ?? b.min), currency: b.currency ?? "INR", period, raw };
}

function ctcBreakup(lines: string[]): { label: string; amount: string }[] {
  return lines
    .map((l) => stripListNumber(l))
    .map((l) => l.match(/^([^:]{2,40}):\s*(.+)$/))
    .filter((m): m is RegExpMatchArray => m !== null && !/^annual ctc$/i.test(cleanText(m[1])))
    .map((m) => ({ label: cleanText(m[1]), amount: cleanText(m[2]) }))
    .filter((x) => x.amount.length > 0);
}

/**
 * International postings carry the employer location in the company name: "Peroptyx (Castlebar, Ireland)".
 * Only a trailing "(…, …)" on an International posting is split off, so names like "Acme (OPC) Pvt Ltd" survive.
 */
export function splitCompanyName(name: string, international: boolean): { company: string; companyLocation: string | null } {
  const m = international ? name.match(/^(.+?)\s*\(([^()]+,[^()]+)\)\s*$/) : null;
  return m?.[1] && m[2] ? { company: cleanText(m[1]), companyLocation: cleanText(m[2]) } : { company: name, companyLocation: null };
}

/** Drop null/undefined/empty values so `extra` stays compact. */
function compact(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === null || v === undefined || v === "" || v === false) continue;
    if (Array.isArray(v) && v.length === 0) continue;
    out[k] = v;
  }
  return out;
}

const listHtml = (items: string[], ordered = false): string =>
  items.length === 0 ? "" : `<${ordered ? "ol" : "ul"}>${items.map((i) => `<li>${escapeHtml(i)}</li>`).join("")}</${ordered ? "ol" : "ul"}>`;

function sectionBody(s: DetailSection, d: DetailPage): string {
  switch (s.kind) {
    case "skills":
    case "perks":
      return s.items.length > 0 ? listHtml(s.items) : s.html;
    case "who_can_apply": {
      const items = d.whoCanApply.length > 0 ? d.whoCanApply : s.items;
      return items.length > 0 ? `<p>Only those candidates can apply who:</p>${listHtml(items, true)}` : s.html;
    }
    case "other_requirements":
    case "additional":
    case "rewards":
      return s.items.length > 1 ? listHtml(s.items, true) : s.html;
    case "salary": {
      const lines = d.salaryLines.length > 0 ? d.salaryLines : s.items;
      const head = lines.filter((l) => !/^\d{1,2}\s*[.)]/.test(l));
      const breakup = lines.filter((l) => /^\d{1,2}\s*[.)]/.test(l)).map(stripListNumber);
      const probation = d.probation
        ? `<p>Probation: ${escapeHtml([d.probation.duration, d.probation.salary && `${d.probation.salary} during probation`].filter(Boolean).join(" · "))}</p>`
        : "";
      const body = head.map((l) => `<p>${escapeHtml(l)}</p>`).join("") + listHtml(breakup) + probation;
      return body || s.html;
    }
    case "openings":
      return d.openings !== null ? `<p>${d.openings}</p>` : s.html;
    case "company": {
      const link = d.companyWebsite ? `<p><a href="${escapeHtml(d.companyWebsite)}">${escapeHtml(d.companyWebsite)}</a></p>` : "";
      return s.html + link;
    }
    default:
      return s.html;
  }
}

/** Turn the JSON-LD description ("<p>About the internship:</p>…") into headed HTML — fallback when the page markup is unusable. */
function ldDescriptionHtml(html: string | null): string {
  if (!html) return "";
  const headed = html
    .replace(/<p>\s*(?:Deadline)\s*:\s*<\/p>[^<]*/gi, "")
    .replace(/<p>\s*([^<]{2,60}?)\s*:\s*<\/p>/g, (_m, h: string) => `<h3>${escapeHtml(cleanText(h))}</h3>`)
    .replace(/INR₹/g, "₹");
  return cleanFragment(headed);
}

/** descriptionHtml from the detail page: its own sections in page order, then a short "Details" list. */
export function buildDescriptionHtml(card: ListingCard, d: DetailPage, pay: ParsedPay): string | null {
  const parts: string[] = [];
  for (const s of d.sections) {
    const body = sectionBody(s, d);
    if (body) parts.push(`<h3>${escapeHtml(s.heading)}</h3>${body}`);
  }
  if (parts.length === 0) {
    const fallback = ldDescriptionHtml(d.jsonLd?.descriptionHtml ?? null);
    if (fallback) parts.push(fallback);
  }
  const kind = d.kind ?? card.kind;
  const facts: [string, string | null][] = [
    ["Start date", d.startDateText],
    ["Duration", d.durationText ?? card.durationText],
    [kind === "job" ? "CTC (annual)" : "Stipend", pay.raw],
    ["Experience", kind === "job" ? (d.experienceText ?? card.experienceText) : null],
    ["Apply by", d.applyByText],
  ];
  const factItems = facts.filter((f): f is [string, string] => !!f[1]);
  if (factItems.length > 0) {
    parts.push(`<h3>Details</h3><ul>${factItems.map(([k, v]) => `<li><strong>${k}:</strong> ${escapeHtml(v)}</li>`).join("")}</ul>`);
  }
  return parts.length > 0 ? parts.join("\n") : null;
}

/**
 * Map a listing card (+ its detail page, when fetched) to a contract RawJob.
 * The same card always yields the same light fields, so light re-sightings never contradict a full record.
 */
export function toRawJob(card: ListingCard, detail: DetailPage | null, opts: MapOptions): RawJob {
  const d = detail;
  const ld = d?.jsonLd ?? null;
  const kind = card.kind;
  const labels = uniqueCi([...card.labels, ...(d?.labels ?? [])]);
  const isWfh = card.isWfh || (d?.isWfh ?? false);
  const isHybrid = !isWfh && (card.isHybrid || (d?.isHybrid ?? false));
  const partTime = labels.some((l) => /^part[\s-]?time$/i.test(l)) || /\bPART_TIME\b/.test(ld?.employmentType ?? "");
  const fresherLabel = labels.some((l) => /^fresher job$/i.test(l));
  const international = labels.some((l) => /^international$/i.test(l));

  const durationText = d?.durationText ?? card.durationText;
  const durationMonths = kind === "internship" ? parseDurationMonths(durationText) : null;
  const pay = parsePay(d?.salaryText ?? card.salaryText, { defaultPeriod: kind === "job" ? "year" : "month", durationMonths });
  const salary = pay.salary ?? (pay.kind === "unknown" ? salaryFromLd(d, pay.raw) : null);

  const experienceText = kind === "job" ? (d?.experienceText ?? card.experienceText) : null;
  const exp = kind === "job" ? parseJobExperience(experienceText, ld?.monthsOfExperience, fresherLabel) : null;
  const level: ExperienceLevel | undefined = kind === "internship" ? "intern" : exp?.level;

  const posted = resolvePostedAt({
    label: card.postedText ?? d?.postedText ?? null,
    urlTsMs: urlTimestampMs(card.path, opts.now),
    datePosted: ld?.datePosted ?? null,
    now: opts.now,
  });

  const cityLocations = (card.locations.length > 0 ? card.locations : (d?.locations ?? [])).filter(
    (l) => !/^(work from home|wfh|remote)$/i.test(l),
  );
  const locations = isWfh ? [REMOTE_INDIA] : uniqueCi(cityLocations);
  const workMode: WorkMode = isWfh ? "remote" : isHybrid ? "hybrid" : "onsite";

  const tags = new Set<string>();
  if (isWfh) tags.add("wfh");
  if ((opts.feedTags ?? []).includes("women") || d?.womenCanApply) tags.add("women");
  if (partTime) tags.add("part-time");
  if (card.ppoText || labels.some((l) => /job offer/i.test(l))) tags.add("ppo");
  if (pay.kind === "unpaid") tags.add("unpaid");

  const companyDomain = d ? (companyDomainFromUrl(d.companyWebsite) ?? companyDomainFromUrl(ld?.organization.sameAs)) : null;
  const logo = card.logoUrl ?? d?.logoUrl ?? null;
  const validThrough = d ? (parseIstDateTime(ld?.validThrough) ?? parseShortDate(d.applyByText)) : null;
  const employmentTypeRaw = [
    kind === "internship" ? "Internship" : fresherLabel ? "Fresher job" : "Job",
    partTime ? "Part time" : "Full time",
    isWfh ? "Work from home" : isHybrid ? "Hybrid" : "In-office",
  ].join(", ");

  const { company, companyLocation } = splitCompanyName(card.company || d?.company || "", international);

  const job: RawJob = {
    source: opts.source,
    sourceKind: "job_board",
    sourceJobId: card.id,
    sourceUrl: card.url,
    target: null,
    // Applications happen on Internshala itself, so the detail page is the apply link.
    applyUrl: card.url,
    title: card.title || d?.title || cleanText(ld?.title?.replace(/\s+-\s+(internship|job)\b.*$/i, "")),
    company,
    locations,
    descriptionHtml: d ? buildDescriptionHtml(card, d, pay) : null,
    postedAt: posted.iso,
    companyLogoUrl: logo,
    employmentTypeRaw,
    jobType: jobTypeFor(kind, partTime, ld?.employmentType ?? null),
    workMode,
    isRemote: isWfh,
    salary,
    skills: uniqueCi([...card.skills, ...(d?.skills ?? [])]),
    tags: [...tags],
  };
  if (level) job.experienceLevel = level;
  if (pay.raw) job.salaryRaw = pay.raw;
  if (experienceText) job.experienceRaw = experienceText;
  if (exp && exp.min !== null) {
    job.experienceMin = exp.min;
    job.experienceMax = exp.max;
  }
  if (companyDomain) job.companyDomain = companyDomain;
  if (validThrough) job.validThrough = validThrough;
  if (ld?.occupationalCategory) job.department = ld.occupationalCategory;
  // Light record for a job we could not open: the card preview beats an empty description. Never sent for
  // known jobs, so a stored full description is not replaced by the preview.
  if (!d && !opts.known) {
    const text = snippetText(card.snippet);
    if (text) job.descriptionText = text;
  }

  job.extra = compact({
    internshalaId: card.id,
    employmentType: kind,
    feed: opts.feed,
    detail: d !== null,
    pinned: card.pinned,
    activelyHiring: card.activelyHiring || (d?.activelyHiring ?? false),
    earlyApplicant: card.earlyApplicant || (d?.earlyApplicant ?? false),
    postedLabel: card.postedText ?? d?.postedText ?? null,
    postedBasis: posted.basis,
    labels,
    partTime,
    international,
    companyLocation,
    hybridNote: isHybrid ? (card.hybridNote ?? d?.hybridNote ?? null) : null,
    duration: durationText,
    durationMonths,
    startDate: d?.startDateText ?? null,
    startsImmediately: d?.startDateText ? /immediate/i.test(d.startDateText) : null,
    applyBy: d?.applyByText ?? null,
    payKind: pay.kind,
    payPeriod: pay.sourcePeriod,
    incentives: pay.incentives,
    ppo: card.ppoText,
    ppoInrYearly: parsePpoAmount(card.ppoText),
    openings: d?.openings ?? null,
    applicants: d?.applicants ?? null,
    perks: d?.perks ?? [],
    whoCanApply: d?.whoCanApply ?? [],
    otherRequirements: d?.otherRequirements ?? [],
    ctc: kind === "job" ? (d?.salaryLines.find((l) => /annual ctc\s*:/i.test(l))?.replace(/^annual ctc\s*:\s*/i, "") ?? null) : null,
    ctcBreakup: d ? ctcBreakup(d.salaryLines) : [],
    probation: d?.probation ?? null,
    industry: ld?.industry ?? null,
    category: ld?.occupationalCategory ?? null,
    ldEmploymentType: ld?.employmentType ?? null,
    companyPageUrl: d?.companyPageUrl ?? null,
    companyActivity: d?.companyActivity ?? [],
  });
  return job;
}
