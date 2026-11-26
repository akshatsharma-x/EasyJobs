import { readFileSync } from "node:fs";
import { validateRawJob, type RawJob } from "@easyjobs/contract";
import { HttpError, type HttpClient, type HttpRequestInit, type Logger, type ScrapeContext, type Scraper } from "@easyjobs/contract/node";
import { expect } from "vitest";

export const fixture = (name: string): string => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
export const fixtureJson = <T>(name: string): T => JSON.parse(fixture(name)) as T;

export const silentLogger: Logger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
  child: () => silentLogger,
};

export interface Route {
  /** Substring or predicate matched against the request URL. */
  match: string | RegExp | ((url: string, init?: HttpRequestInit) => boolean);
  status?: number;
  body: string;
  headers?: Record<string, string>;
  /** Final URL after redirects (Response.url). */
  finalUrl?: string;
}

export interface FakeHttp extends HttpClient {
  calls: { url: string; init?: HttpRequestInit }[];
}

/** HttpClient that serves fixtures by URL; unmatched URLs return 404. Records every call. */
export function fakeHttp(routes: Route[]): FakeHttp {
  const calls: FakeHttp["calls"] = [];
  const matches = (r: Route, url: string, init?: HttpRequestInit): boolean =>
    typeof r.match === "string" ? url.includes(r.match) : r.match instanceof RegExp ? r.match.test(url) : r.match(url, init);
  const fetchImpl = async (url: string, init?: HttpRequestInit): Promise<Response> => {
    calls.push({ url, init });
    const route = routes.find((r) => matches(r, url, init));
    const res = route
      ? new Response(init?.method === "HEAD" ? null : route.body, { status: route.status ?? 200, headers: route.headers })
      : new Response("not found", { status: 404 });
    Object.defineProperty(res, "url", { value: route?.finalUrl ?? url });
    return res;
  };
  return {
    calls,
    fetch: fetchImpl,
    async json<T>(url: string, init?: HttpRequestInit): Promise<T> {
      const res = await fetchImpl(url, init);
      if (!res.ok) throw new HttpError(res.status, url, await res.text());
      return (await res.json()) as T;
    },
    async text(url: string, init?: HttpRequestInit): Promise<string> {
      const res = await fetchImpl(url, init);
      if (!res.ok) throw new HttpError(res.status, url, await res.text());
      return res.text();
    },
  };
}

/** Scrape context for tests: no pauses, silent logs, no disk cache. */
export function testCtx(http: HttpClient, env: Record<string, string | undefined> = {}, extra: Partial<ScrapeContext> = {}): ScrapeContext {
  return {
    http,
    log: silentLogger,
    signal: new AbortController().signal,
    env: { OPEN_APIS_PAUSE_SCALE: "0", OPEN_APIS_CACHE_DIR: "off", ...env },
    ...extra,
  };
}

export async function collect(scraper: Scraper, ctx: ScrapeContext): Promise<RawJob[]> {
  const out: RawJob[] = [];
  for await (const job of scraper.scrape(ctx)) out.push(job);
  return out;
}

/** Every job passes the contract validator and carries the scraper's id/kind. */
export function expectValidJobs(jobs: RawJob[], scraper: Pick<Scraper, "id" | "kind">): void {
  for (const job of jobs) {
    expect(validateRawJob(job), `${job.sourceJobId}: ${validateRawJob(job).join("; ")}`).toEqual([]);
    expect(job.source).toBe(scraper.id);
    expect(job.sourceKind).toBe(scraper.kind);
  }
  const ids = jobs.map((j) => j.sourceJobId);
  expect(new Set(ids).size, "sourceJobIds are unique").toBe(ids.length);
}
