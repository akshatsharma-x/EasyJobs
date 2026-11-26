import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { RawJob } from "@easyjobs/contract";
import { HttpError, type Env, type HttpClient, type HttpRequestInit, type Logger, type LogMeta, type ScrapeContext } from "@easyjobs/contract/node";
import type { BrowserPage, FetcherFactory, NaukriFetcher } from "../src/naukri/browser";
import type { Clock } from "../src/shared/clock";

export const NOW_ISO = "2026-11-26T06:00:00.000Z";
export const NOW = new Date(NOW_ISO);
export const HOUR = 3_600_000;

const FIXTURES = join(import.meta.dirname, "fixtures");
export function fixture(path: string): string {
  return readFileSync(join(FIXTURES, path), "utf8");
}
export function fixtureJson(path: string): unknown {
  return JSON.parse(fixture(path)) as unknown;
}

/** Deterministic clock: sleep() advances time instantly and records the wait. */
export class FakeClock implements Clock {
  t: number;
  readonly sleeps: number[] = [];
  constructor(start: string = NOW_ISO) {
    this.t = Date.parse(start);
  }
  now(): number {
    return this.t;
  }
  async sleep(ms: number, signal?: AbortSignal): Promise<void> {
    if (signal?.aborted) throw signal.reason;
    this.sleeps.push(ms);
    this.t += ms;
  }
  advance(ms: number): void {
    this.t += ms;
  }
}

export interface LogLine {
  level: "debug" | "info" | "warn" | "error";
  msg: string;
  meta?: LogMeta;
}
export type MemoryLogger = Logger & { lines: LogLine[]; text(): string };

export function memoryLogger(): MemoryLogger {
  const lines: LogLine[] = [];
  const make = (): Logger => ({
    debug: (msg, meta) => void lines.push({ level: "debug", msg, meta }),
    info: (msg, meta) => void lines.push({ level: "info", msg, meta }),
    warn: (msg, meta) => void lines.push({ level: "warn", msg, meta }),
    error: (msg, meta) => void lines.push({ level: "error", msg, meta }),
    child: () => make(),
  });
  return Object.assign(make(), { lines, text: () => lines.map((l) => `${l.level} ${l.msg}`).join("\n") });
}

export interface FakeCall {
  url: string;
  init: HttpRequestInit | undefined;
}
export type FakeHttp = HttpClient & { calls: FakeCall[] };

/** HttpClient double: every call is recorded; `handler` decides the response (or throws). */
export function fakeHttp(handler: (url: string, init?: HttpRequestInit) => Response | Promise<Response>): FakeHttp {
  const calls: FakeCall[] = [];
  const fetch = async (url: string, init?: HttpRequestInit): Promise<Response> => {
    calls.push({ url, init });
    return handler(url, init);
  };
  return {
    calls,
    fetch,
    async json<T = unknown>(url: string, init?: HttpRequestInit): Promise<T> {
      const res = await fetch(url, init);
      if (!res.ok) throw new HttpError(res.status, url, await res.text());
      return (await res.json()) as T;
    },
    async text(url: string, init?: HttpRequestInit): Promise<string> {
      const res = await fetch(url, init);
      if (!res.ok) throw new HttpError(res.status, url, await res.text());
      return res.text();
    },
  };
}

/** A Response whose .url reports a redirect target (fetch sets it after following redirects). */
export function responseAt(url: string, body: string, init: ResponseInit = {}): Response {
  const res = new Response(body, init);
  Object.defineProperty(res, "url", { value: url });
  return res;
}

/**
 * HTML response with any status. `new Response()` only accepts 200–599, but undici's fetch does surface
 * LinkedIn's non-standard 999 as a normal response (status 999, ok false) — emulate that.
 */
export function html(body: string, status = 200, headers: Record<string, string> = {}): Response {
  const init = { headers: { "content-type": "text/html; charset=utf-8", ...headers } };
  if (status >= 200 && status <= 599) return new Response(body, { ...init, status });
  const res = new Response(body, { ...init, status: 200 });
  Object.defineProperty(res, "status", { value: status });
  Object.defineProperty(res, "ok", { value: false });
  return res;
}

export function makeCtx(over: Partial<ScrapeContext> & { http: HttpClient; env?: Env }): ScrapeContext & { log: MemoryLogger } {
  const log = memoryLogger();
  return { log, signal: new AbortController().signal, env: {}, ...over } as ScrapeContext & { log: MemoryLogger };
}

export async function collect(it: AsyncIterable<RawJob>): Promise<RawJob[]> {
  const out: RawJob[] = [];
  for await (const job of it) out.push(job);
  return out;
}

/* ───────────── Naukri fake browser ───────────── */

export type PageScript = (url: string, waitFor: RegExp | null) => BrowserPage | Promise<BrowserPage>;

export interface FakeBrowser {
  factory: FetcherFactory;
  opened: string[];
  launches: number;
  closes: number;
}

export function fakeBrowser(script: PageScript, userAgent = "Mozilla/5.0 HeadlessChrome/159.0 EasyJobsBot/1.0 (+https://easyjobs.example/bot)"): FakeBrowser {
  const state: FakeBrowser = {
    opened: [],
    launches: 0,
    closes: 0,
    factory: async () => {
      state.launches++;
      const fetcher: NaukriFetcher = {
        userAgent,
        async open(url, waitFor) {
          state.opened.push(url);
          return script(url, waitFor);
        },
        async close() {
          state.closes++;
        },
      };
      return fetcher;
    },
  };
  return state;
}

export function page(status: number, body: string, url: string, api: BrowserPage["api"] = null): BrowserPage {
  return { status, url, body, api };
}

export function apiJson(url: string, json: unknown, status = 200): NonNullable<BrowserPage["api"]> {
  return { url, status, text: JSON.stringify(json), json };
}
