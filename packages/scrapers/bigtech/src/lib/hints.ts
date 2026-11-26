/**
 * Map a career site's own categories ("Students / University / Graduates", "Full time",
 * "Up to 50% work from home", …) to RawJob hints. These only return a value when the signal is
 * clear; ambiguous inputs return undefined so the normalizer (P03) decides from title/years.
 */
import type { ExperienceLevel, JobType, WorkMode } from "@easyjobs/contract";

type Text = string | null | undefined;

const joinTexts = (texts: Text[]): string => texts.filter((t): t is string => typeof t === "string" && t.length > 0).join(" | ");

const INTERN_RE = /\b(intern(ship)?s?|summer (analyst|associate|intern)|co-?op|industrial training|stipend|trainee intern)\b/i;
const APPRENTICE_RE = /\bapprentice(ship)?s?\b/i;

/** Employment-type field ("Full time", "Regular", "Contract", "Temporary", …) → JobType. */
export function jobTypeFromEmployment(text: Text): JobType | undefined {
  if (!text) return undefined;
  const s = text.toLowerCase();
  if (INTERN_RE.test(s)) return "internship";
  if (APPRENTICE_RE.test(s)) return "apprenticeship";
  if (/\bfreelanc/.test(s)) return "freelance";
  if (/\b(contract(or|ual)?|fixed[- ]term|c2h|contract[- ]to[- ]hire)\b/.test(s)) return "contract";
  if (/\b(temporary|temp|seasonal|casual)\b/.test(s)) return "temporary";
  if (/\bpart[- ]?time\b/.test(s)) return "part_time";
  if (/\b(full[- ]?time|permanent|regular|employee)\b/.test(s)) return "full_time";
  return undefined;
}

/**
 * Job type from title + structured fields. An internship/apprenticeship signal in the title or
 * a category wins over a generic "Full time" schedule (many sites mark interns as full-time).
 */
export function detectJobType(input: { title?: Text; employmentType?: Text; categories?: Text[] }): JobType | undefined {
  const cats = joinTexts(input.categories ?? []);
  if (INTERN_RE.test(input.title ?? "") || /\bintern(ship)?s?\b/i.test(cats)) return "internship";
  if (APPRENTICE_RE.test(input.title ?? "") || APPRENTICE_RE.test(cats)) return "apprenticeship";
  return jobTypeFromEmployment(input.employmentType) ?? jobTypeFromEmployment(cats);
}

/**
 * A site's experience/career-stage category → ExperienceLevel. Vague labels such as
 * "Experienced" or "Professional" return undefined.
 */
export function levelFromCategory(text: Text): ExperienceLevel | undefined {
  if (!text) return undefined;
  const s = text.toLowerCase();
  if (/\bintern(ship)?s?\b|\bco-?op\b|summer (analyst|associate)/.test(s)) return "intern";
  if (/\b(students?|university|universities|graduates?|new[- ]?grads?|campus|freshers?|college|recent grad|graduate (program|trainee)|early[- ]careers?|entry[- ]level|school leavers?|trainee)\b/.test(s)) {
    return /\b(entry[- ]level|early[- ]careers?)\b/.test(s) && !/\b(graduate|student|university|campus|fresher)/.test(s) ? "entry" : "fresher";
  }
  if (/\b(junior|associate level|analyst level|beginner)\b/.test(s)) return "entry";
  if (/\b(mid[- ]?level|intermediate|mid[- ]?senior)\b/.test(s)) return "mid";
  if (/\b(senior level|sr\.? level|experienced professional)\b/.test(s)) return "senior";
  if (/\b(executive|director|vice president|vp|c-level|leadership)\b/.test(s)) return "executive";
  return undefined;
}

/** Detects the work mode from free text ("Hybrid", "Remote", "On-site", "Up to 50% work from home"). */
export function detectWorkMode(...texts: Text[]): WorkMode | undefined {
  const s = joinTexts(texts).toLowerCase();
  if (!s) return undefined;
  if (/\bhybrid\b|flexible (working|location)|up to \d+% (work from home|remote|wfh)/.test(s)) return "hybrid";
  if (/\b(fully remote|100% (remote|work from home|wfh)|remote|work from home|wfh|telecommut\w*|virtual|work from anywhere|anywhere)\b/.test(s)) {
    return "remote";
  }
  if (/\b(on[- ]?site|in[- ]office|office[- ]based|work from office|wfo|onsite only|on-site only)\b/.test(s)) return "onsite";
  return undefined;
}

/* ─────────────────────────── India / remote location filter ─────────────────────────── */

const INDIA_CITIES = [
  "bengaluru", "bangalore", "hyderabad", "secunderabad", "pune", "chennai", "mumbai", "navi mumbai", "thane",
  "gurgaon", "gurugram", "noida", "greater noida", "new delhi", "delhi", "kolkata", "ahmedabad", "gandhinagar",
  "kochi", "cochin", "coimbatore", "thiruvananthapuram", "trivandrum", "jaipur", "chandigarh", "mohali",
  "mysore", "mysuru", "mangalore", "mangaluru", "indore", "nagpur", "vadodara", "baroda", "bhubaneswar",
  "visakhapatnam", "vizag", "lucknow", "madurai", "tiruchirappalli", "trichy", "nashik", "surat", "bhopal",
  "kanpur", "patna", "guwahati", "ranchi", "dehradun", "goa", "panaji", "vijayawada", "warangal", "hubli",
  "hubballi", "belgaum", "belagavi", "salem", "tirunelveli", "tenkasi", "kolhapur", "aurangabad", "raipur",
  "jamshedpur", "ludhiana", "amritsar", "jodhpur", "udaipur", "agra", "varanasi", "prayagraj", "meerut",
  "faridabad", "ghaziabad", "manesar", "hosur", "vellore", "puducherry", "pondicherry", "guntur", "tirupati",
  "kozhikode", "calicut", "thrissur", "bhilai", "siliguri", "durgapur", "cuttack", "jammu", "srinagar",
  "gift city", "sri city", "kakinada", "nellore", "erode", "karur", "rajkot", "kurnool",
];
const INDIA_STATES = [
  "karnataka", "telangana", "maharashtra", "tamil nadu", "tamilnadu", "haryana", "uttar pradesh", "west bengal",
  "gujarat", "kerala", "rajasthan", "andhra pradesh", "odisha", "orissa", "madhya pradesh", "delhi ncr",
  "uttarakhand", "jharkhand", "chhattisgarh", "bihar", "assam",
];
const INDIA_RE = new RegExp(`\\b(india|${[...INDIA_CITIES, ...INDIA_STATES].map((c) => c.replace(/ /g, "\\s+")).join("|")})\\b`, "i");
/** Uppercase ISO codes only (", IN" alone is ambiguous with Indiana, so it isn't matched here). */
const INDIA_CODE_RE = /(^|[\s,(/-])IND($|[\s,)/-])/;

export function isIndiaLocation(text: Text): boolean {
  if (!text) return false;
  return INDIA_RE.test(text) || INDIA_CODE_RE.test(text);
}

const REMOTE_RE = /\b(remote|anywhere|work from home|wfh|virtual|telecommut\w*|distributed|home[- ]based)\b/i;
const OPEN_REGION_RE = /\b(apac|asia|asia[- ]pacific|global|globally|worldwide|world[- ]wide|international|any ?where|all locations|multiple countries)\b/i;

export function isRemoteLocation(text: Text): boolean {
  return !!text && REMOTE_RE.test(text);
}

/**
 * A remote location that India-based candidates can take: it names India, an open region
 * (APAC / Asia / Global / Worldwide / Anywhere), or no region at all ("Remote").
 */
export function isRemoteOpenToIndia(text: Text): boolean {
  if (!text || !isRemoteLocation(text)) return false;
  if (isIndiaLocation(text) || OPEN_REGION_RE.test(text)) return true;
  const rest = text
    .replace(new RegExp(REMOTE_RE.source, "gi"), " ")
    .replace(/\b(position|role|job|work|based|location|first|only|option(al)?|friendly|ok|eligible|in|or|and)\b/gi, " ")
    .replace(/[^a-z]+/gi, " ")
    .trim();
  return rest.length === 0;
}

/** Keep a job if any location is in India or is remote and open to India. Unknown locations → `ifUnknown`. */
export function isOpenToIndia(locations: Text[], ifUnknown = false): boolean {
  const locs = locations.filter((l): l is string => !!l && l.trim().length > 0);
  if (locs.length === 0) return ifUnknown;
  return locs.some((l) => isIndiaLocation(l) || isRemoteOpenToIndia(l));
}

/** Pulls "3+ years" / "2-5 years" / "0 to 2 yrs" out of text → { min, max, raw }. */
export function parseExperienceYears(text: Text): { min: number | null; max: number | null; raw: string } | null {
  if (!text) return null;
  const s = text.replace(/\s+/g, " ");
  let m = /(\d{1,2}(?:\.\d)?)\s*(?:-|–|—|to)\s*(\d{1,2}(?:\.\d)?)\s*\+?\s*(?:years?|yrs?)/i.exec(s);
  if (m) {
    const min = Number(m[1]);
    const max = Number(m[2]);
    if (min <= max && max <= 40) return { min, max, raw: m[0] };
  }
  m = /(\d{1,2}(?:\.\d)?)\s*\+\s*(?:years?|yrs?)|(?:minimum|min\.?|at least|over)\s*(?:of\s*)?(\d{1,2})\s*(?:years?|yrs?)/i.exec(s);
  if (m) {
    const min = Number(m[1] ?? m[2]);
    if (min <= 40) return { min, max: null, raw: m[0] };
  }
  return null;
}

/** ISO 3166-2:IN subdivision codes (and common legacy ones) → state names. */
export const INDIA_STATE_CODES: Record<string, string> = {
  AP: "Andhra Pradesh", AR: "Arunachal Pradesh", AS: "Assam", BR: "Bihar", CG: "Chhattisgarh", CT: "Chhattisgarh",
  CH: "Chandigarh", DL: "Delhi", GA: "Goa", GJ: "Gujarat", HR: "Haryana", HP: "Himachal Pradesh", JH: "Jharkhand",
  JK: "Jammu and Kashmir", KA: "Karnataka", KL: "Kerala", MP: "Madhya Pradesh", MH: "Maharashtra", MN: "Manipur",
  ML: "Meghalaya", MZ: "Mizoram", NL: "Nagaland", OD: "Odisha", OR: "Odisha", PB: "Punjab", PY: "Puducherry",
  RJ: "Rajasthan", SK: "Sikkim", TN: "Tamil Nadu", TG: "Telangana", TS: "Telangana", TR: "Tripura",
  UP: "Uttar Pradesh", UK: "Uttarakhand", UT: "Uttarakhand", WB: "West Bengal",
};

/**
 * "Bengaluru, KA, IN, 560016" / ("Pune", "MH", "IN") → "Bengaluru, Karnataka, India".
 * Non-Indian or unknown parts are passed through unchanged.
 */
export function readableIndiaLocation(city: string | null | undefined, region?: string | null, country?: string | null): string {
  const cc = (country ?? "").trim().toUpperCase();
  const isIndia = cc === "IN" || cc === "IND" || /^india$/i.test(cc);
  const reg = (region ?? "").trim();
  const state = isIndia ? (INDIA_STATE_CODES[reg.toUpperCase()] ?? (/^national capital territory/i.test(reg) ? "Delhi" : reg)) : reg;
  const countryName = isIndia ? "India" : (country ?? "").trim();
  return [city?.trim(), state, countryName].filter((p) => p && p.length > 0).join(", ");
}
