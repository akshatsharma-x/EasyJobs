import type {
  CompaniesResponse,
  CompanySummary,
  JobDetail,
  JobsSearchResponse,
  SearchQuery,
  SimilarJobsResponse,
  StatsResponse,
  StreamEvent,
  SuggestResponse,
} from "@easyjobs/contract";

/** Filter part of a SearchQuery used by the live stream (q / sort / page are ignored, prompts.md §0.5). */
export type StreamFilters = Partial<SearchQuery>;

export interface CompaniesParams {
  q?: string;
  /** CompanyTag values (any-of). */
  ctype?: string[];
  page?: number;
  pageSize?: number;
}

export interface RequestOptions {
  signal?: AbortSignal;
}

/**
 * The single data-access interface of the web app. Implemented by
 * `http.ts` (real API, prompts.md §0.5) and `mock.ts` (in-memory, same semantics).
 */
export interface JobsApi {
  searchJobs(q: SearchQuery, options?: RequestOptions): Promise<JobsSearchResponse>;
  /** Resolves closed jobs too; `null` when the id is unknown (404). */
  getJob(id: string, options?: RequestOptions): Promise<JobDetail | null>;
  /** limit 1..12, default 6. */
  similar(id: string, limit?: number, options?: RequestOptions): Promise<SimilarJobsResponse>;
  suggest(q: string, options?: RequestOptions): Promise<SuggestResponse>;
  stats(options?: RequestOptions): Promise<StatsResponse>;
  /** Sorted by openJobs desc. */
  companies(params?: CompaniesParams, options?: RequestOptions): Promise<CompaniesResponse>;
  /** `null` when the slug is unknown (404). */
  company(slug: string, options?: RequestOptions): Promise<CompanySummary | null>;
  /** Live events for jobs matching `filters`. Returns an unsubscribe function. No-op on the server. */
  subscribe(filters: StreamFilters, onEvent: (event: StreamEvent) => void): () => void;
}

/** Thrown by API implementations for non-2xx responses other than 404-as-null. */
export class ApiRequestError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ApiRequestError";
    this.status = status;
    this.code = code;
  }
}
