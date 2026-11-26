/**
 * Polite, cached HTTP for the registry scripts.
 * - All requests go through createHttpClient (per-host spacing, retries with backoff, robots.txt).
 * - An extra per-group semaphore (group = ATS id) keeps ≤ 4 in-flight requests per ATS even when
 *   tenants live on different subdomains (*.recruitee.com, *.myworkdayjobs.com…).
 * - Responses are cached on disk in .cache/http/ (bodies ≤ 3 MB) so re-runs don't hammer anyone.
 */
import { createHash } from "node:crypto";
import { lookup } from "node:dns/promises";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHttpClient, createLogger, RobotsDisallowedError, type HttpClient, type Logger } from "@easyjobs/contract/node";

export const PKG_ROOT = fileURLToPath(new URL("../../", import.meta.url));
export const DATA_DIR = join(PKG_ROOT, "data");
export const CACHE_DIR = join(PKG_ROOT, ".cache");

export interface FetchResult {
  url: string;
  finalUrl: string;
  /** 0 = network error / robots block (see `error`). */
  status: number;
  contentType: string;
  body: string;
  fetchedAt: string;
  error?: string;
  robotsBlocked?: boolean;
  fromCache?: boolean;
}

export interface FetchOptions {
  method?: "GET" | "POST";
  headers?: Record<string, string>;
  body?: string;
  /** Obey robots.txt (default true). Pass false only for documented public JSON APIs. */
  robots?: boolean;
  /** Concurrency group (usually the ATS id). Default: host. */
  group?: string;
  /** Cache TTL; default from the Fetcher. 0 = don't read the cache. */
  ttlMs?: number;
  timeoutMs?: number;
  retries?: number;
  /** Don't keep bodies larger than this in the cache (default 3 MB). */
  maxCacheBytes?: number;
}

/** Bounded concurrency + minimum spacing between request starts + a shared cool-down after 429s. */
class Gate {
  private active = 0;
  private readonly queue: (() => void)[] = [];
  private nextStart = 0;
  private coolUntil = 0;
  constructor(
    private readonly max: number,
    private readonly minIntervalMs: number,
  ) {}
  coolDown(ms: number): void {
    this.coolUntil = Math.max(this.coolUntil, Date.now() + ms);
  }
  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.active >= this.max) await new Promise<void>((r) => this.queue.push(r));
    else this.active++;
    try {
      const now = Date.now();
      const start = Math.max(now, this.nextStart, this.coolUntil);
      this.nextStart = start + this.minIntervalMs;
      if (start > now) await new Promise((r) => setTimeout(r, start - now));
      return await fn();
    } finally {
      const next = this.queue.shift();
      if (next) next();
      else this.active--;
    }
  }
}

export function vendorFamily(host: string): string | null {
  if (/\.(?:myworkdayjobs|myworkdaysite)\.com$/i.test(host)) return "workday";
  if (/\.oraclecloud\.com$/i.test(host)) return "oracle";
  if (/\.eightfold\.ai$/i.test(host)) return "eightfold";
  return null;
}

const COOLDOWN_MS = 10 * 60_000;
const MAX_COOLDOWNS = 3;

/** Per-group politeness overrides (group = ATS id). Everything else: ≤ 4 in flight, 100 ms spacing. */
const GROUP_LIMITS: Record<string, { max: number; minIntervalMs: number }> = {
  /**
   * Workday sits behind Cloudflare, which starts answering 429 to the whole client after short bursts
   * (observed at ~2 req/s across tenants). One request at a time, ≥ 3 s apart.
   */
  workday: { max: 1, minIntervalMs: 3000 },
  oracle: { max: 2, minIntervalMs: 500 },
  eightfold: { max: 2, minIntervalMs: 500 },
  /** Workable answered 429 at ~2.5 req/s: one at a time, ≥ 1.5 s apart. */
  workable: { max: 1, minIntervalMs: 1500 },
  /** Company careers pages (one Gate per host): one request at a time, ≥ 1 s apart. */
  html: { max: 1, minIntervalMs: 1000 },
};

export interface FetcherOptions {
  /** Default cache TTL (default 20 h). */
  ttlMs?: number;
  /** Ignore cached responses (still writes fresh ones). */
  fresh?: boolean;
  /** Max in-flight requests per group (default 4). */
  perGroup?: number;
  /** Min gap between request starts per host (default 250 ms for APIs). */
  perHostDelayMs?: number;
  log?: Logger;
}

export class Fetcher {
  readonly log: Logger;
  private readonly http: HttpClient;
  private readonly groups = new Map<string, Gate>();
  private readonly dns = new Map<string, Promise<boolean>>();
  /** 429 strikes per group family ("workday", "greenhouse", "html"…). */
  private readonly rateLimited = new Map<string, number>();
  private readonly ttlMs: number;
  private readonly fresh: boolean;
  private readonly perGroup: number;
  private readonly dir = join(CACHE_DIR, "http");
  stats = { requests: 0, cacheHits: 0, errors: 0 };

  constructor(opts: FetcherOptions = {}) {
    this.log = opts.log ?? createLogger("registry");
    this.ttlMs = opts.ttlMs ?? 20 * 3_600_000;
    this.fresh = opts.fresh ?? false;
    this.perGroup = Math.min(4, Math.max(1, opts.perGroup ?? 4));
    this.http = createHttpClient({
      perHostConcurrency: this.perGroup,
      perHostDelayMs: opts.perHostDelayMs ?? 250,
      timeoutMs: 20_000,
      retries: 2,
      log: this.log.child("http"),
    });
    mkdirSync(this.dir, { recursive: true });
  }

  private key(url: string, opts: FetchOptions): string {
    return createHash("sha1").update(`${opts.method ?? "GET"} ${url}\n${opts.body ?? ""}`).digest("hex");
  }

  private gate(group: string): Gate {
    let g = this.groups.get(group);
    if (!g) {
      const lim = GROUP_LIMITS[group.split(":")[0]!] ?? { max: this.perGroup, minIntervalMs: 100 };
      g = new Gate(Math.min(this.perGroup, lim.max), lim.minIntervalMs);
      this.groups.set(group, g);
    }
    return g;
  }

  /** Cached DNS check, so probes of hosts that don't exist fail fast instead of retrying. */
  hostResolves(host: string): Promise<boolean> {
    let p = this.dns.get(host);
    if (!p) {
      p = lookup(host).then(
        () => true,
        () => false,
      );
      this.dns.set(host, p);
    }
    return p;
  }

  readCache(url: string, opts: FetchOptions = {}): FetchResult | null {
    const file = join(this.dir, `${this.key(url, opts)}.json`);
    if (!existsSync(file)) return null;
    try {
      return JSON.parse(readFileSync(file, "utf8")) as FetchResult;
    } catch {
      return null;
    }
  }

  async fetch(url: string, opts: FetchOptions = {}): Promise<FetchResult> {
    const ttl = opts.ttlMs ?? this.ttlMs;
    const file = join(this.dir, `${this.key(url, opts)}.json`);
    if (!this.fresh && ttl > 0) {
      const hit = this.readCache(url, opts);
      if (hit && Date.now() - Date.parse(hit.fetchedAt) < ttl && hit.status !== 0 && hit.status < 500 && hit.status !== 429) {
        this.stats.cacheHits++;
        return { ...hit, fromCache: true };
      }
    }
    const host = new URL(url).hostname;
    if (!(await this.hostResolves(host))) {
      return { url, finalUrl: url, status: 0, contentType: "", body: "", fetchedAt: new Date().toISOString(), error: "ENOTFOUND" };
    }
    // Careers pages hosted by a rate-limited vendor share that vendor's gate and circuit breaker;
    // ordinary company sites each get their own (a 429 from one site never pauses the others).
    const vendor = vendorFamily(host);
    const group = vendor ?? opts.group ?? host;
    const family = group.startsWith("html:") ? group : group.split(":")[0]!;
    if ((this.rateLimited.get(family) ?? 0) >= MAX_COOLDOWNS) {
      return { url, finalUrl: url, status: 0, contentType: "", body: "", fetchedAt: new Date().toISOString(), error: `rate-limited: ${family} circuit open for this run` };
    }
    const gate = this.gate(group);
    let result = await gate.run(() => this.doFetch(url, opts));
    if (result.status === 429 && (family.startsWith("html:") || (opts.group ?? "").startsWith("html:"))) {
      // A page answering 429 to 1–2 polite requests is bot protection: give up on that site (or vendor) this run.
      this.rateLimited.set(family, MAX_COOLDOWNS);
      return { ...result, status: 0, error: `rate-limited (429) by ${host}` };
    }
    if (result.status === 429) {
      // The client already retried with backoff. Back off the whole family hard; after MAX_COOLDOWNS
      // strikes stop calling it for the rest of the run (callers see a transient error, never "dead").
      const strikes = (this.rateLimited.get(family) ?? 0) + 1;
      this.rateLimited.set(family, strikes);
      if (strikes >= MAX_COOLDOWNS) {
        this.log.warn(`429 from ${host} — ${family}: circuit open, no more requests this run`);
        return { ...result, status: 0, error: `rate-limited (429) by ${host}` };
      }
      this.log.warn(`429 from ${host} — cooling down "${family}" for ${COOLDOWN_MS / 60_000} min (strike ${strikes}/${MAX_COOLDOWNS})`);
      for (const [g, gt] of this.groups) if (g.split(":")[0] === family) gt.coolDown(COOLDOWN_MS);
      result = await gate.run(() => this.doFetch(url, opts));
      if (result.status === 429) result = { ...result, status: 0, error: `rate-limited (429) by ${host}` };
    }
    const maxBytes = opts.maxCacheBytes ?? 3_000_000;
    if (result.body.length <= maxBytes && !result.robotsBlocked) {
      try {
        writeFileSync(file, JSON.stringify(result));
      } catch (e) {
        this.log.warn("cache write failed", { error: e instanceof Error ? e.message : String(e) });
      }
    }
    return result;
  }

  private async doFetch(url: string, opts: FetchOptions): Promise<FetchResult> {
    this.stats.requests++;
    const fetchedAt = new Date().toISOString();
    try {
      const res = await this.http.fetch(url, {
        method: opts.method ?? "GET",
        headers: opts.headers,
        body: opts.body,
        robots: opts.robots ?? true,
        timeoutMs: opts.timeoutMs,
        retries: opts.retries,
        redirect: "follow",
      });
      const body = await res.text();
      return { url, finalUrl: res.url || url, status: res.status, contentType: res.headers.get("content-type") ?? "", body, fetchedAt };
    } catch (e) {
      this.stats.errors++;
      if (e instanceof RobotsDisallowedError) {
        return { url, finalUrl: url, status: 0, contentType: "", body: "", fetchedAt, error: "robots.txt disallows this URL", robotsBlocked: true };
      }
      const err = e as Error & { cause?: { code?: string; message?: string } };
      const msg = err.cause?.code ?? err.cause?.message ?? err.message ?? String(e);
      return { url, finalUrl: url, status: 0, contentType: "", body: "", fetchedAt, error: msg };
    }
  }
}

/** JSON.parse that returns null instead of throwing. */
export function parseJson<T = unknown>(body: string): T | null {
  try {
    return JSON.parse(body) as T;
  } catch {
    return null;
  }
}

/** Run `fn` over items with bounded parallelism, preserving order. */
export async function mapLimit<T, R>(items: readonly T[], limit: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]!, i);
    }
  });
  await Promise.all(workers);
  return out;
}

/** Tiny argv helper: --flag value / --flag (boolean) / positional. */
export function parseArgs(argv: string[]): { flags: Map<string, string | true>; positional: string[] } {
  const flags = new Map<string, string | true>();
  const positional: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a.startsWith("--")) {
      const [k, v] = a.slice(2).split("=", 2) as [string, string | undefined];
      if (v !== undefined) flags.set(k, v);
      else if (argv[i + 1] !== undefined && !argv[i + 1]!.startsWith("--")) flags.set(k, argv[++i]!);
      else flags.set(k, true);
    } else positional.push(a);
  }
  return { flags, positional };
}

export function readJsonFile<T>(path: string, fallback: T): T {
  if (!existsSync(path)) return fallback;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch {
    return fallback;
  }
}

export function writeJsonFile(path: string, value: unknown): void {
  writeFileSync(path, JSON.stringify(value, null, 2) + "\n");
}
