/**
 * Search filters, declared once with BOTH an SQL condition and a JS predicate, so search, facets and the
 * SSE stream (server-side event filtering) share exactly the same semantics (parity is tested).
 * Semantics follow the SearchQuery doc comments: lists are OR within a filter, AND across filters.
 */
import { sql, type SQL } from "drizzle-orm";
import { COMPANY_TAGS, POSTED_WITHIN_MS, type Facets, type SearchQuery } from "@easyjobs/contract";
import { intArray, textArray } from "../sql-util";

export type FacetKey = keyof Facets;

/** The fields of a job that filters look at (DB row or in-memory event). */
export interface MatchableJob {
  status: "open" | "closed";
  jobType: string;
  experienceLevel: string;
  workMode: string | null;
  category: string;
  cities: readonly string[];
  countries: readonly string[];
  isRemote: boolean;
  companySlug: string;
  companyTags: readonly string[];
  skills: readonly string[];
  batches: readonly number[];
  sourceIds: readonly string[];
  tags: readonly string[];
  isOfficial: boolean;
  postedAt: string;
  salaryInrYearlyMin: number | null;
  salaryInrYearlyMax: number | null;
  experienceMin: number | null;
  experienceMax: number | null;
}

interface FilterDef {
  key: keyof SearchQuery;
  /** The facet that ignores this filter (disjunctive faceting); null = applies to every facet. */
  facet: FacetKey | null;
  active(q: SearchQuery): boolean;
  sql(q: SearchQuery, now: Date): SQL;
  test(j: MatchableJob, q: SearchQuery, now: Date): boolean;
}

const has = <T>(v: readonly T[] | undefined): v is readonly T[] => Array.isArray(v) && v.length > 0;
const overlaps = (a: readonly string[], b: readonly string[]): boolean => a.some((x) => b.includes(x));
const isRemoteToken = (v: string): boolean => v.toLowerCase() === "remote";

function locationParts(q: SearchQuery): { cities: string[]; remote: boolean } {
  const vals = q.location ?? [];
  return { cities: vals.filter((v) => !isRemoteToken(v)), remote: vals.some(isRemoteToken) };
}
const postedCutoff = (q: SearchQuery, now: Date): Date | null => {
  const ms = POSTED_WITHIN_MS[q.posted];
  return ms === null || ms === undefined ? null : new Date(now.getTime() - ms);
};
const salaryOf = (j: MatchableJob): number | null => j.salaryInrYearlyMax ?? j.salaryInrYearlyMin;

export const FILTERS: readonly FilterDef[] = [
  {
    key: "type",
    facet: "type",
    active: (q) => has(q.type),
    sql: (q) => sql`j.job_type = ANY(${textArray(q.type!)})`,
    test: (j, q) => q.type!.includes(j.jobType as never),
  },
  {
    key: "level",
    facet: "level",
    active: (q) => has(q.level),
    sql: (q) => sql`j.experience_level = ANY(${textArray(q.level!)})`,
    test: (j, q) => q.level!.includes(j.experienceLevel as never),
  },
  {
    key: "mode",
    facet: "mode",
    active: (q) => has(q.mode),
    sql: (q) => sql`j.work_mode = ANY(${textArray(q.mode!)})`,
    test: (j, q) => j.workMode !== null && q.mode!.includes(j.workMode as never),
  },
  {
    key: "category",
    facet: "category",
    active: (q) => has(q.category),
    sql: (q) => sql`j.category = ANY(${textArray(q.category!)})`,
    test: (j, q) => q.category!.includes(j.category as never),
  },
  {
    // Canonical city names or "Remote" (matches isRemote).
    key: "location",
    facet: "location",
    active: (q) => has(q.location),
    sql: (q) => {
      const { cities, remote } = locationParts(q);
      const conds: SQL[] = [];
      if (cities.length > 0) conds.push(sql`j.cities && ${textArray(cities)}`);
      if (remote) conds.push(sql`j.is_remote`);
      return sql`(${sql.join(conds, sql` OR `)})`;
    },
    test: (j, q) => {
      const { cities, remote } = locationParts(q);
      return (cities.length > 0 && overlaps(j.cities, cities)) || (remote && j.isRemote);
    },
  },
  {
    key: "country",
    facet: null,
    active: (q) => has(q.country),
    sql: (q) => sql`j.countries && ${textArray(q.country!)}`,
    test: (j, q) => overlaps(j.countries, q.country!),
  },
  {
    key: "company",
    facet: "company",
    active: (q) => has(q.company),
    sql: (q) => sql`j.company_slug = ANY(${textArray(q.company!)})`,
    test: (j, q) => q.company!.includes(j.companySlug),
  },
  {
    key: "ctype",
    facet: "ctype",
    active: (q) => has(q.ctype),
    sql: (q) => sql`j.company_tags && ${textArray(q.ctype!)}`,
    test: (j, q) => overlaps(j.companyTags, q.ctype!),
  },
  {
    key: "skills",
    facet: "skills",
    active: (q) => has(q.skills),
    sql: (q) => sql`j.skills && ${textArray(q.skills!)}`,
    test: (j, q) => overlaps(j.skills, q.skills!),
  },
  {
    key: "batch",
    facet: "batch",
    active: (q) => has(q.batch),
    sql: (q) => sql`j.batches && ${intArray(q.batch!)}`,
    test: (j, q) => j.batches.some((b) => q.batch!.includes(b)),
  },
  {
    key: "source",
    facet: "source",
    active: (q) => has(q.source),
    sql: (q) => sql`j.source_ids && ${textArray(q.source!)}`,
    test: (j, q) => overlaps(j.sourceIds, q.source!),
  },
  {
    key: "tag",
    facet: "tag",
    active: (q) => has(q.tag),
    sql: (q) => sql`j.tags && ${textArray(q.tag!)}`,
    test: (j, q) => overlaps(j.tags, q.tag!),
  },
  {
    // Only jobs with at least one official (career_site/ats) source.
    key: "official",
    facet: null,
    active: (q) => q.official === true,
    sql: () => sql`j.is_official`,
    test: (j) => j.isOfficial,
  },
  {
    key: "posted",
    facet: null,
    active: (q) => POSTED_WITHIN_MS[q.posted] !== null && POSTED_WITHIN_MS[q.posted] !== undefined,
    sql: (q, now) => sql`j.posted_at >= ${postedCutoff(q, now)!.toISOString()}::timestamptz`,
    test: (j, q, now) => Date.parse(j.postedAt) >= postedCutoff(q, now)!.getTime(),
  },
  {
    // INR per year: the job pays at least salaryMin at the top of its range (jobs without salary are excluded).
    key: "salaryMin",
    facet: null,
    active: (q) => typeof q.salaryMin === "number" && q.salaryMin > 0,
    sql: (q) => sql`coalesce(j.salary_inr_yearly_max, j.salary_inr_yearly_min) >= ${q.salaryMin!}`,
    test: (j, q) => {
      const s = salaryOf(j);
      return s !== null && s >= q.salaryMin!;
    },
  },
  {
    // Candidate's years → experienceMin ≤ exp ≤ experienceMax; null bounds are open-ended.
    key: "exp",
    facet: null,
    active: (q) => typeof q.exp === "number",
    sql: (q) =>
      sql`(j.experience_min IS NULL OR j.experience_min <= ${q.exp!}) AND (j.experience_max IS NULL OR j.experience_max >= ${q.exp!})`,
    test: (j, q) => (j.experienceMin === null || j.experienceMin <= q.exp!) && (j.experienceMax === null || j.experienceMax >= q.exp!),
  },
];

/** SQL conditions for all active filters, optionally excluding the one(s) belonging to `exceptFacet`. */
export function filterConditions(q: SearchQuery, now: Date, exceptFacet: FacetKey | null = null): SQL[] {
  return FILTERS.filter((f) => f.active(q) && (exceptFacet === null || f.facet !== exceptFacet)).map((f) => f.sql(q, now));
}

/** JS predicate with the same semantics as filterConditions (q / sort / page are not filters). */
export function matchesFilters(job: MatchableJob, q: SearchQuery, now: Date = new Date()): boolean {
  if (job.status !== "open") return false;
  return FILTERS.every((f) => !f.active(q) || f.test(job, q, now));
}

/* ─────────────── value canonicalisation ─────────────── */

/** City aliases accepted in `location` (canonical names as produced by @easyjobs/normalize). */
export const CITY_ALIASES: Record<string, string> = {
  bangalore: "Bengaluru",
  bengaluru: "Bengaluru",
  gurgaon: "Gurugram",
  gurugram: "Gurugram",
  bombay: "Mumbai",
  "navi mumbai": "Navi Mumbai",
  madras: "Chennai",
  calcutta: "Kolkata",
  trivandrum: "Thiruvananthapuram",
  cochin: "Kochi",
  mysore: "Mysuru",
  poona: "Pune",
  secunderabad: "Hyderabad",
  "new delhi": "New Delhi",
  delhi: "Delhi",
};

/** Lower-case → canonical lookups for values that come from data (cities, skills, tags, sources). */
export interface FilterDictionary {
  cities?: ReadonlyMap<string, string>;
  skills?: ReadonlyMap<string, string>;
  tags?: ReadonlyMap<string, string>;
  sources?: ReadonlyMap<string, string>;
}

const COMPANY_TAG_LOOKUP = new Map(COMPANY_TAGS.map((t) => [t.toLowerCase(), t]));

function canon(values: string[] | undefined, lookup: ReadonlyMap<string, string> | undefined, aliases?: Record<string, string>): string[] | undefined {
  if (!values) return values;
  const out = values.map((v) => {
    const k = v.trim().toLowerCase();
    const direct = lookup?.get(k);
    if (direct) return direct;
    const alias = aliases?.[k];
    if (alias) return lookup?.get(alias.toLowerCase()) ?? alias;
    return v.trim();
  });
  return [...new Set(out)];
}

/**
 * Make user-supplied values match stored canonical values: "bangalore" → "Bengaluru", "react" → "React",
 * "MNC" → "mnc", "remote" → "Remote". Unknown values pass through unchanged.
 */
export function canonicalizeQuery(q: SearchQuery, dict: FilterDictionary = {}): SearchQuery {
  const location = q.location?.map((v) => (isRemoteToken(v) ? "Remote" : v));
  return {
    ...q,
    location: canon(location, dict.cities, CITY_ALIASES)?.map((v) => (isRemoteToken(v) ? "Remote" : v)),
    skills: canon(q.skills, dict.skills),
    tag: canon(q.tag, dict.tags),
    source: canon(q.source, dict.sources),
    ctype: canon(q.ctype, COMPANY_TAG_LOOKUP),
  };
}
