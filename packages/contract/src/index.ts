/**
 * EasyJobs shared contract — v1.1.0
 * Source of truth: prompts.md §0.2, amended by W1 (docs/INTEGRATION.md → "Contract 1.1.0"). Every 1.1 addition is
 * optional, so 1.0 producers and consumers keep working.
 * Isomorphic (browser + Node), zero runtime dependencies.
 * Node-only helpers (HTTP client, logger, Scraper interface, CLI) live in "@easyjobs/contract/node".
 */
export const CONTRACT_VERSION = "1.1.1";

/* ─────────────────────────── Enums ─────────────────────────── */

export const JOB_TYPES = ["internship", "full_time", "part_time", "contract", "temporary", "apprenticeship", "freelance"] as const;
export type JobType = (typeof JOB_TYPES)[number];

/**
 * intern    – internships, summer analyst/intern, intern-trainee
 * fresher   – 0 yrs: new grad, campus / off-campus drive, graduate engineer trainee, "20XX batch"
 * entry     – 0–2 yrs: junior, associate, SDE-1, Engineer I
 * mid       – 2–5 yrs: SDE-2, Engineer II
 * senior    – 5–8 yrs: Senior, Sr., SDE-3
 * lead      – 8+ yrs: Staff, Principal, Lead, Architect, Engineering Manager
 * executive – Director, Head of, VP, CXO
 */
export const EXPERIENCE_LEVELS = ["intern", "fresher", "entry", "mid", "senior", "lead", "executive"] as const;
export type ExperienceLevel = (typeof EXPERIENCE_LEVELS)[number];

export const WORK_MODES = ["onsite", "hybrid", "remote"] as const;
export type WorkMode = (typeof WORK_MODES)[number];

/** career_site = company's own custom portal · ats = company board on Greenhouse/Lever/Workday/… — both are "official". */
export const SOURCE_KINDS = ["career_site", "ats", "job_board", "aggregator"] as const;
export type SourceKind = (typeof SOURCE_KINDS)[number];
export const OFFICIAL_SOURCE_KINDS: readonly SourceKind[] = ["career_site", "ats"];
/** When merging duplicates, fields from the higher-priority source win. */
export const SOURCE_KIND_PRIORITY: Record<SourceKind, number> = { career_site: 4, ats: 3, job_board: 2, aggregator: 1 };
export const isOfficialKind = (kind: SourceKind): boolean => OFFICIAL_SOURCE_KINDS.includes(kind);

export const JOB_CATEGORIES = [
  "software_engineering", "data_ai", "devops_cloud", "security", "qa_testing", "product", "design",
  "marketing", "sales", "business_ops", "finance", "hr", "consulting", "customer_support",
  "core_engineering", "research", "content", "legal", "healthcare", "education", "other",
] as const;
export type JobCategory = (typeof JOB_CATEGORIES)[number];

export const COMPANY_TAGS = [
  "big_tech", "mnc", "unicorn", "startup", "indian_it", "product", "service", "gcc",
  "fintech", "consulting", "bank", "ai", "yc", "psu", "govt",
] as const;
export type CompanyTag = (typeof COMPANY_TAGS)[number];

export const ATS_TYPES = [
  "greenhouse", "lever", "ashby", "smartrecruiters", "workable", "recruitee", "bamboohr", "personio",
  "breezy", "teamtailor", "workday", "oracle", "successfactors", "eightfold", "phenom", "icims",
  "avature", "taleo", "zoho_recruit", "keka", "darwinbox", "freshteam", "jsonld", "custom",
] as const;
export type AtsType = (typeof ATS_TYPES)[number];

export const POSTED_WITHIN = ["1h", "24h", "3d", "7d", "30d", "any"] as const;
export type PostedWithin = (typeof POSTED_WITHIN)[number];
export const POSTED_WITHIN_MS: Record<PostedWithin, number | null> = {
  "1h": 3_600_000, "24h": 86_400_000, "3d": 259_200_000, "7d": 604_800_000, "30d": 2_592_000_000, any: null,
};

export const SORTS = ["relevance", "newest", "salary"] as const;
export type SortBy = (typeof SORTS)[number];

/** Well-known job tags (free-form tags are allowed too). */
export const KNOWN_TAGS = [
  "off-campus", "walk-in", "wfh", "women", "diversity", "pwd", "urgent", "suspicious",
  // 1.1: emitted by scrapers/normalize (P03 #6, P10 #5)
  "part-time", "ppo", "unpaid", "visa-sponsorship", "test-posting",
  // 1.1.1: non-jobs (talent pools, "general application", "Don't see a fit?") — born closed, never in search
  "general-application",
] as const;

/**
 * 1.1: canonical degree labels (P03 #2, P06 #4, P12 #5). Scrapers should emit these in `RawJob.degrees`;
 * normalize maps common variants onto them. Labels outside the list are allowed (kept tidy, not dropped).
 */
export const DEGREES = [
  "B.E/B.Tech", "M.E/M.Tech", "BCA", "MCA", "B.Sc", "M.Sc", "BBA", "MBA", "B.Com", "M.Com", "BA", "MA", "Diploma", "PhD",
  "Any graduate", "Any postgraduate", "Bachelor's", "Master's", "12th Pass", "10th Pass", "ITI", "B.Pharm", "M.Pharm",
  "MBBS", "B.Arch", "B.Des", "LLB", "LLM", "CA", "CFA",
] as const;
export type Degree = (typeof DEGREES)[number];

/* ─────────────────────────── Display labels ─────────────────────────── */

export const LABELS = {
  jobType: {
    internship: "Internship", full_time: "Full-time", part_time: "Part-time", contract: "Contract",
    temporary: "Temporary", apprenticeship: "Apprenticeship", freelance: "Freelance",
  },
  level: {
    intern: "Internship", fresher: "Fresher / New grad", entry: "Entry level · 0–2 yrs", mid: "Mid level · 2–5 yrs",
    senior: "Senior · 5–8 yrs", lead: "Lead / Staff · 8+ yrs", executive: "Director & above",
  },
  workMode: { onsite: "On-site", hybrid: "Hybrid", remote: "Remote" },
  sourceKind: { career_site: "Official career site", ats: "Official career site", job_board: "Job board", aggregator: "Aggregator" },
  category: {
    software_engineering: "Software Engineering", data_ai: "Data & AI", devops_cloud: "DevOps & Cloud", security: "Security",
    qa_testing: "QA & Testing", product: "Product", design: "Design", marketing: "Marketing", sales: "Sales",
    business_ops: "Business & Operations", finance: "Finance & Accounting", hr: "HR & Recruiting", consulting: "Consulting",
    customer_support: "Customer Support", core_engineering: "Core Engineering", research: "Research & Science",
    content: "Content & Media", legal: "Legal", healthcare: "Healthcare", education: "Education", other: "Other",
  },
  companyTag: {
    big_tech: "Big Tech", mnc: "MNC", unicorn: "Unicorn", startup: "Startup", indian_it: "Indian IT services",
    product: "Product company", service: "Service company", gcc: "Global capability centre", fintech: "Fintech",
    consulting: "Consulting", bank: "Banking", ai: "AI", yc: "Y Combinator", psu: "PSU", govt: "Government",
  },
  posted: { "1h": "Past hour", "24h": "Past 24 hours", "3d": "Past 3 days", "7d": "Past week", "30d": "Past month", any: "Any time" },
  sort: { relevance: "Most relevant", newest: "Newest first", salary: "Highest pay" },
} as const satisfies {
  jobType: Record<JobType, string>;
  level: Record<ExperienceLevel, string>;
  workMode: Record<WorkMode, string>;
  sourceKind: Record<SourceKind, string>;
  category: Record<JobCategory, string>;
  companyTag: Record<CompanyTag, string>;
  posted: Record<PostedWithin, string>;
  sort: Record<SortBy, string>;
};

/* ─────────────────────────── Core data types ─────────────────────────── */

export interface Salary {
  min: number | null;
  max: number | null;
  /** ISO 4217 — "INR", "USD", … */
  currency: string;
  period: "hour" | "month" | "year";
  /** Original text — "₹4–6 LPA", "25,000 /month" */
  raw: string | null;
}

export interface JobLocation {
  raw: string;
  /** Canonical city — "Bengaluru", "Gurugram", "New York" */
  city: string | null;
  state: string | null;
  /** ISO 3166-1 alpha-2 — "IN", "US" */
  country: string | null;
}

/** What scrapers emit. Required fields first; optional "hints" = fill them when the source has structured data. */
export interface RawJob {
  /** Scraper id — "greenhouse", "coursejoiner", "amazon" */
  source: string;
  sourceKind: SourceKind;
  /** Stable id within the source */
  sourceJobId: string;
  /** Human-viewable page of the posting at the source */
  sourceUrl: string;
  /** Registry company slug / feed key used for sweeps; null if not applicable */
  target: string | null;
  /** Direct apply link — the official company/ATS URL whenever known */
  applyUrl: string | null;
  title: string;
  company: string;
  /** Raw location strings; [] if unknown */
  locations: string[];
  descriptionHtml: string | null;
  /** ISO-8601; null if unknown */
  postedAt: string | null;

  companySlug?: string | null;
  companyDomain?: string | null;
  companyLogoUrl?: string | null;
  descriptionText?: string | null;
  validThrough?: string | null;
  department?: string | null;
  employmentTypeRaw?: string | null;
  experienceRaw?: string | null;
  salaryRaw?: string | null;
  jobType?: JobType;
  experienceLevel?: ExperienceLevel;
  experienceMin?: number | null;
  experienceMax?: number | null;
  workMode?: WorkMode;
  isRemote?: boolean;
  salary?: Salary | null;
  batches?: number[];
  degrees?: string[];
  skills?: string[];
  tags?: string[];
  /**
   * 1.1: a re-sighting of an already-stored job emitted without its description (see `ScrapeContext.isKnown`).
   * Normalize copies it to `JobInput.extra.light`; the API merge then keeps the stored description-derived fields
   * (level, experience range, category, skills, degrees, summary, description, quality).
   */
  light?: boolean;
  /**
   * 1.1: whether `applyUrl` points at a single posting (true) or a generic careers page (false). Overrides
   * normalize's heuristic for fingerprint rule 1 (§0.4: rule 1 applies only to official, job-specific URLs).
   */
  applyUrlSpecific?: boolean;
  extra?: Record<string, unknown>;
}

/** Output of @easyjobs/normalize and payload item of POST /v1/ingest/jobs. */
export interface JobInput {
  /** Dedupe key — prompts.md §0.4 */
  fingerprint: string;
  source: string;
  sourceName: string;
  sourceKind: SourceKind;
  sourceJobId: string;
  sourceUrl: string;
  target: string | null;
  /** Falls back to sourceUrl */
  applyUrl: string;
  title: string;
  company: string;
  companySlug: string;
  companyDomain: string | null;
  companyLogoUrl: string | null;
  /** CompanyTag values from the registry; [] if unknown */
  companyTags: string[];
  locations: JobLocation[];
  workMode: WorkMode | null;
  isRemote: boolean;
  jobType: JobType;
  experienceLevel: ExperienceLevel;
  experienceMin: number | null;
  experienceMax: number | null;
  /** Eligible graduation years, e.g. [2025, 2026] */
  batches: number[];
  degrees: string[];
  salary: Salary | null;
  /** Normalized for filtering/sorting */
  salaryInrYearlyMin: number | null;
  salaryInrYearlyMax: number | null;
  /** ≤ 12 canonical skill names */
  skills: string[];
  category: JobCategory;
  department: string | null;
  /** Sanitized HTML */
  descriptionHtml: string | null;
  descriptionText: string | null;
  /** ≤ 280 chars plain text */
  summary: string | null;
  /** ISO-8601; falls back to first-seen time */
  postedAt: string;
  validThrough: string | null;
  /** 0–100 */
  qualityScore: number;
  tags: string[];
  /**
   * Conventions (1.1): `extra.light: true` marks a light record (see `RawJob.light`);
   * `extra.normalize.defaulted` lists fields holding a default rather than evidence — the merge never lets a
   * defaulted value overwrite a stored real one; `extra.terms` carries the source's `SourceTerms`.
   */
  extra: Record<string, unknown>;
}

/** One company in @easyjobs/registry (token formats: prompts.md §0.6). */
export interface CompanyTarget {
  /** Unique kebab-case — "razorpay" */
  slug: string;
  name: string;
  domain: string | null;
  ats: AtsType;
  token: string;
  careersUrl: string;
  /** CompanyTag values */
  tags: string[];
  hq: string | null;
  indiaPresence: boolean;
  /** 1 = every ~15 min · 2 = hourly · 3 = daily */
  priority: 1 | 2 | 3;
  verifiedAt?: string | null;
  openJobs?: number | null;
  /** 1.1: legal entities and former names ("Bundl Technologies" → Swiggy). */
  aliases?: string[];
  extra?: Record<string, unknown>;
}

/* ─────────────────────────── Public API types (prompts.md §0.5) ─────────────────────────── */

export interface JobCompanyRef {
  name: string;
  slug: string;
  domain: string | null;
  logoUrl: string | null;
  tags: string[];
}

/**
 * 1.1: display conditions a source's terms of use impose (P12 #1). The web honours them: credit + link back,
 * `rel` without `nofollow` when `followLinkRequired`, no JobPosting JSON-LD when `noJobPostingSchema`, …
 */
export interface SourceTerms {
  linkBackRequired?: boolean;
  followLinkRequired?: boolean;
  applyUrlUnchanged?: boolean;
  noJobPostingSchema?: boolean;
  noThirdPartySyndication?: boolean;
  creditRequired?: boolean;
  noLogoUse?: boolean;
  removeWhenExpired?: boolean;
}

export interface JobSourceRef {
  id: string;
  name: string;
  kind: SourceKind;
  url: string;
  /** 1.1: e.g. "Jobs via Remote OK" (from `Scraper.attribution`). */
  attribution?: string;
  /** 1.1: display conditions of this source's terms. */
  terms?: SourceTerms;
}

export interface JobListItem {
  id: string;
  /** kebab-case, e.g. "software-engineer-intern-razorpay" — page URL is jobPath(job) */
  slug: string;
  title: string;
  company: JobCompanyRef;
  /** Display strings — "Bengaluru, IN", "Remote (India)" */
  locations: string[];
  isRemote: boolean;
  workMode: WorkMode | null;
  jobType: JobType;
  experienceLevel: ExperienceLevel;
  experienceMin: number | null;
  experienceMax: number | null;
  batches: number[];
  salary: Salary | null;
  /** ≤ 8 */
  skills: string[];
  category: JobCategory;
  tags: string[];
  postedAt: string;
  applyUrl: string;
  /** true if any source is career_site/ats */
  isOfficial: boolean;
  /** Most official first */
  sources: JobSourceRef[];
  /** ≤ 280 chars */
  summary: string | null;
}

export interface JobDetail extends JobListItem {
  /** Sanitized HTML */
  descriptionHtml: string | null;
  degrees: string[];
  department: string | null;
  validThrough: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  status: "open" | "closed";
}

export interface FacetBucket {
  value: string;
  label: string;
  count: number;
}

export interface Facets {
  type: FacetBucket[];
  level: FacetBucket[];
  mode: FacetBucket[];
  category: FacetBucket[];
  location: FacetBucket[];
  company: FacetBucket[];
  ctype: FacetBucket[];
  skills: FacetBucket[];
  batch: FacetBucket[];
  source: FacetBucket[];
  tag: FacetBucket[];
}

export interface JobsSearchResponse {
  data: JobListItem[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  /** Disjunctive facets: each facet's counts apply all OTHER active filters, not its own. */
  facets: Facets;
  tookMs: number;
  /** 1.1: typo corrections applied to `q` ({ amazn: "amazon" }) — "Showing results for …". */
  corrections?: Record<string, string>;
  /** 1.1: true when no exact match existed and a fuzzy (trigram) fallback produced the results. */
  fuzzy?: boolean;
}

export interface SimilarJobsResponse {
  data: JobListItem[];
}

export interface SuggestResponse {
  titles: string[];
  companies: { slug: string; name: string; logoUrl: string | null; openJobs: number }[];
  locations: string[];
  skills: string[];
}

export interface StatsResponse {
  totalOpen: number;
  newLastHour: number;
  newLast24h: number;
  companies: number;
  byLevel: Record<ExperienceLevel, number>;
  byType: Record<JobType, number>;
  sources: { id: string; name: string; kind: SourceKind; open: number; lastRunAt: string | null }[];
  lastUpdatedAt: string | null;
}

export interface CompanySummary {
  slug: string;
  name: string;
  domain: string | null;
  logoUrl: string | null;
  tags: string[];
  hq: string | null;
  careersUrl: string | null;
  openJobs: number;
}

export interface CompaniesResponse {
  data: CompanySummary[];
  page: number;
  pageSize: number;
  total: number;
}

export interface ApiError {
  error: { code: string; message: string };
}

/* Ingest (worker → API, header `x-ingest-key`) */
export interface IngestRequest {
  source: string;
  runId: string;
  /** ≤ 500 per request */
  jobs: JobInput[];
}
export interface IngestResponse {
  inserted: number;
  updated: number;
  merged: number;
  rejected: { index: number; error: string }[];
}
export interface SweepRequest {
  source: string;
  /** 1.1: `null` sweeps the source's target-less postings (`RawJob.target === null`). */
  target: string | null;
  seenSourceJobIds: string[];
}
export interface SweepResponse {
  /** Jobs closed because no source is left. */
  closed: number;
  /** 1.1: (source, sourceJobId) rows detached by the sweep. */
  removed?: number;
}
export interface KnownIdsResponse {
  ids: string[];
}
export interface RunReport {
  runId: string;
  source: string;
  target: string | null;
  startedAt: string;
  finishedAt: string;
  status: "ok" | "partial" | "error";
  emitted: number;
  invalid: number;
  errors: string[];
  /** 1.1: the run saw the whole listing (sweep-eligible). */
  complete?: boolean;
  /** 1.1: numeric run stats (raw/valid/invalid/inserted/…, plus scraper-reported ones like siteTotal). */
  stats?: Record<string, number>;
}

/** GET /v1/stream (SSE): `event: <type>` + `data: <JSON of the whole StreamEvent>`; `: ping` comment every 25 s. */
export type StreamEvent =
  | { type: "job"; job: JobListItem }
  | { type: "stats"; stats: Pick<StatsResponse, "totalOpen" | "newLastHour" | "newLast24h" | "lastUpdatedAt"> };

export const API_ROUTES = {
  jobs: "/v1/jobs",
  job: (id: string) => `/v1/jobs/${encodeURIComponent(id)}`,
  similar: (id: string) => `/v1/jobs/${encodeURIComponent(id)}/similar`,
  suggest: "/v1/suggest",
  stats: "/v1/stats",
  companies: "/v1/companies",
  company: (slug: string) => `/v1/companies/${encodeURIComponent(slug)}`,
  stream: "/v1/stream",
  ingestJobs: "/v1/ingest/jobs",
  ingestSweep: "/v1/ingest/sweep",
  ingestKnown: "/v1/ingest/known",
  ingestRuns: "/v1/ingest/runs",
  health: "/health",
} as const;

/** Web page path of a job. */
export function jobPath(job: { id: string; slug: string }): string {
  return `/jobs/${encodeURIComponent(job.id)}/${job.slug}`;
}

/* ─────────────────────────── Search query (shared by web URL state and API) ─────────────────────────── */

export interface SearchQuery {
  q?: string;
  type?: JobType[];
  level?: ExperienceLevel[];
  mode?: WorkMode[];
  category?: JobCategory[];
  /** Canonical city names ("Bengaluru") or "Remote" */
  location?: string[];
  /** ISO alpha-2 */
  country?: string[];
  /** Company slugs */
  company?: string[];
  /** Company tags (CompanyTag values) — MNC, startup, unicorn, … */
  ctype?: string[];
  skills?: string[];
  /** Graduation years */
  batch?: number[];
  /** Source ids — "coursejoiner", "greenhouse", … */
  source?: string[];
  tag?: string[];
  /** Only jobs with at least one official (career_site/ats) source */
  official?: boolean;
  posted: PostedWithin;
  /** INR per year */
  salaryMin?: number;
  /** Candidate's years of experience → jobs where experienceMin ≤ exp ≤ experienceMax (null bounds are open-ended) */
  exp?: number;
  sort: SortBy;
  page: number;
  pageSize: number;
}

export const DEFAULT_SEARCH_QUERY: SearchQuery = { posted: "any", sort: "relevance", page: 1, pageSize: 20 };

const QUERY_KEYS = [
  "q", "type", "level", "mode", "category", "location", "country", "company", "ctype", "skills", "batch",
  "source", "tag", "official", "posted", "salaryMin", "exp", "sort", "page", "pageSize",
] as const satisfies readonly (keyof SearchQuery)[];

type QueryInput = URLSearchParams | Record<string, string | string[] | undefined>;

const first = (v: unknown): unknown => (Array.isArray(v) ? v[0] : v);

function splitList(v: unknown): string[] {
  if (v === undefined || v === null) return [];
  const arr: unknown[] = Array.isArray(v) ? v : [v];
  const parts = arr.flatMap((x) => String(x).split(",")).map((s) => s.trim()).filter(Boolean);
  return [...new Set(parts)];
}

function enumList<T extends string>(v: unknown, allowed: readonly T[]): T[] | undefined {
  const out = splitList(v).filter((x): x is T => (allowed as readonly string[]).includes(x));
  return out.length > 0 ? out : undefined;
}

function strList(v: unknown): string[] | undefined {
  const out = splitList(v).map((s) => s.slice(0, 80)).slice(0, 50);
  return out.length > 0 ? out : undefined;
}

function clampNum(v: unknown, min: number, max: number): number | undefined {
  const raw = first(v);
  if (raw === undefined || raw === null || raw === "") return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : undefined;
}

function oneOf<T extends string>(v: unknown, allowed: readonly T[], fallback: T): T {
  const s = String(first(v) ?? "");
  return (allowed as readonly string[]).includes(s) ? (s as T) : fallback;
}

/** Lenient parser: unknown values are dropped, numbers clamped. Accepts URLSearchParams or a Next.js/Hono query object. */
export function parseSearchQuery(input: QueryInput): SearchQuery {
  const get = (key: string): unknown => {
    if (input instanceof URLSearchParams) {
      const all = input.getAll(key);
      return all.length > 0 ? all : undefined;
    }
    return input[key];
  };
  const q = String(first(get("q")) ?? "").trim().slice(0, 200);
  const batch = splitList(get("batch")).map(Number).filter((n) => Number.isInteger(n) && n >= 2000 && n <= 2100);
  const official = String(first(get("official")) ?? "");
  return {
    q: q || undefined,
    type: enumList(get("type"), JOB_TYPES),
    level: enumList(get("level"), EXPERIENCE_LEVELS),
    mode: enumList(get("mode"), WORK_MODES),
    category: enumList(get("category"), JOB_CATEGORIES),
    location: strList(get("location")),
    country: strList(get("country"))?.map((c) => c.toUpperCase()),
    company: strList(get("company"))?.map((c) => c.toLowerCase()),
    ctype: strList(get("ctype")),
    skills: strList(get("skills")),
    batch: batch.length > 0 ? batch : undefined,
    source: strList(get("source")),
    tag: strList(get("tag")),
    official: official === "1" || official === "true" ? true : undefined,
    posted: oneOf(get("posted"), POSTED_WITHIN, "any"),
    salaryMin: clampNum(get("salaryMin"), 0, 1_000_000_000),
    exp: clampNum(get("exp"), 0, 50),
    sort: oneOf(get("sort"), SORTS, "relevance"),
    page: Math.floor(clampNum(get("page"), 1, 500) ?? 1),
    pageSize: Math.floor(clampNum(get("pageSize"), 1, 50) ?? 20),
  };
}

/** Inverse of parseSearchQuery. Omits empty values and defaults; lists are comma-joined. */
export function toQueryString(query: Partial<SearchQuery>): string {
  const params = new URLSearchParams();
  for (const key of QUERY_KEYS) {
    const v = query[key];
    if (v === undefined || v === null || v === "" || v === false) continue;
    if (Array.isArray(v)) {
      if (v.length > 0) params.set(key, v.join(","));
      continue;
    }
    if (v === true) {
      params.set(key, "1");
      continue;
    }
    if (v === DEFAULT_SEARCH_QUERY[key]) continue;
    params.set(key, String(v));
  }
  return params.toString().replace(/%2C/gi, ",");
}

/* ─────────────────────────── Validation & helpers ─────────────────────────── */

const isHttpUrl = (v: unknown): boolean => {
  if (typeof v !== "string" || !/^https?:\/\//i.test(v)) return false;
  try {
    new URL(v);
    return true;
  } catch {
    return false;
  }
};
const isIso = (v: unknown): boolean => typeof v === "string" && !Number.isNaN(Date.parse(v));
const nonEmpty = (v: unknown): boolean => typeof v === "string" && v.trim().length > 0;
const isOneOf = (v: unknown, list: readonly string[]): boolean => typeof v === "string" && list.includes(v);

/** Returns a list of problems; [] means valid. */
export function validateRawJob(job: Partial<RawJob> | null | undefined): string[] {
  if (!job || typeof job !== "object") return ["not an object"];
  const e: string[] = [];
  for (const k of ["source", "sourceJobId", "title", "company"] as const) if (!nonEmpty(job[k])) e.push(`${k} is required`);
  if (!isOneOf(job.sourceKind, SOURCE_KINDS)) e.push("sourceKind invalid");
  if (!isHttpUrl(job.sourceUrl)) e.push("sourceUrl must be an absolute http(s) URL");
  if (job.applyUrl !== null && !isHttpUrl(job.applyUrl)) e.push("applyUrl must be null or an absolute http(s) URL");
  if (job.target !== null && typeof job.target !== "string") e.push("target must be string or null");
  if (!Array.isArray(job.locations)) e.push("locations must be an array");
  if (job.descriptionHtml !== null && typeof job.descriptionHtml !== "string") e.push("descriptionHtml must be string or null");
  if (job.postedAt !== null && !isIso(job.postedAt)) e.push("postedAt must be null or ISO-8601");
  if (job.jobType !== undefined && !isOneOf(job.jobType, JOB_TYPES)) e.push("jobType invalid");
  if (job.experienceLevel !== undefined && !isOneOf(job.experienceLevel, EXPERIENCE_LEVELS)) e.push("experienceLevel invalid");
  if (job.workMode !== undefined && !isOneOf(job.workMode, WORK_MODES)) e.push("workMode invalid");
  return e;
}

/** Returns a list of problems; [] means valid. */
export function validateJobInput(job: Partial<JobInput> | null | undefined): string[] {
  if (!job || typeof job !== "object") return ["not an object"];
  const e: string[] = [];
  for (const k of ["fingerprint", "source", "sourceName", "sourceJobId", "title", "company", "companySlug"] as const) {
    if (!nonEmpty(job[k])) e.push(`${k} is required`);
  }
  if (!isHttpUrl(job.sourceUrl)) e.push("sourceUrl invalid");
  if (!isHttpUrl(job.applyUrl)) e.push("applyUrl invalid");
  if (!isOneOf(job.sourceKind, SOURCE_KINDS)) e.push("sourceKind invalid");
  if (!isOneOf(job.jobType, JOB_TYPES)) e.push("jobType invalid");
  if (!isOneOf(job.experienceLevel, EXPERIENCE_LEVELS)) e.push("experienceLevel invalid");
  if (!isOneOf(job.category, JOB_CATEGORIES)) e.push("category invalid");
  if (job.workMode !== null && !isOneOf(job.workMode, WORK_MODES)) e.push("workMode must be null or valid");
  if (!isIso(job.postedAt)) e.push("postedAt invalid");
  for (const k of ["locations", "companyTags", "batches", "degrees", "skills", "tags"] as const) {
    if (!Array.isArray(job[k])) e.push(`${k} must be an array`);
  }
  if (typeof job.isRemote !== "boolean") e.push("isRemote must be boolean");
  if (typeof job.qualityScore !== "number" || job.qualityScore < 0 || job.qualityScore > 100) e.push("qualityScore must be 0–100");
  return e;
}

/** "Amazon Development Centre (India) Pvt. Ltd." → "amazon-development-centre-india-pvt-ltd" */
export function slugify(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "");
}
