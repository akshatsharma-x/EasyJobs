/**
 * Fallback normalizer — used only when packages/normalize (P03) is missing or broken.
 * Minimal but always-valid RawJob → JobInput: slugify, naive level/type/category detection,
 * URL-based fingerprint (§0.4 rule 1 with a small ATS-aware key, rule 2 otherwise).
 * Pure and synchronous; never invents salaries.
 */
import {
  JOB_TYPES,
  EXPERIENCE_LEVELS,
  WORK_MODES,
  isOfficialKind,
  slugify,
  type CompanyTarget,
  type ExperienceLevel,
  type JobCategory,
  type JobInput,
  type JobLocation,
  type JobType,
  type RawJob,
  type Salary,
  type WorkMode,
} from "@easyjobs/contract";
import { isObject, isOneOf, parseTime, sha1 } from "./util";

export interface NormalizeOptions {
  sourceName?: string;
  company?: CompanyTarget;
  now?: Date;
}

export const FALLBACK_NORMALIZER_ID = "worker-fallback";

/* ─────────────────────────── URLs & fingerprint ─────────────────────────── */

/** Hosts whose links are NOT official postings: job boards, aggregators, fresher-job blogs (§0.4 rule 1). */
export const NON_OFFICIAL_HOSTS: readonly string[] = [
  "linkedin.com", "naukri.com", "internshala.com", "indeed.com", "indeed.co.in", "glassdoor.com", "glassdoor.co.in",
  "monster.com", "foundit.in", "shine.com", "timesjobs.com", "unstop.com", "instahyre.com", "cutshort.io",
  "wellfound.com", "angel.co", "hirist.tech", "hirist.com", "iimjobs.com", "apna.co", "workindia.in",
  "freshersworld.com", "coursejoiner.com", "freshersnow.com", "fresherslive.com", "offcampusjobs4u.com",
  "remoteok.com", "remoteok.io", "remotive.com", "weworkremotely.com", "himalayas.app", "jobicy.com",
  "arbeitnow.com", "adzuna.com", "adzuna.in", "jooble.org", "simplyhired.com", "ziprecruiter.com", "dice.com",
  "talent.com", "careerjet.com", "careerjet.co.in", "demo.easyjobs.example",
];

const TRACKING_PARAM =
  /^(utm_.*|gclid|gbraid|wbraid|fbclid|msclkid|dclid|yclid|twclid|mc_cid|mc_eid|_hs.*|igshid|ref|ref_?src|referrer|referer|source|src|trk|trackingid|tracking_id|lever-source|lever-origin|gh_src|sourcetype|source_type|campaign|cmp|share|shared|si|spm)$/i;

/** Career landing pages that are not job-specific (a fingerprint on them would merge unrelated jobs). */
const GENERIC_PATH = /^\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?(?:careers?|jobs?|join(?:-us)?|work-with-us|opportunities|openings|apply)?\/?$/i;

export function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

export function isOfficialHost(host: string): boolean {
  return !NON_OFFICIAL_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
}

const isHttpUrl = (v: unknown): v is string => {
  if (typeof v !== "string" || !/^https?:\/\//i.test(v)) return false;
  try {
    new URL(v);
    return true;
  } catch {
    return false;
  }
};

/** Lowercase host without www, no hash, tracking params removed, remaining (id) params sorted. */
export function canonicalUrl(url: string): string {
  const u = new URL(url);
  const host = u.hostname.toLowerCase().replace(/^www\./, "");
  const params = [...u.searchParams.entries()]
    .filter(([k]) => !TRACKING_PARAM.test(k))
    .sort(([a, av], [b, bv]) => a.localeCompare(b) || av.localeCompare(bv));
  const path = u.pathname.replace(/\/+$/, "");
  const qs = params.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join("&");
  return `${host}${u.port ? `:${u.port}` : ""}${path}${qs ? `?${qs}` : ""}`;
}

/** ATS-aware stable key for the common ATSs; otherwise the canonical URL. */
export function canonicalJobKey(url: string): string {
  const u = new URL(url);
  const host = u.hostname.toLowerCase().replace(/^www\./, "");
  const ghJid = u.searchParams.get("gh_jid");
  if (ghJid && /^\d+$/.test(ghJid)) return `greenhouse:${ghJid}`;
  if (host.endsWith("greenhouse.io")) {
    const m = /\/jobs\/(\d+)/.exec(u.pathname);
    if (m) return `greenhouse:${m[1]}`;
  }
  if (/^jobs\.(eu\.)?lever\.co$/.test(host) || host === "jobs.ashbyhq.com") {
    const m = /^\/[^/]+\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i.exec(u.pathname);
    if (m?.[1]) return `${host.includes("lever") ? "lever" : "ashby"}:${m[1].toLowerCase()}`;
  }
  const wd = /^([a-z0-9-]+)\.wd\d+\.myworkdayjobs\.com$/.exec(host);
  if (wd) {
    const last = u.pathname.replace(/\/+$/, "").split("/").pop() ?? "";
    const id = last.includes("_") ? last.slice(last.lastIndexOf("_") + 1) : "";
    if (/^[A-Za-z0-9-]{3,}$/.test(id)) return `workday:${wd[1]}:${id.toUpperCase()}`;
  }
  return canonicalUrl(url);
}

export function normalizeTitleKey(title: string): string {
  return title
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9+#]+/g, " ")
    .trim();
}

/** §0.4: `k:` + sha1(canonical key) for official links, else `t:` + sha1(company|title|city-or-remote|type). */
export function computeFingerprint(input: {
  applyUrl: string;
  companySlug: string;
  title: string;
  primaryCity: string | null;
  isRemote: boolean;
  jobType: JobType;
}): string {
  const host = hostOf(input.applyUrl);
  if (host && isOfficialHost(host)) {
    const u = new URL(input.applyUrl);
    const generic = GENERIC_PATH.test(u.pathname) && ![...u.searchParams.keys()].some((k) => !TRACKING_PARAM.test(k));
    if (!generic) return `k:${sha1(canonicalJobKey(input.applyUrl))}`;
  }
  const place = input.primaryCity ? input.primaryCity.toLowerCase() : input.isRemote ? "remote" : "";
  return `t:${sha1([input.companySlug, normalizeTitleKey(input.title), place, input.jobType].join("|"))}`;
}

/* ─────────────────────────── Text ─────────────────────────── */

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—", lsquo: "‘", rsquo: "’",
  ldquo: "“", rdquo: "”", hellip: "…", bull: "•", middot: "·", copy: "©", reg: "®", trade: "™", rarr: "→", larr: "←",
};

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]{1,6}|#\d{1,7}|[a-z]{2,8});/gi, (m, e: string) => {
    if (e.startsWith("#")) {
      const code = e[1] === "x" || e[1] === "X" ? Number.parseInt(e.slice(2), 16) : Number.parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : m;
    }
    return NAMED_ENTITIES[e.toLowerCase()] ?? m;
  });
}

const BLOCK_TAGS = "p|div|h[1-6]|ul|ol|tr|table|section|article|blockquote|pre|header|footer";

export function htmlToText(html: string): string {
  let s = html;
  // Greenhouse & co. send HTML-escaped HTML.
  if (!/<[a-z!/]/i.test(s) && /&lt;\s*\/?[a-z]/i.test(s)) s = decodeEntities(s);
  s = s
    .replace(/<(script|style|noscript|iframe|svg|head|template)\b[\s\S]*?<\/\1\s*>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    // List items stay on adjacent lines (one list); blocks are separated by a blank line.
    .replace(/<li\b[^>]*>/gi, "\n• ")
    .replace(/<\/li\s*>/gi, "")
    .replace(new RegExp(`</?(?:${BLOCK_TAGS})\\b[^>]*>`, "gi"), "\n\n")
    .replace(/<[^>]*>/g, " ");
  return decodeEntities(s)
    .replace(/[ \t\f\v\u00a0\u200b]+/g, " ")
    .split("\n")
    .map((line) => line.trim())
    .filter((line, i, all) => line !== "•" && !(line === "" && all[i - 1] === ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const escapeHtml = (s: string): string => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Plain text → minimal, inherently safe HTML (escaped paragraphs and bullet lists). The API re-sanitizes anyway. */
export function textToHtml(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((block) => block.split("\n").map((l) => l.trim()).filter(Boolean))
    .filter((lines) => lines.length > 0)
    .map((lines) =>
      lines.every((l) => l.startsWith("• "))
        ? `<ul>${lines.map((l) => `<li>${escapeHtml(l.slice(2))}</li>`).join("")}</ul>`
        : `<p>${lines.map(escapeHtml).join("<br>")}</p>`,
    )
    .join("\n");
}

/** ≤ max chars, cut at a sentence end when possible. */
export function summarize(text: string, max = 280): string | null {
  // Lines (headings, bullets) become sentences: "What you do\n• Build" → "What you do. Build".
  const t = text
    .split("\n")
    .map((l) => l.replace(/^•\s*/, "").replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .reduce((acc, line) => (acc ? `${acc}${/[.!?:;,]$/.test(acc) ? " " : ". "}${line}` : line), "");
  if (!t) return null;
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const sentence = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "), cut.lastIndexOf("? "));
  if (sentence >= max * 0.5) return cut.slice(0, sentence + 1);
  const space = cut.lastIndexOf(" ");
  return `${cut.slice(0, space > max * 0.5 ? space : max - 1).trimEnd()}…`;
}

/* ─────────────────────────── Classification ─────────────────────────── */

export interface Years {
  min: number | null;
  max: number | null;
}

/** "0-2 Yrs", "2+ years", "1 to 3 years", "minimum 3 years", "Freshers" → { min, max }. */
export function parseYears(text: string | null | undefined): Years | null {
  if (!text) return null;
  const t = text.toLowerCase().slice(0, 4000);
  let m = /(\d{1,2}(?:\.\d)?)\s*(?:-|–|—|to)\s*(\d{1,2}(?:\.\d)?)\s*\+?\s*(?:years?|yrs?)/.exec(t);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    if (a <= b && b <= 40) return { min: a, max: b };
  }
  m = /(\d{1,2})\s*\+\s*(?:years?|yrs?)/.exec(t) ?? /(?:minimum|min\.?|at least|atleast)\s*(?:of\s*)?(\d{1,2})\s*(?:years?|yrs?)/.exec(t);
  if (m) {
    const a = Number(m[1]);
    if (a <= 40) return { min: a, max: null };
  }
  m = /(\d{1,2})\s*(?:years?|yrs?)\s*(?:of\s*)?(?:experience|exp\b)/.exec(t);
  if (m) {
    const a = Number(m[1]);
    if (a <= 40) return { min: a, max: null };
  }
  if (/\bfreshers?\b|\bno experience\b|\b0 years?\b/.test(t)) return { min: 0, max: 0 };
  return null;
}

const FRESHER_WORDS = /\b(freshers?|new grads?|new graduates?|campus|off[- ]campus|graduate engineer trainee|20\d\d batch|batch of 20\d\d|pass[- ]?outs?)\b|\bGET\b/;

const TITLE_LEVELS: readonly [RegExp, ExperienceLevel][] = [
  [/\b(intern|internship|interns|summer (analyst|associate|intern)|co-?op)\b/i, "intern"],
  [/\b(new grad|graduate (engineer(ing)? )?trainee|fresher|freshers|campus|apprentice|trainee|20\d\d batch)\b/i, "fresher"],
  [/\b(chief|cxo|cto|ceo|cfo|coo|vp|svp|evp|vice president|head of|director)\b/i, "executive"],
  [/\b(staff|principal|lead|architect|distinguished|fellow|engineering manager)\b/i, "lead"],
  [/\b(senior|sr\.?|sde[- ]?(iii|3)|engineer[- ]?(iii|3)|level[- ]?3)\b/i, "senior"],
  [/\b(sde[- ]?(ii|2)|engineer[- ]?(ii|2)|mid[- ]?level|intermediate)\b/i, "mid"],
  [/\b(junior|jr\.?|associate|sde[- ]?(i|1)|engineer[- ]?(i|1)|entry[- ]?level|graduate|early career)\b/i, "entry"],
];

/** §0.4 precedence: internship → intern; explicit years > structured hint > title keywords > description keywords. */
export function classifyLevel(input: {
  jobType: JobType;
  years: Years | null;
  hint?: ExperienceLevel;
  title: string;
  description: string;
}): ExperienceLevel {
  if (input.jobType === "internship") return "intern";
  const fresherWords = FRESHER_WORDS.test(input.title) || FRESHER_WORDS.test(input.description.slice(0, 4000));
  const y = input.years;
  if (y && (y.min !== null || y.max !== null)) {
    if (fresherWords && (y.max ?? y.min ?? 0) <= 2) return "fresher";
    if (y.max !== null) return y.max <= 1 ? "fresher" : y.max <= 2 ? "entry" : y.max <= 5 ? "mid" : y.max <= 8 ? "senior" : "lead";
    const min = y.min ?? 0;
    return min >= 8 ? "lead" : min >= 5 ? "senior" : min >= 2 ? "mid" : min >= 1 ? "entry" : "fresher";
  }
  if (input.hint) return input.hint;
  for (const [re, level] of TITLE_LEVELS) if (re.test(input.title)) return level;
  if (/\bGET\b/.test(input.title)) return "fresher";
  if (fresherWords) return "fresher";
  return "mid";
}

export function detectJobType(raw: Pick<RawJob, "jobType" | "employmentTypeRaw" | "title">): JobType {
  if (isOneOf(raw.jobType, JOB_TYPES)) return raw.jobType;
  const t = `${raw.employmentTypeRaw ?? ""} ${raw.title}`.toLowerCase();
  if (/\bintern(ship)?s?\b|\bco-?op\b|\bsummer (analyst|associate)\b/.test(t)) return "internship";
  if (/\bapprentice(ship)?s?\b/.test(t)) return "apprenticeship";
  if (/\bfreelanc/.test(t)) return "freelance";
  if (/\bpart[- ]?time\b/.test(t)) return "part_time";
  if (/\b(contract|contractor|contractual|fixed[- ]term|c2h)\b/.test(t)) return "contract";
  if (/\b(temporary|temp|seasonal)\b/.test(t)) return "temporary";
  return "full_time";
}

const CATEGORY_RULES: readonly [RegExp, JobCategory][] = [
  [/\b(security|cyber|infosec|soc analyst|penetration|appsec)\b/i, "security"],
  [/\b(qa|quality assurance|sdet|tester|testing|test engineer|automation test)\b/i, "qa_testing"],
  [/\b(devops|sre|site reliability|cloud|infrastructure|platform engineer|kubernetes)\b/i, "devops_cloud"],
  [/\b(data|machine learning|ml|ai|artificial intelligence|analytics|deep learning|nlp|computer vision|llm)\b/i, "data_ai"],
  [/\b(product manager|product owner|product management|apm)\b/i, "product"],
  [/\b(designer|design|ux|ui\/ux|ui|graphic|illustrator|visual)\b/i, "design"],
  [/\b(engineer|engineering|developer|sde|swe|programmer|frontend|front[- ]end|backend|back[- ]end|full[- ]?stack|android|ios|mobile|software)\b/i, "software_engineering"],
  [/\b(marketing|seo|sem|growth|brand|social media|performance marketing)\b/i, "marketing"],
  [/\b(sales|business development|account executive|bdr|sdr|inside sales|pre-?sales)\b/i, "sales"],
  [/\b(finance|financial|accountant|accounting|audit|tax|treasury|payroll)\b/i, "finance"],
  [/\b(hr|human resources|recruiter|recruiting|talent acquisition|people partner)\b/i, "hr"],
  [/\b(consultant|consulting|advisory)\b/i, "consulting"],
  [/\b(customer support|customer success|customer service|support specialist|helpdesk|technical support)\b/i, "customer_support"],
  [/\b(mechanical|electrical|civil|chemical|electronics|vlsi|embedded|hardware|manufacturing)\b/i, "core_engineering"],
  [/\b(research|researcher|scientist)\b/i, "research"],
  [/\b(content|writer|copywriter|editor|journalist|video)\b/i, "content"],
  [/\b(legal|lawyer|counsel|compliance|paralegal)\b/i, "legal"],
  [/\b(nurse|doctor|medical|clinical|pharma|pharmacist|healthcare)\b/i, "healthcare"],
  [/\b(teacher|tutor|instructor|faculty|lecturer|professor|education)\b/i, "education"],
  [/\b(operations|business analyst|strategy|program manager|project manager|supply chain|logistics)\b/i, "business_ops"],
];

export function categorize(title: string, department: string | null | undefined): JobCategory {
  for (const text of [title, department ?? ""]) {
    if (!text) continue;
    for (const [re, category] of CATEGORY_RULES) if (re.test(text)) return category;
  }
  return "other";
}

/* ─────────────────────────── Locations ─────────────────────────── */

const CITY_ALIASES: Record<string, string> = {
  bangalore: "Bengaluru", bengaluru: "Bengaluru", gurgaon: "Gurugram", gurugram: "Gurugram", mumbai: "Mumbai",
  bombay: "Mumbai", "navi mumbai": "Navi Mumbai", thane: "Thane", madras: "Chennai", chennai: "Chennai",
  calcutta: "Kolkata", kolkata: "Kolkata", "new delhi": "New Delhi", delhi: "Delhi", "delhi ncr": "Delhi",
  ncr: "Delhi", hyderabad: "Hyderabad", secunderabad: "Hyderabad", pune: "Pune", noida: "Noida",
  "greater noida": "Noida", ahmedabad: "Ahmedabad", kochi: "Kochi", cochin: "Kochi", trivandrum: "Thiruvananthapuram",
  thiruvananthapuram: "Thiruvananthapuram", jaipur: "Jaipur", indore: "Indore", chandigarh: "Chandigarh",
  mohali: "Mohali", coimbatore: "Coimbatore", mysore: "Mysuru", mysuru: "Mysuru", bhubaneswar: "Bhubaneswar",
  nagpur: "Nagpur", lucknow: "Lucknow", vizag: "Visakhapatnam", visakhapatnam: "Visakhapatnam", vadodara: "Vadodara",
  surat: "Surat", mangalore: "Mangaluru", mangaluru: "Mangaluru",
};
const INDIAN_CITIES = new Set(Object.values(CITY_ALIASES));
const COUNTRY_ALIASES: Record<string, string> = {
  india: "IN", in: "IN", ind: "IN", "united states": "US", "united states of america": "US", usa: "US", us: "US",
  "united kingdom": "GB", uk: "GB", england: "GB", singapore: "SG", germany: "DE", canada: "CA", australia: "AU",
  "united arab emirates": "AE", uae: "AE", ireland: "IE", netherlands: "NL", france: "FR", japan: "JP", poland: "PL",
  spain: "ES", israel: "IL", brazil: "BR", mexico: "MX", philippines: "PH",
};
const REMOTE_RE = /\b(remote|work from home|wfh|anywhere|distributed|virtual)\b/i;
const NOT_A_CITY = /\b(multiple|various|several|pan[- ]india|any|location|locations|tbd|hybrid|onsite|on-site|office)\b/i;

export function normalizeLocation(raw: string): JobLocation {
  const text = raw.replace(/\s+/g, " ").trim();
  const parts = text
    .split(/\s+[-–—]\s+|[,|/;()]/)
    .map((p) => p.trim())
    .filter(Boolean);
  let city: string | null = null;
  let country: string | null = null;
  for (const part of parts) {
    const key = part.toLowerCase();
    if (!country && COUNTRY_ALIASES[key]) {
      country = COUNTRY_ALIASES[key] ?? null;
      continue;
    }
    if (!city && CITY_ALIASES[key]) city = CITY_ALIASES[key] ?? null;
  }
  if (!city && parts[0] && !REMOTE_RE.test(parts[0]) && !NOT_A_CITY.test(parts[0]) && !COUNTRY_ALIASES[parts[0].toLowerCase()]) {
    if (/^[\p{L}][\p{L} .'-]{1,40}$/u.test(parts[0])) city = parts[0];
  }
  if (/\bpan[- ]india\b/i.test(text)) country = "IN";
  if (city && !country && INDIAN_CITIES.has(city)) country = "IN";
  return { raw: text, city, state: null, country };
}

function detectWorkMode(raw: RawJob, locationText: string): WorkMode | null {
  if (isOneOf(raw.workMode, WORK_MODES)) return raw.workMode;
  if (raw.isRemote === true) return "remote";
  const t = `${raw.title} ${locationText}`;
  if (/\bhybrid\b/i.test(t)) return "hybrid";
  if (REMOTE_RE.test(t)) return "remote";
  if (/\b(on-?site|in[- ]office|work from office|wfo)\b/i.test(t)) return "onsite";
  return null;
}

/* ─────────────────────────── Salary, lists, tags ─────────────────────────── */

const FX_TO_INR: Record<string, number> = {
  INR: 1, USD: 84, EUR: 90, GBP: 106, SGD: 63, AED: 23, CAD: 61, AUD: 55, CHF: 95, JPY: 0.56,
};
const PERIOD_FACTOR: Record<Salary["period"], number> = { year: 1, month: 12, hour: 2080 };

function cleanSalary(value: unknown): Salary | null {
  if (!isObject(value)) return null;
  const n = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null);
  let min = n(value.min);
  let max = n(value.max);
  if (min === null && max === null) return null;
  if (min !== null && max !== null && min > max) [min, max] = [max, min];
  const currency = typeof value.currency === "string" && /^[A-Za-z]{3}$/.test(value.currency) ? value.currency.toUpperCase() : null;
  if (!currency) return null;
  const period = isOneOf(value.period, ["hour", "month", "year"] as const) ? value.period : "year";
  return { min, max, currency, period, raw: typeof value.raw === "string" ? value.raw : null };
}

function inrYearly(salary: Salary | null): [number | null, number | null] {
  if (!salary) return [null, null];
  const fx = FX_TO_INR[salary.currency];
  if (fx === undefined) return [null, null];
  const f = fx * PERIOD_FACTOR[salary.period];
  const conv = (v: number | null): number | null => (v === null ? null : Math.round(v * f));
  return [conv(salary.min), conv(salary.max)];
}

function cleanStrings(value: unknown, max: number, maxLen = 80): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const v of value) {
    if (typeof v !== "string") continue;
    const s = v.replace(/\s+/g, " ").trim().slice(0, maxLen);
    const k = s.toLowerCase();
    if (!s || seen.has(k)) continue;
    seen.add(k);
    out.push(s);
    if (out.length >= max) break;
  }
  return out;
}

export function extractBatches(text: string): number[] {
  const years = new Set<number>();
  const t = text.slice(0, 6000);
  // "2025 batch", "2025 & 2026 batch", "2024/2025/2026 passouts"
  for (const m of t.matchAll(/\b((?:20[0-4]\d\s*(?:,|&|and|\/|or|-)\s*){0,6}20[0-4]\d)\s*(?:batch(?:es)?|pass[- ]?outs?|graduates?)\b/gi)) {
    for (const y of (m[1] ?? "").matchAll(/20[0-4]\d/g)) years.add(Number(y[0]));
  }
  for (const m of t.matchAll(/\b(?:batch(?:es)?|pass[- ]?outs?|graduating(?: in)?|yop)\s*(?:of|:|-)?\s*((?:20[0-4]\d\s*(?:,|&|and|\/|or|-)?\s*){1,6})/gi)) {
    for (const y of (m[1] ?? "").matchAll(/20[0-4]\d/g)) years.add(Number(y[0]));
  }
  return [...years].filter((y) => y >= 2000 && y <= 2100).sort((a, b) => a - b);
}

function cleanBatches(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((v): v is number => Number.isInteger(v) && v >= 2000 && v <= 2100))].sort((a, b) => a - b);
}

function detectTags(raw: RawJob, text: string): string[] {
  const tags = new Set(cleanStrings(raw.tags, 20, 40).map((t) => slugify(t)).filter(Boolean));
  const hay = `${raw.title}\n${text.slice(0, 4000)}`;
  if (/\bwalk[- ]?in\b/i.test(hay)) tags.add("walk-in");
  if (/\boff[- ]?campus\b/i.test(hay)) tags.add("off-campus");
  if (/\b(work from home|wfh)\b/i.test(hay)) tags.add("wfh");
  if (/\b(women|female candidates)\b/i.test(hay)) tags.add("women");
  if (/\burgent(ly)?\b/i.test(raw.title)) tags.add("urgent");
  return [...tags];
}

function cleanDomain(v: unknown): string | null {
  if (typeof v !== "string" || !v.trim()) return null;
  const d = v.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split(/[/?#]/)[0] ?? "";
  return /^[a-z0-9.-]+\.[a-z]{2,}$/.test(d) ? d : null;
}

function qualityScore(parts: {
  official: boolean;
  officialApply: boolean;
  descriptionLength: number;
  salary: boolean;
  location: boolean;
  recent: boolean;
}): number {
  let q = 20;
  if (parts.official) q += 25;
  if (parts.officialApply) q += 10;
  q += parts.descriptionLength > 1500 ? 20 : parts.descriptionLength > 500 ? 14 : parts.descriptionLength > 100 ? 7 : 0;
  if (parts.salary) q += 10;
  if (parts.location) q += 10;
  if (parts.recent) q += 5;
  return Math.max(0, Math.min(100, q));
}

/* ─────────────────────────── normalize ─────────────────────────── */

/** RawJob (already passing validateRawJob) → JobInput that always passes validateJobInput. */
export function fallbackNormalize(raw: RawJob, opts: NormalizeOptions = {}): JobInput {
  const now = opts.now ?? new Date();
  const company = (opts.company?.name?.trim() || String(raw.company ?? "").replace(/\s+/g, " ").trim()) || "Unknown company";
  const companySlug =
    opts.company?.slug || slugify(raw.companySlug ?? "") || slugify(company) || `company-${sha1(company).slice(0, 10)}`;
  const title = String(raw.title ?? "").replace(/\s+/g, " ").trim().slice(0, 300) || "Untitled role";
  const sourceUrl = raw.sourceUrl;
  const applyUrl = isHttpUrl(raw.applyUrl) ? raw.applyUrl : sourceUrl;

  const html = typeof raw.descriptionHtml === "string" ? raw.descriptionHtml : null;
  const plain = typeof raw.descriptionText === "string" ? raw.descriptionText : null;
  const text = (html ? htmlToText(html) : plain ? plain.replace(/\r\n?/g, "\n").replace(/[ \t]+/g, " ").trim() : "").slice(0, 50_000);

  const locations = (Array.isArray(raw.locations) ? raw.locations : [])
    .filter((l): l is string => typeof l === "string" && l.trim().length > 0)
    .slice(0, 25)
    .map(normalizeLocation);
  const locationText = locations.map((l) => l.raw).join(" | ");
  const workMode = detectWorkMode(raw, locationText);
  const isRemote = typeof raw.isRemote === "boolean" ? raw.isRemote : workMode === "remote";

  const jobType = detectJobType(raw);
  const hintMin = typeof raw.experienceMin === "number" && Number.isFinite(raw.experienceMin) ? raw.experienceMin : null;
  const hintMax = typeof raw.experienceMax === "number" && Number.isFinite(raw.experienceMax) ? raw.experienceMax : null;
  const years: Years | null =
    hintMin !== null || hintMax !== null
      ? { min: hintMin, max: hintMax }
      : (parseYears(raw.experienceRaw) ?? parseYears(title) ?? parseYears(text));
  const experienceLevel = classifyLevel({
    jobType,
    years,
    hint: isOneOf(raw.experienceLevel, EXPERIENCE_LEVELS) ? raw.experienceLevel : undefined,
    title,
    description: text,
  });

  const salary = cleanSalary(raw.salary);
  const [salaryInrYearlyMin, salaryInrYearlyMax] = inrYearly(salary);
  const batches = cleanBatches(raw.batches);
  const postedMs = parseTime(raw.postedAt);
  const postedAt = postedMs !== null && postedMs <= now.getTime() + 86_400_000 ? new Date(postedMs).toISOString() : now.toISOString();
  const validMs = parseTime(raw.validThrough ?? null);
  const companyDomain = cleanDomain(raw.companyDomain) ?? cleanDomain(opts.company?.domain);
  const applyHost = hostOf(applyUrl);

  return {
    fingerprint: computeFingerprint({
      applyUrl,
      companySlug,
      title,
      primaryCity: locations.find((l) => l.city)?.city ?? null,
      isRemote,
      jobType,
    }),
    source: raw.source,
    sourceName: opts.sourceName?.trim() || raw.source,
    sourceKind: raw.sourceKind,
    sourceJobId: raw.sourceJobId,
    sourceUrl,
    target: typeof raw.target === "string" ? raw.target : null,
    applyUrl,
    title,
    company,
    companySlug,
    companyDomain,
    companyLogoUrl: isHttpUrl(raw.companyLogoUrl)
      ? raw.companyLogoUrl
      : companyDomain
        ? `https://www.google.com/s2/favicons?domain=${encodeURIComponent(companyDomain)}&sz=128`
        : null,
    companyTags: cleanStrings(opts.company?.tags, 20, 40),
    locations,
    workMode,
    isRemote,
    jobType,
    experienceLevel,
    experienceMin: years?.min ?? null,
    experienceMax: years?.max ?? null,
    batches: batches.length > 0 ? batches : extractBatches(`${title}\n${text}`),
    degrees: cleanStrings(raw.degrees, 10, 60),
    salary,
    salaryInrYearlyMin,
    salaryInrYearlyMax,
    skills: cleanStrings(raw.skills, 12, 60),
    category: categorize(title, raw.department),
    department: typeof raw.department === "string" && raw.department.trim() ? raw.department.trim().slice(0, 120) : null,
    descriptionHtml: text ? textToHtml(text) : null,
    descriptionText: text || null,
    summary: text ? summarize(text) : null,
    postedAt,
    validThrough: validMs !== null ? new Date(validMs).toISOString() : null,
    qualityScore: qualityScore({
      official: isOfficialKind(raw.sourceKind),
      officialApply: applyHost !== null && isOfficialHost(applyHost) && isHttpUrl(raw.applyUrl),
      descriptionLength: text.length,
      salary: salary !== null,
      location: locations.some((l) => l.city !== null || l.country !== null) || isRemote,
      recent: postedMs !== null && now.getTime() - postedMs < 7 * 86_400_000,
    }),
    tags: detectTags(raw, text),
    extra: { ...(isObject(raw.extra) ? raw.extra : {}), normalizedBy: FALLBACK_NORMALIZER_ID },
  };
}
