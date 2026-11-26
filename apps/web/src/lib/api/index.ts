import { API_URL, USE_MOCKS } from "@/lib/env";
import type { JobsApi } from "./types";

export * from "./types";

let implementation: Promise<JobsApi> | undefined;

/**
 * Lazily loads the implementation chosen by NEXT_PUBLIC_USE_MOCKS. The flag is inlined at build time,
 * so the unused implementation (and the whole mock dataset in http mode) is never shipped/loaded.
 */
export function loadApi(): Promise<JobsApi> {
  implementation ??= USE_MOCKS
    ? import("./mock").then((m) => m.createMockApi())
    : import("./http").then((m) =>
        m.createHttpApi({ baseUrl: API_URL, serverBaseUrl: process.env.API_INTERNAL_URL || undefined }),
      );
  return implementation;
}

/** Isomorphic API facade — usable from server components, route handlers and client components. */
export const api: JobsApi = {
  searchJobs: async (q, o) => (await loadApi()).searchJobs(q, o),
  getJob: async (id, o) => (await loadApi()).getJob(id, o),
  similar: async (id, limit, o) => (await loadApi()).similar(id, limit, o),
  suggest: async (q, o) => (await loadApi()).suggest(q, o),
  stats: async (o) => (await loadApi()).stats(o),
  companies: async (p, o) => (await loadApi()).companies(p, o),
  company: async (slug, o) => (await loadApi()).company(slug, o),
  subscribe(filters, onEvent) {
    let unsubscribe: (() => void) | undefined;
    let cancelled = false;
    void loadApi().then((impl) => {
      if (!cancelled) unsubscribe = impl.subscribe(filters, onEvent);
    });
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  },
};
