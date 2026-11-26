"use client";

import { useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createParser, useQueryState, useQueryStates, parseAsString } from "nuqs";
import { DEFAULT_SEARCH_QUERY, parseSearchQuery, toQueryString, type SearchQuery } from "@easyjobs/contract";
import { applyPatch, mergePreset, type QueryPatch } from "@/lib/query-utils";

export { activeFilterCount, applyPatch, mergePreset, streamFilters, type QueryPatch } from "@/lib/query-utils";

/**
 * URL state for the search view. The URL format is defined ENTIRELY by the contract:
 * every key is parsed with parseSearchQuery and serialised with toQueryString — nuqs only
 * provides shallow (no server round-trip) history updates and cross-component reactivity.
 */
type UrlKey = Exclude<keyof SearchQuery, "page" | "pageSize">;

const URL_KEYS = [
  "q", "type", "level", "mode", "category", "location", "country", "company", "ctype", "skills",
  "batch", "source", "tag", "official", "posted", "salaryMin", "exp", "sort",
] as const satisfies readonly UrlKey[];

function contractParser<K extends UrlKey>(key: K) {
  return createParser<NonNullable<SearchQuery[K]>>({
    parse(value: string) {
      const parsed = parseSearchQuery(new URLSearchParams([[key, value]]))[key];
      return (parsed ?? null) as NonNullable<SearchQuery[K]> | null;
    },
    serialize(value) {
      return new URLSearchParams(toQueryString({ [key]: value } as Partial<SearchQuery>)).get(key) ?? "";
    },
    eq: (a, b) => JSON.stringify(a) === JSON.stringify(b),
  });
}

const parsers = {
  q: contractParser("q"),
  type: contractParser("type"),
  level: contractParser("level"),
  mode: contractParser("mode"),
  category: contractParser("category"),
  location: contractParser("location"),
  country: contractParser("country"),
  company: contractParser("company"),
  ctype: contractParser("ctype"),
  skills: contractParser("skills"),
  batch: contractParser("batch"),
  source: contractParser("source"),
  tag: contractParser("tag"),
  official: contractParser("official"),
  posted: contractParser("posted").withDefault(DEFAULT_SEARCH_QUERY.posted),
  salaryMin: contractParser("salaryMin"),
  exp: contractParser("exp"),
  sort: contractParser("sort").withDefault(DEFAULT_SEARCH_QUERY.sort),
};

export interface SearchStateOptions {
  /** "/jobs" keeps everything in its own URL; any other base path navigates to /jobs on change. */
  basePath?: string;
  preset?: Partial<SearchQuery>;
}

export interface SearchState {
  query: SearchQuery;
  /** Shallow URL update (push by default). */
  setQuery: (patch: QueryPatch, opts?: { history?: "push" | "replace" }) => void;
  replaceQuery: (next: SearchQuery, opts?: { history?: "push" | "replace" }) => void;
  clearAll: () => void;
  hrefFor: (patch: QueryPatch) => string;
}

export function useSearchState({ basePath = "/jobs", preset }: SearchStateOptions = {}): SearchState {
  const router = useRouter();
  const [urlState, setUrlState] = useQueryStates(parsers, { history: "push", shallow: true, scroll: false });

  const query = useMemo<SearchQuery>(() => {
    const raw: SearchQuery = { ...DEFAULT_SEARCH_QUERY };
    for (const key of URL_KEYS) {
      const value = urlState[key];
      if (value !== null && value !== undefined) (raw as unknown as Record<string, unknown>)[key] = value;
    }
    return mergePreset(preset, raw);
  }, [urlState, preset]);

  const inPlace = basePath === "/jobs";

  const replaceQuery = useCallback(
    (next: SearchQuery, opts?: { history?: "push" | "replace" }) => {
      if (!inPlace) {
        const qs = toQueryString({ ...next, page: 1 });
        router.push(qs ? `/jobs?${qs}` : "/jobs", { scroll: true });
        return;
      }
      const update: Record<string, unknown> = {};
      for (const key of URL_KEYS) {
        const value = next[key];
        const empty = value === undefined || value === false || value === "" || (Array.isArray(value) && value.length === 0);
        update[key] = empty ? null : value;
      }
      void setUrlState(update as Parameters<typeof setUrlState>[0], { history: opts?.history ?? "push" });
    },
    [inPlace, router, setUrlState],
  );

  const setQuery = useCallback(
    (patch: QueryPatch, opts?: { history?: "push" | "replace" }) => replaceQuery(applyPatch(query, patch), opts),
    [query, replaceQuery],
  );

  const clearAll = useCallback(() => {
    if (!inPlace) router.push("/jobs");
    else replaceQuery({ ...DEFAULT_SEARCH_QUERY, q: query.q, sort: query.sort });
  }, [inPlace, query.q, query.sort, replaceQuery, router]);

  const hrefFor = useCallback((patch: QueryPatch) => {
    const qs = toQueryString({ ...applyPatch(query, patch), page: 1 });
    return qs ? `/jobs?${qs}` : "/jobs";
  }, [query]);

  return { query, setQuery, replaceQuery, clearAll, hrefFor };
}

/** Selected job in the split view (`?job=<id>`, replace history so j/k don't spam the back stack). */
export function useSelectedJob(): [string | null, (id: string | null) => void] {
  const [job, setJob] = useQueryState("job", parseAsString.withOptions({ history: "replace", shallow: true, scroll: false }));
  const set = useCallback((id: string | null) => void setJob(id), [setJob]);
  return [job, set];
}

