import {
  API_ROUTES,
  toQueryString,
  type ApiError,
  type CompaniesResponse,
  type CompanySummary,
  type JobDetail,
  type JobsSearchResponse,
  type SearchQuery,
  type SimilarJobsResponse,
  type StatsResponse,
  type StreamEvent,
  type SuggestResponse,
} from "@easyjobs/contract";
import { ApiRequestError, type CompaniesParams, type JobsApi, type RequestOptions, type StreamFilters } from "./types";

export interface HttpApiOptions {
  /** Public base URL (browser + server), e.g. http://localhost:4000 */
  baseUrl: string;
  /** Optional server-only base URL (private network / Docker). */
  serverBaseUrl?: string;
  /** Server-side Data Cache revalidation window in seconds (default 15). */
  revalidateSeconds?: number;
}

const isServer = (): boolean => typeof window === "undefined";

/** Real API client — routes and semantics exactly as prompts.md §0.5. */
export function createHttpApi(options: HttpApiOptions): JobsApi {
  const revalidate = options.revalidateSeconds ?? 15;
  const base = (): string => (isServer() && options.serverBaseUrl ? options.serverBaseUrl : options.baseUrl);

  async function get<T>(path: string, init: RequestOptions & { allow404: true }): Promise<T | null>;
  async function get<T>(path: string, init?: RequestOptions & { allow404?: false }): Promise<T>;
  async function get<T>(path: string, init: RequestOptions & { allow404?: boolean } = {}): Promise<T | null> {
    const url = `${base()}${path}`;
    let res: Response;
    try {
      res = await fetch(url, {
        headers: { accept: "application/json" },
        signal: init.signal,
        ...(isServer() ? { next: { revalidate } } : {}),
      });
    } catch (error) {
      if (init.signal?.aborted) throw error;
      throw new ApiRequestError(0, "network_error", `Could not reach the EasyJobs API at ${base()} (${String(error)})`);
    }
    if (res.status === 404 && init.allow404) return null;
    if (!res.ok) {
      let code = "http_error";
      let message = `HTTP ${res.status} for ${path}`;
      try {
        const body = (await res.json()) as Partial<ApiError>;
        if (body.error?.code) code = body.error.code;
        if (body.error?.message) message = body.error.message;
      } catch {
        /* non-JSON error body */
      }
      throw new ApiRequestError(res.status, code, message);
    }
    return (await res.json()) as T;
  }

  const withQs = (path: string, qs: string): string => (qs ? `${path}?${qs}` : path);

  return {
    searchJobs: (q: SearchQuery, init?: RequestOptions) =>
      get<JobsSearchResponse>(withQs(API_ROUTES.jobs, toQueryString(q)), init),

    getJob: (id: string, init?: RequestOptions) => get<JobDetail>(API_ROUTES.job(id), { ...init, allow404: true }),

    similar: (id: string, limit = 6, init?: RequestOptions) =>
      get<SimilarJobsResponse>(withQs(API_ROUTES.similar(id), `limit=${Math.min(12, Math.max(1, limit))}`), init),

    suggest: (q: string, init?: RequestOptions) =>
      get<SuggestResponse>(withQs(API_ROUTES.suggest, new URLSearchParams({ q }).toString()), init),

    stats: (init?: RequestOptions) => get<StatsResponse>(API_ROUTES.stats, init),

    companies: (params: CompaniesParams = {}, init?: RequestOptions) => {
      const sp = new URLSearchParams();
      if (params.q) sp.set("q", params.q);
      if (params.ctype?.length) sp.set("ctype", params.ctype.join(","));
      if (params.page) sp.set("page", String(params.page));
      if (params.pageSize) sp.set("pageSize", String(params.pageSize));
      return get<CompaniesResponse>(withQs(API_ROUTES.companies, sp.toString().replace(/%2C/gi, ",")), init);
    },

    company: (slug: string, init?: RequestOptions) =>
      get<CompanySummary>(API_ROUTES.company(slug), { ...init, allow404: true }),

    subscribe(filters: StreamFilters, onEvent: (event: StreamEvent) => void): () => void {
      if (isServer() || typeof EventSource === "undefined") return () => {};
      // q / sort / page are ignored by the stream (§0.5) — strip them for a clean URL.
      const { q: _q, sort: _sort, page: _page, pageSize: _pageSize, ...rest } = filters;
      const source = new EventSource(withQs(`${options.baseUrl}${API_ROUTES.stream}`, toQueryString(rest)));
      const handle = (event: MessageEvent<string>): void => {
        try {
          onEvent(JSON.parse(event.data) as StreamEvent);
        } catch {
          /* ignore malformed frames */
        }
      };
      source.addEventListener("job", handle as EventListener);
      source.addEventListener("stats", handle as EventListener);
      return () => source.close();
    },
  };
}
