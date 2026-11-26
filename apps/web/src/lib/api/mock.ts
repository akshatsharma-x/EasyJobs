/**
 * In-memory implementation of JobsApi with the same semantics as the real API (prompts.md §0.5):
 * text search on title/company/skills, every SearchQuery filter, disjunctive facets, 3 sorts, pagination,
 * suggest, stats, companies, and a simulated SSE stream that emits a new job every 6–12 s.
 *
 * Text matching: the query is lower-cased and split on anything except letters, digits and "+#." (so "c++",
 * "c#" and "node.js" survive). Every token (AND) must prefix-match a word of the title, the company name or a
 * skill. Tokens shorter than 2 characters are ignored unless they contain "+" or "#" ("c++", "c#").
 */
import {
  DEFAULT_SEARCH_QUERY,
  EXPERIENCE_LEVELS,
  JOB_TYPES,
  LABELS,
  POSTED_WITHIN_MS,
  type CompaniesResponse,
  type CompanySummary,
  type ExperienceLevel,
  type FacetBucket,
  type Facets,
  type JobDetail,
  type JobListItem,
  type JobType,
  type JobsSearchResponse,
  type SearchQuery,
  type SimilarJobsResponse,
  type StatsResponse,
  type StreamEvent,
  type SuggestResponse,
} from "@easyjobs/contract";
import { MOCK_LATENCY_MS } from "@/lib/env";
import { companyTagLabel, tagLabel } from "@/lib/labels";
import { CITY_ALIASES } from "@/lib/smart-query";
import {
  MOCK_COMPANIES,
  MOCK_SOURCES,
  deriveChoices,
  encodeLiveId,
  generateJobSpec,
  getBaseSpec,
  getBaseSpecs,
  isLiveId,
  mulberry32,
  postedAtFor,
  sourceById,
  specFromLiveId,
  toJobDetail,
  toListItem,
  type MockCompanyDef,
  type MockJobSpec,
} from "./mock-data";
import type { CompaniesParams, JobsApi, RequestOptions, StreamFilters } from "./types";

export interface MockApiOptions {
  /** Clock (epoch ms). Default Date.now. */
  now?: () => number;
  /** Simulated latency per call (ms, ±40 % jitter). Default: MOCK_LATENCY_MS in the browser, 0 on the server. */
  latencyMs?: number;
  /** Delay range between simulated stream jobs (ms). Default [6000, 12000]. */
  streamIntervalMs?: [number, number];
  /** Enable the simulated live stream. Default: browser only. */
  stream?: boolean;
}

type FacetKey = keyof Facets;

const FACET_KEYS: readonly FacetKey[] = ["type", "level", "mode", "category", "location", "company", "ctype", "skills", "batch", "source", "tag"];
const FACET_KEY_SET = new Set<string>(FACET_KEYS);
const FACET_CAPS: Partial<Record<FacetKey, number>> = { skills: 40, location: 60, company: 60 };

const DAY = 86_400_000;
const CACHE_MS = 30_000;
const MAX_LIVE_JOBS = 500;
const MAX_LIVE_AGE_MS = 7 * DAY;
const isBrowser = (): boolean => typeof window !== "undefined";

/* ─────────────────────────── Indexing ─────────────────────────── */

interface IndexedJob {
  spec: MockJobSpec;
  item: JobListItem;
  open: boolean;
  postedMs: number;
  /** lower-case canonical city names */
  cityKeys: string[];
  /** canonical city names (display case) */
  cityNames: string[];
  countries: string[];
  /** INR / yr, max ?? min */
  salaryInr: number | null;
  titleLower: string;
  titleWords: string[];
  companyWords: string[];
  skillWords: string[];
  skillsLower: string[];
  sourceIds: string[];
}

/** Lower-case words, keeping "+#." inside words ("c++", "c#", "node.js"). */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^\p{L}\p{N}+#.]+/u)
    .map((w) => w.replace(/^\.+|\.+$/g, ""))
    .filter((w) => w.length >= 2 || /[+#]/.test(w));
}

function indexJob(spec: MockJobSpec, now: number): IndexedJob {
  const item = toListItem(spec, now);
  const cityNames = spec.locations.map((l) => l.city).filter((c): c is string => c !== null);
  const countries = [...new Set(spec.locations.map((l) => l.country).filter((c): c is string => c !== null))];
  return {
    spec,
    item,
    open: spec.status === "open",
    postedMs: postedAtFor(spec, now),
    cityKeys: cityNames.map((c) => c.toLowerCase()),
    cityNames,
    countries,
    salaryInr: spec.salaryInrYearlyMax ?? spec.salaryInrYearlyMin,
    titleLower: spec.title.toLowerCase(),
    titleWords: tokenize(spec.title),
    companyWords: tokenize(`${item.company.name} ${item.company.slug.replace(/-/g, " ")}`),
    skillWords: spec.skills.flatMap(tokenize),
    skillsLower: spec.skills.map((s) => s.toLowerCase()),
    sourceIds: spec.sources.map((s) => s.id),
  };
}

interface Snapshot {
  now: number;
  jobs: IndexedJob[];
  byId: Map<string, IndexedJob>;
}

/** Base dataset + live jobs, materialised for one `now` and cached for ~30 s. */
class MockStore {
  private readonly live = new Map<string, MockJobSpec>();
  private cache: Snapshot | null = null;
  private lastLiveAt: number | null = null;

  constructor(private readonly clock: () => number) {}

  addLive(spec: MockJobSpec): void {
    this.live.set(spec.id, spec);
    this.lastLiveAt = Math.max(this.lastLiveAt ?? 0, spec.postedAtMs ?? 0);
    while (this.live.size > MAX_LIVE_JOBS) {
      const oldest = this.live.keys().next().value;
      if (oldest === undefined) break;
      this.live.delete(oldest);
    }
    this.cache = null;
  }

  get latestLiveAt(): number | null {
    return this.lastLiveAt;
  }

  snapshot(): Snapshot {
    const now = this.clock();
    if (this.cache && Math.abs(now - this.cache.now) <= CACHE_MS) return this.cache;
    const jobs: IndexedJob[] = [];
    for (const spec of getBaseSpecs()) jobs.push(indexJob(spec, now));
    for (const spec of this.live.values()) {
      if (now - (spec.postedAtMs ?? now) <= MAX_LIVE_AGE_MS) jobs.push(indexJob(spec, now));
    }
    this.cache = { now, jobs, byId: new Map(jobs.map((j) => [j.item.id, j])) };
    return this.cache;
  }

  /** Base job, live job seen by this instance, or a live job regenerated from its self-describing id. */
  resolve(id: string, snap: Snapshot): IndexedJob | null {
    const hit = snap.byId.get(id);
    if (hit) return hit;
    const spec = getBaseSpec(id) ?? this.live.get(id) ?? (isLiveId(id) ? specFromLiveId(id) : null);
    if (!spec) return null;
    if (spec.postedAtMs !== null && spec.postedAtMs > snap.now + DAY) return null;
    return indexJob(spec, snap.now);
  }
}

/* ─────────────────────────── Filtering ─────────────────────────── */

interface CompiledFilter {
  key: string;
  test: (job: IndexedJob) => boolean;
}

const lowerSet = (values: readonly string[]): Set<string> => new Set(values.map((v) => v.toLowerCase()));

function compileFilters(q: Partial<SearchQuery>, now: number): CompiledFilter[] {
  const filters: CompiledFilter[] = [];
  if (q.type?.length) {
    const set = new Set<string>(q.type);
    filters.push({ key: "type", test: (j) => set.has(j.item.jobType) });
  }
  if (q.level?.length) {
    const set = new Set<string>(q.level);
    filters.push({ key: "level", test: (j) => set.has(j.item.experienceLevel) });
  }
  if (q.mode?.length) {
    const set = new Set<string>(q.mode);
    filters.push({ key: "mode", test: (j) => j.item.workMode !== null && set.has(j.item.workMode) });
  }
  if (q.category?.length) {
    const set = new Set<string>(q.category);
    filters.push({ key: "category", test: (j) => set.has(j.item.category) });
  }
  if (q.location?.length) {
    const wanted = lowerSet(q.location);
    const remote = wanted.has("remote");
    filters.push({ key: "location", test: (j) => (remote && j.item.isRemote) || j.cityKeys.some((c) => wanted.has(c)) });
  }
  if (q.country?.length) {
    const set = new Set(q.country.map((c) => c.toUpperCase()));
    filters.push({ key: "country", test: (j) => j.countries.some((c) => set.has(c)) });
  }
  if (q.company?.length) {
    const set = lowerSet(q.company);
    filters.push({ key: "company", test: (j) => set.has(j.item.company.slug) });
  }
  if (q.ctype?.length) {
    const set = new Set(q.ctype);
    filters.push({ key: "ctype", test: (j) => j.item.company.tags.some((t) => set.has(t)) });
  }
  if (q.skills?.length) {
    const set = lowerSet(q.skills);
    filters.push({ key: "skills", test: (j) => j.skillsLower.some((s) => set.has(s)) });
  }
  if (q.batch?.length) {
    const set = new Set(q.batch);
    filters.push({ key: "batch", test: (j) => j.item.batches.some((b) => set.has(b)) });
  }
  if (q.source?.length) {
    const set = new Set(q.source);
    filters.push({ key: "source", test: (j) => j.sourceIds.some((s) => set.has(s)) });
  }
  if (q.tag?.length) {
    const set = new Set(q.tag);
    filters.push({ key: "tag", test: (j) => j.item.tags.some((t) => set.has(t)) });
  }
  if (q.official === true) filters.push({ key: "official", test: (j) => j.item.isOfficial });
  const postedMs = q.posted ? POSTED_WITHIN_MS[q.posted] : null;
  if (postedMs !== null && postedMs !== undefined) {
    const since = now - postedMs;
    filters.push({ key: "posted", test: (j) => j.postedMs >= since });
  }
  if (q.salaryMin !== undefined && q.salaryMin > 0) {
    const min = q.salaryMin;
    filters.push({ key: "salaryMin", test: (j) => j.salaryInr !== null && j.salaryInr >= min });
  }
  if (q.exp !== undefined) {
    const exp = q.exp;
    filters.push({
      key: "exp",
      test: (j) => (j.item.experienceMin ?? 0) <= exp && exp <= (j.item.experienceMax ?? Number.POSITIVE_INFINITY),
    });
  }
  return filters;
}

function matchesText(job: IndexedJob, tokens: string[]): boolean {
  for (const t of tokens) {
    const hit =
      job.titleWords.some((w) => w.startsWith(t)) ||
      job.companyWords.some((w) => w.startsWith(t)) ||
      job.skillWords.some((w) => w.startsWith(t));
    if (!hit) return false;
  }
  return true;
}

/** title exact word > title word prefix > title substring > company > skill, plus a phrase bonus. */
function textScore(job: IndexedJob, tokens: string[], phrase: string): number {
  let score = 0;
  for (const t of tokens) {
    let best = 0;
    for (const w of job.titleWords) {
      if (w === t) best = Math.max(best, 6);
      else if (w.startsWith(t)) best = Math.max(best, 5);
    }
    if (best < 4 && job.titleLower.includes(t)) best = 4;
    if (best < 3 && job.companyWords.some((w) => w.startsWith(t))) best = 3;
    if (best < 2 && job.skillWords.some((w) => w.startsWith(t))) best = 2;
    score += best;
  }
  if (tokens.length > 1 && job.titleLower.includes(phrase)) score += 3;
  return score;
}

function freshness(job: IndexedJob, now: number): number {
  const ageHours = Math.max(0, now - job.postedMs) / 3_600_000;
  return Math.exp(-ageHours / 96);
}

/* ─────────────────────────── Facets ─────────────────────────── */

function facetValues(job: IndexedJob, key: FacetKey): string[] {
  const item = job.item;
  switch (key) {
    case "type":
      return [item.jobType];
    case "level":
      return [item.experienceLevel];
    case "mode":
      return item.workMode ? [item.workMode] : [];
    case "category":
      return [item.category];
    case "location":
      return item.isRemote ? [...job.cityNames, "Remote"] : job.cityNames;
    case "company":
      return [item.company.slug];
    case "ctype":
      return item.company.tags;
    case "skills":
      return item.skills;
    case "batch":
      return item.batches.map(String);
    case "source":
      return job.sourceIds;
    case "tag":
      return item.tags;
  }
}

const COMPANY_NAME = new Map<string, string>(MOCK_COMPANIES.map((c) => [c.slug, c.name]));

function facetLabel(key: FacetKey, value: string): string {
  switch (key) {
    case "type":
      return (LABELS.jobType as Record<string, string>)[value] ?? value;
    case "level":
      return (LABELS.level as Record<string, string>)[value] ?? value;
    case "mode":
      return (LABELS.workMode as Record<string, string>)[value] ?? value;
    case "category":
      return (LABELS.category as Record<string, string>)[value] ?? value;
    case "company":
      return COMPANY_NAME.get(value) ?? value;
    case "ctype":
      return companyTagLabel(value);
    case "source":
      return sourceById(value)?.name ?? value;
    case "tag":
      return tagLabel(value);
    default:
      return value;
  }
}

function selectedValues(q: SearchQuery, key: FacetKey): string[] {
  const v = q[key];
  return Array.isArray(v) ? v.map(String) : [];
}

function buildFacet(pool: IndexedJob[], key: FacetKey, q: SearchQuery): FacetBucket[] {
  const caseless = key === "location" || key === "skills" || key === "company";
  const counts = new Map<string, { value: string; count: number }>();
  for (const job of pool) {
    for (const value of new Set(facetValues(job, key))) {
      const id = caseless ? value.toLowerCase() : value;
      const entry = counts.get(id);
      if (entry) entry.count++;
      else counts.set(id, { value, count: 1 });
    }
  }
  let buckets: FacetBucket[] = [...counts.values()].map(({ value, count }) => ({ value, label: facetLabel(key, value), count }));
  buckets.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  const cap = FACET_CAPS[key];
  const selected = selectedValues(q, key);
  if (cap !== undefined && buckets.length > cap) {
    const keep = new Set(selected.map((s) => (caseless ? s.toLowerCase() : s)));
    buckets = buckets.filter((b, i) => i < cap || keep.has(caseless ? b.value.toLowerCase() : b.value));
  }
  for (const s of selected) {
    const exists = buckets.some((b) => (caseless ? b.value.toLowerCase() === s.toLowerCase() : b.value === s));
    if (!exists) buckets.push({ value: s, label: facetLabel(key, s), count: 0 });
  }
  return buckets;
}

/* ─────────────────────────── Search ─────────────────────────── */

function normalizeQuery(input: Partial<SearchQuery>): SearchQuery {
  const q: SearchQuery = { ...DEFAULT_SEARCH_QUERY, ...input };
  q.page = Math.max(1, Math.floor(Number(q.page) || 1));
  q.pageSize = Math.min(50, Math.max(1, Math.floor(Number(q.pageSize) || DEFAULT_SEARCH_QUERY.pageSize)));
  return q;
}

const perfNow = (): number => (typeof performance !== "undefined" ? performance.now() : Date.now());

function runSearch(snap: Snapshot, input: Partial<SearchQuery>): JobsSearchResponse {
  const t0 = perfNow();
  const q = normalizeQuery(input);
  const tokens = tokenize(q.q ?? "");
  const phrase = tokens.join(" ");
  const filters = compileFilters(q, snap.now);
  const results: IndexedJob[] = [];
  const pools = Object.fromEntries(FACET_KEYS.map((k) => [k, [] as IndexedJob[]])) as Record<FacetKey, IndexedJob[]>;

  for (const job of snap.jobs) {
    if (!job.open) continue;
    if (tokens.length > 0 && !matchesText(job, tokens)) continue;
    let failed: string | null = null;
    let failures = 0;
    for (const f of filters) {
      if (!f.test(job)) {
        failures++;
        failed = f.key;
        if (failures > 1) break;
      }
    }
    if (failures === 0) {
      results.push(job);
      for (const k of FACET_KEYS) pools[k].push(job);
    } else if (failures === 1 && failed !== null && FACET_KEY_SET.has(failed)) {
      pools[failed as FacetKey].push(job);
    }
  }

  const score = new Map<IndexedJob, number>();
  if (q.sort === "relevance") {
    for (const job of results) {
      const fresh = freshness(job, snap.now);
      score.set(
        job,
        tokens.length > 0
          ? textScore(job, tokens, phrase) + 1.5 * fresh + job.spec.qualityScore / 200
          : 3 * fresh + job.spec.qualityScore / 50 + (job.item.isOfficial ? 0.6 : 0),
      );
    }
  }
  const byId = (a: IndexedJob, b: IndexedJob): number => (a.item.id < b.item.id ? -1 : a.item.id > b.item.id ? 1 : 0);
  const newest = (a: IndexedJob, b: IndexedJob): number => b.postedMs - a.postedMs || byId(a, b);
  results.sort((a, b) => {
    if (q.sort === "newest") return newest(a, b);
    if (q.sort === "salary") {
      if (a.salaryInr === null && b.salaryInr === null) return newest(a, b);
      if (a.salaryInr === null) return 1;
      if (b.salaryInr === null) return -1;
      return b.salaryInr - a.salaryInr || newest(a, b);
    }
    return (score.get(b) ?? 0) - (score.get(a) ?? 0) || newest(a, b);
  });

  const facets = Object.fromEntries(FACET_KEYS.map((k) => [k, buildFacet(pools[k], k, q)])) as unknown as Facets;
  const total = results.length;
  const start = (q.page - 1) * q.pageSize;
  return {
    data: results.slice(start, start + q.pageSize).map((j) => j.item),
    page: q.page,
    pageSize: q.pageSize,
    total,
    totalPages: total === 0 ? 0 : Math.ceil(total / q.pageSize),
    facets,
    tookMs: Math.max(1, Math.round(perfNow() - t0)),
  };
}

function matchesFilters(job: IndexedJob, filters: StreamFilters, now: number): boolean {
  if (!job.open) return false;
  const compiled = compileFilters({ ...filters, q: undefined }, now);
  return compiled.every((f) => f.test(job));
}

/* ─────────────────────────── Similar / suggest / stats / companies ─────────────────────────── */

function runSimilar(snap: Snapshot, base: IndexedJob, limit: number): JobListItem[] {
  const baseSkills = new Set(base.skillsLower);
  const baseCities = new Set(base.cityKeys);
  const scored: { job: IndexedJob; score: number }[] = [];
  for (const job of snap.jobs) {
    if (!job.open || job.item.id === base.item.id) continue;
    let score = 0;
    if (job.item.category === base.item.category) score += 3;
    if (job.item.experienceLevel === base.item.experienceLevel) score += 2;
    for (const s of job.skillsLower) if (baseSkills.has(s)) score += 1;
    if (job.cityKeys.some((c) => baseCities.has(c)) || (job.item.isRemote && base.item.isRemote)) score += 1;
    if (job.item.company.slug === base.item.company.slug) score += 0.5;
    score += 0.5 * freshness(job, snap.now);
    if (score >= 3) scored.push({ job, score });
  }
  scored.sort((a, b) => b.score - a.score || b.job.postedMs - a.job.postedMs);
  return scored.slice(0, limit).map((s) => s.job.item);
}

function rank<T extends { label: string; count: number }>(entries: T[], q: string): T[] {
  return entries
    .filter((e) => q === "" || e.label.toLowerCase().includes(q))
    .sort((a, b) => {
      if (q !== "") {
        const as = a.label.toLowerCase().startsWith(q) ? 0 : 1;
        const bs = b.label.toLowerCase().startsWith(q) ? 0 : 1;
        if (as !== bs) return as - bs;
      }
      return b.count - a.count || a.label.localeCompare(b.label);
    });
}

function openCountsByCompany(snap: Snapshot): Map<string, number> {
  const counts = new Map<string, number>();
  for (const job of snap.jobs) if (job.open) counts.set(job.item.company.slug, (counts.get(job.item.company.slug) ?? 0) + 1);
  return counts;
}

function runSuggest(snap: Snapshot, raw: string): SuggestResponse {
  const q = raw.trim().toLowerCase().replace(/\s+/g, " ");
  const titles = new Map<string, number>();
  const cities = new Map<string, number>();
  const skills = new Map<string, number>();
  for (const job of snap.jobs) {
    if (!job.open) continue;
    titles.set(job.item.title, (titles.get(job.item.title) ?? 0) + 1);
    for (const c of facetValues(job, "location")) cities.set(c, (cities.get(c) ?? 0) + 1);
    for (const s of job.item.skills) skills.set(s, (skills.get(s) ?? 0) + 1);
  }
  const counts = openCountsByCompany(snap);
  const companies = MOCK_COMPANIES.map((c) => ({ label: c.name, slug: c.slug, count: counts.get(c.slug) ?? 0 }))
    .filter((c) => q === "" || c.label.toLowerCase().includes(q) || c.slug.includes(q.replace(/\s/g, "-")))
    .sort((a, b) => {
      if (q !== "") {
        const as = a.label.toLowerCase().startsWith(q) ? 0 : 1;
        const bs = b.label.toLowerCase().startsWith(q) ? 0 : 1;
        if (as !== bs) return as - bs;
      }
      return b.count - a.count || a.label.localeCompare(b.label);
    })
    .slice(0, 8)
    .map((c) => ({ slug: c.slug, name: c.label, logoUrl: null, openJobs: c.count }));

  // Locations also match aliases: "bang" → Bengaluru, "gurgaon" → Gurugram.
  const aliasHits = new Set(
    q === "" ? [] : Object.entries(CITY_ALIASES).filter(([alias]) => alias.startsWith(q)).map(([, city]) => city.toLowerCase()),
  );
  const locationEntries = [...cities.entries()].map(([label, count]) => ({ label, count }));
  const locations = locationEntries
    .filter((e) => q === "" || e.label.toLowerCase().includes(q) || aliasHits.has(e.label.toLowerCase()))
    .sort((a, b) => {
      if (q !== "") {
        const as = a.label.toLowerCase().startsWith(q) || aliasHits.has(a.label.toLowerCase()) ? 0 : 1;
        const bs = b.label.toLowerCase().startsWith(q) || aliasHits.has(b.label.toLowerCase()) ? 0 : 1;
        if (as !== bs) return as - bs;
      }
      return b.count - a.count || a.label.localeCompare(b.label);
    })
    .slice(0, 8)
    .map((e) => e.label);

  return {
    titles: rank([...titles.entries()].map(([label, count]) => ({ label, count })), q).slice(0, 8).map((e) => e.label),
    companies,
    locations,
    skills: rank([...skills.entries()].map(([label, count]) => ({ label, count })), q).slice(0, 8).map((e) => e.label),
  };
}

function runStats(snap: Snapshot, latestLiveAt: number | null): StatsResponse {
  const byLevel = Object.fromEntries(EXPERIENCE_LEVELS.map((l) => [l, 0])) as Record<ExperienceLevel, number>;
  const byType = Object.fromEntries(JOB_TYPES.map((t) => [t, 0])) as Record<JobType, number>;
  const perSource = new Map<string, number>();
  const companies = new Set<string>();
  let totalOpen = 0;
  let newLastHour = 0;
  let newLast24h = 0;
  for (const job of snap.jobs) {
    if (!job.open) continue;
    totalOpen++;
    byLevel[job.item.experienceLevel]++;
    byType[job.item.jobType]++;
    companies.add(job.item.company.slug);
    const age = snap.now - job.postedMs;
    if (age <= 3_600_000) newLastHour++;
    if (age <= DAY) newLast24h++;
    for (const id of job.sourceIds) perSource.set(id, (perSource.get(id) ?? 0) + 1);
  }
  const sources = MOCK_SOURCES.filter((s) => (perSource.get(s.id) ?? 0) > 0)
    .map((s) => ({
      id: s.id,
      name: s.name,
      kind: s.kind,
      open: perSource.get(s.id) ?? 0,
      lastRunAt: new Date(snap.now - (2 + (hashId(s.id) % 23)) * 60_000).toISOString(),
    }))
    .sort((a, b) => b.open - a.open || a.name.localeCompare(b.name));
  return {
    totalOpen,
    newLastHour,
    newLast24h,
    companies: companies.size,
    byLevel,
    byType,
    sources,
    lastUpdatedAt: new Date(latestLiveAt ?? snap.now - 2 * 60_000).toISOString(),
  };
}

function hashId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (Math.imul(h, 31) + id.charCodeAt(i)) >>> 0;
  return h;
}

function companySummary(c: MockCompanyDef, openJobs: number): CompanySummary {
  return { slug: c.slug, name: c.name, domain: c.domain, logoUrl: null, tags: [...c.tags], hq: c.hq, careersUrl: c.careersUrl, openJobs };
}

function runCompanies(snap: Snapshot, params: CompaniesParams = {}): CompaniesResponse {
  const counts = openCountsByCompany(snap);
  const q = (params.q ?? "").trim().toLowerCase();
  const ctype = (params.ctype ?? []).filter(Boolean);
  const page = Math.max(1, Math.floor(Number(params.page) || 1));
  const pageSize = Math.min(100, Math.max(1, Math.floor(Number(params.pageSize) || 24)));
  const all = MOCK_COMPANIES.filter(
    (c) => (q === "" || c.name.toLowerCase().includes(q) || c.slug.includes(q.replace(/\s+/g, "-"))) && (ctype.length === 0 || c.tags.some((t) => ctype.includes(t))),
  )
    .map((c) => companySummary(c, counts.get(c.slug) ?? 0))
    .sort((a, b) => b.openJobs - a.openJobs || a.name.localeCompare(b.name));
  return { data: all.slice((page - 1) * pageSize, page * pageSize), page, pageSize, total: all.length };
}

/* ─────────────────────────── Latency ─────────────────────────── */

function abortError(signal: AbortSignal): unknown {
  return signal.reason ?? new DOMException("The operation was aborted.", "AbortError");
}

function wait(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.reject(abortError(signal));
  if (ms <= 0) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const onAbort = (): void => {
      clearTimeout(timer);
      reject(abortError(signal as AbortSignal));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/* ─────────────────────────── Factory ─────────────────────────── */

interface Subscription {
  filters: StreamFilters;
  onEvent: (event: StreamEvent) => void;
}

export function createMockApi(options: MockApiOptions = {}): JobsApi {
  const clock = options.now ?? Date.now;
  const latencyMs = Math.max(0, options.latencyMs ?? (isBrowser() ? MOCK_LATENCY_MS : 0));
  const [minGap, maxGap] = options.streamIntervalMs ?? [6000, 12000];
  const streamEnabled = options.stream ?? isBrowser();
  const store = new MockStore(clock);
  const subscriptions = new Map<number, Subscription>();
  let nextSubscriptionId = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;

  async function respond<T>(compute: () => T, request?: RequestOptions): Promise<T> {
    const signal = request?.signal;
    if (signal?.aborted) throw abortError(signal);
    const value = compute();
    if (latencyMs > 0) await wait(Math.round(latencyMs * (0.6 + Math.random() * 0.8)), signal);
    return value;
  }

  function emit(sub: Subscription, event: StreamEvent): void {
    try {
      sub.onEvent(event);
    } catch {
      /* a failing listener must not stop the stream */
    }
  }

  function tick(): void {
    timer = null;
    if (subscriptions.size === 0) return;
    const hidden = typeof document !== "undefined" && document.visibilityState === "hidden";
    if (!hidden) {
      const latest = [...subscriptions.values()].at(-1) as Subscription;
      const seed = Math.floor(Math.random() * 0x100000000) >>> 0;
      const postedAtMs = clock();
      const choices = deriveChoices(latest.filters, mulberry32((seed ^ 0x5bd1e995) >>> 0));
      const id = encodeLiveId(postedAtMs, seed, choices);
      store.addLive(generateJobSpec(seed, choices, { id, postedAtMs }));
      const snap = store.snapshot();
      const job = snap.byId.get(id);
      const stats = runStats(snap, store.latestLiveAt);
      for (const sub of [...subscriptions.values()]) {
        if (job && matchesFilters(job, sub.filters, snap.now)) emit(sub, { type: "job", job: job.item });
      }
      const liveStats = { totalOpen: stats.totalOpen, newLastHour: stats.newLastHour, newLast24h: stats.newLast24h, lastUpdatedAt: stats.lastUpdatedAt };
      for (const sub of [...subscriptions.values()]) emit(sub, { type: "stats", stats: liveStats });
    }
    schedule();
  }

  function schedule(): void {
    if (timer !== null || subscriptions.size === 0) return;
    const delay = minGap + Math.random() * Math.max(0, maxGap - minGap);
    timer = setTimeout(tick, delay);
  }

  return {
    searchJobs: (q, request) => respond(() => runSearch(store.snapshot(), q), request),

    getJob: (id, request) =>
      respond((): JobDetail | null => {
        const snap = store.snapshot();
        const job = store.resolve(id, snap);
        return job ? toJobDetail(job.spec, snap.now) : null;
      }, request),

    similar: (id, limit = 6, request) =>
      respond((): SimilarJobsResponse => {
        const snap = store.snapshot();
        const base = store.resolve(id, snap);
        const n = Math.min(12, Math.max(1, Math.floor(Number(limit) || 6)));
        return { data: base ? runSimilar(snap, base, n) : [] };
      }, request),

    suggest: (q, request) => respond(() => runSuggest(store.snapshot(), q ?? ""), request),

    stats: (request) => respond(() => runStats(store.snapshot(), store.latestLiveAt), request),

    companies: (params, request) => respond(() => runCompanies(store.snapshot(), params), request),

    company: (slug, request) =>
      respond((): CompanySummary | null => {
        const snap = store.snapshot();
        const def = MOCK_COMPANIES.find((c) => c.slug === slug.toLowerCase());
        return def ? companySummary(def, openCountsByCompany(snap).get(def.slug) ?? 0) : null;
      }, request),

    subscribe(filters, onEvent) {
      if (!streamEnabled) return () => {};
      const id = ++nextSubscriptionId;
      subscriptions.set(id, { filters: { ...filters }, onEvent });
      schedule();
      return () => {
        subscriptions.delete(id);
        if (subscriptions.size === 0 && timer !== null) {
          clearTimeout(timer);
          timer = null;
        }
      };
    },
  };
}
