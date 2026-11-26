import { infiniteQueryOptions, queryOptions } from "@tanstack/react-query";
import { toQueryString, type SearchQuery } from "@easyjobs/contract";
import { api, type CompaniesParams } from "@/lib/api";

/** Canonical cache key for a search (page is handled by the infinite query). */
export const searchKey = (query: SearchQuery): string => toQueryString({ ...query, page: 1 });

export const queryKeys = {
  jobs: (query: SearchQuery) => ["jobs", searchKey(query)] as const,
  job: (id: string) => ["job", id] as const,
  similar: (id: string) => ["similar", id] as const,
  suggest: (q: string) => ["suggest", q.trim().toLowerCase()] as const,
  stats: () => ["stats"] as const,
  companies: (p: CompaniesParams) => ["companies", JSON.stringify(p)] as const,
  company: (slug: string) => ["company", slug] as const,
};

export function jobsInfiniteOptions(query: SearchQuery) {
  return infiniteQueryOptions({
    queryKey: queryKeys.jobs(query),
    queryFn: ({ pageParam, signal }) => api.searchJobs({ ...query, page: pageParam }, { signal }),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page < last.totalPages ? last.page + 1 : undefined),
  });
}

export function jobOptions(id: string) {
  return queryOptions({
    queryKey: queryKeys.job(id),
    queryFn: async ({ signal }) => {
      const job = await api.getJob(id, { signal });
      if (!job?.descriptionHtml) return job;
      // Defence in depth; the sanitiser chunk only loads when a description is first shown.
      const { sanitizeHtml } = await import("@/lib/sanitize");
      return { ...job, descriptionHtml: sanitizeHtml(job.descriptionHtml) };
    },
    staleTime: 60_000,
  });
}

export function suggestOptions(q: string) {
  return queryOptions({
    queryKey: queryKeys.suggest(q),
    queryFn: ({ signal }) => api.suggest(q.trim(), { signal }),
    staleTime: 60_000,
  });
}
