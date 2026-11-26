import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Env, HttpClient, Logger } from "@easyjobs/contract/node";
import { envStr } from "./util";

interface CacheEntry {
  /** Final URL after redirects (equals the input when there was none or resolution failed). */
  final: string;
  /** Epoch ms of resolution. */
  at: number;
  ok: boolean;
}

interface CacheFile {
  version: 1;
  entries: Record<string, CacheEntry>;
}

export interface RedirectResolverOptions {
  /** JSON cache path; null = memory only. */
  cacheFile: string | null;
  /** Re-resolve after this long (default 30 days — keeps apply URLs, and so fingerprints, stable). */
  ttlMs?: number;
  /** Network resolutions allowed per scrape run (cache hits are free). */
  maxPerRun?: number;
  timeoutMs?: number;
  log?: Logger;
}

const DAY = 86_400_000;

/** A redirect that ends on a sign-in wall (Google Forms → accounts.google.com, SSO portals) is not an apply URL. */
export function isLoginWall(url: string): boolean {
  try {
    const u = new URL(url);
    return (
      /^(?:accounts\.google\.com|login\.microsoftonline\.com|login\.live\.com|auth\.|sso\.|login\.|signin\.)/i.test(u.hostname) ||
      /\/(?:signin|sign-in|login|log-in|auth\/|sso|oauth|saml)(?:\/|$|\?)/i.test(u.pathname + (u.search ? "?" : ""))
    );
  } catch {
    return true;
  }
}
const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

/** Default cache location: $OPEN_APIS_CACHE_DIR or <package>/.cache. "off" disables the disk cache. */
export function defaultCacheFile(env: Env, name = "redirects.json"): string | null {
  const dir = envStr(env, "OPEN_APIS_CACHE_DIR");
  if (dir?.toLowerCase() === "off") return null;
  return join(dir ?? join(PACKAGE_ROOT, ".cache"), name);
}

/**
 * Resolves redirecting links (shorteners, careers pages that bounce to an ATS) to their final URL with one
 * HEAD request (GET fallback), using the shared polite HttpClient (robots.txt + per-host limits).
 * Results — including failures — are cached so each link costs at most one request per TTL.
 */
export class RedirectResolver {
  private readonly opts: Required<Omit<RedirectResolverOptions, "log" | "cacheFile">> &
    Pick<RedirectResolverOptions, "log" | "cacheFile">;
  private entries: Record<string, CacheEntry> | null = null;
  private readonly inflight = new Map<string, Promise<string>>();
  private dirty = false;
  private spent = 0;

  constructor(options: RedirectResolverOptions) {
    this.opts = { ttlMs: 30 * DAY, maxPerRun: 150, timeoutMs: 8000, ...options };
  }

  private load(): Record<string, CacheEntry> {
    if (this.entries) return this.entries;
    this.entries = {};
    if (this.opts.cacheFile) {
      try {
        const parsed = JSON.parse(readFileSync(this.opts.cacheFile, "utf8")) as Partial<CacheFile>;
        if (parsed && parsed.version === 1 && parsed.entries && typeof parsed.entries === "object") this.entries = parsed.entries;
      } catch {
        /* missing or corrupt cache → start fresh */
      }
    }
    return this.entries;
  }

  /** Cached final URL, if fresh. */
  peek(url: string, now = Date.now()): string | undefined {
    const hit = this.load()[url];
    if (!hit || now - hit.at >= this.opts.ttlMs) return undefined;
    return isLoginWall(hit.final) ? url : hit.final;
  }

  /** Final URL for `url`; returns `url` itself on any failure or when the per-run budget is spent. */
  async resolve(url: string, http: HttpClient, signal?: AbortSignal): Promise<string> {
    const cached = this.peek(url);
    if (cached !== undefined) return cached;
    const pending = this.inflight.get(url);
    if (pending) return pending;
    if (this.spent >= this.opts.maxPerRun) return url;
    this.spent++;
    const job = this.lookup(url, http, signal).finally(() => this.inflight.delete(url));
    this.inflight.set(url, job);
    return job;
  }

  private async lookup(url: string, http: HttpClient, signal?: AbortSignal): Promise<string> {
    let final = url;
    let ok = false;
    try {
      let res = await http.fetch(url, { method: "HEAD", redirect: "follow", timeoutMs: this.opts.timeoutMs, retries: 1, signal });
      if ([400, 403, 404, 405, 501].includes(res.status)) {
        await res.body?.cancel().catch(() => undefined);
        res = await http.fetch(url, { method: "GET", redirect: "follow", timeoutMs: this.opts.timeoutMs, retries: 1, signal });
      }
      await res.body?.cancel().catch(() => undefined);
      if (res.ok && /^https?:\/\//i.test(res.url) && !isLoginWall(res.url)) {
        final = res.url;
        ok = true;
      }
    } catch (e) {
      if (signal?.aborted) throw e;
      this.opts.log?.debug("redirect resolution failed", { url, error: e instanceof Error ? e.message : String(e) });
    }
    this.load()[url] = { final, at: Date.now(), ok };
    this.dirty = true;
    return final;
  }

  /** Persists the cache (atomic rename). Safe to call repeatedly. */
  flush(): void {
    if (!this.dirty || !this.opts.cacheFile || !this.entries) return;
    try {
      mkdirSync(dirname(this.opts.cacheFile), { recursive: true });
      const now = Date.now();
      const kept = Object.fromEntries(Object.entries(this.entries).filter(([, e]) => now - e.at < this.opts.ttlMs));
      const tmp = `${this.opts.cacheFile}.${process.pid}.tmp`;
      writeFileSync(tmp, JSON.stringify({ version: 1, entries: kept } satisfies CacheFile));
      renameSync(tmp, this.opts.cacheFile);
      this.dirty = false;
    } catch (e) {
      this.opts.log?.warn("could not write redirect cache", { file: this.opts.cacheFile, error: e instanceof Error ? e.message : String(e) });
    }
  }
}
