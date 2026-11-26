/**
 * Thin request helpers over the contract's polite HttpClient (per-host concurrency/spacing, retries with
 * Retry-After, timeouts, robots.txt). Every request carries the run's AbortSignal.
 */
import { HttpError, type HttpClient } from "@easyjobs/contract/node";
import { BoardNotFoundError, UnexpectedResponseError } from "./errors";

export interface RequestScope {
  readonly http: HttpClient;
  readonly signal: AbortSignal;
}

export interface RequestOptions {
  /**
   * Check robots.txt first. Default false: these are documented public job-board APIs (§0.8 allows it).
   * Adapters that read a company's own careers host (BambooHR, Breezy, Personio, Teamtailor) pass true.
   */
  robots?: boolean;
  accept?: string;
  method?: "GET" | "POST";
  /** JSON request body (sets content-type). */
  json?: unknown;
  headers?: Record<string, string>;
  /** Treat any 3xx as "board not found" — BambooHR redirects unknown subdomains to its marketing site. */
  redirectIsNotFound?: boolean;
}

async function discard(res: Response): Promise<void> {
  try {
    await res.body?.cancel();
  } catch {
    /* ignore */
  }
}

async function send(scope: RequestScope, url: string, opts: RequestOptions): Promise<Response> {
  const headers = new Headers(opts.headers);
  if (opts.accept && !headers.has("accept")) headers.set("accept", opts.accept);
  let body: string | undefined;
  if (opts.json !== undefined) {
    body = JSON.stringify(opts.json);
    if (!headers.has("content-type")) headers.set("content-type", "application/json");
  }
  return scope.http.fetch(url, {
    method: opts.method ?? (body ? "POST" : "GET"),
    headers,
    body,
    signal: scope.signal,
    robots: opts.robots ?? false,
    redirect: opts.redirectIsNotFound ? "manual" : "follow",
  });
}

const isGone = (res: Response, opts: RequestOptions): boolean =>
  res.status === 404 || res.status === 410 || (opts.redirectIsNotFound === true && res.status >= 300 && res.status < 400);

/** Board-level request: 404/410 → BoardNotFoundError; other non-2xx → HttpError. */
export async function fetchBoard(scope: RequestScope, url: string, opts: RequestOptions = {}): Promise<Response> {
  const res = await send(scope, url, opts);
  if (isGone(res, opts)) {
    const location = res.headers.get("location");
    await discard(res);
    throw new BoardNotFoundError(url, res.status, location ? `redirects to ${location}` : undefined);
  }
  if (!res.ok) throw new HttpError(res.status, url, await res.text().catch(() => ""));
  return res;
}

/** Detail-level request: 404/410 → null (the posting closed between list and detail); other non-2xx → HttpError. */
export async function fetchDetail(scope: RequestScope, url: string, opts: RequestOptions = {}): Promise<Response | null> {
  const res = await send(scope, url, opts);
  if (isGone(res, opts)) {
    await discard(res);
    return null;
  }
  if (!res.ok) throw new HttpError(res.status, url, await res.text().catch(() => ""));
  return res;
}

export function parseJson<T>(text: string, url: string, contentType: string | null): T {
  try {
    return JSON.parse(text) as T;
  } catch {
    const snippet = text.slice(0, 120).replace(/\s+/g, " ");
    throw new UnexpectedResponseError(url, `expected JSON, got ${contentType ?? "unknown content-type"}: "${snippet}"`);
  }
}

export async function getBoardJson<T>(scope: RequestScope, url: string, opts: RequestOptions = {}): Promise<T> {
  const res = await fetchBoard(scope, url, { accept: "application/json", ...opts });
  return parseJson<T>(await res.text(), url, res.headers.get("content-type"));
}

export async function getDetailJson<T>(scope: RequestScope, url: string, opts: RequestOptions = {}): Promise<T | null> {
  const res = await fetchDetail(scope, url, { accept: "application/json", ...opts });
  return res ? parseJson<T>(await res.text(), url, res.headers.get("content-type")) : null;
}

export async function getBoardText(scope: RequestScope, url: string, opts: RequestOptions = {}): Promise<string> {
  const res = await fetchBoard(scope, url, opts);
  return res.text();
}
