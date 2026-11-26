import { DEFAULT_SEARCH_QUERY, type SearchQuery } from "@easyjobs/contract";

/* Pure SearchQuery helpers shared by server components and client hooks. */

type UrlKey = Exclude<keyof SearchQuery, "page" | "pageSize">;

export type QueryPatch = Partial<{ [K in UrlKey]: SearchQuery[K] | null }>;

/** Merge a preset (landing / company page) under the URL state: URL keys win. */
export function mergePreset(preset: Partial<SearchQuery> | undefined, query: SearchQuery): SearchQuery {
  if (!preset) return query;
  const out: SearchQuery = { ...query };
  for (const key of Object.keys(preset) as (keyof SearchQuery)[]) {
    const current = query[key];
    const isDefault = current === undefined || current === DEFAULT_SEARCH_QUERY[key];
    if (isDefault) (out as unknown as Record<string, unknown>)[key] = preset[key];
  }
  return out;
}

export function applyPatch(query: SearchQuery, patch: QueryPatch): SearchQuery {
  const next: Record<string, unknown> = { ...query, page: 1 };
  for (const [key, value] of Object.entries(patch)) {
    if (value === null || value === undefined || (Array.isArray(value) && value.length === 0) || value === false || value === "") {
      next[key] = key === "posted" ? "any" : key === "sort" ? "relevance" : undefined;
    } else next[key] = value;
  }
  return next as unknown as SearchQuery;
}

/** Filters only (what the live stream cares about). */
export function streamFilters(query: SearchQuery): Partial<SearchQuery> {
  const { q: _q, sort: _s, page: _p, pageSize: _ps, ...rest } = query;
  return rest;
}

/** Number of active filters (for the mobile "Filters (n)" button). */
export function activeFilterCount(query: SearchQuery, preset?: Partial<SearchQuery>): number {
  let n = 0;
  const lists = ["type", "level", "mode", "category", "location", "country", "company", "ctype", "skills", "batch", "source", "tag"] as const;
  for (const key of lists) {
    const presetCount = preset?.[key]?.length ?? 0;
    n += Math.max(0, (query[key]?.length ?? 0) - presetCount);
  }
  if (query.official && !preset?.official) n++;
  if (query.posted !== "any" && preset?.posted !== query.posted) n++;
  if (query.salaryMin) n++;
  if (query.exp !== undefined) n++;
  return n;
}
