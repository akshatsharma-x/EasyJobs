/**
 * EasyJobs shared contract — Node-only helpers (v1.1.0).
 * Source of truth: prompts.md §0.2, amended by W1 (docs/INTEGRATION.md → "Contract 1.1.0").
 * Logger · polite HTTP client (per-host rate limit, retries, robots.txt) · Scraper plugin interface · standard scraper CLI.
 */
import { createWriteStream, mkdirSync } from "node:fs";
import { join } from "node:path";
import { validateRawJob, type AtsType, type CompanyTarget, type RawJob, type SourceKind } from "./index";

/* ─────────────────────────── Logger ─────────────────────────── */

export type LogMeta = Record<string, unknown>;

export interface Logger {
  debug(msg: string, meta?: LogMeta): void;
  info(msg: string, meta?: LogMeta): void;
  warn(msg: string, meta?: LogMeta): void;
  error(msg: string, meta?: LogMeta): void;
  child(scope: string): Logger;
}

/** LOG_LEVEL=debug enables debug lines; LOG_FORMAT=json prints JSON lines. */
export function createLogger(scope = "easyjobs"): Logger {
  const json = process.env.LOG_FORMAT === "json";
  const debugOn = process.env.LOG_LEVEL === "debug";
  const emit = (level: "debug" | "info" | "warn" | "error", msg: string, meta?: LogMeta): void => {
    if (level === "debug" && !debugOn) return;
    if (json) {
      console.log(JSON.stringify({ t: new Date().toISOString(), level, scope, msg, ...meta }));
      return;
    }
    const line = `${new Date().toISOString().slice(11, 19)} ${level.toUpperCase().padEnd(5)} [${scope}] ${msg}`;
    const out = level === "error" ? console.error : level === "warn" ? console.warn : console.log;
    if (meta && Object.keys(meta).length > 0) out(line, meta);
    else out(line);
  };
  return {
    debug: (m, x) => emit("debug", m, x),
    info: (m, x) => emit("info", m, x),
    warn: (m, x) => emit("warn", m, x),
    error: (m, x) => emit("error", m, x),
    child: (s) => createLogger(`${scope}:${s}`),
  };
}

/* ─────────────────────────── HTTP client ─────────────────────────── */

export const DEFAULT_USER_AGENT = "EasyJobsBot/1.0 (+https://easyjobs.example/bot)";

export interface HttpRequestInit extends RequestInit {
  /** Per-attempt timeout (default 20 000 ms). */
  timeoutMs?: number;
  /** Retries on network errors, 429 and 5xx (default 3). */
  retries?: number;
  /** Check robots.txt first (default true). Use false only for documented public JSON APIs. */
  robots?: boolean;
}

export interface HttpClient {
  fetch(url: string, init?: HttpRequestInit): Promise<Response>;
  /** Parses JSON; throws HttpError on non-2xx. */
  json<T = unknown>(url: string, init?: HttpRequestInit): Promise<T>;
  /** Throws HttpError on non-2xx. */
  text(url: string, init?: HttpRequestInit): Promise<string>;
}

export interface HttpClientOptions {
  /** Default: env SCRAPER_USER_AGENT or DEFAULT_USER_AGENT */
  userAgent?: string;
  /** Max parallel requests per host (default 2). */
  perHostConcurrency?: number;
  /** Min gap between request starts per host (default 750 ms). */
  perHostDelayMs?: number;
  timeoutMs?: number;
  retries?: number;
  robots?: boolean;
  log?: Logger;
}

export class HttpError extends Error {
  readonly status: number;
  readonly url: string;
  readonly body: string;
  /** 1.1: response headers (lower-cased keys), e.g. `retry-after`, `cf-mitigated`. */
  readonly headers: Record<string, string>;
  constructor(status: number, url: string, body = "", headers: Record<string, string> = {}) {
    super(`HTTP ${status} for ${url}`);
    this.name = "HttpError";
    this.status = status;
    this.url = url;
    this.body = body.slice(0, 1000);
    this.headers = headers;
  }
  /** 1.1: an anti-bot wall (Cloudflare challenge, LinkedIn 999) — retrying soon is pointless and impolite. */
  get blocked(): boolean {
    return isBlockedResponse(this.status, this.headers);
  }
}

/**
 * 1.1: a scraper hit an anti-bot wall / block page. The worker pauses the source until `retryAt`
 * (or the circuit-breaker window) instead of retrying, and the run is reported as "partial" without a sweep.
 */
export class SourceBlockedError extends Error {
  readonly retryAt: Date | null;
  constructor(message: string, retryAt: Date | null = null) {
    super(message);
    this.name = "SourceBlockedError";
    this.retryAt = retryAt;
  }
}

/** 1.1: LinkedIn's 999, any non-standard ≥ 600 status, or a Cloudflare challenge (`cf-mitigated: challenge`). */
export function isBlockedResponse(status: number, headers: Headers | Record<string, string>): boolean {
  const mitigated = headers instanceof Headers ? headers.get("cf-mitigated") : headers["cf-mitigated"];
  return status === 999 || status >= 600 || (typeof mitigated === "string" && mitigated.toLowerCase() === "challenge");
}

function headerRecord(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  headers.forEach((v, k) => {
    out[k.toLowerCase()] = v;
  });
  return out;
}

export class RobotsDisallowedError extends Error {
  readonly url: string;
  constructor(url: string) {
    super(`Disallowed by robots.txt: ${url}`);
    this.name = "RobotsDisallowedError";
    this.url = url;
  }
}

export function sleep(ms: number, signal?: AbortSignal | null): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason);
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(signal.reason);
      },
      { once: true },
    );
  });
}

export interface RobotsRules {
  allow: string[];
  disallow: string[];
}

/** Minimal robots.txt parser: uses the group(s) whose user-agent token appears in our UA, else "*". */
export function parseRobots(txt: string, userAgent: string): RobotsRules {
  const groups: { agents: string[]; allow: string[]; disallow: string[] }[] = [];
  let current: { agents: string[]; allow: string[]; disallow: string[] } | undefined;
  let lastWasAgent = false;
  for (const raw of txt.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, "").trim();
    const i = line.indexOf(":");
    if (i < 0) continue;
    const key = line.slice(0, i).trim().toLowerCase();
    const value = line.slice(i + 1).trim();
    if (key === "user-agent") {
      if (!current || !lastWasAgent) {
        current = { agents: [], allow: [], disallow: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (!current || !value) continue;
    if (key === "allow") current.allow.push(value);
    else if (key === "disallow") current.disallow.push(value);
  }
  const ua = userAgent.toLowerCase();
  const specific = groups.filter((g) => g.agents.some((a) => a !== "*" && a.length > 0 && ua.includes(a)));
  const chosen = specific.length > 0 ? specific : groups.filter((g) => g.agents.includes("*"));
  return { allow: chosen.flatMap((g) => g.allow), disallow: chosen.flatMap((g) => g.disallow) };
}

function ruleLength(rule: string, path: string): number {
  const anchored = rule.endsWith("$");
  const body = anchored ? rule.slice(0, -1) : rule;
  const pattern = body
    .split("*")
    .map((s) => s.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp(`^${pattern}${anchored ? "$" : ""}`).test(path) ? body.length : -1;
}

/** Longest matching rule wins; on a tie, Allow wins. */
export function isPathAllowed(rules: RobotsRules, path: string): boolean {
  let best = -1;
  let allowed = true;
  for (const rule of rules.disallow) {
    const n = ruleLength(rule, path);
    if (n > best) {
      best = n;
      allowed = false;
    }
  }
  for (const rule of rules.allow) {
    const n = ruleLength(rule, path);
    if (n >= 0 && n >= best) {
      best = n;
      allowed = true;
    }
  }
  return allowed;
}

/** Polite fetch: per-host concurrency + spacing, retries with backoff (honours Retry-After), timeouts, robots.txt. */
export function createHttpClient(options: HttpClientOptions = {}): HttpClient {
  const userAgent = options.userAgent ?? process.env.SCRAPER_USER_AGENT ?? DEFAULT_USER_AGENT;
  const concurrency = Math.max(1, options.perHostConcurrency ?? 2);
  const gapMs = Math.max(0, options.perHostDelayMs ?? 750);
  const hosts = new Map<string, { active: number; queue: (() => void)[]; next: number }>();
  const robotsCache = new Map<string, { at: number; ttl: number; rules: Promise<RobotsRules> }>();

  async function acquire(host: string): Promise<() => void> {
    let slot = hosts.get(host);
    if (!slot) {
      slot = { active: 0, queue: [], next: 0 };
      hosts.set(host, slot);
    }
    const s = slot;
    if (s.active < concurrency) s.active++;
    else await new Promise<void>((resolve) => s.queue.push(resolve));
    const now = Date.now();
    const startAt = Math.max(now, s.next);
    s.next = startAt + gapMs;
    if (startAt > now) await sleep(startAt - now);
    return () => {
      const nextWaiter = s.queue.shift();
      if (nextWaiter) nextWaiter();
      else s.active--;
    };
  }

  // 1.1 (RFC 9309 §2.3.1): 2xx → parse; other 4xx → no rules (allow); 5xx, 429 or a network failure → the
  // robots.txt is unreachable → assume complete disallow, re-checked after a short TTL instead of 6 h.
  const ROBOTS_TTL_MS = 6 * 3_600_000;
  const ROBOTS_UNREACHABLE_TTL_MS = 10 * 60_000;
  const DISALLOW_ALL: RobotsRules = { allow: [], disallow: ["/"] };

  async function robotsAllows(url: URL): Promise<boolean> {
    let entry = robotsCache.get(url.origin);
    if (!entry || Date.now() - entry.at > entry.ttl) {
      let ttl = ROBOTS_TTL_MS;
      const rules = (async (): Promise<RobotsRules> => {
        try {
          const res = await fetch(`${url.origin}/robots.txt`, {
            headers: { "user-agent": userAgent },
            signal: AbortSignal.timeout(10_000),
          });
          if (res.ok) return parseRobots(await res.text(), userAgent);
          await res.body?.cancel().catch(() => undefined);
          if (res.status >= 500 || res.status === 429) {
            ttl = ROBOTS_UNREACHABLE_TTL_MS;
            return DISALLOW_ALL;
          }
          return { allow: [], disallow: [] };
        } catch {
          ttl = ROBOTS_UNREACHABLE_TTL_MS;
          return DISALLOW_ALL;
        }
      })();
      const created = { at: Date.now(), ttl, rules };
      robotsCache.set(url.origin, created);
      void rules.then(() => {
        created.ttl = ttl;
      });
      entry = created;
    }
    return isPathAllowed(await entry.rules, url.pathname + url.search);
  }

  async function request(input: string, init: HttpRequestInit = {}): Promise<Response> {
    const {
      timeoutMs = options.timeoutMs ?? 20_000,
      retries = options.retries ?? 3,
      robots = options.robots ?? true,
      ...rest
    } = init;
    const url = new URL(input);
    if (robots && !(await robotsAllows(url))) throw new RobotsDisallowedError(input);
    const headers = new Headers(rest.headers);
    if (!headers.has("user-agent")) headers.set("user-agent", userAgent);
    if (!headers.has("accept-language")) headers.set("accept-language", "en-IN,en;q=0.9");
    for (let attempt = 0; ; attempt++) {
      const release = await acquire(url.host);
      let res: Response | undefined;
      let error: unknown;
      try {
        const timeout = AbortSignal.timeout(timeoutMs);
        const signal = rest.signal ? AbortSignal.any([rest.signal, timeout]) : timeout;
        res = await fetch(url, { ...rest, headers, signal });
      } catch (e) {
        error = e;
      } finally {
        release();
      }
      if (rest.signal?.aborted) throw rest.signal.reason ?? error;
      // 1.1: never retry anti-bot answers (999 / ≥ 600 / Cloudflare challenge) — back off instead.
      const blocked = res !== undefined && isBlockedResponse(res.status, res.headers);
      const retryable = !blocked && (res === undefined || res.status === 429 || (res.status >= 500 && res.status < 600));
      if (!retryable || attempt >= retries) {
        if (res === undefined) throw error;
        return res;
      }
      const retryAfter = Number(res?.headers.get("retry-after"));
      const waitMs =
        Number.isFinite(retryAfter) && retryAfter > 0
          ? Math.min(retryAfter * 1000, 120_000)
          : Math.min(30_000, 1000 * 2 ** attempt) + Math.random() * 500;
      options.log?.warn(`retrying ${url.host}${url.pathname}`, { status: res?.status, attempt: attempt + 1, waitMs: Math.round(waitMs) });
      try {
        await res?.body?.cancel();
      } catch {
        /* ignore */
      }
      await sleep(waitMs, rest.signal);
    }
  }

  async function ensureOk(res: Response, url: string): Promise<Response> {
    if (res.ok) return res;
    const body = await res.text().catch(() => "");
    throw new HttpError(res.status, url, body, headerRecord(res.headers));
  }

  return {
    fetch: request,
    async json<T = unknown>(url: string, init: HttpRequestInit = {}): Promise<T> {
      const headers = new Headers(init.headers);
      if (!headers.has("accept")) headers.set("accept", "application/json");
      const res = await ensureOk(await request(url, { ...init, headers }), url);
      return (await res.json()) as T;
    },
    async text(url: string, init: HttpRequestInit = {}): Promise<string> {
      const res = await ensureOk(await request(url, init), url);
      return res.text();
    },
  };
}

/* ─────────────────────────── Scraper plugin interface ─────────────────────────── */

export type Env = Record<string, string | undefined>;

/** 1.1: extra information for `ScrapeContext.report("partial" | "blocked", info)`. */
export interface ScrapeReportInfo {
  reason?: string;
  /** Don't run this task again before this time (ISO string or Date). */
  retryAt?: string | Date;
}

export interface ScrapeContext {
  http: HttpClient;
  log: Logger;
  signal: AbortSignal;
  env: Env;
  /** Max jobs to emit (dev/testing). undefined = no limit. */
  limit?: number;
  /**
   * Incremental hint: postings older than this are probably unchanged. Use it only to skip *work* (detail pages,
   * deep pagination) — a run that receives `since` is never swept, and known postings should still be emitted.
   */
  since?: Date;
  /** Registry targets — only for scrapers with `handlesAts`. The worker passes ONE target per call. */
  targets?: CompanyTarget[];
  /**
   * true → already stored (with details): you may skip the detail fetch and emit a light record
   * (`descriptionHtml: null`, `light: true`). Known jobs must still be emitted — they count as seen.
   */
  isKnown?: (sourceJobId: string, target?: string | null) => boolean;
  /** 1.1: this run saw only part of the listing (stopped at known ids, search results…): no sweep after it. */
  markIncomplete?: (reason?: string) => void;
  /**
   * 1.1: `report("partial" | "blocked", { reason, retryAt })` → graceful stop: RunReport "partial", no sweep, and
   * no rerun before `retryAt` ("blocked" without `retryAt` counts as a failure). `report({ siteTotal: 2054, … })`
   * → numeric run stats (worker `/status`, `RunReport.stats`).
   */
  report?: (statusOrStats: "partial" | "blocked" | Record<string, number>, info?: ScrapeReportInfo) => void;
  /**
   * 1.1: postings that are still open but unchanged (e.g. skipped thanks to `since`) — counted as seen by the
   * sweep without being normalized or ingested. `target` defaults to the task's target.
   */
  markSeen?: (sourceJobIds: string[], target?: string | null) => void;
}

export interface Scraper {
  /** Unique kebab-case id, becomes RawJob.source — e.g. "greenhouse", "coursejoiner", "amazon". */
  id: string;
  /** Display name — e.g. "Greenhouse", "CourseJoiner", "Amazon Jobs". */
  name: string;
  kind: SourceKind;
  /** Default schedule in minutes. ATS scrapers are scheduled per target priority instead. */
  intervalMinutes: number;
  /** ATS adapters: which registry `ats` values this scraper handles. */
  handlesAts?: AtsType[];
  /** Attribution required by the source's terms (shown in UI), e.g. "Jobs via Remote OK". */
  attribution?: string;
  /** Return false to skip (feature flag / missing API key). Default: enabled. */
  isEnabled?: (env: Env) => boolean;
  /**
   * 1.1: false → the worker never sweeps this scraper's jobs (incremental feeds, search results); they close via
   * the freshness rules (§0.4). Default true: after a complete run, every (source, target) seen is swept.
   */
  sweep?: boolean;
  scrape(ctx: ScrapeContext): AsyncIterable<RawJob>;
}

/** Shape of every scraper package's src/index.ts: `export const scrapers: Scraper[] = [...]; export default scrapers;` */
export interface ScraperModule {
  scrapers?: Scraper[];
  default?: Scraper[];
}

export function createScrapeContext(partial: Partial<ScrapeContext> = {}): ScrapeContext {
  const log = partial.log ?? createLogger("scraper");
  return {
    ...partial,
    log,
    http: partial.http ?? createHttpClient({ log }),
    signal: partial.signal ?? new AbortController().signal,
    env: partial.env ?? process.env,
  };
}

/* ─────────────────────────── Standard scraper CLI ─────────────────────────── */

/**
 * Use in every scraper package's src/cli.ts:
 *   tsx src/cli.ts [--scraper <id>] [--limit <n>|all] [--target <slug>] [--out <dir>]
 * Writes <out>/<scraperId>.jsonl and logs count, invalid count and per-field fill rates.
 */
export async function runScraperCli(
  scrapers: Scraper[],
  opts: { targets?: CompanyTarget[]; argv?: string[] } = {},
): Promise<void> {
  const argv = opts.argv ?? process.argv.slice(2);
  const arg = (name: string): string | undefined => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const only = arg("scraper");
  const limitArg = arg("limit") ?? "50";
  const limit = limitArg === "all" ? Number.POSITIVE_INFINITY : Math.max(1, Number(limitArg) || 50);
  const targetSlug = arg("target");
  const outDir = arg("out") ?? "out";
  const log = createLogger("cli");
  mkdirSync(outDir, { recursive: true });
  const selected = scrapers.filter((s) => !only || s.id === only);
  if (selected.length === 0) throw new Error(`No scraper "${only}". Available: ${scrapers.map((s) => s.id).join(", ")}`);
  for (const s of selected) {
    if (s.isEnabled && !s.isEnabled(process.env)) {
      log.warn(`${s.id}: disabled by env/config — skipping`);
      continue;
    }
    const ats = s.handlesAts;
    const targets = ats
      ? (opts.targets ?? []).filter((t) => ats.includes(t.ats) && (!targetSlug || t.slug === targetSlug))
      : undefined;
    const ctx = createScrapeContext({ log: log.child(s.id), limit: Number.isFinite(limit) ? limit : undefined, targets });
    const file = join(outDir, `${s.id}.jsonl`);
    const out = createWriteStream(file);
    const fill: Record<string, number> = {};
    let n = 0;
    let invalid = 0;
    const t0 = Date.now();
    try {
      for await (const job of s.scrape(ctx)) {
        const errs = validateRawJob(job);
        if (errs.length > 0 && ++invalid <= 5) log.warn(`${s.id}: invalid job`, { sourceJobId: job.sourceJobId, errs });
        for (const [k, v] of Object.entries(job)) {
          if (v !== null && v !== undefined && v !== "" && !(Array.isArray(v) && v.length === 0)) fill[k] = (fill[k] ?? 0) + 1;
        }
        out.write(JSON.stringify(job) + "\n");
        if (++n >= limit) break;
      }
    } catch (e) {
      process.exitCode = 1;
      log.error(`${s.id}: failed`, { error: e instanceof Error ? e.message : String(e) });
    } finally {
      out.end();
    }
    const rates = Object.fromEntries(Object.entries(fill).map(([k, v]) => [k, `${Math.round((v / Math.max(n, 1)) * 100)}%`]));
    log.info(`${s.id}: ${n} jobs, ${invalid} invalid, ${((Date.now() - t0) / 1000).toFixed(1)}s → ${file}`, rates);
  }
}
