/**
 * Offline test harness: a fake HttpClient that serves saved fixtures by URL/body matching, and
 * collect() which runs a scraper to completion with a quiet logger and no throttling.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { validateRawJob, type RawJob } from "@easyjobs/contract";
import { HttpError, type HttpClient, type HttpRequestInit, type Logger, type Scraper, type ScrapeContext } from "@easyjobs/contract/node";

export const FIXTURES = fileURLToPath(new URL("./fixtures/", import.meta.url));

export function fixture(path: string): string {
  return readFileSync(join(FIXTURES, path), "utf8");
}

export function fixtureJson<T = unknown>(path: string): T {
  return JSON.parse(fixture(path)) as T;
}

export interface Route {
  /** Matches the URL (regex or predicate on url + request body). */
  match: RegExp | ((url: string, body: string, init: HttpRequestInit) => boolean);
  /** Fixture path under test/fixtures, or an inline body (objects are JSON-encoded). */
  file?: string;
  body?: unknown;
  status?: number;
  contentType?: string;
}

export interface FakeHttp extends HttpClient {
  calls: { url: string; method: string; body: string }[];
}

function bodyString(body: unknown): string {
  if (body === undefined || body === null) return "";
  if (typeof body === "string") return body;
  if (body instanceof URLSearchParams) return body.toString();
  if (body instanceof FormData) return JSON.stringify([...body.entries()].map(([k, v]) => [k, typeof v === "string" ? v : "[blob]"]));
  return String(body);
}

export function fakeHttp(routes: Route[]): FakeHttp {
  const calls: FakeHttp["calls"] = [];
  const respond = async (url: string, init: HttpRequestInit = {}): Promise<Response> => {
    const body = bodyString(init.body);
    calls.push({ url, method: init.method ?? "GET", body });
    const route = routes.find((r) => (r.match instanceof RegExp ? r.match.test(url) : r.match(url, body, init)));
    if (!route) return new Response(`no fixture for ${init.method ?? "GET"} ${url}`, { status: 404 });
    const payload = route.file !== undefined ? fixture(route.file) : typeof route.body === "string" ? route.body : JSON.stringify(route.body ?? null);
    const contentType = route.contentType ?? (route.file?.endsWith(".html") ? "text/html" : "application/json");
    return new Response(payload, { status: route.status ?? 200, headers: { "content-type": contentType } });
  };
  const ok = async (url: string, init?: HttpRequestInit): Promise<Response> => {
    const res = await respond(url, init);
    if (!res.ok) throw new HttpError(res.status, url, await res.text());
    return res;
  };
  return {
    calls,
    fetch: respond,
    json: async <T>(url: string, init?: HttpRequestInit) => (await (await ok(url, init)).json()) as T,
    text: async (url: string, init?: HttpRequestInit) => (await ok(url, init)).text(),
  };
}

export const quietLog: Logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  child: () => quietLog,
};

export async function collect(scraper: Scraper, partial: Partial<ScrapeContext> & { http: HttpClient }): Promise<RawJob[]> {
  const ctx: ScrapeContext = {
    log: quietLog,
    signal: new AbortController().signal,
    ...partial,
    env: { BIGTECH_MIN_GAP_MS: "0", ...(partial.env ?? {}) },
  };
  const out: RawJob[] = [];
  for await (const job of scraper.scrape(ctx)) out.push(job);
  return out;
}

/** Asserts every job passes the contract validator; returns the problems for a nicer failure. */
export function invalidJobs(jobs: RawJob[]): { id: string; errs: string[] }[] {
  return jobs.map((j) => ({ id: j.sourceJobId, errs: validateRawJob(j) })).filter((x) => x.errs.length > 0);
}
