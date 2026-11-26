import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { HttpError, type HttpClient, type Logger } from "@easyjobs/contract/node";
import type { Throttle } from "./throttle";

export interface FetchedPage {
  html: string;
  /** URL after redirects. */
  url: string;
  fromCache: boolean;
}

export type PageFetcher = (url: string, signal: AbortSignal) => Promise<FetchedPage>;

export interface PageFetcherOptions {
  http: HttpClient;
  throttle: Throttle;
  log: Logger;
  /** Development only: cache raw HTML on disk so repeated runs don't hit the site. */
  devCacheDir?: string | null;
  devCacheTtlMs?: number;
  maxRedirects?: number;
}

/** Thrown for 403 / 429-after-retries: the site wants us to slow down or stop. */
export class BlockedError extends Error {
  readonly status: number;
  readonly url: string;
  constructor(status: number, url: string) {
    super(`Internshala answered HTTP ${status} for ${url} — backing off`);
    this.name = "BlockedError";
    this.status = status;
    this.url = url;
  }
}

function cachePath(dir: string, url: string): string {
  return join(dir, `${createHash("sha1").update(url).digest("hex")}.html`);
}

function readCache(dir: string, url: string, ttlMs: number): string | null {
  const file = cachePath(dir, url);
  try {
    if (Date.now() - statSync(file).mtimeMs > ttlMs) return null;
    return readFileSync(file, "utf8");
  } catch {
    return null;
  }
}

/**
 * HTML fetcher for internshala.com: every hop goes through the contract client (robots.txt, retries,
 * per-host limits) *and* our site throttle. Redirects are followed manually so each hop is robots-checked.
 */
export function createPageFetcher(opts: PageFetcherOptions): PageFetcher {
  const maxRedirects = opts.maxRedirects ?? 3;
  const ttl = opts.devCacheTtlMs ?? 6 * 3_600_000;
  if (opts.devCacheDir) mkdirSync(opts.devCacheDir, { recursive: true });

  return async (url, signal) => {
    if (opts.devCacheDir) {
      const hit = readCache(opts.devCacheDir, url, ttl);
      if (hit !== null) return { html: hit, url, fromCache: true };
    }
    const origin = new URL(url).origin;
    let current = url;
    for (let hop = 0; hop <= maxRedirects; hop++) {
      await opts.throttle.wait(signal);
      const res = await opts.http.fetch(current, {
        signal,
        redirect: "manual",
        headers: { accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8" },
      });
      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get("location");
        await res.body?.cancel().catch(() => undefined);
        if (!location) throw new HttpError(res.status, current, "redirect without location");
        const next = new URL(location, current);
        if (next.origin !== origin) throw new HttpError(res.status, current, `off-site redirect to ${next.origin}`);
        opts.log.debug(`redirect ${current} → ${next.href}`);
        current = next.href;
        continue;
      }
      if (res.status === 403 || res.status === 429) {
        await res.body?.cancel().catch(() => undefined);
        throw new BlockedError(res.status, current);
      }
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new HttpError(res.status, current, body);
      }
      const html = await res.text();
      if (opts.devCacheDir) writeFileSync(cachePath(opts.devCacheDir, url), html);
      return { html, url: current, fromCache: false };
    }
    throw new HttpError(310, url, `more than ${maxRedirects} redirects`);
  };
}
