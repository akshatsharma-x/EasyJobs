import { gunzipSync } from "node:zlib";
import { HttpError, RobotsDisallowedError, sleep, type HttpClient, type Logger } from "@easyjobs/contract/node";
import type { DevCache } from "./cache";
import { blockedFor, markBlocked, sharedLimiter, type Limiter } from "./limiter";

export interface RequestOptions {
  method?: "GET" | "POST";
  /** JSON body (objects are stringified; strings are sent as-is). */
  body?: unknown;
  headers?: Record<string, string>;
  timeoutMs?: number;
  /** Override the source default (robots.txt check). */
  robots?: boolean;
  /** Override SourceHttpConfig.throttleWaitsMs for this request ([] = fail fast, e.g. detail calls). */
  throttleWaitsMs?: number[];
}

export interface FetchedPage {
  /** Final URL after redirects. */
  url: string;
  status: number;
  text: string;
}

export interface SourceHttpStats {
  requests: number;
  cacheHits: number;
  rateLimited: number;
}

export interface SourceHttp {
  json<T = unknown>(url: string, opts?: RequestOptions): Promise<T>;
  text(url: string, opts?: RequestOptions): Promise<string>;
  /** Like text() but also returns the final URL (redirects followed). */
  page(url: string, opts?: RequestOptions): Promise<FetchedPage>;
  readonly stats: SourceHttpStats;
  readonly limiter: Limiter;
}

export interface SourceHttpConfig {
  /** Politeness key (usually the tenant host; Eightfold shares one key across tenants). */
  limiterKey: string;
  concurrency: number;
  gapMs: number;
  timeoutMs: number;
  robots: boolean;
  /** Extra waits after the contract client already gave up on a 429/503 (it has no Retry-After budget for slow limiters). */
  throttleWaitsMs?: number[];
  signal: AbortSignal;
  log: Logger;
  cache?: DevCache | null;
}

/** Error whose message carries enough context to debug from a log line. */
export class SourceError extends Error {
  readonly url: string;
  readonly status: number | null;
  constructor(message: string, url: string, status: number | null = null, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "SourceError";
    this.url = url;
    this.status = status;
  }
}

export const isAbortError = (e: unknown): boolean =>
  e instanceof Error && (e.name === "AbortError" || e.name === "TimeoutError");

/** HTTP status of an error from this module or the contract client, if any. */
export function statusOf(e: unknown): number | null {
  if (e instanceof HttpError) return e.status;
  if (e instanceof SourceError) return e.status;
  return null;
}

export const isGone = (e: unknown): boolean => {
  const s = statusOf(e);
  return s === 404 || s === 410;
};

/** 429 / 403 / 503 — the source is throttling or blocking us: back off, never push harder. */
export const isThrottled = (e: unknown): boolean => {
  const s = statusOf(e);
  return s === 429 || s === 403 || s === 503 || e instanceof BlockedError;
};

/** Anti-bot interstitials (Cloudflare managed challenge, CAPTCHA pages). We never try to get past these. */
const CHALLENGE_BODY = /enable javascript and cookies to continue|cf-chl-|challenge-platform|cf_chl_opt|attention required!? \| cloudflare|captcha|are you a robot|access denied.{0,40}bot/i;

export function isChallengeResponse(status: number, body: string): boolean {
  return (status === 403 || status === 429 || status === 503) && CHALLENGE_BODY.test(body);
}

/** The source answered with an anti-bot challenge: stop this run and back off (no bypass attempts). */
export class BlockedError extends SourceError {
  constructor(url: string, status: number, until?: number) {
    const host = new URL(url).host;
    super(
      until
        ? `blocked by an anti-bot challenge at ${host} earlier — no requests until ${new Date(until).toISOString().slice(11, 16)} UTC; not bypassing`
        : `blocked by an anti-bot challenge (HTTP ${status}) at ${host} — not bypassing; backing off until a later run`,
      url,
      status,
    );
    this.name = "BlockedError";
  }
}

export const isBlocked = (e: unknown): boolean => e instanceof BlockedError;

export function describeError(e: unknown): string {
  if (e instanceof HttpError) {
    const body = e.body.replace(/\s+/g, " ").trim().slice(0, 160);
    return `HTTP ${e.status} ${e.url}${body ? ` — ${body}` : ""}`;
  }
  if (e instanceof RobotsDisallowedError) return e.message;
  if (e instanceof Error) {
    const cause = e.cause instanceof Error ? ` (cause: ${e.cause.message})` : "";
    return `${e.message}${cause}`;
  }
  return String(e);
}

function decodeBody(buf: Buffer): string {
  // Some sitemaps are served as raw .gz bytes without Content-Encoding.
  const bytes = buf.length > 2 && buf[0] === 0x1f && buf[1] === 0x8b ? gunzipSync(buf) : buf;
  return bytes.toString("utf8");
}

/**
 * Offline tests only: vitest sets VITEST, and the suite opts in explicitly. Production can never
 * hit this path, so politeness (gaps, back-off waits) is always on outside the test runner.
 */
const TEST_NO_DELAY = Boolean(process.env.VITEST) && process.env.ATS_ENTERPRISE_TEST_NO_DELAY === "1";
const wait = (ms: number, signal: AbortSignal): Promise<void> => sleep(TEST_NO_DELAY ? 0 : ms, signal);

export function createSourceHttp(http: HttpClient, cfg: SourceHttpConfig): SourceHttp {
  const limiter = sharedLimiter(cfg.limiterKey, cfg.concurrency, TEST_NO_DELAY ? 0 : cfg.gapMs);
  const stats: SourceHttpStats = { requests: 0, cacheHits: 0, rateLimited: 0 };
  /** After a throttle response every request to this source waits at least this long. */
  const THROTTLE_PAUSE_MS = 10_000;
  /** A challenge lasted 8–25+ minutes when observed, and knocking again extends it. */
  const BLOCK_PAUSE_MS = 15 * 60_000;
  const NETWORK_RETRIES = 2;

  async function request(url: string, opts: RequestOptions, accept: string): Promise<{ body: Buffer; url: string; status: number }> {
    const waits = opts.throttleWaitsMs ?? cfg.throttleWaitsMs ?? [];
    const bodyStr =
      opts.body === undefined ? undefined : typeof opts.body === "string" ? opts.body : JSON.stringify(opts.body);
    const method = opts.method ?? (bodyStr !== undefined ? "POST" : "GET");
    const cacheKey = `${method} ${url} ${bodyStr ?? ""}`;
    const cached = cfg.cache?.get(cacheKey);
    if (cached) {
      stats.cacheHits++;
      return { body: cached, url, status: 200 };
    }
    const headers: Record<string, string> = { accept, ...(bodyStr !== undefined ? { "content-type": "application/json" } : {}), ...opts.headers };
    const timeoutMs = opts.timeoutMs ?? cfg.timeoutMs;
    const until = blockedFor(cfg.limiterKey);
    if (until) throw new BlockedError(url, 429, until);
    let throttled = 0;
    let transient = 0;
    for (;;) {
      let res: Response;
      try {
        res = await limiter.run(async () => {
          stats.requests++;
          // retries: 0 — retrying is done here, where challenges, Retry-After and source-wide pauses are understood.
          return http.fetch(url, { method, headers, body: bodyStr, signal: cfg.signal, timeoutMs, retries: 0, robots: opts.robots ?? cfg.robots });
        }, cfg.signal);
      } catch (e) {
        if (cfg.signal.aborted) throw cfg.signal.reason ?? e;
        if (e instanceof RobotsDisallowedError) throw e;
        if (transient < NETWORK_RETRIES) {
          await wait(1000 * 2 ** transient++ + Math.random() * 500, cfg.signal);
          continue;
        }
        const timedOut = e instanceof Error && e.name === "TimeoutError";
        throw new SourceError(`${timedOut ? `timeout after ${timeoutMs} ms` : "network error"}: ${method} ${url}`, url, null, { cause: e });
      }
      if (res.ok) {
        const body = Buffer.from(await res.arrayBuffer());
        cfg.cache?.set(cacheKey, body);
        return { body, url: res.url || url, status: res.status };
      }
      const text = await res.text().catch(() => "");
      if (res.headers.get("cf-mitigated") === "challenge" || isChallengeResponse(res.status, text)) {
        stats.rateLimited++;
        // Challenges last minutes to hours: every request to this source waits, and this run gives up now.
        markBlocked(cfg.limiterKey, Date.now() + BLOCK_PAUSE_MS);
        throw new BlockedError(url, res.status);
      }
      if (res.status === 429 || res.status === 503) {
        stats.rateLimited++;
        const retryAfter = Number(res.headers.get("retry-after"));
        const planned = waits[throttled];
        const backoff = planned === undefined ? undefined : Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter * 1000, 180_000) : planned;
        // Slow down everything else sharing this source, not just this request.
        if (!TEST_NO_DELAY) limiter.pause(Math.max(THROTTLE_PAUSE_MS, backoff ?? 0));
        if (backoff !== undefined) {
          throttled++;
          cfg.log.warn(`throttled (HTTP ${res.status}); backing off`, { host: safeHost(url), waitMs: backoff, attempt: throttled });
          await wait(backoff, cfg.signal);
          continue;
        }
      } else if (res.status >= 500 && transient < NETWORK_RETRIES) {
        await wait(1000 * 2 ** transient++ + Math.random() * 500, cfg.signal);
        continue;
      }
      throw new HttpError(res.status, url, text);
    }
  }

  return {
    stats,
    limiter,
    async json<T = unknown>(url: string, opts: RequestOptions = {}): Promise<T> {
      const { body } = await request(url, opts, "application/json");
      const text = decodeBody(body);
      try {
        return JSON.parse(text) as T;
      } catch (e) {
        throw new SourceError(`invalid JSON from ${url}: ${text.slice(0, 120).replace(/\s+/g, " ")}`, url, 200, { cause: e });
      }
    },
    async text(url: string, opts: RequestOptions = {}): Promise<string> {
      const { body } = await request(url, opts, "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8");
      return decodeBody(body);
    },
    async page(url: string, opts: RequestOptions = {}): Promise<FetchedPage> {
      const r = await request(url, opts, "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8");
      return { url: r.url, status: r.status, text: decodeBody(r.body) };
    },
  };
}

function safeHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}
