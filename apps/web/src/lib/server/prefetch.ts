import "server-only";
import { cache } from "react";
import { QueryClient, dehydrate, type DehydratedState } from "@tanstack/react-query";
import type { SearchQuery } from "@easyjobs/contract";
import { api } from "@/lib/api";
import { jobOptions, jobsInfiniteOptions } from "@/lib/query-keys";

/** Per-request job lookup (dedupes generateMetadata + page). */
export const getJobCached = cache((id: string) => api.getJob(id));

/**
 * Server-side prefetch for the search view: the first results page (and an explicitly selected
 * `?job=` preview), dehydrated into the client cache so the first paint is fully server-rendered.
 * The default preview's description is fetched client-side — it's hidden on mobile, so shipping it
 * in every HTML response would only slow down phones.
 */
export async function prefetchSearch(query: SearchQuery, selectedId?: string | null): Promise<DehydratedState> {
  const qc = new QueryClient({ defaultOptions: { queries: { staleTime: 30_000 } } });
  await qc.prefetchInfiniteQuery(jobsInfiniteOptions(query));
  if (selectedId) await qc.prefetchQuery(jobOptions(selectedId));
  return dehydrate(qc);
}
