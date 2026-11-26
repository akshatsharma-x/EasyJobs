import { gzipSync } from "node:zlib";
import {
  API_ROUTES,
  type IngestRequest,
  type IngestResponse,
  type KnownIdsResponse,
  type RunReport,
  type SweepRequest,
  type SweepResponse,
} from "@easyjobs/contract";
import type { Logger } from "@easyjobs/contract/node";
import { delay, errorMessage, isObject, truncate } from "./util";

export const WORKER_VERSION = "0.1.0";
export const WORKER_USER_AGENT = `EasyJobsWorker/${WORKER_VERSION}`;

/**
 * unavailable → retryable later (network, timeout, 5xx/429 after retries, 401/403/404): the caller spools.
 * rejected    → this payload will never be accepted (other 4xx): the caller drops it and reports an error.
 * too_large   → 413: postJobs splits the batch.
 */
export type ApiFailureKind = "unavailable" | "rejected" | "too_large";

export type ApiResult<T> = { ok: true; status: number; data: T } | { ok: false; kind: ApiFailureKind; status: number | null; error: string };

export interface ApiClientOptions {
  baseUrl: string;
  key: string;
  timeoutMs?: number;
  retries?: number;
  retryBaseMs?: number;
  retryMaxMs?: number;
  gzip?: boolean;
  log?: Logger;
  fetchImpl?: typeof fetch;
}

const GZIP_MIN_BYTES = 1024;

function describeFetchError(e: unknown): string {
  if (e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError")) return "request timed out";
  return errorMessage(e);
}

async function readJson(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return {};
  }
}

const count = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : 0);

export function normalizeIngestResponse(v: unknown): IngestResponse {
  const o = isObject(v) ? v : {};
  const rejected = Array.isArray(o.rejected)
    ? o.rejected.filter(isObject).map((r) => ({ index: count(r.index), error: typeof r.error === "string" ? r.error : JSON.stringify(r.error ?? "") }))
    : [];
  return { inserted: count(o.inserted), updated: count(o.updated), merged: count(o.merged), rejected };
}

/** HTTP client for the API's /v1/ingest/* routes (x-ingest-key, gzip bodies, retries with backoff). */
export class IngestApiClient {
  readonly baseUrl: string;
  private gzip: boolean;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private readonly retries: number;
  private readonly retryBaseMs: number;
  private readonly retryMaxMs: number;

  constructor(private readonly opts: ApiClientOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/+$/, "");
    this.gzip = opts.gzip ?? true;
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.timeoutMs = opts.timeoutMs ?? 30_000;
    this.retries = opts.retries ?? 3;
    this.retryBaseMs = opts.retryBaseMs ?? 500;
    this.retryMaxMs = opts.retryMaxMs ?? 30_000;
  }

  get gzipEnabled(): boolean {
    return this.gzip;
  }

  /** GET /v1/ingest/known — null when unavailable (callers then treat every job as unknown). */
  async known(source: string, target: string | null): Promise<Set<string> | null> {
    const qs = new URLSearchParams({ source });
    if (target) qs.set("target", target);
    const r = await this.request<KnownIdsResponse>("GET", `${API_ROUTES.ingestKnown}?${qs.toString()}`, undefined, 1);
    if (!r.ok) {
      this.opts.log?.debug("known ids unavailable", { source, target, error: r.error });
      return null;
    }
    const ids = isObject(r.data) && Array.isArray(r.data.ids) ? r.data.ids.filter((x): x is string => typeof x === "string") : null;
    return ids ? new Set(ids) : null;
  }

  /** POST /v1/ingest/jobs; on 413 the batch is split in halves recursively. */
  async postJobs(req: IngestRequest): Promise<ApiResult<IngestResponse>> {
    const r = await this.request<unknown>("POST", API_ROUTES.ingestJobs, req);
    if (r.ok) return { ok: true, status: r.status, data: normalizeIngestResponse(r.data) };
    if (r.kind !== "too_large") return r;
    if (req.jobs.length <= 1) return { ok: false, kind: "rejected", status: r.status, error: "a single job exceeds the API body limit (HTTP 413)" };
    const mid = Math.ceil(req.jobs.length / 2);
    this.opts.log?.warn(`API returned 413 for ${req.jobs.length} jobs — splitting into ${mid} + ${req.jobs.length - mid}`);
    const a = await this.postJobs({ ...req, jobs: req.jobs.slice(0, mid) });
    if (!a.ok) return a;
    const b = await this.postJobs({ ...req, jobs: req.jobs.slice(mid) });
    if (!b.ok) return b;
    return {
      ok: true,
      status: b.status,
      data: {
        inserted: a.data.inserted + b.data.inserted,
        updated: a.data.updated + b.data.updated,
        merged: a.data.merged + b.data.merged,
        rejected: [...a.data.rejected, ...b.data.rejected.map((x) => ({ ...x, index: x.index + mid }))],
      },
    };
  }

  async postSweep(req: SweepRequest): Promise<ApiResult<SweepResponse>> {
    const r = await this.request<unknown>("POST", API_ROUTES.ingestSweep, req);
    return r.ok ? { ok: true, status: r.status, data: { closed: count(isObject(r.data) ? r.data.closed : 0) } } : r;
  }

  async postRun(report: RunReport): Promise<ApiResult<{ ok: boolean }>> {
    const r = await this.request<unknown>("POST", API_ROUTES.ingestRuns, report);
    return r.ok ? { ok: true, status: r.status, data: { ok: true } } : r;
  }

  async health(): Promise<boolean> {
    try {
      const res = await this.fetchImpl(this.baseUrl + API_ROUTES.health, { signal: AbortSignal.timeout(5000), headers: { "user-agent": WORKER_USER_AGENT } });
      await res.body?.cancel().catch(() => undefined);
      return res.ok;
    } catch {
      return false;
    }
  }

  private headers(hasBody: boolean, gzip: boolean): Record<string, string> {
    const h: Record<string, string> = { "x-ingest-key": this.opts.key, accept: "application/json", "user-agent": WORKER_USER_AGENT };
    if (hasBody) h["content-type"] = "application/json";
    if (gzip) h["content-encoding"] = "gzip";
    return h;
  }

  private async backoff(attempt: number, retryAfter: string | null): Promise<void> {
    const ra = Number(retryAfter);
    const ms =
      Number.isFinite(ra) && ra > 0
        ? Math.min(ra * 1000, this.retryMaxMs)
        : Math.min(this.retryMaxMs, this.retryBaseMs * 2 ** attempt) * (0.75 + Math.random() * 0.5);
    await delay(ms);
  }

  private async request<T>(method: "GET" | "POST", path: string, body?: unknown, retries = this.retries): Promise<ApiResult<T>> {
    const url = this.baseUrl + path;
    const json = body === undefined ? undefined : JSON.stringify(body);
    let lastError = "unknown error";
    let lastStatus: number | null = null;
    for (let attempt = 0; attempt <= retries; attempt++) {
      const useGzip = this.gzip && json !== undefined && json.length >= GZIP_MIN_BYTES;
      let res: Response;
      try {
        res = await this.fetchImpl(url, {
          method,
          headers: this.headers(json !== undefined, useGzip),
          body: json === undefined ? undefined : useGzip ? gzipSync(json) : json,
          signal: AbortSignal.timeout(this.timeoutMs),
        });
      } catch (e) {
        lastError = `${method} ${path}: ${describeFetchError(e)}`;
        lastStatus = null;
        if (attempt < retries) {
          await this.backoff(attempt, null);
          continue;
        }
        return { ok: false, kind: "unavailable", status: null, error: lastError };
      }
      if (res.ok) return { ok: true, status: res.status, data: (await readJson(res)) as T };
      const text = await res.text().catch(() => "");
      lastStatus = res.status;
      lastError = `${method} ${path}: HTTP ${res.status}${text ? ` ${truncate(text.replace(/\s+/g, " "), 200)}` : ""}`;
      // An API that can't read gzip bodies answers 415 (or a JSON parse 400): fall back to plain JSON for good.
      if (useGzip && (res.status === 415 || (res.status === 400 && /json|parse|unexpected token|syntax/i.test(text)))) {
        this.gzip = false;
        this.opts.log?.warn("API did not accept a gzip body — sending uncompressed JSON from now on", { status: res.status });
        attempt--;
        continue;
      }
      if (res.status === 413) return { ok: false, kind: "too_large", status: 413, error: lastError };
      if (res.status === 401 || res.status === 403 || res.status === 404) return { ok: false, kind: "unavailable", status: res.status, error: lastError };
      if (res.status === 408 || res.status === 429 || res.status >= 500) {
        if (attempt < retries) {
          await this.backoff(attempt, res.headers.get("retry-after"));
          continue;
        }
        return { ok: false, kind: "unavailable", status: res.status, error: lastError };
      }
      return { ok: false, kind: "rejected", status: res.status, error: lastError };
    }
    return { ok: false, kind: "unavailable", status: lastStatus, error: lastError };
  }
}
