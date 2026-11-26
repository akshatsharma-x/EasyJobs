import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { CompanyTarget, RawJob } from "@easyjobs/contract";
import type { HttpClient, HttpRequestInit, Logger, ScrapeContext } from "@easyjobs/contract/node";

const FIXTURES = fileURLToPath(new URL("./fixtures/", import.meta.url));

export const fixture = (path: string): string => readFileSync(`${FIXTURES}${path}`, "utf8");
export const fixtureJson = <T = unknown>(path: string): T => JSON.parse(fixture(path)) as T;

export interface LogLine {
  level: string;
  msg: string;
  meta?: Record<string, unknown>;
}

export function memoryLogger(lines: LogLine[] = []): Logger & { lines: LogLine[] } {
  const make = (): Logger & { lines: LogLine[] } => ({
    lines,
    debug: (msg, meta) => void lines.push({ level: "debug", msg, meta }),
    info: (msg, meta) => void lines.push({ level: "info", msg, meta }),
    warn: (msg, meta) => void lines.push({ level: "warn", msg, meta }),
    error: (msg, meta) => void lines.push({ level: "error", msg, meta }),
    child: () => make(),
  });
  return make();
}

export interface Call {
  url: string;
  method: string;
  body: unknown;
  init: HttpRequestInit;
}

export type Route = (url: URL, call: Call) => Response | Promise<Response> | undefined;

export const json = (data: unknown, status = 200, headers: Record<string, string> = {}): Response =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json", ...headers } });
export const html = (body: string, status = 200, headers: Record<string, string> = {}): Response =>
  new Response(body, { status, headers: { "content-type": "text/html", ...headers } });

/** HttpClient double: routes are tried in order; unmatched requests fail loudly. */
export function mockHttp(...routes: Route[]): HttpClient & { calls: Call[] } {
  const calls: Call[] = [];
  const fetchImpl = async (url: string, init: HttpRequestInit = {}): Promise<Response> => {
    const raw = typeof init.body === "string" ? init.body : undefined;
    const call: Call = { url, method: init.method ?? "GET", body: raw ? safeJson(raw) : undefined, init };
    calls.push(call);
    for (const r of routes) {
      const res = await r(new URL(url), call);
      if (res) return res;
    }
    return new Response(`no mock route for ${url}`, { status: 599 });
  };
  return {
    calls,
    fetch: fetchImpl,
    async json<T>(url: string, init?: HttpRequestInit): Promise<T> {
      return (await (await fetchImpl(url, init)).json()) as T;
    },
    async text(url: string, init?: HttpRequestInit): Promise<string> {
      return (await fetchImpl(url, init)).text();
    },
  };
}

function safeJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
}

export function target(partial: Partial<CompanyTarget> & Pick<CompanyTarget, "slug" | "ats" | "token">): CompanyTarget {
  return {
    name: partial.slug.toUpperCase(),
    domain: `${partial.slug}.com`,
    careersUrl: partial.token,
    tags: [],
    hq: null,
    indiaPresence: true,
    priority: 2,
    ...partial,
  };
}

export function ctxFor(http: HttpClient, targets: CompanyTarget[], opts: Partial<ScrapeContext> = {}): ScrapeContext & { log: Logger & { lines: LogLine[] } } {
  const log = memoryLogger();
  return { http, log, signal: new AbortController().signal, env: { ATS_ENTERPRISE_STATE_DIR: "off" }, targets, ...opts } as ScrapeContext & {
    log: Logger & { lines: LogLine[] };
  };
}

export async function collect(it: AsyncIterable<RawJob>): Promise<{ jobs: RawJob[]; error: unknown }> {
  const jobs: RawJob[] = [];
  try {
    for await (const j of it) jobs.push(j);
    return { jobs, error: null };
  } catch (error) {
    return { jobs, error };
  }
}

export const NOW = new Date("2026-11-25T22:00:00.000Z");
