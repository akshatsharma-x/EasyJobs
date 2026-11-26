import { readFileSync } from "node:fs";
import type { CompanyTarget, RawJob } from "@easyjobs/contract";
import { validateRawJob } from "@easyjobs/contract";
import { createScrapeContext, HttpError, type HttpClient, type HttpRequestInit, type Logger, type ScrapeContext } from "@easyjobs/contract/node";

const FIXTURES = new URL("./fixtures/", import.meta.url);

export const fixtureText = (path: string): string => readFileSync(new URL(path, FIXTURES), "utf8");
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- raw third-party payloads in tests
export const fixtureJson = <T = any>(path: string): T => JSON.parse(fixtureText(path)) as T;
export const manifest = fixtureJson<Record<string, Record<string, string>>>("manifest.json");

/* ───────────── fake HTTP ───────────── */

export interface FakeResponse {
  status?: number;
  body?: string | object | null;
  headers?: Record<string, string>;
}
export type RouteHandler = FakeResponse | ((url: URL, init: HttpRequestInit) => FakeResponse | Promise<FakeResponse>);

export interface FakeHttp extends HttpClient {
  calls: { url: string; init: HttpRequestInit }[];
  urls(): string[];
}

/**
 * Serves fixtures by exact URL. A route key without "?" also matches any query string on that path.
 * Unknown URLs fail the test loudly.
 */
export function fakeHttp(routes: Record<string, RouteHandler>): FakeHttp {
  const calls: { url: string; init: HttpRequestInit }[] = [];
  const find = (url: URL): RouteHandler | undefined => routes[url.toString()] ?? routes[`${url.origin}${url.pathname}`];
  const respond = async (input: string, init: HttpRequestInit = {}): Promise<Response> => {
    init.signal?.throwIfAborted();
    calls.push({ url: input, init });
    const url = new URL(input);
    const route = find(url);
    if (!route) throw new Error(`fakeHttp: unexpected request ${input}`);
    const r = typeof route === "function" ? await route(url, init) : route;
    const body = r.body === undefined || r.body === null ? null : typeof r.body === "string" ? r.body : JSON.stringify(r.body);
    const headers = new Headers(r.headers);
    if (body !== null && !headers.has("content-type")) headers.set("content-type", typeof r.body === "string" ? "text/plain" : "application/json");
    return new Response(body, { status: r.status ?? 200, headers });
  };
  const ensureOk = async (res: Response, url: string): Promise<Response> => {
    if (res.ok) return res;
    throw new HttpError(res.status, url, await res.text());
  };
  return {
    calls,
    urls: () => calls.map((c) => c.url),
    fetch: respond,
    json: async <T>(url: string, init?: HttpRequestInit) => (await (await ensureOk(await respond(url, init), url)).json()) as T,
    text: async (url: string, init?: HttpRequestInit) => (await ensureOk(await respond(url, init), url)).text(),
  };
}

export const json = (body: unknown, status = 200): FakeResponse => ({ status, body: body as object, headers: { "content-type": "application/json" } });
export const xml = (body: string, status = 200): FakeResponse => ({ status, body, headers: { "content-type": "application/xml" } });
export const notFound = (body = "Not Found"): FakeResponse => ({ status: 404, body, headers: { "content-type": "text/html" } });

/* ───────────── logging ───────────── */

export interface LogLine {
  level: "debug" | "info" | "warn" | "error";
  scope: string;
  msg: string;
  meta?: Record<string, unknown>;
}

export function captureLog(scope = "test", lines: LogLine[] = []): Logger & { lines: LogLine[] } {
  const mk = (level: LogLine["level"]) => (msg: string, meta?: Record<string, unknown>) => {
    lines.push({ level, scope, msg, meta });
  };
  return {
    lines,
    debug: mk("debug"),
    info: mk("info"),
    warn: mk("warn"),
    error: mk("error"),
    child: (s: string) => captureLog(`${scope}:${s}`, lines),
  };
}

/* ───────────── contexts ───────────── */

export function target(over: Partial<CompanyTarget> & Pick<CompanyTarget, "slug" | "ats" | "token">): CompanyTarget {
  return {
    name: over.slug.replace(/(^|-)([a-z])/g, (_m, _d: string, c: string) => c.toUpperCase()),
    domain: `${over.slug}.example`,
    careersUrl: `https://${over.slug}.example/careers`,
    tags: [],
    hq: null,
    indiaPresence: false,
    priority: 2,
    ...over,
  };
}

export function ctx(http: HttpClient, targets: CompanyTarget[], extra: Partial<ScrapeContext> = {}): ScrapeContext & { log: ReturnType<typeof captureLog> } {
  const log = captureLog();
  return { ...createScrapeContext({ http, log, targets, env: {}, ...extra }), log } as ScrapeContext & { log: ReturnType<typeof captureLog> };
}

export async function collect(iter: AsyncIterable<RawJob>): Promise<RawJob[]> {
  const out: RawJob[] = [];
  for await (const job of iter) out.push(job);
  return out;
}

/** Every emitted job passes the contract validator. */
export function expectAllValid(jobs: RawJob[]): void {
  const problems = jobs.map((j) => ({ id: j.sourceJobId, errs: validateRawJob(j) })).filter((p) => p.errs.length > 0);
  if (problems.length > 0) throw new Error(`invalid RawJobs: ${JSON.stringify(problems)}`);
}

export const byId = (jobs: RawJob[], id: string): RawJob => {
  const job = jobs.find((j) => j.sourceJobId === id);
  if (!job) throw new Error(`no job ${id} among ${jobs.map((j) => j.sourceJobId).join(", ")}`);
  return job;
};
