/** Structured hints: batches, degrees, experience, salary, deadlines, job type, level, tags, work mode. */
import type { ExperienceLevel, JobType, WorkMode } from "@easyjobs/contract";
import { isNotAvailable } from "./labels";
import { normalizeSpace } from "../util/text";

/* ───────────── batches ───────────── */

const YEAR = String.raw`(?:19|20)\d\d`;
const YEAR_LIST = String.raw`${YEAR}(?:\s*(?:,|\/|&|and|or|–|-|to)\s*(?:${YEAR}|\d\d)\b)*`;
const BATCH_BEFORE = new RegExp(
  String.raw`\b(?:batch(?:es)?|pass(?:ed)?[\s-]?outs?|passing(?:\s+out)?(?:\s+year)?|year\s+of\s+(?:passing|graduation)|graduat(?:ing|ion|es?)(?:\s+(?:in|year|batch|class|cohort))?|yop|cohort|class\s+of|completing\s+(?:their\s+)?(?:degree|graduation)\s+in)\b[^.\n;]{0,40}?\b(${YEAR_LIST})`,
  "gi",
);
const BATCH_AFTER = new RegExp(String.raw`\b(${YEAR_LIST})\s*(?:batch(?:es)?|pass[\s-]?outs?|passouts?|graduates?|grads|passed[\s-]?out|cohort)\b`, "gi");

function expandYears(list: string): number[] {
  const out: number[] = [];
  const tokens = list.split(/\s*(,|\/|&|and|or|–|-|to)\s*/);
  let prev: number | null = null;
  let rangeNext = false;
  for (const tok of tokens) {
    if (/^(–|-|to)$/.test(tok)) {
      rangeNext = true;
      continue;
    }
    if (/^(,|\/|&|and|or)$/.test(tok) || !tok) {
      rangeNext = false;
      continue;
    }
    let y = Number(tok);
    if (!Number.isFinite(y)) continue;
    if (y < 100 && prev !== null) y = Math.floor(prev / 100) * 100 + y;
    if (rangeNext && prev !== null && y > prev && y - prev <= 6) {
      for (let k = prev + 1; k <= y; k++) out.push(k);
    } else out.push(y);
    prev = y;
    rangeNext = false;
  }
  return out;
}

/** Graduation years near batch words. Bounded to [postedYear-6, postedYear+3]. */
export function extractBatches(texts: string[], postedYear: number): number[] {
  const years = new Set<number>();
  for (const text of texts) {
    for (const re of [BATCH_BEFORE, BATCH_AFTER]) {
      re.lastIndex = 0;
      for (const m of text.matchAll(re)) for (const y of expandYears(m[1] ?? "")) years.add(y);
    }
  }
  return [...years].filter((y) => y >= postedYear - 6 && y <= postedYear + 3).sort((a, b) => a - b);
}

/** Years in an explicit "Batch:" value ("2024, 2025 or 2026", "2024–26"). */
export function batchesFromValue(value: string, postedYear: number): number[] {
  if (isNotAvailable(value)) return [];
  const m = value.match(new RegExp(YEAR_LIST, "g")) ?? [];
  const years = new Set(m.flatMap(expandYears));
  return [...years].filter((y) => y >= postedYear - 6 && y <= postedYear + 3).sort((a, b) => a - b);
}

/* ───────────── degrees ───────────── */

/**
 * Degree patterns. Short abbreviations that collide with English words ("be", "me", "ba", "ma", "ca") are matched
 * case-sensitively (BE/ME/BA/MA/CA) or only in dotted form (B.E., M.E.).
 */
const DEGREE_PATTERNS: [string, RegExp[]][] = [
  ["B.E/B.Tech", [/\bb\.\s?e\b\.?|\bb\.?\s?tech\b|\bbachelor(?:'?s|’s)? (?:degree )?(?:of|in) (?:engineering|technology)\b|\bbtech\b/i, /\bBE\b(?!\s+(?:able|a|an|the|in|on|at|of|to|eligible|required|considered|selected|completed|willing|ready|from|open|done))/]],
  ["M.E/M.Tech", [/\bm\.\s?e\b\.?|\bm\.?\s?tech\b|\bmaster(?:'?s|’s)? (?:degree )?(?:of|in) (?:engineering|technology)\b|\bmtech\b/i, /\bME\s*(?:\/|,|or|and)\s*M\.?\s?Tech\b|\bM\.?\s?Tech\s*(?:\/|,|or|and)\s*ME\b/]],
  ["BCA", [/\bb\.?\s?c\.?\s?a\b/i]],
  ["MCA", [/\bm\.?\s?c\.?\s?a\b/i]],
  ["B.Sc", [/\bb\.?\s?sc\b|\bbachelor(?:'?s|’s)? (?:degree )?(?:of|in) science\b/i]],
  ["M.Sc", [/\bm\.?\s?sc\b|\bmaster(?:'?s|’s)? (?:degree )?(?:of|in) science\b/i, /\bM\.?S\.?\s+in\b/]],
  ["BBA", [/\bb\.?\s?b\.?\s?a\b|\bbachelor(?:'?s|’s)? (?:degree )?(?:of|in) business administration\b|\bbbm\b|\bbms\b/i]],
  ["MBA", [/\bm\.?\s?b\.?\s?a\b|\bpgdm\b|\bmaster(?:'?s|’s)? (?:degree )?(?:of|in) business administration\b/i]],
  ["B.Com", [/\bb\.?\s?com\b|\bbachelor(?:'?s|’s)? (?:degree )?(?:of|in) commerce\b/i]],
  ["M.Com", [/\bm\.?\s?com\b|\bmaster(?:'?s|’s)? (?:degree )?(?:of|in) commerce\b/i]],
  ["BA", [/\bb\.a\.?(?![a-z])|\bbachelor(?:'?s|’s)? (?:degree )?(?:of|in) arts\b/i, /\bBA\b/]],
  ["MA", [/\bm\.a\.(?![a-z])|\bmaster(?:'?s|’s)? (?:degree )?(?:of|in) arts\b/i, /\bMA\s*(?:\/|,|or|and)\s*(?:M\.?\s?Com|MBA|M\.?Sc)\b/]],
  ["B.Pharm", [/\bb\.?\s?pharm(?:a)?\b/i]],
  ["M.Pharm", [/\bm\.?\s?pharm(?:a)?\b/i]],
  ["LLB", [/\bll\.?\s?b\b|\bb\.?a\.?\s?ll\.?b\b/i]],
  ["B.Des", [/\bb\.?\s?des\b/i]],
  ["Diploma", [/\bdiploma\b|\bpolytechnic\b/i]],
  ["ITI", [/\bITI\b/]],
  ["PhD", [/\bph\.?\s?d\b|\bdoctora(?:te|l)\b/i]],
  ["CA", [/\b(?:chartered accountan(?:t|cy)|icai)\b/i, /\bCA\s+(?:inter|intermediate|final|students?|freshers?|qualified|articleship)\b|\bCA\/CMA\b/i]],
  ["12th Pass", [/\b(?:12th|class\s+(?:xii|12)|hsc|higher secondary)\b(?!\s*(?:marks|percentage))/i]],
  ["10th Pass", [/\b(?:10th|class\s+(?:x|10)|sslc|matriculat(?:ion|e))\b(?!\s*(?:marks|percentage))/i]],
  ["Any Graduate", [/\bany\s+(?:graduate|graduation|degree|stream|bachelor(?:'?s|’s)?(?:\s+degree)?|discipline)\b|\ball\s+(?:streams|graduates)\b|\bgraduates?\s+(?:from|in)\s+any\b|\bgraduation in any\b/i]],
  ["Any Postgraduate", [/\bany\s+(?:post[\s-]?graduate|post[\s-]?graduation|pg|master(?:'?s|’s)?(?:\s+degree)?)\b/i]],
];

export function extractDegrees(texts: string[]): string[] {
  const joined = texts.join("\n");
  return DEGREE_PATTERNS.filter(([, res]) => res.some((re) => re.test(joined))).map(([name]) => name);
}

/* ───────────── experience / salary ───────────── */

const EXPERIENCE_RE = /\b(?:\d{1,2}(?:\.\d)?\s*(?:\+|plus)?\s*(?:-|–|to)\s*\d{1,2}(?:\.\d)?\s*(?:\+\s*)?(?:years?|yrs?)|\d{1,2}(?:\.\d)?\s*\+?\s*(?:years?|yrs?)(?:\s+of)?\s+(?:experience|exp)|(?:minimum|min\.?|at least|atleast)\s+\d{1,2}\s*(?:years?|yrs?)|freshers?(?:\s*(?:\/|or|&|and)\s*experienced)?|0\s*(?:-|–|to)\s*\d+\s*(?:years?|yrs?|months?))\b/i;

export function experienceFromText(text: string): string | null {
  const m = EXPERIENCE_RE.exec(text);
  return m ? normalizeSpace(m[0]) : null;
}

const MONEY_RE = /(?:(?:₹|rs\.?|inr|usd|\$)\s*[\d,.]+(?:\s*(?:k|l|lakh|lakhs|lac|lacs|lpa|cr|crore|thousand))?(?:\s*(?:-|–|to)\s*(?:₹|rs\.?|inr|\$)?\s*[\d,.]+(?:\s*(?:k|l|lakh|lakhs|lac|lacs|lpa|cr|crore|thousand))?)?(?:\s*(?:\/|per|a|p\.?)\s*(?:month|mo|annum|year|yr|a\.?|hour|hr|week|day))?(?:\s*(?:ctc|lpa|p\.?a\.?))?|[\d.,]+\s*(?:-|–|to)?\s*[\d.,]*\s*(?:lpa|lakhs?\s*(?:per annum|p\.?a\.?|ctc)?|lacs?\s*(?:p\.?a\.?|per annum|ctc)?|lakh\s*ctc|k\s*(?:\/|per)\s*month))/i;

/** Compact salary text: the KV value if short, else the first money expression in it. */
export function salaryFromValue(value: string): string | null {
  const v = normalizeSpace(value);
  if (!v || isNotAvailable(v) || /^(?:as per (?:company|industry)|best in industry|competitive|performance based)\b/i.test(v)) {
    return /\b(?:unpaid|no stipend)\b/i.test(v) ? "Unpaid" : null;
  }
  if (v.length <= 60) return v;
  const m = MONEY_RE.exec(v);
  return m ? normalizeSpace(m[0]) : null;
}

/** Salary/stipend mentioned in a title ("Stipend Rs.20,000 / Month", "₹5-14 LPA", "6 Lakh CTC"). */
export function salaryFromTitle(title: string): string | null {
  const stip = /\b(?:stipend|salary|ctc|package|pay)\s*(?:of|:|up\s*to|upto)?\s*((?:₹|rs\.?|inr)\s*[\d,.]+\s*(?:k|lakh|lakhs|lpa|lacs?)?(?:\s*(?:-|–|to)\s*(?:₹|rs\.?)?\s*[\d,.]+\s*(?:k|lakh|lakhs|lpa|lacs?)?)?(?:\s*(?:\/|per)\s*(?:month|annum|year))?)/i.exec(title);
  if (stip?.[1]) return normalizeSpace(stip[1]);
  const lpa = /(?:₹|rs\.?\s*)?\b\d+(?:\.\d+)?\s*(?:(?:-|–|to)\s*\d+(?:\.\d+)?\s*)?(?:lpa|lakhs?\s*(?:ctc|p\.?a\.?|per annum)|lacs?\s*p\.?a\.?|lakh\s*ctc)\b/i.exec(title);
  if (lpa) return normalizeSpace(lpa[0]);
  const month = /(?:₹|rs\.?)\s*[\d,.]+\s*k?\s*(?:\/|per)\s*month/i.exec(title);
  return month ? normalizeSpace(month[0]) : null;
}

/* ───────────── dates ───────────── */

const MONTHS: Record<string, number> = {
  jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2, apr: 3, april: 3, may: 4, jun: 5, june: 5, jul: 6, july: 6,
  aug: 7, august: 7, sep: 8, sept: 8, september: 8, oct: 9, october: 9, nov: 10, november: 10, dec: 11, december: 11,
};
const MONTH_NAMES = Object.keys(MONTHS).sort((a, b) => b.length - a.length).join("|");

/** 23:59:59 IST of a calendar date, as ISO UTC. */
function endOfDayIst(y: number, m: number, d: number): string | null {
  if (m < 0 || m > 11 || d < 1 || d > 31) return null;
  const t = Date.UTC(y, m, d, 18, 29, 59); // 23:59:59 +05:30
  const check = new Date(Date.UTC(y, m, d));
  if (check.getUTCMonth() !== m) return null;
  return new Date(t).toISOString();
}

/**
 * Parse a deadline ("14 March 2026", "24th December", "Dec 20", "2026-12-24", "24/12/2026", "ASAP") → ISO or null.
 * Missing years are inferred relative to `posted` (the next occurrence not more than ~10 days before posting).
 */
export function parseDeadline(text: string, posted: Date): string | null {
  const t = normalizeSpace(text).toLowerCase();
  if (!t || isNotAvailable(t) || /\b(?:asap|soon|rolling|ongoing|open until|till filled|immediately|not specified)\b/.test(t)) return null;
  const inferYear = (m: number, d: number): number => {
    const py = posted.getUTCFullYear();
    const candidate = Date.UTC(py, m, d);
    return candidate < posted.getTime() - 10 * 86_400_000 ? py + 1 : py;
  };
  let m: RegExpExecArray | null;
  if ((m = /\b(20\d\d)-(\d{1,2})-(\d{1,2})\b/.exec(t))) return endOfDayIst(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if ((m = /\b(\d{1,2})[/.-](\d{1,2})[/.-](20\d\d|\d\d)\b/.exec(t))) {
    const y = Number(m[3]!.length === 2 ? `20${m[3]}` : m[3]);
    return endOfDayIst(y, Number(m[2]) - 1, Number(m[1])); // Indian sites use DD/MM/YYYY
  }
  const dmy = new RegExp(String.raw`\b(\d{1,2})(?:st|nd|rd|th)?(?:\s+of)?\s*[-\s,]?\s*(${MONTH_NAMES})\.?,?(?:\s*,?\s*(20\d\d))?\b`, "i");
  if ((m = dmy.exec(t))) {
    const mon = MONTHS[m[2]!.toLowerCase()]!;
    const d = Number(m[1]);
    return endOfDayIst(m[3] ? Number(m[3]) : inferYear(mon, d), mon, d);
  }
  const mdy = new RegExp(String.raw`\b(${MONTH_NAMES})\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:\s*,?\s*(20\d\d))?\b`, "i");
  if ((m = mdy.exec(t))) {
    const mon = MONTHS[m[1]!.toLowerCase()]!;
    const d = Number(m[2]);
    return endOfDayIst(m[3] ? Number(m[3]) : inferYear(mon, d), mon, d);
  }
  return null;
}

/** "Apply by 24th December", "Last Date 14 March", "(Apply by 19 Nov)", "Apply Before October 26". */
export function deadlineFromTitle(title: string, posted: Date): string | null {
  const m = /\b(?:apply\s+(?:by|before|till|until)|last\s+date(?:\s+to\s+apply)?|deadline|closes?\s+on|till)\s*[:-]?\s*([^|;:()]{3,30})/i.exec(title);
  return m?.[1] ? parseDeadline(m[1], posted) : null;
}

/* ───────────── type / level / tags / mode ───────────── */

export interface IntentSignals {
  title: string;
  categories: string[];
  tags: string[];
  jobTypeValue?: string | null;
  workModeValue?: string | null;
  experienceValue?: string | null;
  text: string;
}

export function detectJobType(s: IntentSignals, role: string): JobType {
  const hay = `${s.title} ${role} ${s.categories.join(" ")} ${s.jobTypeValue ?? ""}`.toLowerCase();
  if (/\bapprentice(?:ship)?s?\b/.test(`${role} ${s.title}`.toLowerCase()) || /\bapprenticeship\b/.test(s.categories.join(" "))) return "apprenticeship";
  if (/\bintern(?:ship)?s?\b|\bindustrial trainee\b|\bsummer (?:analyst|associate|trainee)\b|\bco[\s-]?op\b|\bplacement\b(?!\s+(?:drive|cell|officer))/.test(`${role} ${s.title} ${s.jobTypeValue ?? ""}`.toLowerCase())) return "internship";
  if (/\bpart[\s-]?time\b/.test(hay)) return "part_time";
  if (/\bfreelanc/.test(hay)) return "freelance";
  const typeText = `${role} ${s.jobTypeValue ?? ""}`.toLowerCase();
  if (/\b(?:contract|contractual|temporary|fixed[\s-]?term)\b/.test(typeText) && !/\bfull[\s-]?time\b/.test(typeText)) return "contract";
  return "full_time";
}

const FRESHER_RE = /\b(?:freshers?|new\s+grad(?:uate)?s?|recent\s+graduates?|entry[\s-]?level|campus|off[\s-]?campus|graduate\s+(?:engineer\s+)?trainee|\bget\b|management\s+trainee|graduate\s+trainee|20\d\d\s+(?:batch|pass[\s-]?outs?|graduates?)|0\s*(?:-|–|to)\s*[12]\s*(?:years?|yrs?)|0\s*years?|no\s+(?:prior\s+)?experience)\b/i;

export function detectLevel(jobType: JobType, s: IntentSignals, role: string, experienceRaw: string | null): ExperienceLevel | undefined {
  if (jobType === "internship") return "intern";
  const exp = (experienceRaw ?? "").toLowerCase();
  const maxYears = (() => {
    const nums = [...exp.matchAll(/(\d+(?:\.\d+)?)/g)].map((m) => Number(m[1]));
    return nums.length > 0 ? Math.max(...nums) : null;
  })();
  if (maxYears !== null && maxYears > 2 && !/month/.test(exp)) return undefined;
  if (/\b(?:senior|sr\.?|lead|principal|staff|manager|director|head|architect)\b/i.test(role) && !/\btrainee\b/i.test(role)) return undefined;
  const hay = `${s.title} ${role} ${exp} ${s.categories.join(" ")}`;
  if (jobType === "apprenticeship") return "fresher";
  if (FRESHER_RE.test(hay)) return "fresher";
  if (/\bfreshers?\b/i.test(exp)) return "fresher";
  return undefined;
}

/**
 * Tags from the title/role (site-wide categories like "off-campus-drive" on every freshershunt post are not evidence);
 * "wfh" also from specific category/tag slugs ("work-from-home", "wfh-jobs").
 */
export function detectTags(s: IntentSignals, role: string, isRemote: boolean): string[] {
  const own = `${s.title} ${role}`.toLowerCase();
  const slugs = `${s.categories.join(" ")} ${s.tags.join(" ")}`.toLowerCase();
  const out: string[] = [];
  if (/\boff[\s-]?campus\b|\bpool[\s-]?campus\b|\bcampus\s+drive\b/.test(own)) out.push("off-campus");
  if (/\bwalk[\s-]?ins?\b|\bwalkin\b/.test(own)) out.push("walk-in");
  if (isRemote || /\bwork[\s-]from[\s-]home\b|\bwfh\b/.test(own) || /(?:^|\s)(?:work-from-home(?:-jobs?)?|wfh(?:-jobs?)?|remote-jobs?)(?:\s|$)/.test(slugs)) out.push("wfh");
  if (/\b(?:female candidates only|only women|for women|women only)\b/.test(own)) out.push("women");
  if (/\burgent(?:ly)?\b/.test(s.title.toLowerCase())) out.push("urgent");
  return out;
}

export function detectWorkMode(values: (string | null | undefined)[], titleAndRole: string): { workMode?: WorkMode; isRemote?: boolean } {
  const hay = `${values.filter(Boolean).join(" ")} ${titleAndRole}`.toLowerCase();
  if (/\bhybrid\b/.test(hay)) return { workMode: "hybrid", isRemote: false };
  if (/\b(?:remote|work[\s-]from[\s-]home|wfh|virtual internship|fully online)\b/.test(hay)) return { workMode: "remote", isRemote: true };
  if (/\b(?:on[\s-]?site|in[\s-]office|office[\s-]based|work from office|wfo|offline)\b/.test(values.filter(Boolean).join(" ").toLowerCase())) return { workMode: "onsite", isRemote: false };
  return {};
}
