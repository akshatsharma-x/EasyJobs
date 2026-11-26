# EasyJobs — build prompts

EasyJobs is a real-time internship and job search for India (plus remote and global roles). It reads the official career portals of MNCs, Indian IT companies and startups: Greenhouse, Lever, Ashby, Workday, Oracle, Eightfold and custom portals. It also pulls from **CourseJoiner**, Internshala, LinkedIn, Naukri, Unstop and open job APIs. Everything goes into one clean, fast search, with filters for internship, fresher, entry level, years of experience, batch, location, salary, company type and more.

## How to use this file

| Phase | Prompts | How |
|---|---|---|
| 0 · You, once (~2 min) | setup | commands below |
| 1 · Build, **in parallel** | **P01 – P12** | One Claude Code session per prompt, all running at the same time in this folder. Each session owns its own folder and codes only against the shared contract in §0, so **no prompt needs another prompt's output**. |
| 2 · Wire up and verify, **in order** | **W1 → W2 → W3** (→ W4) | Start after the Phase 1 sessions finish. |
| 3 · Optional add-ons | E1 – E3 | After W1. These can run in parallel. |

- To run a prompt, copy its whole code block into a fresh session in this folder.
- Fewer sessions available? Start with **P01, P02, P03, P05, P06, P07**. The rest plug in on their own whenever they finish, because the worker discovers scraper packages automatically.
- Each session ends by writing `docs/status/<ID>.md`. W1 reads those files.
- Etiquette: scrapers follow robots.txt, rate limits and each API's terms. The LinkedIn and Naukri adapters are **off by default** because those sites restrict automated access. Turn them on at your own discretion.

### Phase 0 — setup (you, once)

```bash
cd ~/Downloads/easyJobs
corepack enable pnpm        # or: npm i -g pnpm
pnpm -v
# Create the shared contract files from §0.2. Every session also does this; running it once up front avoids races.
node --input-type=module <<'EOF'
import fs from "node:fs";
import path from "node:path";
const md = fs.readFileSync("prompts.md", "utf8");
const re = /<!-- file: (\S+) -->\s*```[a-z]*\n([\s\S]*?)\n```/g;
for (const [, file, body] of md.matchAll(re)) {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, body + "\n", { flag: "wx" });
    console.log("created", file);
  } catch (e) {
    if (e.code === "EEXIST") console.log("exists ", file);
    else throw e;
  }
}
EOF
pnpm install
```

You don't need Docker or Postgres. Without `DATABASE_URL`, the API uses embedded Postgres (PGlite). Optional free keys give you more data: `ADZUNA_APP_ID`/`ADZUNA_APP_KEY`, `JOOBLE_API_KEY`, `LOGO_DEV_TOKEN`, `ANTHROPIC_API_KEY` (see §0.7).

### Architecture

```
SOURCES                         packages/scrapers/*        apps/worker                 apps/api + packages/db          apps/web
Company ATS boards  ─┐          one package per            scheduler (15m/1h/24h)      POST /v1/ingest/*               Next.js UI
(Greenhouse, Lever,  │          source family              → normalize (P03)           upsert · merge · sweep          search + filters
 Ashby, Workday, …)  ├─► Scraper.scrape() ─RawJob─►       → registry  (P04)  ─JobInput─►  Postgres / PGlite  ─► GET /v1/jobs, /v1/stream (SSE)
Custom portals       │                                     → batches, spool, sweep                                     live "N new jobs"
CourseJoiner, Intern-│
shala, LinkedIn, …  ─┘
```

---

## §0 Shared contract (every session reads all of §0 first)

### 0.1 Stack and conventions

- Monorepo using **pnpm workspaces**, Node ≥ 22, **TypeScript strict**, ESM everywhere.
- Internal packages are consumed **as TypeScript source**, with no build step (`"main": "./src/index.ts"`). Run code with `tsx` and test with `vitest`. Next.js lists them in `transpilePackages`.
- Package names are `@easyjobs/<name>`; scraper packages are `@easyjobs/scraper-<name>`. Internal dependencies use `"workspace:*"`.
- Only the API touches the database: Postgres, or PGlite in dev when `DATABASE_URL` is unset. The worker talks to the API over HTTP. The web app talks only to the API (or to its own mocks).
- Web: Next.js App Router, Tailwind v4, shadcn/ui. API: Hono on Node.
- All timestamps are ISO-8601 UTC strings. Money is normalized to INR per year for filtering (see §0.4).

### 0.2 Bootstrap (idempotent; run first in every session)

Run the bootstrap command from **Phase 0** above in the repo root. It creates each file below **only if it is missing**, with exactly the content shown. Then run `pnpm install` from the root. **Never edit these files.** Only W1 may change them.

<!-- file: package.json -->
```json
{
  "name": "easyjobs",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "engines": {
    "node": ">=22"
  },
  "scripts": {
    "typecheck": "pnpm -r run typecheck",
    "test": "pnpm -r run test"
  },
  "devDependencies": {
    "@types/node": "^22.10.0",
    "typescript": "^5.6.0"
  }
}
```

<!-- file: pnpm-workspace.yaml -->
```yaml
packages:
  - "apps/*"
  - "packages/*"
  - "packages/scrapers/*"
onlyBuiltDependencies:
  - esbuild
  - sharp
```

<!-- file: tsconfig.base.json -->
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2023", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "forceConsistentCasingInFileNames": true,
    "noEmit": true
  }
}
```

<!-- file: .gitignore -->
```gitignore
node_modules/
.env
.env.*
!.env.example
.data/
.cache/
.state/
.spool/
out/
dist/
.next/
coverage/
playwright-report/
test-results/
*.log
.DS_Store
```

<!-- file: packages/contract/package.json -->
```json
{
  "name": "@easyjobs/contract",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts",
    "./node": "./src/node.ts"
  },
  "scripts": {
    "typecheck": "tsc --noEmit -p ."
  },
  "devDependencies": {
    "@types/node": "^22.10.0",
    "typescript": "^5.6.0"
  }
}
```

<!-- file: packages/contract/tsconfig.json -->
```json
{
  "extends": "../../tsconfig.base.json",
  "include": ["src"]
}
```

<!-- file: packages/contract/src/index.ts -->
```ts
/**
 * EasyJobs shared contract — v1.0.0
 * Source of truth: prompts.md §0.2. Only the integration session (W1) may change this file.
 * Isomorphic (browser + Node), zero runtime dependencies.
 * Node-only helpers (HTTP client, logger, Scraper interface, CLI) live in "@easyjobs/contract/node".
 */
export const CONTRACT_VERSION = "1.0.0";

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
export const KNOWN_TAGS = ["off-campus", "walk-in", "wfh", "women", "diversity", "pwd", "urgent", "suspicious"] as const;

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

export interface JobSourceRef {
  id: string;
  name: string;
  kind: SourceKind;
  url: string;
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
  target: string;
  seenSourceJobIds: string[];
}
export interface SweepResponse {
  closed: number;
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
```

<!-- file: packages/contract/src/node.ts -->
```ts
/**
 * EasyJobs shared contract — Node-only helpers (v1.0.0).
 * Source of truth: prompts.md §0.2. Only the integration session (W1) may change this file.
 * Logger · polite HTTP client (per-host rate limit, retries, robots.txt) · Scraper plugin interface · standard scraper CLI.
 */
import { createWriteStream, mkdirSync } from "node:fs";
import { join } from "node:path";
import { validateRawJob, type AtsType, type CompanyTarget, type RawJob, type SourceKind } from "./index";

/* ─────────────────────────── Logger ─────────────────────────── */

export type LogMeta = Record<string, unknown>;

export interface Logger {
  debug(msg: string, meta?: LogMeta): void;
  info(msg: string, meta?: LogMeta): void;
  warn(msg: string, meta?: LogMeta): void;
  error(msg: string, meta?: LogMeta): void;
  child(scope: string): Logger;
}

/** LOG_LEVEL=debug enables debug lines; LOG_FORMAT=json prints JSON lines. */
export function createLogger(scope = "easyjobs"): Logger {
  const json = process.env.LOG_FORMAT === "json";
  const debugOn = process.env.LOG_LEVEL === "debug";
  const emit = (level: "debug" | "info" | "warn" | "error", msg: string, meta?: LogMeta): void => {
    if (level === "debug" && !debugOn) return;
    if (json) {
      console.log(JSON.stringify({ t: new Date().toISOString(), level, scope, msg, ...meta }));
      return;
    }
    const line = `${new Date().toISOString().slice(11, 19)} ${level.toUpperCase().padEnd(5)} [${scope}] ${msg}`;
    const out = level === "error" ? console.error : level === "warn" ? console.warn : console.log;
    if (meta && Object.keys(meta).length > 0) out(line, meta);
    else out(line);
  };
  return {
    debug: (m, x) => emit("debug", m, x),
    info: (m, x) => emit("info", m, x),
    warn: (m, x) => emit("warn", m, x),
    error: (m, x) => emit("error", m, x),
    child: (s) => createLogger(`${scope}:${s}`),
  };
}

/* ─────────────────────────── HTTP client ─────────────────────────── */

export const DEFAULT_USER_AGENT = "EasyJobsBot/1.0 (+https://easyjobs.example/bot)";

export interface HttpRequestInit extends RequestInit {
  /** Per-attempt timeout (default 20 000 ms). */
  timeoutMs?: number;
  /** Retries on network errors, 429 and 5xx (default 3). */
  retries?: number;
  /** Check robots.txt first (default true). Use false only for documented public JSON APIs. */
  robots?: boolean;
}

export interface HttpClient {
  fetch(url: string, init?: HttpRequestInit): Promise<Response>;
  /** Parses JSON; throws HttpError on non-2xx. */
  json<T = unknown>(url: string, init?: HttpRequestInit): Promise<T>;
  /** Throws HttpError on non-2xx. */
  text(url: string, init?: HttpRequestInit): Promise<string>;
}

export interface HttpClientOptions {
  /** Default: env SCRAPER_USER_AGENT or DEFAULT_USER_AGENT */
  userAgent?: string;
  /** Max parallel requests per host (default 2). */
  perHostConcurrency?: number;
  /** Min gap between request starts per host (default 750 ms). */
  perHostDelayMs?: number;
  timeoutMs?: number;
  retries?: number;
  robots?: boolean;
  log?: Logger;
}

export class HttpError extends Error {
  readonly status: number;
  readonly url: string;
  readonly body: string;
  constructor(status: number, url: string, body = "") {
    super(`HTTP ${status} for ${url}`);
    this.name = "HttpError";
    this.status = status;
    this.url = url;
    this.body = body.slice(0, 1000);
  }
}

export class RobotsDisallowedError extends Error {
  readonly url: string;
  constructor(url: string) {
    super(`Disallowed by robots.txt: ${url}`);
    this.name = "RobotsDisallowedError";
    this.url = url;
  }
}

export function sleep(ms: number, signal?: AbortSignal | null): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason);
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(signal.reason);
      },
      { once: true },
    );
  });
}

export interface RobotsRules {
  allow: string[];
  disallow: string[];
}

/** Minimal robots.txt parser: uses the group(s) whose user-agent token appears in our UA, else "*". */
export function parseRobots(txt: string, userAgent: string): RobotsRules {
  const groups: { agents: string[]; allow: string[]; disallow: string[] }[] = [];
  let current: { agents: string[]; allow: string[]; disallow: string[] } | undefined;
  let lastWasAgent = false;
  for (const raw of txt.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, "").trim();
    const i = line.indexOf(":");
    if (i < 0) continue;
    const key = line.slice(0, i).trim().toLowerCase();
    const value = line.slice(i + 1).trim();
    if (key === "user-agent") {
      if (!current || !lastWasAgent) {
        current = { agents: [], allow: [], disallow: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (!current || !value) continue;
    if (key === "allow") current.allow.push(value);
    else if (key === "disallow") current.disallow.push(value);
  }
  const ua = userAgent.toLowerCase();
  const specific = groups.filter((g) => g.agents.some((a) => a !== "*" && a.length > 0 && ua.includes(a)));
  const chosen = specific.length > 0 ? specific : groups.filter((g) => g.agents.includes("*"));
  return { allow: chosen.flatMap((g) => g.allow), disallow: chosen.flatMap((g) => g.disallow) };
}

function ruleLength(rule: string, path: string): number {
  const anchored = rule.endsWith("$");
  const body = anchored ? rule.slice(0, -1) : rule;
  const pattern = body
    .split("*")
    .map((s) => s.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp(`^${pattern}${anchored ? "$" : ""}`).test(path) ? body.length : -1;
}

/** Longest matching rule wins; on a tie, Allow wins. */
export function isPathAllowed(rules: RobotsRules, path: string): boolean {
  let best = -1;
  let allowed = true;
  for (const rule of rules.disallow) {
    const n = ruleLength(rule, path);
    if (n > best) {
      best = n;
      allowed = false;
    }
  }
  for (const rule of rules.allow) {
    const n = ruleLength(rule, path);
    if (n >= 0 && n >= best) {
      best = n;
      allowed = true;
    }
  }
  return allowed;
}

/** Polite fetch: per-host concurrency + spacing, retries with backoff (honours Retry-After), timeouts, robots.txt. */
export function createHttpClient(options: HttpClientOptions = {}): HttpClient {
  const userAgent = options.userAgent ?? process.env.SCRAPER_USER_AGENT ?? DEFAULT_USER_AGENT;
  const concurrency = Math.max(1, options.perHostConcurrency ?? 2);
  const gapMs = Math.max(0, options.perHostDelayMs ?? 750);
  const hosts = new Map<string, { active: number; queue: (() => void)[]; next: number }>();
  const robotsCache = new Map<string, { at: number; rules: Promise<RobotsRules> }>();

  async function acquire(host: string): Promise<() => void> {
    let slot = hosts.get(host);
    if (!slot) {
      slot = { active: 0, queue: [], next: 0 };
      hosts.set(host, slot);
    }
    const s = slot;
    if (s.active < concurrency) s.active++;
    else await new Promise<void>((resolve) => s.queue.push(resolve));
    const now = Date.now();
    const startAt = Math.max(now, s.next);
    s.next = startAt + gapMs;
    if (startAt > now) await sleep(startAt - now);
    return () => {
      const nextWaiter = s.queue.shift();
      if (nextWaiter) nextWaiter();
      else s.active--;
    };
  }

  async function robotsAllows(url: URL): Promise<boolean> {
    let entry = robotsCache.get(url.origin);
    if (!entry || Date.now() - entry.at > 6 * 3_600_000) {
      const rules = (async (): Promise<RobotsRules> => {
        try {
          const res = await fetch(`${url.origin}/robots.txt`, {
            headers: { "user-agent": userAgent },
            signal: AbortSignal.timeout(10_000),
          });
          return res.ok ? parseRobots(await res.text(), userAgent) : { allow: [], disallow: [] };
        } catch {
          return { allow: [], disallow: [] };
        }
      })();
      entry = { at: Date.now(), rules };
      robotsCache.set(url.origin, entry);
    }
    return isPathAllowed(await entry.rules, url.pathname + url.search);
  }

  async function request(input: string, init: HttpRequestInit = {}): Promise<Response> {
    const {
      timeoutMs = options.timeoutMs ?? 20_000,
      retries = options.retries ?? 3,
      robots = options.robots ?? true,
      ...rest
    } = init;
    const url = new URL(input);
    if (robots && !(await robotsAllows(url))) throw new RobotsDisallowedError(input);
    const headers = new Headers(rest.headers);
    if (!headers.has("user-agent")) headers.set("user-agent", userAgent);
    if (!headers.has("accept-language")) headers.set("accept-language", "en-IN,en;q=0.9");
    for (let attempt = 0; ; attempt++) {
      const release = await acquire(url.host);
      let res: Response | undefined;
      let error: unknown;
      try {
        const timeout = AbortSignal.timeout(timeoutMs);
        const signal = rest.signal ? AbortSignal.any([rest.signal, timeout]) : timeout;
        res = await fetch(url, { ...rest, headers, signal });
      } catch (e) {
        error = e;
      } finally {
        release();
      }
      if (rest.signal?.aborted) throw rest.signal.reason ?? error;
      const retryable = res === undefined || res.status === 429 || res.status >= 500;
      if (!retryable || attempt >= retries) {
        if (res === undefined) throw error;
        return res;
      }
      const retryAfter = Number(res?.headers.get("retry-after"));
      const waitMs =
        Number.isFinite(retryAfter) && retryAfter > 0
          ? Math.min(retryAfter * 1000, 120_000)
          : Math.min(30_000, 1000 * 2 ** attempt) + Math.random() * 500;
      options.log?.warn(`retrying ${url.host}${url.pathname}`, { status: res?.status, attempt: attempt + 1, waitMs: Math.round(waitMs) });
      try {
        await res?.body?.cancel();
      } catch {
        /* ignore */
      }
      await sleep(waitMs, rest.signal);
    }
  }

  async function ensureOk(res: Response, url: string): Promise<Response> {
    if (res.ok) return res;
    const body = await res.text().catch(() => "");
    throw new HttpError(res.status, url, body);
  }

  return {
    fetch: request,
    async json<T = unknown>(url: string, init: HttpRequestInit = {}): Promise<T> {
      const headers = new Headers(init.headers);
      if (!headers.has("accept")) headers.set("accept", "application/json");
      const res = await ensureOk(await request(url, { ...init, headers }), url);
      return (await res.json()) as T;
    },
    async text(url: string, init: HttpRequestInit = {}): Promise<string> {
      const res = await ensureOk(await request(url, init), url);
      return res.text();
    },
  };
}

/* ─────────────────────────── Scraper plugin interface ─────────────────────────── */

export type Env = Record<string, string | undefined>;

export interface ScrapeContext {
  http: HttpClient;
  log: Logger;
  signal: AbortSignal;
  env: Env;
  /** Max jobs to emit (dev/testing). undefined = no limit. */
  limit?: number;
  /** Best-effort incremental cutoff: only jobs posted/updated after this. */
  since?: Date;
  /** Registry targets — only for scrapers with `handlesAts`. The worker passes ONE target per call. */
  targets?: CompanyTarget[];
  /** true → already stored: you may skip detail fetches and emit a light record (descriptionHtml: null). */
  isKnown?: (sourceJobId: string, target?: string | null) => boolean;
}

export interface Scraper {
  /** Unique kebab-case id, becomes RawJob.source — e.g. "greenhouse", "coursejoiner", "amazon". */
  id: string;
  /** Display name — e.g. "Greenhouse", "CourseJoiner", "Amazon Jobs". */
  name: string;
  kind: SourceKind;
  /** Default schedule in minutes. ATS scrapers are scheduled per target priority instead. */
  intervalMinutes: number;
  /** ATS adapters: which registry `ats` values this scraper handles. */
  handlesAts?: AtsType[];
  /** Attribution required by the source's terms (shown in UI), e.g. "Jobs via Remote OK". */
  attribution?: string;
  /** Return false to skip (feature flag / missing API key). Default: enabled. */
  isEnabled?: (env: Env) => boolean;
  scrape(ctx: ScrapeContext): AsyncIterable<RawJob>;
}

/** Shape of every scraper package's src/index.ts: `export const scrapers: Scraper[] = [...]; export default scrapers;` */
export interface ScraperModule {
  scrapers?: Scraper[];
  default?: Scraper[];
}

export function createScrapeContext(partial: Partial<ScrapeContext> = {}): ScrapeContext {
  const log = partial.log ?? createLogger("scraper");
  return {
    ...partial,
    log,
    http: partial.http ?? createHttpClient({ log }),
    signal: partial.signal ?? new AbortController().signal,
    env: partial.env ?? process.env,
  };
}

/* ─────────────────────────── Standard scraper CLI ─────────────────────────── */

/**
 * Use in every scraper package's src/cli.ts:
 *   tsx src/cli.ts [--scraper <id>] [--limit <n>|all] [--target <slug>] [--out <dir>]
 * Writes <out>/<scraperId>.jsonl and logs count, invalid count and per-field fill rates.
 */
export async function runScraperCli(
  scrapers: Scraper[],
  opts: { targets?: CompanyTarget[]; argv?: string[] } = {},
): Promise<void> {
  const argv = opts.argv ?? process.argv.slice(2);
  const arg = (name: string): string | undefined => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const only = arg("scraper");
  const limitArg = arg("limit") ?? "50";
  const limit = limitArg === "all" ? Number.POSITIVE_INFINITY : Math.max(1, Number(limitArg) || 50);
  const targetSlug = arg("target");
  const outDir = arg("out") ?? "out";
  const log = createLogger("cli");
  mkdirSync(outDir, { recursive: true });
  const selected = scrapers.filter((s) => !only || s.id === only);
  if (selected.length === 0) throw new Error(`No scraper "${only}". Available: ${scrapers.map((s) => s.id).join(", ")}`);
  for (const s of selected) {
    if (s.isEnabled && !s.isEnabled(process.env)) {
      log.warn(`${s.id}: disabled by env/config — skipping`);
      continue;
    }
    const ats = s.handlesAts;
    const targets = ats
      ? (opts.targets ?? []).filter((t) => ats.includes(t.ats) && (!targetSlug || t.slug === targetSlug))
      : undefined;
    const ctx = createScrapeContext({ log: log.child(s.id), limit: Number.isFinite(limit) ? limit : undefined, targets });
    const file = join(outDir, `${s.id}.jsonl`);
    const out = createWriteStream(file);
    const fill: Record<string, number> = {};
    let n = 0;
    let invalid = 0;
    const t0 = Date.now();
    try {
      for await (const job of s.scrape(ctx)) {
        const errs = validateRawJob(job);
        if (errs.length > 0 && ++invalid <= 5) log.warn(`${s.id}: invalid job`, { sourceJobId: job.sourceJobId, errs });
        for (const [k, v] of Object.entries(job)) {
          if (v !== null && v !== undefined && v !== "" && !(Array.isArray(v) && v.length === 0)) fill[k] = (fill[k] ?? 0) + 1;
        }
        out.write(JSON.stringify(job) + "\n");
        if (++n >= limit) break;
      }
    } catch (e) {
      process.exitCode = 1;
      log.error(`${s.id}: failed`, { error: e instanceof Error ? e.message : String(e) });
    } finally {
      out.end();
    }
    const rates = Object.fromEntries(Object.entries(fill).map(([k, v]) => [k, `${Math.round((v / Math.max(n, 1)) * 100)}%`]));
    log.info(`${s.id}: ${n} jobs, ${invalid} invalid, ${((Date.now() - t0) / 1000).toFixed(1)}s → ${file}`, rates);
  }
}
```

### 0.3 Folder ownership (Phase 1)

| ID | Owns (the only places it may write) | Package |
|---|---|---|
| P01 | `apps/web/**` | `@easyjobs/web` |
| P02 | `packages/db/**`, `apps/api/**`, root `docker-compose.yml`, `.data/` (runtime) | `@easyjobs/db`, `@easyjobs/api` |
| P03 | `packages/normalize/**` | `@easyjobs/normalize` |
| P04 | `packages/registry/**` | `@easyjobs/registry` |
| P05 | `apps/worker/**` | `@easyjobs/worker` |
| P06 | `packages/scrapers/coursejoiner/**` | `@easyjobs/scraper-coursejoiner` |
| P07 | `packages/scrapers/ats-public/**` | `@easyjobs/scraper-ats-public` |
| P08 | `packages/scrapers/ats-enterprise/**` | `@easyjobs/scraper-ats-enterprise` |
| P09 | `packages/scrapers/bigtech/**` | `@easyjobs/scraper-bigtech` |
| P10 | `packages/scrapers/internshala/**` | `@easyjobs/scraper-internshala` |
| P11 | `packages/scrapers/portals/**` | `@easyjobs/scraper-portals` |
| P12 | `packages/scrapers/open-apis/**` | `@easyjobs/scraper-open-apis` |
| all | Create missing §0.2 files (never edit them). Write `docs/status/<ID>.md` and `docs/contract-requests/<ID>.md`. | |

### 0.4 Data flow and semantic rules

**Pipeline:** `Scraper.scrape()` → `RawJob` → worker → `normalizeJob()` (P03) → `JobInput` → `POST /v1/ingest/jobs` → DB → `GET /v1/jobs` → web.

**Experience level** (see the definitions in `EXPERIENCE_LEVELS`). Precedence: an explicit years range > a structured hint from the source > title keywords > description keywords. `jobType: internship` gives `intern`. If fresher words appear (freshers, new grad, batch, campus, GET) and max years ≤ 2, the level is `fresher`. If only years are known: max ≤ 1 → fresher; ≤ 2 → entry; ≤ 5 → mid; ≤ 8 → senior; above that → lead.

**Fingerprint (dedupe key):**
1. If `applyUrl` is on an official host (not an aggregator or job-board host), the key is `k:` + `canonicalJobKey(applyUrl)`. This is an ATS-aware stable id such as `greenhouse:4012345`, `lever:<uuid>`, `workday:<tenant>:<JR-id>` or `amazon:<id>`. Fall back to the canonical URL: lowercase host without `www`, no hash, tracking params removed, id params kept and sorted.
2. Otherwise the key is `t:` + `sha1(companySlug | normalized title | primary city or "remote" | jobType)`.

The fingerprint is the prefix plus the hex sha1 of the key. Rule 1 is what makes a CourseJoiner post that links to the official posting merge with the official ATS record.

**Merge on the same fingerprint (DB):**
- Sources are unioned by `(source, sourceJobId)`.
- Scalar fields come from the highest `SOURCE_KIND_PRIORITY` source that has a non-null value. A non-null value is **never** overwritten with null or empty.
- Arrays are unioned (skills capped at 12).
- `postedAt` and `firstSeenAt` keep the earliest value.
- `applyUrl` comes from the most official source.
- Any sighting re-opens the job.

**Freshness:**
- A sweep removes a source's `(source, target)` jobs that were not seen in a complete run. A job with no remaining sources becomes `closed`.
- `validThrough` in the past → `closed`.
- Jobs that only come from job boards or aggregators close when they haven't been seen for 21 days or are more than 45 days old.
- Closed jobs still resolve by id (the UI shows a "closed" banner) but never appear in search.
- "New" means `postedAt` is within 24 hours.

**Money:** `salaryInrYearly*` = month × 12, hour × 2080, converted with a static FX table in normalize. Never invent a salary.

### 0.5 HTTP API (`apps/api`, base `http://localhost:4000`)

| Route | Request | Response |
|---|---|---|
| `GET /v1/jobs` | `SearchQuery` params, parsed with `parseSearchQuery` | `JobsSearchResponse` |
| `GET /v1/jobs/:id` | — | `JobDetail` (closed jobs too) · 404 `ApiError` |
| `GET /v1/jobs/:id/similar` | `?limit=1..12` (default 6) | `SimilarJobsResponse` |
| `GET /v1/suggest` | `?q=` | `SuggestResponse` (≤ 8 per list) |
| `GET /v1/stats` | — | `StatsResponse` |
| `GET /v1/companies` | `?q=&ctype=&page=&pageSize=` | `CompaniesResponse` (by openJobs desc) |
| `GET /v1/companies/:slug` | — | `CompanySummary` · 404 |
| `GET /v1/stream` | filter params of `SearchQuery` (q/sort/page ignored) | SSE: `event: job` / `event: stats`; `data` = JSON `StreamEvent`; `: ping` every 25 s |
| `POST /v1/ingest/jobs` | `IngestRequest` (≤ 500 jobs; gzip allowed) | `IngestResponse` |
| `POST /v1/ingest/sweep` | `SweepRequest` | `SweepResponse` |
| `GET /v1/ingest/known` | `?source=&target=` | `KnownIdsResponse` |
| `POST /v1/ingest/runs` | `RunReport` | `{ "ok": true }` |
| `GET /health` | — | `{ ok, db, version }` |

`/v1/ingest/*` requires the header `x-ingest-key: $INGEST_API_KEY` and returns 401 without it. Errors use the `ApiError` JSON shape with the matching HTTP status. CORS allows `WEB_ORIGIN`. A job's page on the web is `jobPath(job)` = `/jobs/{id}/{slug}`.

### 0.6 Registry token formats (`CompanyTarget.token`)

| ats | token | example (illustrative, verify) |
|---|---|---|
| greenhouse | board token | `stripe` |
| lever | site name (`eu:` prefix for EU boards) | `palantir` |
| ashby | job-board name | `openai` |
| smartrecruiters | company identifier | `Visa` |
| workable / recruitee / bamboohr / breezy / teamtailor / personio / freshteam / zoho_recruit / keka / darwinbox | subdomain (or the full careers URL if non-standard) | `acme` |
| workday | full career site URL | `https://nvidia.wd5.myworkdayjobs.com/NVIDIAExternalCareerSite` |
| oracle | full CandidateExperience site URL | `https://<pod>.fa.<region>.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX_1` |
| eightfold | `https://<host>\|<domain>` | `https://explore.jobs.netflix.net\|netflix.com` |
| successfactors / phenom / icims / avature / taleo | careers site URL | |
| jsonld | careers site URL or sitemap URL | |
| custom | careers URL (P09 handles these with its own scrapers; the worker doesn't feed them) | |

### 0.7 Env vars and ports

Ports: web **3000**, api **4000**, worker **4100**, docker postgres **5433**. Apps load the repo-root `.env` if it exists (`process.loadEnvFile`; in Next.js use `loadEnvConfig` from `@next/env` in `next.config.ts`). Each package documents its own variables in its README and its own `.env.example`. W1 merges them.

| Var | Used by | Default |
|---|---|---|
| `DATABASE_URL` | api/db | unset → PGlite at `.data/pglite` |
| `API_PORT`, `WEB_ORIGIN` | api | `4000`, `http://localhost:3000` |
| `INGEST_API_KEY` | api, worker | `dev-ingest-key` |
| `API_URL` | worker | `http://localhost:4000` |
| `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_SITE_URL` | web | `http://localhost:4000`, `http://localhost:3000` |
| `NEXT_PUBLIC_USE_MOCKS` | web | `1` until W1, then `0` |
| `WORKER_PORT`, `WORKER_CONCURRENCY` | worker | `4100`, `6` |
| `SCRAPER_USER_AGENT` | scrapers | `EasyJobsBot/1.0 (+https://easyjobs.example/bot)` |
| `LOG_LEVEL`, `LOG_FORMAT` | all | `info`, pretty (`json` optional) |
| `ENABLE_LINKEDIN`, `ENABLE_NAUKRI` | portals | `0` |
| `ADZUNA_APP_ID`, `ADZUNA_APP_KEY`, `JOOBLE_API_KEY` | open-apis | — |
| `ANTHROPIC_API_KEY` | normalize, coursejoiner (optional LLM extraction) | — |
| `LOGO_DEV_TOKEN` | normalize, web (company logos) | — |

### 0.8 Rules for every Phase-1 session

1. Read all of §0. Run the §0.2 bootstrap first.
2. Write **only** inside your owned paths (§0.3), plus `docs/status/<ID>.md` and `docs/contract-requests/<ID>.md`. Other sessions are working in parallel on the other folders. Never touch their folders, never edit root files, and never edit the lockfile by hand.
3. The contract is frozen. Import types, enums, labels and helpers from `@easyjobs/contract` (isomorphic) and from `@easyjobs/contract/node` (HTTP client, logger, `Scraper`, CLI). Never copy or redefine them. If something is missing, put it in `extra` or use local types, and write the request to `docs/contract-requests/<ID>.md`.
4. Dependencies: from the repo root, run `pnpm --filter <your-package> add <dep>` (add `-D` for dev dependencies). Concurrent sessions can make pnpm fail for a moment (lockfile, EEXIST, ENOENT or ERR_PNPM_* errors). When that happens, wait 20–40 s and retry, up to 5 times. Never delete `node_modules` or `pnpm-lock.yaml`. Prefer a few well-maintained dependencies.
5. Code: strict TypeScript, ESM, small modules, explicit types on exports, no `any` in public APIs, errors handled with context, no secrets in code.
6. Scraping etiquette:
   - Always use `createHttpClient`, which handles per-host rate limits, retries and robots.txt. Identify yourself with `SCRAPER_USER_AGENT`.
   - HTML pages must obey robots.txt. For documented public JSON APIs, `robots: false` is allowed.
   - Never log in, never bypass CAPTCHAs, anti-bot measures or paywalls, and never use proxies or fingerprint spoofing. Back off on 429 and 403.
   - Collect only job-posting data, never personal data.
   - While developing, cache responses in your package's `.cache/` so you don't hammer sites.
7. Tests: vitest. They run offline by default using small saved fixtures in `test/fixtures/`. Live tests run only when `LIVE=1`.
8. Work autonomously. Don't ask questions: decide, document the decision, and continue. Don't stop at a plan or a skeleton; build the whole thing and **run it**. Endpoint notes in these prompts may be out of date, so verify live behavior yourself.
9. You are done when:
   - `pnpm --filter <pkg> typecheck` and `pnpm --filter <pkg> test` pass.
   - Your DONE WHEN criteria are met.
   - `docs/status/<ID>.md` exists, covering: summary, how to run, env vars, decisions, known gaps, and numbers (counts, fill rates, benchmarks).

### 0.9 Package template (scraper packages; apps and libraries are similar)

`packages/scrapers/<name>/package.json`: copy the contract package.json pattern. Use name `@easyjobs/scraper-<name>`, `"type": "module"`, `"main"`/`"types"`/`"exports"` → `./src/index.ts`, scripts `scrape: "tsx src/cli.ts"`, `test: "vitest run"`, `typecheck: "tsc --noEmit -p ."`, dependency `"@easyjobs/contract": "workspace:*"`, and devDependencies `typescript`, `tsx`, `vitest`, `@types/node`. `tsconfig.json`: `{ "extends": "../../../tsconfig.base.json", "include": ["src", "test"] }`.

```ts
// src/index.ts
import type { Scraper } from "@easyjobs/contract/node";
import { myScraper } from "./my-scraper";
export const scrapers: Scraper[] = [myScraper];
export default scrapers;

// src/cli.ts   →   pnpm --filter @easyjobs/scraper-<name> scrape --limit 30 [--scraper <id>] [--target <slug>]
import { runScraperCli } from "@easyjobs/contract/node";
import { scrapers } from "./index";
// import { targets } from "./fixtures/targets";   // ATS packages only
await runScraperCli(scrapers /* , { targets } */);
```

---

## Phase 1 — build prompts (run all in parallel)

### P01 · Web app

```text
[P01 · Web app] Read prompts.md §0 (Shared Contract) completely, run the §0.2 bootstrap, follow §0.8. You own ONLY apps/web/**.

GOAL
Build the EasyJobs website: the most beautiful, fastest and clearest job and internship search in India. Clean but impressive: Linear / Vercel / Raycast-level polish applied to job search. It must work fully on its own now (mock mode) and switch to the real API later with one env var.

STACK
Latest stable Next.js (App Router, TS, src/ dir, RSC) + React 19, Tailwind CSS v4, shadcn/ui (Radix), motion (Framer Motion), TanStack Query v5, nuqs (URL state), cmdk, vaul, sonner, lucide-react, next-themes, Geist Sans + Geist Mono, zustand (persist), date-fns. Package @easyjobs/web, port 3000, dependency "@easyjobs/contract": "workspace:*" (add it to transpilePackages; load the root .env in next.config via @next/env). Import every type, enum, LABEL, API_ROUTES, jobPath, parseSearchQuery and toQueryString from @easyjobs/contract. Never redefine them.

DATA LAYER (src/lib/api/)
- One JobsApi interface: searchJobs(q: SearchQuery), getJob(id), similar(id), suggest(q), stats(), companies(params), company(slug), subscribe(filters, onEvent) → unsubscribe.
- Two implementations of it:
  - http.ts: NEXT_PUBLIC_API_URL + API_ROUTES exactly as in §0.5. subscribe uses EventSource.
  - mock.ts: in-memory, with the SAME semantics as §0.5. That means text matching on title/company/skills, every SearchQuery filter, disjunctive facets, all 3 sorts, pagination, suggest and stats, plus a simulated stream that emits a new realistic job every 6–12 s.
- NEXT_PUBLIC_USE_MOCKS picks the implementation (default "1" for now). Both must work in server components and in client components.
- Mock data: generate ~400 realistic jobs deterministically (seeded PRNG + templates).
  - Real companies with domains: Google, Microsoft, Amazon, Flipkart, Razorpay, Swiggy, Zomato, CRED, Zepto, Meesho, PhonePe, Groww, Atlassian, Adobe, Salesforce, Uber, Goldman Sachs, JPMorgan, TCS, Infosys, Wipro, Accenture, Deloitte, Cognizant, Capgemini, Freshworks, Zoho, Postman, BrowserStack, Paytm, NVIDIA, Intel, Qualcomm, Cisco, Oracle, SAP, Walmart Global Tech…
  - Locations: weighted Indian cities (Bengaluru, Hyderabad, Pune, Gurugram, Noida, Chennai, Mumbai, Remote) plus some global ones.
  - Content: realistic titles per level, INR LPA salaries and monthly stipends, batches 2024–2027, skills, company tags, a mix of official and aggregator sources (CourseJoiner, Internshala, LinkedIn, Naukri, Unstop), and rich descriptionHtml.
  - postedAt spread over the last 30 days, with many in the last few hours.
- Logos: use company.logoUrl, else https://www.google.com/s2/favicons?domain=<domain>&sz=128, else a monogram tile with a deterministic color. Always show logos on a white rounded-square tile with a hairline border, so low-res favicons still look crisp.

PAGES
1. "/" Home
   - Hero: a headline like "Every internship and job. The minute it's posted." plus one sub line ("We scan 1,000+ official career sites and top job boards every few minutes.").
   - Big search with [What: role, skill or company] [Where: city or remote] [Search], with autocomplete from suggest().
   - Quick chips under the search: Internships · Freshers · Remote · Work from home · 2026 batch · Off-campus drives · Official sites only.
   - Live strip: a pulsing dot plus "12,480 open roles · 1,284 new today · updated 2 min ago" (stats(), kept live by subscribe()).
   - Company logo marquee (grayscale → color on hover).
   - "Just posted" live feed where new jobs slide in (motion layout animation).
   - "Browse by category" bento grid with counts, and a "Top companies hiring" grid.
   - Student band: pick your batch (2025/2026/2027) → opens the filtered search.
   - Footer with sources and how it works.
2. "/jobs" Search. This is the core page; make it flawless.
   - Sticky search bar (query + location), result count with tookMs ("1,204 jobs · 38 ms"), and a sort menu.
   - Experience quick tabs above the results, with counts from facets: All · Internships · Freshers · Entry 0–2 · Mid 2–5 · Senior 5+ (these map to `level`).
   - Filter sidebar: sticky with collapsible sections on desktop, a vaul bottom sheet on mobile. Filters:
     - Official career sites only (switch with a shield-check icon)
     - Job type and Experience level
     - "Your experience" in years (0 / 1 / 2 / 3 / 5 / 8+ → `exp`)
     - Batch chips 2024–2028
     - Work mode
     - Location (searchable multi-select with counts)
     - Company (searchable, with logos)
     - Company type (`ctype`: MNC, Startup, Unicorn, Indian IT, Big Tech…)
     - Category
     - Minimum salary/stipend (INR slider)
     - Posted within
     - Source
     - Tags (off-campus, walk-in, wfh, women)
   - Active filter chips with individual remove buttons and "Clear all". ALL state lives in the URL via toQueryString/parseSearchQuery, so searches are shareable and back/forward works.
   - Smart search: detect known tokens in the free text and turn them into filter chips, with an undo toast. Tokens include intern/internship, fresher/new grad, remote/wfh, city names and aliases (bangalore → Bengaluru, gurgaon → Gurugram), "2026 batch", and company names from suggest.
   - Results: a split view on desktop (list on the left, sticky detail preview on the right, like a mail client); on mobile, a list that opens a full page.
   - JobCard contents:
     - logo, title, company, location, work mode
     - level/type badges, formatted salary or stipend (₹4–6 LPA · ₹25k/mo · $120k–150k/yr), batch, top skills
     - "2h ago" with a green "New" pulse if under 24 h
     - an "Official ✓" badge or "via CourseJoiner"
     - Save and Apply ↗ actions
     - a hover lift, and an accent bar when selected
   - Live updates: subscribe() with the current filters shows a floating pill "▲ 7 new jobs match your filters"; clicking it prepends them.
   - Infinite scroll with a "Load more" fallback, skeletons that match the card layout, keepPreviousData (no layout jumps), detail prefetch on hover, and a 250 ms debounce.
   - Empty state with smart suggestions computed from facets ("Remove 'Hybrid' → 120 jobs").
   - Keyboard: / focuses search, j/k move, Enter opens, s saves, o opens the apply link, Esc closes.
   - ⌘K palette (cmdk): search, presets ("Remote internships", "Fresher jobs in Bengaluru", "2026 batch off-campus"), jump to a company, toggle the theme.
3. "/jobs/[id]/[[...slug]]" Job page (SSR, SEO):
   - Title block and a key-facts grid: experience, salary, location, mode, type, batch, degrees, posted, deadline.
   - The sanitized description in beautiful prose typography.
   - A sticky "Apply on <official domain> ↗" CTA, an "Also listed on" sources list, similar jobs, plus share, save and report.
   - JSON-LD JobPosting, an OG image via next/og, and a canonical URL.
4. "/companies": search plus a grid with open-role counts and tags. "/companies/[slug]": a header with logo, tags and careers link, plus that company's jobs using the same results components.
5. Preset landing pages that reuse the search view with preset filters plus short SEO copy: /internships, /freshers, /remote, /off-campus, /work-from-home.
6. "/saved": saved jobs plus a mini application tracker (Saved → Applied → Interviewing → Offer/Rejected, with notes and CSV export), stored in localStorage via zustand persist.
7. "/about": sources, update frequency, and "we always link to the original posting".
8. Polished 404, error and loading states.

DESIGN SYSTEM & ART DIRECTION
- Layout: a neutral base (zinc/stone), generous whitespace, max width about 1280 px, an 8 pt spacing grid, 12–16 px card radius, and hairline borders instead of heavy shadows.
- Color: ONE signature accent, used sparingly (primary buttons, focus rings, selected states, one highlighted hero word), plus a semantic green only for "New/Live". Full light and dark themes (system default plus a toggle), both meeting AA contrast.
- Typography: Geist Sans; big, tight headings (≈ -0.03em tracking); Geist Mono with tabular-nums for counts, salaries and times.
- Premium details:
  - a subtle dot grid and a very soft gradient glow, in the hero only
  - a glassy sticky header with backdrop blur
  - 150–250 ms transitions and springy chips/pills
  - number tickers for live counts, skeleton shimmer, focus-visible rings
  - respect prefers-reduced-motion
- Avoid: the generic purple-gradient "AI" look, emoji, stock illustrations, heavy shadows, cluttered cards, and more than ~4 badges per card.
- Accessibility: fully keyboard-operable, ARIA for comboboxes/tabs/dialogs, visible focus, semantic HTML.
- Performance: RSC first render for / and /jobs, Lighthouse mobile ≥ 95 in all four categories in mock mode, no CLS (fixed-size logos), next/font.
- SEO: metadata on every page, app/sitemap.ts, app/robots.ts, canonical URLs, JSON-LD.

QUALITY GATES
- Vitest: the mock API's filter/facet/sort logic, the salary formatter, the smart-query parser, and the toQueryString round trip.
- Playwright e2e:
  - home search → results
  - level tabs and sidebar filters change both the results and the URL; the back button restores state
  - the detail view opens; a save persists after reload
  - the mobile filter sheet, dark mode, and ⌘K
- Visual review loop (mandatory, at least 2 rounds): take Playwright screenshots of /, /jobs with filters, a job page, /companies and /saved at 1440×900 and 390×844, in light and dark, into apps/web/screenshots/. Open each screenshot and critique it like a picky senior product designer: alignment, spacing rhythm, hierarchy, contrast, density, consistency. Fix the problems and re-shoot.

DONE WHEN typecheck, test, build and e2e all pass in mock mode; apps/web/README.md explains the switch to the real API (NEXT_PUBLIC_USE_MOCKS=0 + NEXT_PUBLIC_API_URL); and docs/status/P01.md is written.
```

### P02 · Database + API

```text
[P02 · Database + API] Read prompts.md §0 completely, run the §0.2 bootstrap, follow §0.8. You own ONLY packages/db/**, apps/api/**, the root docker-compose.yml and .data/.

GOAL
Build the data store and the public + ingest HTTP API exactly as specified in §0.5. It must be fast enough for instant search: p95 < 150 ms with 100k jobs on real Postgres.

DB (packages/db → @easyjobs/db)
- Drizzle ORM (pg-core) with drizzle-kit migrations.
- Driver: if DATABASE_URL is set, use postgres.js. Otherwise use PGlite (@electric-sql/pglite, persisted at <repo>/.data/pglite, with the pg_trgm extension), so dev needs zero installs. Same schema, migrations and tests for both drivers.
- Root docker-compose.yml with a `db` service (postgres:17, host port 5433, volume, healthcheck), as an option for Docker users.
- Tables (refine as needed):
  - jobs: short url-safe text id PK, unique fingerprint, slug, all JobInput fields (arrays as text[]/int[]; salary/locations/extra as jsonb), derived cities[] and countries[], source_ids[], best_source_kind, is_official, status open|closed, first_seen_at, last_seen_at, closed_at, and a search tsvector.
  - job_sources: job_id FK, source, source_name, source_kind, source_job_id, target, url, first_seen_at, last_seen_at, UNIQUE(source, source_job_id).
  - companies: slug PK, name, domain, logo_url, tags[], hq, careers_url, open_jobs, updated_at. Upserted from ingested jobs.
  - scrape_runs: RunReport rows.
- tsvector weights: title A, company A, skills B, description D. Use 'simple' for title/company/skills and 'english' for the description. Generated columns need IMMUTABLE expressions (array_to_string isn't), so maintain the vector in the upsert SQL or in a trigger.
- Indexes:
  - GIN on search
  - trigram GIN on lower(title) and lower(company)
  - (status, posted_at desc)
  - GIN on cities, skills, batches, tags, company_tags, source_ids
  - btree on experience_level, job_type, work_mode, category, company_slug, salary_inr_yearly_max
- A typed repository for the API: upsertJobs, sweep, knownIds, recordRun, searchJobs, getJob, similarJobs, suggest, stats, listCompanies, getCompany, expireStale.

INGEST SEMANTICS (§0.4)
- Validate every JobInput with a zod schema declared as z.ZodType<JobInput>, so it can never drift from the contract. Reject bad items one at a time; never reject the whole batch.
- Re-sanitize descriptionHtml with a sanitize-html allowlist. The API is the trust boundary.
- Upsert by fingerprint using the §0.4 merge rules. Upsert companies. Emit "job created" events for new rows.
- sweep and expireStale (run hourly) follow the §0.4 freshness rules exactly.

API (apps/api → @easyjobs/api, Hono on Node, API_PORT=4000)
- Implement every §0.5 route with the exact shapes. Import types from @easyjobs/contract and parse queries with parseSearchQuery.
- Search:
  - websearch_to_tsquery plus prefix matching on the last token (type-ahead).
  - Trigram fallback for typos ("amazn", "devloper").
  - Synonym expansion: sde/swe ↔ software engineer/developer, ml ↔ machine learning, frontend ↔ front end, fresher ↔ new grad/graduate trainee, intern ↔ internship/trainee, wfh ↔ remote, bangalore ↔ bengaluru, gurgaon ↔ gurugram, bombay ↔ mumbai…
  - Relevance = text rank × freshness decay × small boosts (official source, qualityScore).
  - Sorts: relevance | newest | salary (nulls last).
- Disjunctive facets: compute each facet with every filter except its own. Run facet queries in parallel. Return the top 30 buckets for location, company and skills, with labels from LABELS.
- Filters follow SearchQuery's doc comments exactly. In particular: exp is open-ended for null bounds; official = has an official source; posted uses POSTED_WITHIN_MS; location "Remote" matches isRemote; ctype matches company_tags.
- Caching: a 20 s in-memory LRU for search, facets, stats and suggest, keyed by the normalized query. Send an ETag and Cache-Control: public, max-age=15, stale-while-revalidate=60.
- SSE /v1/stream: an in-process event bus fed by ingest (add LISTEN/NOTIFY when DATABASE_URL is set, for multiple instances). Filter events server-side with the same filter logic. Heartbeat every 25 s, stats event every 30 s.
- Security: x-ingest-key on /v1/ingest/*, CORS for WEB_ORIGIN, a per-IP token-bucket rate limit on public routes, body size limits, structured logs, graceful shutdown.
- /openapi.json plus Scalar docs at /docs (nice to have).
- Seed: `pnpm --filter @easyjobs/db seed` generates ~2,000 realistic synthetic JobInputs (varied companies, Indian cities, levels, batches, salaries, sources, and deliberate cross-source duplicates to exercise merging) and ingests them through the real upsert path.

TESTS (vitest, offline on PGlite)
Cover: ingest validation and merge rules, sweep/expiry, every filter, facet exclusion semantics, sorts, pagination, suggest, stats, SSE filtering, auth. Add a benchmark script (autocannon) for /v1/jobs against a 100k-row synthetic DB. Run it on PGlite, and on real Postgres if one is available (Homebrew postgres or Docker). Record p50/p95 in the status file.

DONE WHEN `pnpm --filter @easyjobs/api dev` serves every route against PGlite with seed data; typecheck and tests pass; and docs/status/P02.md lists routes, env vars and benchmark numbers.
```

### P03 · Normalizer and enrichment

```text
[P03 · Normalizer & enrichment] Read prompts.md §0 completely, run the §0.2 bootstrap, follow §0.8. You own ONLY packages/normalize/**.

GOAL
Build @easyjobs/normalize, which turns any RawJob into a clean, consistent JobInput. This is what makes the site's filters trustworthy.

PUBLIC API (src/index.ts)
- normalizeJob(raw: RawJob, opts?: { sourceName?: string; company?: CompanyTarget; now?: Date }): JobInput
- Also export every sub-function, each unit-tested on its own: classifyLevel, parseExperience, detectJobType, parseSalary, toInrYearly, normalizeLocations, detectWorkMode, extractSkills, extractBatches, extractDegrees, categorize, cleanTitle, cleanCompanyName, companyLogoUrl, canonicalJobKey, canonicalUrl, fingerprint, sanitizeDescription, htmlToText, summarize, parsePostedAt, detectTags, qualityScore.
- Everything is pure, synchronous, deterministic (given `now`) and makes no network calls, except the optional enrichWithLLM below.

RULES
Build big table-driven test suites from real-world strings: at least 30 cases each for level, experience, salary, location, skills and batches.
- Hints win: if the RawJob already has jobType/experienceLevel/salary/workMode/batches/skills, trust them (still clean and validate them).
- Level (§0.4 precedence): handle Intern, Summer Analyst, Trainee, Apprentice, Graduate Engineer Trainee/GET, New Grad, Campus, University Graduate, Early Career, Fresher, "0-1 yrs", SDE I/II/III, Engineer 1/2/3, L3–L7, Associate, Junior, Senior/Sr., Staff, Principal, Lead, Architect, Manager, Director, Head of, VP, Chief.
- Experience: "0-2 Yrs", "2+ years", "1 to 3 years", "minimum 3 years", "3-5 yrs exp", "Freshers", "fresher/experienced" → min/max.
- Salary → Salary + INR yearly, using a static FX table. Formats include "₹ 4,00,000 - 6,00,000 /year", "4-6 LPA", "4.5 LPA", "INR 25K/month", "Stipend: ₹15,000 /month", "10000-15000 /month", "$120,000 – $150,000", "€60k", "Unpaid", "Not disclosed", "Performance based", "Competitive". Never invent a salary.
- Locations:
  - Canonical city/state/country, with an alias table for the top 150 Indian cities and the top 150 global tech hubs. Examples: Bengaluru/Bangalore, Gurugram/Gurgaon, Mumbai/Bombay/Navi Mumbai, Hyderabad/Secunderabad, Chennai/Madras, Kolkata/Calcutta, Noida/Greater Noida, Kochi/Cochin, Thiruvananthapuram/Trivandrum.
  - Split strings like "Bangalore/Hyderabad/Pune"; handle "Multiple locations", "Pan India", "Remote - India", "Anywhere", "Hybrid - Pune".
  - Derive workMode and isRemote from the text.
- Skills: a dictionary of ~500 skills with aliases and boundary-safe matching: C++, C#, .NET, Node.js, React/React.js, Next.js, Go/Golang (never match the English word "go"), R, AWS, GCP, Azure, SQL, Excel, Tableau, Figma, SAP, Salesforce, AutoCAD… Rank by title presence, then frequency; max 12.
- Batches: "2024/2025/2026 batch", "Batch: 2025 & 2026", "graduating in 2026", "2025 passouts", "YOP 2024" → year lists. Ignore unrelated years ("since 2005").
- Degrees: B.E/B.Tech, M.E/M.Tech, BCA/MCA, B.Sc/M.Sc, BBA/MBA, B.Com, Diploma, PhD, Any graduate.
- Category (JOB_CATEGORIES) from the title, department and skills.
- Clean titles and companies:
  - Strip noise: "Hiring!!", "Urgent", "Off Campus Drive 2026", "| Apply Now", emoji.
  - Resolve company aliases: "Amazon Development Centre (India) Pvt. Ltd." → "Amazon", "Tata Consultancy Services" → "TCS".
  - companySlug via slugify. companyTags from opts.company.tags.
- Logos: if LOGO_DEV_TOKEN is set, https://img.logo.dev/<domain>?token=…&size=128; otherwise the Google favicon URL.
- canonicalJobKey(url): ATS-aware stable keys for Greenhouse (gh_jid or /jobs/<id>), Lever, Ashby, SmartRecruiters, Workable, Workday (tenant + JR id), Oracle, Eightfold, amazon.jobs, Google, Microsoft, Internshala, LinkedIn (/jobs/view/<id>), Naukri and Unstop. Otherwise fall back to canonicalUrl. fingerprint follows §0.4 exactly, including the list of aggregator/job-board hosts.
- sanitizeDescription: a sanitize-html allowlist (p, br, ul/ol/li, strong/b, em/i, h2–h4, a[href] with rel/target added, blockquote, code, pre, basic tables). Decode HTML entities (Greenhouse sends escaped HTML). Strip styles, scripts, iframes and tracking pixels. Collapse empty paragraphs.
- htmlToText, and summarize (≤ 280 chars, sentence-aware).
- parsePostedAt: ISO, epoch s/ms, "Posted Today", "Just now", "2 days ago", "30+ Days Ago", "Posted on 12 Nov 2025" → ISO (fall back to `now`).
- detectTags: off-campus, walk-in, wfh, women/diversity, pwd, urgent. Also "suspicious" for scam signals: registration/training/security fee, "pay to apply", WhatsApp/Telegram-only contact, a gmail/yahoo recruiter address, unrealistic pay for freshers.
- qualityScore 0–100: points for an official source, a real apply URL, description length, salary, parsed location and recency; points off for suspicious.
- Optional enrichWithLLM(job): runs only for low-confidence records. It uses the Anthropic SDK with the latest small Claude model (e.g. claude-haiku-5-5) and a strict JSON schema via tool use to fill level/experience/batches/degrees/skills/category. Results are cached on disk by fingerprint. It is a no-op without ANTHROPIC_API_KEY and must never change title/company/applyUrl.

ALSO
- A fuzz test: normalizeJob never throws on garbage RawJobs, and its output always passes validateJobInput.
- A perf check: no catastrophic regexes; at least 5k jobs/second.
- A CLI: `pnpm --filter @easyjobs/normalize run cli <file.jsonl>` normalizes RawJob JSONL (e.g. any scraper's out/*.jsonl) to stdout and prints field distributions.

DONE WHEN typecheck and tests are green, fixtures cover every rule, and docs/status/P03.md is written.
```

### P04 · Company registry

```text
[P04 · Company registry] Read prompts.md §0 completely, run the §0.2 bootstrap, follow §0.8. You own ONLY packages/registry/**.

GOAL
Build @easyjobs/registry: a large, VERIFIED list of companies (CompanyTarget[]) with the exact ATS and token the ATS scrapers need. This is how we cover "every MNC and startup" through official career portals.

OUTPUT
- data/companies.json (CompanyTarget[], §0.6 token formats), sorted by slug. Minimum 500 verified entries; aim for 1,000+.
- src/index.ts exports:
  - companies, getCompany(slug), targetsByAts(ats), aliases
  - findCompany(nameOrDomainOrSlug): fuzzy matching on normalized names, aliases ("TCS" ↔ "Tata Consultancy Services") and domains
- Load the JSON with readFileSync + import.meta.url (no JSON import attributes).

COVERAGE (India-first, but global)
- Big Tech.
- Global MNCs and GCCs in India: banks, fintech, semiconductors, SaaS, retail tech. For example Goldman Sachs, JPMorgan, Morgan Stanley, Wells Fargo, American Express, Visa, Mastercard, Walmart, Target, NVIDIA, Intel, AMD, Qualcomm, Texas Instruments, Cisco, Adobe, Salesforce, ServiceNow, Workday, SAP, Oracle, Intuit, PayPal, Uber, Atlassian…
- Indian IT and consulting: TCS, Infosys, Wipro, HCLTech, Tech Mahindra, LTIMindtree, Cognizant, Capgemini, Accenture, Deloitte, EY, PwC, KPMG…
- Indian unicorns and product startups: Flipkart, Swiggy, Zomato, Zepto, Razorpay, CRED, PhonePe, Groww, Meesho, Ola, Paytm, Freshworks, Zoho, Postman, BrowserStack, Dream11, ShareChat, upGrad, PhysicsWallah, InMobi, Myntra, Nykaa, Lenskart, Urban Company, Rapido, Juspay, Chargebee…
- Global startups (YC, AI labs, devtools) that hire in India or remotely.

METHOD
1. scripts/candidates.ts: a large curated candidate list (name, domain, careers URL if known, tags, hq, indiaPresence).
2. scripts/detect-ats.ts <careersUrl|domain>: fetch the careers page (respect robots, be polite) and follow redirects. Look for ATS fingerprints in URLs, HTML and scripts:
   - boards/job-boards.greenhouse.io, jobs.lever.co, jobs.ashbyhq.com, jobs.smartrecruiters.com, apply.workable.com, *.recruitee.com
   - *.bamboohr.com, *.jobs.personio.*, *.breezy.hr, *.teamtailor.com
   - *.myworkdayjobs.com, *.oraclecloud.com/hcmUI, successfactors/jobs2web, eightfold "api/apply/v2", phenom "phApp", *.icims.com
   - avature, taleo, zohorecruit, keka, darwinbox, freshteam
   Output: {ats, token}.
3. scripts/probe.ts: for candidates without a known ATS, probe slug variants (name, namehq, nameinc, name-india, nameindia, domain stem) against the public greenhouse/lever/ashby/smartrecruiters/workable/recruitee APIs. Keep hits whose company name or domain matches.
4. scripts/verify.ts: hit each entry's real endpoint with the cheapest possible request and store verifiedAt + openJobs. Drop dead entries into data/rejected.json with a reason. Concurrency ≤ 4 per ATS host, responses cached in .cache/, flags --only <ats> and --slug.
5. Priority:
   - 1 = big India hirers and fresher-friendly companies (Big Tech, Indian IT, unicorns)
   - 2 = other MNCs and startups
   - 3 = the rest
   Tags come from COMPANY_TAGS.
6. data/summary.md: counts by ATS, tag and priority; the top 50 by openJobs.

TESTS: every entry is valid (unique kebab-case slug, token format per ATS, https URLs); findCompany fuzzy cases; detect-ats on saved HTML fixtures.

DONE WHEN companies.json has ≥ 500 verified entries (report the real number), tests are green, and docs/status/P04.md is written.
```

### P05 · Scheduler and ingestion worker

```text
[P05 · Scheduler / ingestion worker] Read prompts.md §0 completely, run the §0.2 bootstrap, follow §0.8. You own ONLY apps/worker/**.

GOAL
Build @easyjobs/worker, the always-on process that keeps the site real-time. It runs every scraper on a smart schedule, normalizes and dedupes the results, and ships batches to the API ingest endpoints (§0.5). It is built against the contract only; everything else is plugged in by discovery, so no other session's code is needed now.

DISCOVERY (no hard imports of sibling packages)
- Scrapers: scan <repo>/packages/scrapers/*/src/index.ts and dynamic-import each one (pathToFileURL) as a ScraperModule. Validate the shape. Skip broken packages with a clear warning; never crash. Include an internal "demo" scraper that emits fake jobs, used in tests and when no scrapers exist.
- Normalizer: if <repo>/packages/normalize/src/index.ts exists, use its normalizeJob. Otherwise use a local fallback-normalize.ts that produces a minimal but valid JobInput (slugify, naive level/type detection, URL-based fingerprint).
- Registry: if <repo>/packages/registry/src/index.ts exists, use companies/findCompany. Otherwise use fixtures/companies.sample.json (10 real entries across greenhouse/lever/ashby/workday).
- Re-scan on SIGHUP and every 10 min, so new scraper packages are picked up without a restart.

SCHEDULING
- Tasks:
  - scrapers without handlesAts → one task each, every intervalMinutes
  - ATS scrapers → one task per (scraper, target), on a cadence set by target.priority (1: 15 min, 2: 60 min, 3: 24 h), spread evenly across the window with jitter (no thundering herd)
- Concurrency: global WORKER_CONCURRENCY (default 6), 1–2 per scraper, a per-task timeout, and an AbortSignal on shutdown.
- Failures: exponential backoff per failing task. Circuit breaker: after 5 consecutive failures, pause that task for 6 h and report it.
- Respect isEnabled(env). Use one shared createHttpClient so per-host politeness applies across all scrapers.
- Persist schedule state (last success, next run, failures, cursors) in apps/worker/.state/state.json, so restarts don't re-hammer sources.

PIPELINE (per task)
1. scrape, with ctx.since = the last successful run and ctx.isKnown backed by GET /v1/ingest/known (cached per run)
2. validateRawJob (drop and count invalid jobs)
3. normalizeJob, passing sourceName and the registry company (looked up by target slug or findCompany(raw.company))
4. validateJobInput, then dedupe within the run by fingerprint
5. POST /v1/ingest/jobs in batches of 200 (gzip, retries)
6. POST /v1/ingest/sweep for (source, target), ONLY if the task completed without error and no limit was applied
7. POST /v1/ingest/runs with a RunReport
If the API is unreachable, spool batches to apps/worker/.spool/*.jsonl and replay them in order once it is back.

INTERFACES
- CLI:
  - `pnpm --filter @easyjobs/worker start` runs the scheduler.
  - `once --source <id> [--target <slug>] [--limit n] [--dry-run]` runs one task.
  - `list` shows discovered scrapers, targets and next runs.
  - --dry-run writes normalized JobInputs to apps/worker/out/<source>.jsonl instead of POSTing.
- HTTP on WORKER_PORT (4100):
  - GET /health
  - GET /status: per task, last run, duration, emitted, invalid, errors, next run, paused
  - POST /run/:source: manual trigger, requires x-ingest-key
- Structured logs, with one concise summary line per task.

TESTS (vitest, offline)
- Discovery with temporary fake scraper packages, including a broken one.
- Scheduler ordering, jitter, backoff and circuit breaker, using fake timers.
- The pipeline against a tiny in-test fake ingest server: batching, sweep only after complete runs, spool and replay.
- The fallback normalizer's output passes validateJobInput.

DONE WHEN typecheck and tests are green, `once --source demo --dry-run` works, `start` runs against a fake ingest server, and docs/status/P05.md is written.
```

### P06 · CourseJoiner scraper (+ similar fresher job blogs)

```text
[P06 · Scraper: CourseJoiner] Read prompts.md §0 completely, run the §0.2 bootstrap, follow §0.8. You own ONLY packages/scrapers/coursejoiner/** (@easyjobs/scraper-coursejoiner).

GOAL
A high-volume, high-quality feed of Indian internships, fresher jobs and off-campus drives from https://coursejoiner.com. Each job must link to the ORIGINAL company apply link, so it merges with the official posting (§0.4 fingerprint rule 1).

DISCOVER FIRST (document findings in README.md)
- Check robots.txt and the sitemaps (/sitemap.xml, /sitemap_index.xml, post sitemaps).
- Check whether the WordPress REST API is available: /wp-json/wp/v2/posts?per_page=100&_fields=id,date_gmt,modified_gmt,link,title,content,categories,tags and /wp-json/wp/v2/categories.
- Check the RSS feeds (/feed/ and category feeds).
- Prefer REST, then RSS, then HTML (cheerio). Obey robots.txt and stay at ≤ 1 request/second.

PARSING
- Map categories and tags to intent: internship, fresher job, off-campus drive, work from home, experienced. Skip non-job posts (courses, scholarships, quizzes, results, admit cards, news). A post only counts if it yields a company, a role and an apply link.
- Extract fields from the post body with tolerant patterns, because labels vary:
  - "Company Name / Company", "Job Role / Role / Position / Designation"
  - "Qualification / Education / Eligibility", "Batch / Eligible Batch / Passing Year", "Experience"
  - "Salary / CTC / Package / Stipend", "Job Location / Location", "Job Type", "Last Date", "Skills"
  - plus tables and bullet lists
  One post can contain several roles; emit one RawJob per role, with sourceJobId = <postId>#<n>.
- Apply link: take the external link near "Apply Link / Apply Now / Click Here to Apply".
  - Prefer company and ATS domains; ignore social, Telegram, WhatsApp and other-blog links.
  - Unwrap redirects and shorteners (redirect follow, cached).
  - If there is no external apply link, skip the post.
- Fill hints:
  - experienceRaw, salaryRaw, batches, degrees
  - jobType (internship vs full_time), experienceLevel (intern/fresher when obvious), tags (off-campus, walk-in, wfh)
  - postedAt = date_gmt
  - descriptionHtml = only the job-relevant part of the post (strip ads, share buttons, "join our Telegram" blocks and related posts)
- sourceKind "aggregator", source "coursejoiner", sourceUrl = post URL, target null.
- Optional: if ANTHROPIC_API_KEY is set and the heuristics have low confidence, extract the fields with the latest small Claude model (e.g. claude-haiku-5-5) and a strict JSON schema, cached by post id + modified date. Everything must work fully without it.

INCREMENTAL & BACKFILL
- intervalMinutes 15.
- Use modified_after/after (REST) or feed dates for ctx.since, plus ETag/If-Modified-Since caching.
- --backfill-days N (default 60) for the first run.
- Honour ctx.limit, and use ctx.isKnown to skip re-parsing unchanged posts.

SIMILAR SOURCES (once CourseJoiner is solid)
Make the adapter generic: createWpJobBlogScraper({ id, name, baseUrl, includeCategories, excludeCategories }). Add 2–3 more Indian fresher/off-campus job blogs that you VERIFY expose WP REST or RSS and allow crawling in robots.txt. Each gets its own Scraper id.

TESTS: 20+ saved real post fixtures of different shapes (single role, multi-role, table layout, internship, walk-in, and a non-job post that must be skipped), with expected RawJob snapshots. Also test apply-link selection and category filtering. src/cli.ts uses runScraperCli.

DONE WHEN `pnpm --filter @easyjobs/scraper-coursejoiner scrape --limit 100` gives ≥ 90% valid jobs that have an apply link, company and title; typecheck and tests are green; and docs/status/P06.md includes sample output stats.
```

### P07 · Public ATS APIs (startups + many MNCs)

```text
[P07 · Scraper: public ATS APIs] Read prompts.md §0 completely, run the §0.2 bootstrap, follow §0.8. You own ONLY packages/scrapers/ats-public/** (@easyjobs/scraper-ats-public).

GOAL
Official jobs from thousands of companies, via documented public job-board APIs. Build one Scraper per ATS, each with handlesAts set and kind "ats", working from ctx.targets. These are documented public APIs, so http requests can use robots:false, but stay polite (per-host concurrency 2–4).

ADAPTERS
Verify every endpoint and field live, then save small fixtures.
- greenhouse: GET https://boards-api.greenhouse.io/v1/boards/{token}/jobs?content=true
  - content is HTML-escaped, so decode it
  - postedAt: first_published if present, else updated_at
  - also map departments, offices, metadata, absolute_url
- lever: GET https://api.lever.co/v0/postings/{token}?mode=json (for an "eu:" token, use api.eu.lever.co)
  - map categories (commitment, location, allLocations, team, department), workplaceType, salaryRange
  - createdAt (ms), hostedUrl/applyUrl, descriptionPlain + lists + additional
- ashby: GET https://api.ashbyhq.com/posting-api/job-board/{token}?includeCompensation=true
  - map employmentType, isRemote/workplaceType, location + secondaryLocations, publishedAt, jobUrl/applyUrl, descriptionHtml, compensation
- smartrecruiters: GET https://api.smartrecruiters.com/v1/companies/{token}/postings?limit=100&offset=N, then /postings/{id} for details (only when !ctx.isKnown)
  - experienceLevel ids map to hints: internship, entry_level, associate, mid_senior_level, director, executive
  - also map typeOfEmployment, location.remote, jobAd.sections
- workable: the account widget/jobs API (e.g. https://apply.workable.com/api/v1/widget/accounts/{token}?details=true, or the v3 jobs API). Pick whichever is reliable and document it.
- recruitee: GET https://{token}.recruitee.com/api/offers/ (employment_type_code, experience_code, remote/hybrid, salary, careers_url)
- If time permits: bamboohr (/careers/list), personio (XML feed), breezy (/json), teamtailor.

MAPPING
Fill every hint the source provides: jobType, workMode/isRemote, experienceLevel, salary, department, postedAt, descriptionHtml, and companyDomain/companyLogoUrl from the target. Set:
- applyUrl = the official posting URL
- target = target.slug
- sourceJobId = the ATS job id
- source = the ATS id

ROBUSTNESS
- On a 404/410 board, log once and finish (the registry will drop it).
- Paginate fully. Honour ctx.limit and ctx.signal.
- Skip detail calls for known ids. Be gentle on 429s.

FIXTURE TARGETS: src/fixtures/targets.ts with 3–5 real, live, verified companies per ATS. The CLI and live tests use them.

TESTS: parser tests per ATS on saved fixtures, including edge cases (remote-only, multi-location, salary present/absent, internships); pagination logic with mocked responses; an opt-in LIVE=1 smoke test per ATS.

DONE WHEN every adapter returns valid RawJobs for its fixture targets via the CLI; typecheck and tests are green; and docs/status/P07.md has per-ATS counts and fill rates.
```

### P08 · Enterprise ATS (most MNC career sites)

```text
[P08 · Scraper: enterprise ATS] Read prompts.md §0 completely, run the §0.2 bootstrap, follow §0.8. You own ONLY packages/scrapers/ats-enterprise/** (@easyjobs/scraper-ats-enterprise).

GOAL
Most large MNCs run their career sites on enterprise ATSs. Build one Scraper per platform (handlesAts set, kind "ats"), driven by ctx.targets using the §0.6 token formats. Verify every endpoint live, find out what has changed, and document the request/response shapes in README.md.

ADAPTERS
- workday: the token is the career site URL https://{tenant}.wd{N}.myworkdayjobs.com/{site}.
  - List: POST https://{tenant}.wd{N}.myworkdayjobs.com/wday/cxs/{tenant}/{site}/jobs with {"appliedFacets":{},"limit":20,"offset":n,"searchText":""}. Paginate by total.
  - Detail: GET …/wday/cxs/{tenant}/{site}{externalPath} → jobPostingInfo: jobDescription, location, additionalLocations, timeType, startDate, jobReqId, remoteType, externalUrl.
  - Fetch details only for unknown jobs, capped per run (env WORKDAY_MAX_DETAILS, default 300).
  - Parse "Posted Today / Yesterday / 3 Days Ago / 30+ Days Ago".
  - Optional India-only mode via the tenant's location facet when the registry entry sets extra.workdayCountry.
- oracle (Oracle Recruiting Cloud): the token is https://{host}/hcmUI/CandidateExperience/en/sites/{siteNumber}.
  - List: /hcmRestApi/resources/latest/recruitingCEJobRequisitions?onlyData=true&expand=requisitionList.secondaryLocations&finder=findReqs;siteNumber={siteNumber},limit=25,offset={n},sortBy=POSTING_DATES_DESC
  - Detail: recruitingCEJobRequisitionDetails?expand=all&onlyData=true&finder=ById;Id="{id}",siteNumber={siteNumber}
  - Public URL: …/sites/{siteNumber}/job/{id}
- eightfold: the token is "https://{host}|{domain}".
  - List: GET https://{host}/api/apply/v2/jobs?domain={domain}&start={n}&num=10&sort_by=timestamp (optionally with a location filter)
  - Detail: /api/apply/v2/jobs/{id}?domain={domain}
- successfactors / phenom / icims / avature / taleo: these differ per customer, so build best-effort adapters. Phenom: the embedded phApp.ddo / widgets JSON. SuccessFactors RMK sites: search pages + sitemap. iCIMS: /jobs/search?ss=1&in_iframe=1 + detail pages.
- jsonld (generic, and very important): the token is a careers site or sitemap URL.
  - Discover job URLs from sitemaps or listing pages, then fetch the detail pages (robots respected, ≤ 1 rps per host).
  - Extract the schema.org JobPosting JSON-LD. Handle @graph, arrays, malformed JSON and escaped descriptions.
  - Map title, datePosted, validThrough, employmentType, hiringOrganization, jobLocation.address, jobLocationType TELECOMMUTE, applicantLocationRequirements, baseSalary, experienceRequirements, educationRequirements, identifier and url.
  - It is also the fallback for successfactors/phenom/icims when their APIs don't cooperate.

FIXTURE TARGETS: src/fixtures/targets.ts with real examples that you find and verify yourself: about 5 Workday tenants (big-tech/semiconductor/SaaS career sites), 2–3 Oracle sites, 2 Eightfold sites, and 3 JSON-LD career sites.

ROBUSTNESS
- Per-tenant politeness: concurrency 2, ≥ 400 ms gap.
- Resume via ctx.isKnown; use timeouts.
- Parsing must tolerate schema drift: zod safeParse per item, skipping bad items with a counter.

TESTS: fixtures and parser tests per platform, JSON-LD edge cases, LIVE=1 smoke tests.

DONE WHEN workday, oracle, eightfold and jsonld all produce valid RawJobs for their fixture targets via the CLI; typecheck and tests are green; and docs/status/P08.md has per-platform counts and fill rates.
```

### P09 · Custom career portals (big tech + Indian IT)

```text
[P09 · Scraper: custom career portals] Read prompts.md §0 completely, run the §0.2 bootstrap, follow §0.8. You own ONLY packages/scrapers/bigtech/** (@easyjobs/scraper-bigtech).

GOAL
Direct official coverage of the highest-volume employers whose career sites are custom-built (not standard ATS boards). Build one Scraper per company: id = company slug, kind "career_site", no handlesAts, intervalMinutes 30–60. Use India-focused filters where the site supports them, but keep remote/global roles that are open to India.

TARGETS (in priority order)
Amazon (amazon.jobs search JSON), Google, Microsoft, Apple, Meta, IBM, Atlassian, Uber, Goldman Sachs, Flipkart, TCS, Infosys, Wipro, HCLTech, Tech Mahindra, Cognizant, Capgemini, Accenture, Deloitte (India/USI), LTIMindtree, Zoho, Freshworks. Aim for ≥ 15 working.
If a target turns out to be a plain Greenhouse/Lever/Workday/Oracle/Eightfold board, don't build it here. List it in README under "for the registry" with its ats and token instead.

METHOD (for each target)
1. Open the careers search page and find the JSON endpoint the page itself calls. Playwright is fine as a dev tool for capturing network responses. Prefer that public JSON over HTML; obey robots.txt for HTML pages; use small page sizes and ≤ 1 rps.
2. Implement list fetching, plus detail fetching only for unknown ids. Map every available field to RawJob hints:
   - jobType, and level from the site's own categories (e.g. "Students / University / Graduates")
   - workMode, locations, postedAt, descriptionHtml
   - applyUrl = the official job page
3. Save fixtures; write parser tests and a LIVE=1 smoke test.
4. If a site needs login, a CAPTCHA or anti-bot tokens, do NOT work around it. Set isEnabled to () => false and give the reason in README.
Put shared helpers (pagination, HTML → text, relative dates) in src/lib/.

DONE WHEN ≥ 15 company scrapers return valid RawJobs via the CLI (e.g. `--scraper amazon --limit 50`); typecheck and tests are green; and docs/status/P09.md has a per-company table (status, endpoint type, jobs found, fill rates).
```

### P10 · Internshala scraper

```text
[P10 · Scraper: Internshala] Read prompts.md §0 completely, run the §0.2 bootstrap, follow §0.8. You own ONLY packages/scrapers/internshala/** (@easyjobs/scraper-internshala).

GOAL
India's biggest internship and fresher-job board, as two Scrapers: "internshala-internships" and "internshala-jobs" (kind "job_board", intervalMinutes 20).

DISCOVER FIRST (document in README.md)
- robots.txt (obey it).
- Listing URL patterns and pagination: /internships/, /internships/page-2/, /internships/work-from-home-internships/, category paths, /jobs/, /fresher-jobs/…
- Whether listings expose structured data (data attributes, embedded JSON, JSON-LD), and what the detail pages contain.

PARSING (cheerio)
- Listing cards: internal id, title, company, locations or "Work from home", start date, duration, stipend/CTC text, posted ("Just now", "Today", "2 days ago", "1 week ago"), the "Actively hiring" badge, part-time flag, detail URL, logo.
- Detail pages (only for !ctx.isKnown, capped per run): about the role, skills required, who can apply, perks, number of openings, CTC breakdown, apply-by date (→ validThrough), experience for jobs.
- Hints:
  - internships → jobType internship, level intern; fresher jobs → fresher/entry
  - stipend "₹ 10,000 - 15,000 /month" → salary with period month; handle "Unpaid" and "Performance based"
  - CTC "₹ 3,00,000 - 4,50,000" → salary with period year
  - WFH → remote; part-time; skills; tags (wfh, women for "for women" listings)
- applyUrl = sourceUrl = the Internshala detail URL (applications happen there); companyLogoUrl from the card.

POLITENESS: ≤ 1 request per 1.5 s. Crawl newest first and stop at the first page made entirely of known ids (incremental). A --pages N flag for backfill.

TESTS: saved listing and detail fixtures (internship, WFH, unpaid, a job with CTC), the pagination stop condition, parser snapshots.

DONE WHEN both scrapers produce ≥ 95% valid jobs via the CLI; typecheck and tests are green; and docs/status/P10.md has stats.
```

### P11 · LinkedIn (public guest listings) + Naukri

```text
[P11 · Scrapers: LinkedIn + Naukri] Read prompts.md §0 completely, run the §0.2 bootstrap, follow §0.8. You own ONLY packages/scrapers/portals/** (@easyjobs/scraper-portals).

GOAL
Best-effort, low-volume coverage of the two biggest portals. Both scrapers are DISABLED unless ENABLE_LINKEDIN=1 / ENABLE_NAUKRI=1 (via isEnabled). kind "job_board".

HARD RULES
- Public, logged-out pages only. No accounts or cookies, no CAPTCHA solving, no forged anti-bot tokens, no proxy rotation or fingerprint spoofing.
- On 429/999/403 or a challenge page: back off exponentially (hours) and end the run gracefully with a clear log.
- Very low rate: 1 request per 4–6 s, with per-run caps from env (LINKEDIN_MAX_REQ_PER_RUN, NAUKRI_MAX_REQ_PER_RUN).

LINKEDIN (id "linkedin", intervalMinutes 60)
- Guest search fragments: https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?keywords={kw}&location=India&f_TPR=r86400&start={0,25,…}
  - experience filter f_E: 1 internship, 2 entry, 3 associate, 4 mid-senior, 5 director, 6 executive
  - work type f_WT: 1 on-site, 2 remote, 3 hybrid
  - sortBy=DD
  - parse the job id (urn:li:jobPosting:{id}), title, company, location, time[datetime] and link
- Detail, only for unknown ids and capped: https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/{id} → description plus criteria (seniority, employment type, function, industries) → hints.
- Keyword plan from env, rotated across runs to keep volume low. Defaults: software engineer, developer, data analyst, data scientist, intern, fresher, graduate trainee, product manager, designer, marketing, sales, finance, HR.
- applyUrl = https://www.linkedin.com/jobs/view/{id}

NAUKRI (id "naukri", intervalMinutes 60)
- Work out how the public search pages load results: the JSON the site calls, or data rendered into the page.
  - If plain HTTP with ordinary headers works, use it.
  - If it needs generated anti-bot tokens, use Playwright (headless Chromium) to load public search pages such as https://www.naukri.com/software-engineer-jobs?experience=0 at very low volume and read the results the page receives.
  - If that is challenged too, ship the scraper disabled, with the evidence in README.
- Map jobId, title, companyName, placeholders (experience / salary / location), tagsAndSkills, posted label/createdDate → postedAt, jdURL → applyUrl/sourceUrl, and logo. Run fresher-focused queries (experience 0–1) plus the keyword plan.

TESTS: saved HTML/JSON fixtures for both portals (listing + detail), parser snapshots, backoff on 429/999 (mocked), isEnabled gating.

DONE WHEN both work via the CLI with their flags on, or are documented as blocked with evidence; typecheck and tests are green; and docs/status/P11.md is written.
```

### P12 · Open job APIs and feeds

```text
[P12 · Scrapers: open job APIs & feeds] Read prompts.md §0 completely, run the §0.2 bootstrap, follow §0.8. You own ONLY packages/scrapers/open-apis/** (@easyjobs/scraper-open-apis).

GOAL
Many small, reliable sources with public APIs. Build one Scraper per source. For each one: verify the endpoint live, follow the API's terms (rate limits; required attribution → Scraper.attribution), save fixtures, and map every structured field to RawJob hints.

SOURCES
- unstop: Unstop's public opportunity search, jobs and internships (student-heavy, India). Map eligibility → batches/degrees. kind job_board.
- adzuna: India endpoint /v1/api/jobs/in/search/{page} with max_days_old and sort_by=date. Needs ADZUNA_APP_ID/ADZUNA_APP_KEY; isEnabled only when the keys exist.
- jooble: POST https://jooble.org/api/{JOOBLE_API_KEY} with location India. isEnabled only when the key exists.
- themuse: public jobs API, with levels Internship/Entry/Mid/Senior.
- Remote boards: remotive, remoteok (attribution + link back required), arbeitnow, himalayas, jobicy, weworkremotely (RSS). Keep roles open to India or anywhere, and tag them remote.
- hn-whoishiring: find the latest "Ask HN: Who is hiring?" thread via the Algolia HN API and parse its top-level comments ("Company | Role | Location | REMOTE | …" plus links) into jobs. intervalMinutes 360.

Use intervals that respect each API's guidance (e.g. Remotive asks for only a few requests a day). For APIs whose links redirect to the original posting, resolve applyUrl to the final official URL when that's cheap (cached), so dedupe can merge them with official records.

TESTS: a fixture-based parser test per source, isEnabled gating, LIVE=1 smoke tests.

DONE WHEN every keyless source returns valid RawJobs via the CLI (key-based ones are verified if keys are present, otherwise unit-tested with fixtures); typecheck and tests are green; and docs/status/P12.md has per-source stats.
```

---

## Phase 2 — wire up and verify (run in order)

### W1 · Integrate everything

```text
[W1 · Integrate everything] Read prompts.md §0, every docs/status/*.md and every docs/contract-requests/*.md. You may now edit anything in the repo.

1. Contract: review the contract requests. Apply the worthwhile ones to packages/contract (bump CONTRACT_VERSION) and update every consumer. Stay backward-compatible where possible.
2. Run a clean `pnpm install` from the root, then make `pnpm -r run typecheck` and `pnpm -r run test` fully green. Fix real bugs; never skip or delete tests to get green.
3. Wire the real flow:
   - The worker discovers every scraper package plus the real @easyjobs/normalize and @easyjobs/registry. Prove it with `worker list`.
   - Worker → API ingest with INGEST_API_KEY; the API runs on PGlite (or DATABASE_URL).
   - Web: set NEXT_PUBLIC_USE_MOCKS=0 to use the real API. Fix every mismatch between mock and real behaviour (facet semantics, sorting, empty states, SSE, logos).
4. Root developer experience:
   - A root .env.example that merges every package's variables, with comments.
   - README.md: architecture diagram, how it works, quick start, a sources table, legal/etiquette notes.
   - Root scripts:
     - `pnpm dev` starts API + worker + web together (concurrently, colored prefixes); migrations run automatically
     - `pnpm scrape:once` runs every enabled scraper once with --limit 30 through the full pipeline
     - `pnpm seed`, `pnpm reset`, `pnpm check` (typecheck + test + lint)
5. Smoke run: `pnpm scrape:once`, then open the site and verify:
   - jobs from each source appear
   - filter and facet counts match DB counts
   - job pages render
   - the live "new jobs" pill fires when a manual worker run ingests new jobs
   - a real CourseJoiner job merged with its official posting (record the example)
6. Write docs/INTEGRATION.md: what changed, a per-source results table (enabled?, jobs ingested, invalid %, errors), and known issues ranked by impact.

DONE WHEN a fresh clone works with `pnpm install && cp .env.example .env && pnpm dev` plus `pnpm scrape:once`, and the site shows real jobs from ≥ 6 sources.
```

### W2 · End-to-end verification and data quality

```text
[W2 · End-to-end verification & data quality] Read prompts.md §0, README.md and docs/INTEGRATION.md. The app is integrated. Your job is to prove that it works and to fix what doesn't.

1. Run the full pipeline with realistic volume (every enabled source, normal limits) for at least 30 minutes of scheduler time.
2. Data quality: add scripts/data-quality.ts and have it generate docs/data-quality.md.
   - Per source: jobs, % with an apply URL on an official domain, % with salary, % with a parsed location, level and category distributions, duplicates merged, suspicious flagged, stale.
   - Overall: level/type/mode distributions, top companies, and freshness (median minutes from postedAt to firstSeenAt, for sources with precise timestamps).
   - Inspect 50 random jobs per level by hand (title vs level/type/batch/salary). Fix classifier and scraper bugs at the root, with new tests. Repeat until mis-classification is < 3% in your sample.
3. API:
   - contract tests for every route against the contract types
   - facet counts equal the real filtered totals; pagination is stable
   - SSE delivers matching new jobs within seconds
   - load test /v1/jobs and /v1/suggest (p95 targets: 150 ms / 50 ms on Postgres)
4. Web E2E (Playwright, against the real API):
   - search, every filter group, the level tabs, smart-search chips, URL share and back
   - job page plus valid JSON-LD; the apply link opens the official URL
   - save/tracker, ⌘K, the mobile sheet, dark mode, the live pill
   - Lighthouse mobile ≥ 95 on /, /jobs and a job page; axe reports zero serious or critical violations
5. Resilience:
   - kill the API mid-run → spool and replay works
   - make one source return 500s → backoff and circuit breaker work
   - break one scraper package → the worker survives
6. Write docs/qa-report.md: what was tested, the results, the fixes, and the remaining issues. Leave `pnpm check` green.
```

### W3 · Visual polish and "wow" pass

```text
[W3 · Visual polish & wow pass] Read README.md and docs/qa-report.md. Run the app with real data. Goal: make it look and feel exceptional — clean, calm and fast, but impressive. Change only apps/web unless a data fix is required.

1. Screenshot every page with Playwright (1440×900 and 390×844, light and dark, including empty, loading and error states) into apps/web/screenshots/before/. Critique each one like a demanding senior product designer: hierarchy, spacing rhythm, alignment, type scale, job-card density, badge overload, dark-mode contrast, logo rendering, empty states, motion. Write the top 25 issues to docs/design-review.md.
2. Fix them all. Then add tasteful signature moments:
   - a live counter ticker in the hero and the "just posted" feed animation
   - smooth filter transitions with layout animation and number tickers on facet counts
   - a delightful save interaction and keyboard hints
   - a crisp OG image template, favicon, app icons and a PWA manifest
3. Real-data edge cases: very long titles and company names, 10+ locations, missing logos, no salary, non-INR currencies, HTML-heavy descriptions, closed jobs (banner + similar jobs), suspicious jobs (warning callout).
4. Performance: zero CLS, LCP < 2 s on throttled mobile, a JS budget per route, logo caching, route prefetching.
5. Re-shoot into screenshots/after/ and compare side by side. Keep iterating until every screen would hold its own in a top design showcase.
```

### W4 · Production deploy (optional)

```text
[W4 · Production deploy] Read README.md. Prepare EasyJobs for production. Do NOT deploy anything or create any accounts without asking me first.
- Dockerfiles for api and worker (multi-stage, small, non-root). Next.js web for Vercel or standalone Docker. docker-compose.prod.yml with postgres + api + worker + web + Caddy (HTTPS).
- Production Postgres via DATABASE_URL (Neon/Supabase/RDS), with migrations on deploy and daily backups.
- Health checks, restart policies, structured logs, an optional error-tracking hook (Sentry), and uptime checks.
- Scraper etiquette in production: a real contact URL in SCRAPER_USER_AGENT, documented per-source rate limits, and a kill switch per source via env.
- Legal/UX pages: privacy, terms, and "we link to original postings / takedown requests" contact.
- docs/DEPLOY.md with exact steps for (a) a single VPS with docker compose and (b) Vercel + Railway/Fly.io + Neon.
```

---

## Optional add-ons (after W1, can run in parallel)

```text
[E1 · Job alerts] Read README.md. Add saved-search alerts:
- email via Resend (instant or daily digest) and a Telegram bot
- API endpoints to create, verify (double opt-in) and unsubscribe alerts
- a worker hook that matches newly ingested jobs against alerts
- a beautiful email template
- a "Create alert for this search" button in apps/web
Include tests and docs.
```

```text
[E2 · AI resume match] Read README.md. Add opt-in "Jobs for you":
- the user uploads a resume PDF; it is not stored by default
- extract skills and experience with Claude via the Anthropic SDK (use the latest Sonnet/Haiku models)
- personalized ranking, a "match %" and missing-skill hints on job cards, and a /for-you page
Privacy-first. The site must work exactly as before when the feature is off.
```

```text
[E3 · Accounts & sync] Read README.md. Add optional sign-in with Auth.js (Google + email magic link) that syncs saved jobs, the tracker and alerts across devices. Migrate a user's localStorage data on their first sign-in.
```
