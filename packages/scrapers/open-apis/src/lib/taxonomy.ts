import { EXPERIENCE_LEVELS, type ExperienceLevel, type JobType } from "@easyjobs/contract";

/** Generic employment-type strings ("Full-Time", "full_time", "Contractor", "Intern", …) → JobType. */
export function jobTypeFrom(raw: unknown): JobType | undefined {
  const s = String(raw ?? "").toLowerCase().replace(/[_-]+/g, " ").trim();
  if (!s) return undefined;
  if (/\bintern(ship)?s?\b|\bpraktikum\b|\bco op\b/.test(s)) return "internship";
  if (/\bapprentice(ship)?\b/.test(s)) return "apprenticeship";
  if (/\bfreelance(r)?\b/.test(s)) return "freelance";
  if (/\bpart ?time\b/.test(s)) return "part_time";
  if (/\btemp(orary)?\b|\bfixed term\b|\bseasonal\b/.test(s)) return "temporary";
  if (/\bcontract(or|ual)?\b|\bc2h\b/.test(s)) return "contract";
  if (/\bfull ?time\b|\bpermanent\b|\bfte\b|\bregular\b/.test(s)) return "full_time";
  return undefined;
}

const RANK = new Map<ExperienceLevel, number>(EXPERIENCE_LEVELS.map((l, i) => [l, i]));

/** Most junior level in a list — a role open to "Entry-level, Mid-level" is shown to entry-level seekers. */
export function lowestLevel(levels: (ExperienceLevel | undefined)[]): ExperienceLevel | undefined {
  let best: ExperienceLevel | undefined;
  for (const l of levels) {
    if (l !== undefined && (best === undefined || (RANK.get(l) ?? 99) < (RANK.get(best) ?? 99))) best = l;
  }
  return best;
}

/** Seniority labels used by job boards → ExperienceLevel. */
export function levelFrom(raw: unknown): ExperienceLevel | undefined {
  const s = String(raw ?? "").toLowerCase().trim();
  if (!s || s === "any") return undefined;
  if (/\bintern(ship)?\b/.test(s)) return "intern";
  if (/\b(new grad|graduate|fresher|no experience|student)\b/.test(s)) return "fresher";
  if (/\b(entry|junior|jr|associate)\b/.test(s)) return "entry";
  if (/\b(mid|midweight|intermediate)\b/.test(s)) return "mid";
  if (/\b(director|executive|head|vp|vice president|chief|c-level)\b/.test(s)) return "executive";
  if (/\b(lead|staff|principal|manager|management)\b/.test(s)) return "lead";
  if (/\b(senior|sr)\b/.test(s)) return "senior";
  return undefined;
}
