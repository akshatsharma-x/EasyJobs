/**
 * createWpJobBlogScraper — a polite, incremental scraper for WordPress job blogs (CourseJoiner & co).
 *
 * Run modes
 * - full (first run, CLI, or once per WPJOBS_REFRESH_HOURS): posts published in the last backfill window (default 60 d).
 *   Unchanged posts come from the local parse cache (no refetch, no re-parse) and are re-emitted, so still-open jobs keep
 *   getting sightings; with ctx.isKnown they are emitted as light records (descriptionHtml: null).
 * - incremental (ctx.since set and a full run happened recently): only posts modified after since − 1 h.
 * Strategies: WP REST → RSS → HTML (sitemap + page), each obeying robots.txt via the contract HTTP client,
 * plus a ≤ 1 request/second per-host gate.
 */
import type { RawJob } from "@easyjobs/contract";
import type { Env, Logger, ScrapeContext, Scraper } from "@easyjobs/contract/node";
import { openSiteCache, PARSER_VERSION, resolveCacheRoot, type CachedParse, type SiteCache } from "../cache";
import { classifyIntent, matchesAny } from "../parse/intent";
import { analyzePost, parsePost, type ParseContext, type ParsedPost } from "../parse/post";
import { collectShortLinks, createRedirectResolver } from "../resolve/redirects";
import { createLlmExtractor, DEFAULT_LLM_MODEL, type LlmExtractor } from "../llm/extract";
import { buildLlmInput, llmOverrides, shouldUseLlm } from "../llm/merge";
import { politeHttp } from "../util/polite";
import { hostOf } from "../util/url";
import { isUnavailable, openSource, type ListWindow, type PostSource, type SourceDeps } from "./source";
import type { SourceStrategy, WpJobBlogConfig } from "./config";
import type { WpPost, WpPostRef } from "./types";

export interface WpJobBlogOptions {
  /** Cache root directory; null → memory only. Default: env WPJOBS_CACHE_DIR or the package's .cache/. */
  cacheDir?: string | null;
  /** Clock override (tests). */
  now?: () => Date;
  /** LLM extractor override; null disables. Default: created from ANTHROPIC_API_KEY when the site allows it. */
  llm?: LlmExtractor | null;
  /** Hosts of other job blogs (their links are never apply links). */
  extraBlogHosts?: string[];
}

export interface RunStats {
  strategy: SourceStrategy | null;
  mode: ListWindow["mode"];
  listed: number;
  candidates: number;
  fetched: number;
  cacheHits: number;
  knownSkipped: number;
  parsed: number;
  emitted: number;
  light: number;
  expired: number;
  llmCalls: number;
  skipped: Record<string, number>;
}

const envId = (id: string): string => id.toUpperCase().replace(/[^A-Z0-9]+/g, "_");

function readNumber(env: Env, keys: string[]): number | undefined {
  for (const k of keys) {
    const v = env[k];
    if (v !== undefined && v !== "" && Number.isFinite(Number(v)) && Number(v) > 0) return Number(v);
  }
  return undefined;
}

function bump(map: Record<string, number>, key: string): void {
  const k = key.replace(/:.*$/, "");
  map[k] = (map[k] ?? 0) + 1;
}

async function pickSource(strategies: SourceStrategy[], deps: SourceDeps, log: Logger): Promise<PostSource> {
  const errors: string[] = [];
  for (const s of strategies) {
    try {
      const src = await openSource(s, deps);
      log.debug(`using ${s} strategy`);
      return src;
    } catch (e) {
      if (!isUnavailable(e)) throw e;
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(`${s}: ${msg}`);
      log.warn(`${s} unavailable — trying next strategy`, { error: msg });
    }
  }
  throw new Error(`no usable source for ${deps.baseUrl} (${errors.join("; ")})`);
}

function maybeCreateLlm(config: WpJobBlogConfig, env: Env, cache: SiteCache, log: Logger): LlmExtractor | null {
  const key = env.ANTHROPIC_API_KEY;
  if (!key || config.llm === false || /^(?:0|false|off)$/i.test(env.WPJOBS_LLM ?? "")) return null;
  return createLlmExtractor({
    apiKey: key,
    model: env.WPJOBS_LLM_MODEL || DEFAULT_LLM_MODEL,
    store: cache.llm,
    log,
    maxCalls: readNumber(env, ["WPJOBS_LLM_MAX_CALLS"]) ?? 30,
  });
}

function stripDebug(p: ParsedPost): CachedParse["jobs"] {
  return p.jobs;
}

export function createWpJobBlogScraper(config: WpJobBlogConfig, options: WpJobBlogOptions = {}): Scraper {
  const ID = envId(config.id);
  return {
    id: config.id,
    name: config.name,
    kind: "aggregator",
    intervalMinutes: config.intervalMinutes ?? 15,
    ...(config.attribution ? { attribution: config.attribution } : {}),
    isEnabled: (env) => !/^(?:0|false|off)$/i.test(env[`ENABLE_${ID}`] ?? ""),
    scrape: (ctx) => scrapeSite(config, options, ctx),
  };
}

async function* scrapeSite(config: WpJobBlogConfig, options: WpJobBlogOptions, ctx: ScrapeContext): AsyncGenerator<RawJob> {
  const now = options.now?.() ?? new Date();
  const log = ctx.log;
  const ID = envId(config.id);
  const http = politeHttp(ctx.http, config.minGapMs ?? 1000);
  const cache = openSiteCache(config.id, resolveCacheRoot(ctx.env, options.cacheDir));
  const backfillDays = readNumber(ctx.env, [`${ID}_BACKFILL_DAYS`, "WPJOBS_BACKFILL_DAYS"]) ?? config.backfillDays ?? 60;
  const refreshHours = readNumber(ctx.env, ["WPJOBS_REFRESH_HOURS"]) ?? 24;
  const lastFullAt = cache.meta.get("lastFullAt");
  const since = ctx.since;
  const incremental = !!since && !!lastFullAt && now.getTime() - Date.parse(lastFullAt) < refreshHours * 3_600_000;
  const window: ListWindow = incremental
    ? { mode: "incremental", from: new Date(since!.getTime() - 3_600_000) }
    : { mode: "full", from: new Date(now.getTime() - backfillDays * 86_400_000) };
  const baseUrl = config.baseUrl.replace(/\/+$/, "");
  const deps: SourceDeps = {
    http,
    log,
    signal: ctx.signal,
    baseUrl,
    feedUrl: config.feedUrl ?? `${baseUrl}/feed/`,
    terms: cache.terms,
    conditional: cache.conditional,
  };
  const resolver = createRedirectResolver({ http, store: cache.redirects, log, signal: ctx.signal });
  const llm = options.llm !== undefined ? options.llm : maybeCreateLlm(config, ctx.env, cache, log);
  const pctx: ParseContext = { site: config, extraBlogHosts: options.extraBlogHosts };
  const stats: RunStats = {
    strategy: null, mode: window.mode, listed: 0, candidates: 0, fetched: 0, cacheHits: 0, knownSkipped: 0, parsed: 0,
    emitted: 0, light: 0, expired: 0, llmCalls: 0, skipped: {},
  };
  const limitReached = (): boolean => ctx.limit !== undefined && stats.emitted >= ctx.limit;
  let completed = false;

  async function parseOne(post: WpPost): Promise<ParsedPost> {
    const shortLinks = collectShortLinks(post.contentHtml, post.link);
    const resolved = shortLinks.length > 0 ? await resolver.resolveMany(shortLinks) : new Map<string, string>();
    const local: ParseContext = { ...pctx, resolveUrl: (u) => resolved.get(u) ?? u };
    let parsed = parsePost(post, local);
    if (llm && shouldUseLlm(parsed)) {
      const analysis = analyzePost(post, local);
      if (analysis.cands.length > 0) {
        const before = llm.calls;
        const out = await llm.extract(buildLlmInput(post, analysis));
        stats.llmCalls += llm.calls - before;
        if (out && !out.is_job_posting && !(parsed.status === "jobs" && parsed.confidence >= 0.5)) {
          parsed = { ...parsed, status: "skipped", reason: "llm: not a job posting", jobs: [] };
        } else if (out) {
          const overrides = llmOverrides(out, analysis);
          if (overrides) {
            const re = parsePost(post, local, overrides);
            if (re.status === "jobs") parsed = re;
          }
        }
      }
    }
    return parsed;
  }

  try {
    const source = await pickSource(config.strategies ?? ["rest", "rss", "html"], deps, log);
    stats.strategy = source.kind;
    outer: for await (const refs of source.list(window)) {
      stats.listed += refs.length;
      const todo: { ref: WpPostRef; cached?: CachedParse }[] = [];
      for (const ref of refs) {
        if (ref.partial) {
          if (ref.categories.some((c) => matchesAny(c.slug, config.excludeCategories))) {
            bump(stats.skipped, "excluded category");
            continue;
          }
        } else {
          const intent = classifyIntent(ref, config);
          if (!intent.candidate) {
            bump(stats.skipped, intent.reason ?? "not a job post");
            continue;
          }
        }
        stats.candidates++;
        const id = ref.id || cache.links.get(ref.link) || 0;
        const cached = id ? cache.parsed.get(String(id)) : undefined;
        if (cached && cached.modified === ref.modifiedGmt && cached.version === PARSER_VERSION) {
          stats.cacheHits++;
          todo.push({ ref: { ...ref, id }, cached });
          continue;
        }
        if (!cached && id && since && Date.parse(ref.modifiedGmt) <= since.getTime() && ctx.isKnown?.(`${id}#1`, null)) {
          stats.knownSkipped++; // stored already and unchanged since the last successful run
          continue;
        }
        todo.push({ ref: { ...ref, id } });
      }

      // Fetch content only where neither a valid parse nor same-version content is cached.
      const needContent = todo.filter((t) => {
        if (t.cached) return false;
        const p = t.ref.id ? cache.posts.get(String(t.ref.id)) : undefined;
        return !p || p.modifiedGmt !== t.ref.modifiedGmt;
      });
      if (needContent.length > 0) {
        const posts = await source.fetch(needContent.map((t) => t.ref));
        stats.fetched += posts.length;
        for (const p of posts) {
          cache.posts.set(String(p.id), p);
          cache.links.set(p.link, p.id);
          const t = needContent.find((x) => x.ref.link === p.link || (x.ref.id && x.ref.id === p.id));
          if (t && !t.ref.id) t.ref = { ...t.ref, id: p.id };
        }
      }

      for (const t of todo) {
        let result: CachedParse | undefined = t.cached;
        if (!result) {
          const post = t.ref.id ? cache.posts.get(String(t.ref.id)) : undefined;
          if (!post) continue; // unpublished meanwhile / page unavailable
          const parsed = await parseOne(post);
          stats.parsed++;
          result = {
            modified: post.modifiedGmt,
            date: post.dateGmt,
            version: PARSER_VERSION,
            status: parsed.status,
            ...(parsed.reason ? { reason: parsed.reason } : {}),
            confidence: parsed.confidence,
            jobs: stripDebug(parsed),
          };
          cache.parsed.set(String(post.id), result);
        }
        if (result.status === "skipped") {
          bump(stats.skipped, result.reason ?? "skipped");
          continue;
        }
        for (const job of result.jobs) {
          if (job.validThrough && Date.parse(job.validThrough) < now.getTime() - 86_400_000) {
            stats.expired++;
            continue;
          }
          const light = t.cached !== undefined && ctx.isKnown?.(job.sourceJobId, null) === true;
          stats.emitted++;
          if (light) stats.light++;
          // Light records keep every hint (so derived fields stay stable) and say so in extra.light.
          yield light ? { ...job, descriptionHtml: null, extra: { ...job.extra, light: true } } : job;
          if (limitReached()) break outer;
        }
      }
      cache.flush();
    }
    completed = !limitReached() && !ctx.signal.aborted;
  } finally {
    if (completed && window.mode === "full") cache.meta.set("lastFullAt", now.toISOString());
    cache.meta.set("lastRunAt", now.toISOString());
    if (completed) cache.prune(new Date(now.getTime() - (backfillDays + 7) * 86_400_000));
    cache.flush();
    const skipped = Object.entries(stats.skipped)
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `${k}=${v}`)
      .join(", ");
    // Optional worker hook (docs/contract-requests/P05.md #2) — not in contract v1.0.0, so duck-typed.
    const report = (ctx as ScrapeContext & { report?: (stats: Record<string, number>) => void }).report;
    if (typeof report === "function") {
      try {
        report({
          listed: stats.listed, candidates: stats.candidates, fetched: stats.fetched, cacheHits: stats.cacheHits, parsed: stats.parsed,
          emitted: stats.emitted, light: stats.light, expired: stats.expired, knownSkipped: stats.knownSkipped, llmCalls: stats.llmCalls,
          skipped: Object.values(stats.skipped).reduce((a, b) => a + b, 0),
        });
      } catch {
        /* reporting must never fail a run */
      }
    }
    log.info(
      `${config.id}: ${stats.mode} via ${stats.strategy ?? "-"} — listed ${stats.listed}, candidates ${stats.candidates}, fetched ${stats.fetched}, ` +
        `cache hits ${stats.cacheHits}, parsed ${stats.parsed}, emitted ${stats.emitted}${stats.light ? ` (${stats.light} light)` : ""}, ` +
        `expired ${stats.expired}${stats.llmCalls ? `, llm ${stats.llmCalls}` : ""}${skipped ? ` · skipped: ${skipped}` : ""}`,
    );
  }
}

/** Hosts of all configured blogs (used so blogs never pick each other's posts as apply links). */
export function blogHosts(configs: WpJobBlogConfig[]): string[] {
  return configs.map((c) => hostOf(c.baseUrl)).filter(Boolean);
}
