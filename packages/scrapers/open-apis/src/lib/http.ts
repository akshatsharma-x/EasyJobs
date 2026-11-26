import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { HttpError, sleep, type HttpRequestInit, type ScrapeContext } from "@easyjobs/contract/node";

/* ─────────── Opt-in development cache (§0.8: "cache responses in your package's .cache/") ─────────── */

const DEV_CACHE_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "..", ".cache", "http");

/** Minutes to reuse cached GET responses; 0 (default) disables. Never set this in production. */
function devCacheMinutes(): number {
  const n = Number(process.env.OPEN_APIS_HTTP_CACHE_MIN ?? 0);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function devCachePath(url: string): string {
  return join(DEV_CACHE_DIR, `${createHash("sha1").update(url).digest("hex")}.json`);
}

function devCacheGet(url: string): string | null {
  const minutes = devCacheMinutes();
  if (!minutes) return null;
  try {
    const hit = JSON.parse(readFileSync(devCachePath(url), "utf8")) as { at: number; body: string };
    return Date.now() - hit.at < minutes * 60_000 ? hit.body : null;
  } catch {
    return null;
  }
}

function devCachePut(url: string, safeUrl: string, body: string): void {
  if (!devCacheMinutes()) return;
  try {
    mkdirSync(DEV_CACHE_DIR, { recursive: true });
    writeFileSync(devCachePath(url), JSON.stringify({ url: safeUrl, at: Date.now(), body }));
  } catch {
    /* cache is best-effort */
  }
}

/** Replaces every secret occurrence (API keys in paths/queries) so errors and logs never carry them. */
export function redact(text: string, secrets: readonly (string | undefined)[] = []): string {
  let out = text;
  for (const s of secrets) if (s && s.length >= 4) out = out.split(s).join("***").split(encodeURIComponent(s)).join("***");
  return out;
}

export interface FetchOptions {
  /** Values to scrub from error messages (API keys). */
  secrets?: readonly (string | undefined)[];
}

/** The source refused us with an anti-bot wall (e.g. a Cloudflare challenge). We never try to get past it. */
export class SourceBlockedError extends Error {
  readonly source: string;
  readonly url: string;
  readonly status: number;
  constructor(source: string, url: string, status: number, detail: string) {
    super(`${source}: blocked by ${detail} (HTTP ${status}) at ${url} — not retrying; see docs/status/P12.md`);
    this.name = "SourceBlockedError";
    this.source = source;
    this.url = url;
    this.status = status;
  }
}

type Ctx = Pick<ScrapeContext, "http" | "signal">;

function challengeKind(res: Response, body: string): string | null {
  if (res.headers.get("cf-mitigated") === "challenge") return "a Cloudflare challenge";
  if ((res.status === 403 || res.status === 503) && /<title>\s*(just a moment|attention required)/i.test(body)) {
    return "a Cloudflare challenge";
  }
  return null;
}

/** Fetch text with source-aware errors: anti-bot walls → SourceBlockedError, other non-2xx → HttpError. */
export async function fetchText(
  ctx: Ctx,
  source: string,
  url: string,
  init: HttpRequestInit = {},
  opts: FetchOptions = {},
): Promise<string> {
  const safeUrl = redact(url, opts.secrets);
  const cacheable = (init.method ?? "GET").toUpperCase() === "GET";
  const cached = cacheable ? devCacheGet(url) : null;
  if (cached !== null) return cached;
  let res: Response;
  try {
    res = await ctx.http.fetch(url, { ...init, signal: init.signal ?? ctx.signal });
  } catch (e) {
    if (ctx.signal.aborted || !opts.secrets?.length) throw e;
    throw new Error(redact(`${source}: request to ${safeUrl} failed: ${e instanceof Error ? e.message : String(e)}`, opts.secrets));
  }
  const body = await res.text();
  const wall = challengeKind(res, body);
  if (wall) throw new SourceBlockedError(source, safeUrl, res.status, wall);
  if (!res.ok) throw new HttpError(res.status, safeUrl, redact(body, opts.secrets));
  if (cacheable) devCachePut(url, safeUrl, body);
  return body;
}

/** fetchText + JSON.parse; HTML or garbage bodies become a descriptive error. `preprocess` can patch the raw text first. */
export async function fetchJson<T>(
  ctx: Ctx,
  source: string,
  url: string,
  init: HttpRequestInit = {},
  opts: FetchOptions & { preprocess?: (raw: string) => string } = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  if (!headers.has("accept")) headers.set("accept", "application/json");
  const raw = await fetchText(ctx, source, url, { ...init, headers }, opts);
  try {
    return JSON.parse(opts.preprocess ? opts.preprocess(raw) : raw) as T;
  } catch (e) {
    const snippet = raw.slice(0, 120).replace(/\s+/g, " ");
    throw new Error(`${source}: expected JSON from ${redact(url, opts.secrets)} but got: ${snippet}`, { cause: e });
  }
}

const retryable = (e: unknown): boolean =>
  e instanceof HttpError ? e.status === 429 || e.status >= 500 : !(e instanceof SourceBlockedError) && e instanceof Error && !/expected JSON/.test(e.message);

/**
 * Retries `fn` on 429/5xx/network errors with exponential backoff. Use with `retries: 0` on the shared client
 * when the URL embeds a secret, so the client's own retry log line (host + path) never prints it.
 */
export async function withRetries<T>(
  ctx: Pick<ScrapeContext, "signal" | "log">,
  label: string,
  fn: () => Promise<T>,
  retries = 3,
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (e) {
      if (ctx.signal.aborted || attempt >= retries || !retryable(e)) throw e;
      const waitMs = Math.min(30_000, 1000 * 2 ** attempt) + Math.random() * 500;
      ctx.log.warn(`${label}: retrying`, { attempt: attempt + 1, waitMs: Math.round(waitMs), error: e instanceof Error ? e.message : String(e) });
      await sleep(waitMs, ctx.signal);
    }
  }
}

/** Quote integers too large for a JS number under the given keys, so ids survive JSON.parse intact. */
export function quoteBigIntegers(raw: string, keys: string[]): string {
  const re = new RegExp(`("(?:${keys.join("|")})"\\s*:\\s*)(-?\\d{16,})(?=\\s*[,}\\]])`, "g");
  return raw.replace(re, '$1"$2"');
}
