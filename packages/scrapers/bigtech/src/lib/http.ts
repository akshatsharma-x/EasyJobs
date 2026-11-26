/**
 * Wraps the shared contract HttpClient (which already does robots.txt, retries, per-host limits)
 * with site-level politeness: ≤ 1 request/second per host by default, the run's AbortSignal on
 * every request, and an opt-in on-disk response cache for development (BIGTECH_DEV_CACHE=1).
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { HttpError, sleep, type Env, type HttpClient, type HttpRequestInit, type Logger } from "@easyjobs/contract/node";

export interface PoliteHttpOptions {
  /** Minimum gap between request starts per host (default 1000 ms). */
  minGapMs?: number;
  signal?: AbortSignal;
  /** Directory for the dev cache; null disables it. */
  cacheDir?: string | null;
  /** Dev cache TTL (default 6 h). */
  cacheTtlMs?: number;
  log?: Logger;
}

const PACKAGE_ROOT = fileURLToPath(new URL("../../", import.meta.url));
export const DEFAULT_DEV_CACHE_DIR = join(PACKAGE_ROOT, ".cache", "http");

/**
 * Options derived from env: BIGTECH_MIN_GAP_MS, BIGTECH_DEV_CACHE, BIGTECH_DEV_CACHE_TTL_MIN.
 * The per-host gap is the site's own floor (default 1000 ms); BIGTECH_MIN_GAP_MS can only raise it,
 * except "0", which turns throttling off (offline tests with fake HTTP).
 */
export function politeOptionsFromEnv(env: Env, defaults: { minGapMs?: number } = {}): Pick<PoliteHttpOptions, "minGapMs" | "cacheDir" | "cacheTtlMs"> {
  const raw = env.BIGTECH_MIN_GAP_MS;
  const gap = raw !== undefined && raw !== "" ? Number(raw) : Number.NaN;
  const floor = defaults.minGapMs ?? 1000;
  const ttlMin = Number(env.BIGTECH_DEV_CACHE_TTL_MIN ?? 360);
  return {
    minGapMs: !Number.isFinite(gap) ? floor : gap <= 0 ? 0 : Math.max(gap, floor),
    cacheDir: env.BIGTECH_DEV_CACHE === "1" ? DEFAULT_DEV_CACHE_DIR : null,
    cacheTtlMs: (Number.isFinite(ttlMin) ? ttlMin : 360) * 60_000,
  };
}

function bodyKey(body: unknown): string {
  if (body === undefined || body === null) return "";
  if (typeof body === "string") return body;
  if (body instanceof URLSearchParams) return body.toString();
  if (typeof FormData !== "undefined" && body instanceof FormData) {
    return JSON.stringify([...body.entries()].map(([k, v]) => [k, typeof v === "string" ? v : "[blob]"]));
  }
  return String(body);
}

interface CachedResponse {
  status: number;
  contentType: string;
  url: string;
  body: string;
}

export function politeHttp(http: HttpClient, opts: PoliteHttpOptions = {}): HttpClient {
  const gap = Math.max(0, opts.minGapMs ?? 1000);
  const nextAt = new Map<string, number>();
  const ttl = opts.cacheTtlMs ?? 6 * 3_600_000;

  async function throttle(host: string): Promise<void> {
    if (gap === 0) return;
    const now = Date.now();
    const startAt = Math.max(now, nextAt.get(host) ?? 0);
    nextAt.set(host, startAt + gap);
    if (startAt > now) await sleep(startAt - now, opts.signal);
  }

  function cachePath(url: string, init: HttpRequestInit): string | null {
    if (!opts.cacheDir) return null;
    const key = createHash("sha1").update(`${init.method ?? "GET"} ${url}\n${bodyKey(init.body)}`).digest("hex");
    return join(opts.cacheDir, `${key}.json`);
  }

  async function doFetch(url: string, init: HttpRequestInit = {}): Promise<Response> {
    const file = cachePath(url, init);
    if (file && existsSync(file) && Date.now() - statSync(file).mtimeMs < ttl) {
      const hit = JSON.parse(readFileSync(file, "utf8")) as CachedResponse;
      return new Response(hit.body, { status: hit.status, headers: { "content-type": hit.contentType } });
    }
    await throttle(new URL(url).host);
    const signal = init.signal ?? opts.signal;
    const res = await http.fetch(url, { ...init, ...(signal ? { signal } : {}) });
    if (!file || !res.ok) return res;
    const body = await res.text();
    const contentType = res.headers.get("content-type") ?? "";
    mkdirSync(opts.cacheDir as string, { recursive: true });
    writeFileSync(file, JSON.stringify({ status: res.status, contentType, url, body } satisfies CachedResponse));
    return new Response(body, { status: res.status, headers: { "content-type": contentType } });
  }

  async function ensureOk(res: Response, url: string): Promise<Response> {
    if (res.ok) return res;
    const body = await res.text().catch(() => "");
    throw new HttpError(res.status, url, body);
  }

  return {
    fetch: doFetch,
    async json<T = unknown>(url: string, init: HttpRequestInit = {}): Promise<T> {
      const headers = new Headers(init.headers);
      if (!headers.has("accept")) headers.set("accept", "application/json");
      const res = await ensureOk(await doFetch(url, { ...init, headers }), url);
      const text = await res.text();
      try {
        return JSON.parse(text) as T;
      } catch (e) {
        throw new Error(`Invalid JSON from ${url}: ${e instanceof Error ? e.message : String(e)} — starts with ${JSON.stringify(text.slice(0, 120))}`);
      }
    },
    async text(url: string, init: HttpRequestInit = {}): Promise<string> {
      const res = await ensureOk(await doFetch(url, init), url);
      return res.text();
    },
  };
}

/** JSON POST helper with the right headers. */
export function postJson<T = unknown>(http: HttpClient, url: string, body: unknown, init: HttpRequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json");
  return http.json<T>(url, { ...init, method: "POST", headers, body: JSON.stringify(body) });
}

/** Short, single-line description of an error for logs. */
export function errorMessage(e: unknown): string {
  if (e instanceof HttpError) return `${e.message}${e.body ? ` — ${e.body.replace(/\s+/g, " ").slice(0, 160)}` : ""}`;
  return e instanceof Error ? e.message : String(e);
}
