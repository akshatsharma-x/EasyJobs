/**
 * Maps STRUCTURED ATS labels (employment type, workplace type, experience level) to contract enums.
 * These become RawJob hints, which the normalizer trusts over its own keyword detection — so every
 * mapping here is conservative: ambiguous labels return undefined and leave the decision to the normalizer.
 */
import type { ExperienceLevel, JobType, WorkMode } from "@easyjobs/contract";
import { clean } from "./text";

/** "1-In Office" / "3CF-Customer Facing Remote" (Greenhouse select options) → "In Office"; "0-2 years" is kept. */
export function stripOptionPrefix(value: string): string {
  return value.replace(/^\s*\d+[A-Z]{0,3}\s*[-–.)]\s*(?=[A-Za-z])/, "");
}

const norm = (value: unknown): string | null => {
  const s = clean(value);
  if (!s) return null;
  return stripOptionPrefix(s)
    .replace(/([a-z])([A-Z])/g, "$1 $2") // FullTime → Full Time
    .toLowerCase()
    .replace(/[_\-/|,+&()]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
};

const JOB_TYPE_RULES: [JobType, RegExp][] = [
  ["internship", /\b(intern|interns|internship|internships|stagiaire|praktikum|praktikant|co op|coop|summer analyst)\b/],
  ["apprenticeship", /\b(apprentice|apprenticeship|ausbildung|azubi)\b/],
  ["freelance", /\b(freelance|freelancer|freelancing)\b/],
  ["temporary", /\b(temp|temporary|seasonal|casual|short term|interim)\b/],
  ["contract", /\b(contract|contractor|contractual|fixed term|fixedterm|befristet|consultant|third party)\b/],
  ["part_time", /\b(part time|parttime|teilzeit|half time)\b/],
  ["full_time", /\b(full time|fulltime|permanent|on roll|onroll|vollzeit|unbefristet)\b/],
];

/** Weak full-time signals, used only when nothing else matched ("Part-time Employee" stays part-time). */
const WEAK_FULL_TIME = /\b(employee|employed|salaried|regular|standard employment)\b/;

/**
 * Employment-type label → JobType. Precedence: internship > apprenticeship > freelance > temporary > contract
 * > part-time > full-time. "Full-time / Part-time" style labels are ambiguous → undefined.
 */
export function jobTypeFromLabel(value: unknown): JobType | undefined {
  const s = norm(value);
  if (!s) return undefined;
  const found = JOB_TYPE_RULES.filter(([, re]) => re.test(s)).map(([type]) => type);
  if (found.length === 0) return WEAK_FULL_TIME.test(s) ? "full_time" : undefined;
  if (found.length === 2 && found.includes("part_time") && found.includes("full_time")) return undefined;
  return found[0];
}

/**
 * Workplace label(s) → WorkMode. Several values (Greenhouse multi-selects such as
 * ["In Office", "Flexible", "Fully Remote"]) resolve to the most flexible option offered.
 */
export function workModeFromLabel(value: unknown): WorkMode | undefined {
  const values = Array.isArray(value) ? value : [value];
  let best: WorkMode | undefined;
  const rank: Record<WorkMode, number> = { onsite: 1, hybrid: 2, remote: 3 };
  for (const v of values) {
    const s = norm(v);
    if (!s) continue;
    let mode: WorkMode | undefined;
    if (/\b(remote|remotely|telecommute|telecommuting|wfh|work from home|home based|home office|anywhere|distributed|virtual)\b/.test(s) && !/\bnot remote\b|\bno remote\b|\bnon remote\b/.test(s)) mode = "remote";
    else if (/\b(hybrid|flexible|flex)\b/.test(s)) mode = "hybrid";
    else if (/\b(on site|onsite|in office|office based|in person|office|on premises?)\b/.test(s)) mode = "onsite";
    if (mode && (!best || rank[mode] > rank[best])) best = mode;
  }
  return best;
}

/** Labels that span two contract levels (LinkedIn-style "Mid-Senior level", Recruitee "experienced"). */
const BROAD_LEVEL = /\b(mid senior|mid to senior|experienced)\b/;

/** Title words that the normalizer uses to pick senior/lead/executive (or intern/entry) itself. */
const TITLE_SENIORITY =
  /\b(senior|sr|staff|principal|lead|head|director|vp|vice president|chief|cxo|cto|ceo|cfo|coo|manager|architect|distinguished|fellow|intern|internship|junior|jr|associate|graduate|trainee|fresher|entry|apprentice)\b/i;

/**
 * Structured experience label → ExperienceLevel.
 * Broad labels ("Mid-Senior level", "Experienced") only yield "mid" when the title has no seniority words —
 * otherwise the hint would override a "Senior Staff Engineer" title. `title` may be omitted.
 */
export function levelFromLabel(value: unknown, title?: string | null): ExperienceLevel | undefined {
  const s = norm(value);
  if (!s) return undefined;
  if (/\b(not applicable|n a|none|other|any|all levels|unspecified)\b/.test(s) && s.split(" ").length <= 3) return undefined;
  if (/\b(intern|internship|student|students|working student|werkstudent|praktikum)\b/.test(s)) return "intern";
  if (/\b(new grad|new graduate|graduate|fresher|freshers|campus|university|early career|school leaver)\b/.test(s)) return "fresher";
  if (/\b(executive|director|vice president|vp|svp|evp|head|chief|c level|cxo|president|partner)\b/.test(s)) return "executive";
  if (/\b(manager|management|supervisor|lead|staff|principal|architect|team lead)\b/.test(s)) return "lead";
  if (/\b(senior|sr)\b/.test(s) && !BROAD_LEVEL.test(s)) return "senior";
  if (BROAD_LEVEL.test(s)) return title && TITLE_SENIORITY.test(title) ? undefined : "mid";
  if (/\b(mid|mid level|intermediate)\b/.test(s)) return "mid";
  if (/\b(entry|entry level|junior|jr|associate|beginner)\b/.test(s)) return "entry";
  return undefined;
}

/** Personio-style experience buckets: "lt-1", "1-2", "2-5", "ht-15". */
export function yearsFromBucket(value: unknown): { min: number | null; max: number | null; label: string } | null {
  const s = clean(value)?.toLowerCase();
  if (!s) return null;
  let m = /^lt[-_ ]?(\d+)$/.exec(s);
  if (m) return { min: 0, max: Number(m[1]), label: `less than ${m[1]} year${m[1] === "1" ? "" : "s"}` };
  m = /^(?:ht|gt)[-_ ]?(\d+)$/.exec(s);
  if (m) return { min: Number(m[1]), max: null, label: `${m[1]}+ years` };
  m = /^(\d+)\s*[-–_]\s*(\d+)$/.exec(s);
  if (m) return { min: Number(m[1]), max: Number(m[2]), label: `${m[1]}-${m[2]} years` };
  return null;
}
