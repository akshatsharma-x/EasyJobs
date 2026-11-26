/**
 * defineCareerSite(): the one place where run semantics live, so every company scraper behaves
 * the same way:
 *  - list → (detail only for ids that ctx.isKnown() doesn't know, capped per run) → map → validate
 *  - dedupes ids within a run, honours ctx.limit and ctx.signal
 *  - unknown jobs beyond the detail cap are deferred to the next run (not emitted without
 *    details), so they still get a description later; known jobs are emitted as light records
 *    so the worker's sweep sees them as open
 *  - ctx.since is NOT used to drop jobs: the worker sweeps (closes) every job a complete run
 *    didn't emit, so filtering by date would close live postings
 *  - list errors propagate (the run fails → no sweep); per-job detail/mapping errors are counted
 */
import { validateRawJob, type RawJob } from "@easyjobs/contract";
import type { Env, Scraper, ScrapeContext } from "@easyjobs/contract/node";
import { errorMessage, politeHttp, politeOptionsFromEnv } from "./http";
import { SkipMemo } from "./memo";
import type { CompanyInfo } from "./raw";

export interface SiteContext extends ScrapeContext {
  /** Polite client (≤ 1 rps per host, run signal attached, optional dev cache). */
  http: ScrapeContext["http"];
  /** Fixed "now" for the run (relative dates). */
  now: Date;
  /** Report the total the site says it has (shown in run stats / docs). */
  reportTotal(total: number): void;
}

export interface RunStats {
  listed: number;
  emitted: number;
  skipped: number;
  invalid: number;
  details: number;
  detailErrors: number;
  deferred: number;
  siteTotal: number | null;
  ms: number;
}

export interface CareerSiteDefinition<TItem, TDetail = never> {
  company: CompanyInfo;
  /** Display name, e.g. "Amazon Jobs". */
  name: string;
  /** 30–60 */
  intervalMinutes: number;
  /** "json" | "graphql" | "html" … — documented in README/status. */
  endpointType: string;
  /** If set, the scraper is permanently disabled (login / CAPTCHA / anti-bot / terms) — see README. */
  disabledReason?: string;
  /**
   * Off by default; enabled only when `env[optIn.env] === "1"` (like ENABLE_LINKEDIN for P11). For sites
   * that signal they don't want bots but whose data endpoint is technically open — operator's call.
   */
  optIn?: { env: string; reason: string };
  /** Extra enable condition (env flags). */
  isEnabled?: (env: Env) => boolean;
  /** Gap between requests per host (default 1000 ms). */
  minGapMs?: number;
  /** Max detail fetches per run (default env BIGTECH_MAX_DETAILS or 200). */
  maxDetails?: number;
  list(ctx: SiteContext): AsyncIterable<TItem>;
  idOf(item: TItem): string | number | null | undefined;
  /** Cheap pre-filter on list items (e.g. India / open-remote) before any detail fetch. */
  keep?(item: TItem, ctx: SiteContext): boolean;
  /** Fetch details for a job we don't know yet. Return null to emit list data only. */
  detail?(item: TItem, ctx: SiteContext): Promise<TDetail | null>;
  /** Map to RawJob; return null to skip (e.g. a filter that needs detail data). */
  toRawJob(item: TItem, detail: TDetail | null, ctx: SiteContext): RawJob | null;
}

export interface CareerSiteScraper extends Scraper {
  readonly company: CompanyInfo;
  readonly endpointType: string;
  readonly disabledReason: string | null;
  readonly optIn: { env: string; reason: string } | null;
  /** Stats of the most recent run in this process (for scripts/report.ts). */
  lastRun: RunStats | null;
  /**
   * Ids whose detail was fetched but which toRawJob() dropped (closed, outside India). Consulted only in
   * incremental runs (ctx.isKnown present) so they aren't re-fetched every run; TTL 24 h, in-process.
   */
  readonly dropped: SkipMemo;
}

function disabledList(env: Env): Set<string> {
  return new Set((env.BIGTECH_DISABLE ?? "").split(",").map((s) => s.trim()).filter(Boolean));
}

export function defineCareerSite<TItem, TDetail = never>(def: CareerSiteDefinition<TItem, TDetail>): CareerSiteScraper {
  const { company } = def;
  const scraper: CareerSiteScraper = {
    id: company.slug,
    name: def.name,
    kind: "career_site",
    intervalMinutes: def.intervalMinutes,
    company,
    endpointType: def.endpointType,
    disabledReason: def.disabledReason ?? null,
    optIn: def.optIn ?? null,
    lastRun: null,
    dropped: new SkipMemo(),
    isEnabled: (env: Env): boolean => {
      if (def.disabledReason) return false;
      if (disabledList(env).has(company.slug)) return false;
      if (def.optIn && env[def.optIn.env] !== "1") return false;
      return def.isEnabled ? def.isEnabled(env) : true;
    },
    async *scrape(ctx: ScrapeContext): AsyncGenerator<RawJob> {
      const t0 = Date.now();
      const log = ctx.log;
      const http = politeHttp(ctx.http, { ...politeOptionsFromEnv(ctx.env, { minGapMs: def.minGapMs }), signal: ctx.signal, log });
      const stats: RunStats = { listed: 0, emitted: 0, skipped: 0, invalid: 0, details: 0, detailErrors: 0, deferred: 0, siteTotal: null, ms: 0 };
      scraper.lastRun = stats;
      const sctx: SiteContext = {
        ...ctx,
        http,
        now: new Date(),
        reportTotal: (n: number) => {
          if (Number.isFinite(n) && n >= 0) stats.siteTotal = n;
        },
      };
      const envMax = Number(ctx.env.BIGTECH_MAX_DETAILS);
      const maxDetails = def.maxDetails ?? (Number.isFinite(envMax) && envMax >= 0 && ctx.env.BIGTECH_MAX_DETAILS ? envMax : 200);
      const seen = new Set<string>();
      try {
        for await (const item of def.list(sctx)) {
          if (ctx.signal.aborted) throw ctx.signal.reason ?? new Error("aborted");
          const rawId = def.idOf(item);
          const id = rawId === null || rawId === undefined ? "" : String(rawId).trim();
          if (!id || seen.has(id)) continue;
          seen.add(id);
          stats.listed++;
          if (def.keep && !def.keep(item, sctx)) {
            stats.skipped++;
            continue;
          }
          let detail: TDetail | null = null;
          if (def.detail) {
            const known = ctx.isKnown?.(id, company.slug) ?? false;
            if (!known) {
              if (ctx.isKnown && scraper.dropped.has(id)) {
                stats.skipped++;
                continue;
              }
              if (stats.details >= maxDetails) {
                stats.deferred++;
                continue;
              }
              stats.details++;
              try {
                detail = await def.detail(item, sctx);
              } catch (e) {
                if (ctx.signal.aborted) throw e;
                stats.detailErrors++;
                if (stats.detailErrors <= 3) log.warn(`detail failed for ${id}`, { error: errorMessage(e) });
              }
            }
          }
          let job: RawJob | null;
          try {
            job = def.toRawJob(item, detail, sctx);
          } catch (e) {
            stats.invalid++;
            if (stats.invalid <= 3) log.warn(`mapping failed for ${id}`, { error: errorMessage(e) });
            continue;
          }
          if (!job) {
            stats.skipped++;
            if (detail !== null) scraper.dropped.add(id);
            continue;
          }
          const errs = validateRawJob(job);
          if (errs.length > 0) {
            stats.invalid++;
            if (stats.invalid <= 3) log.warn(`invalid job ${id}`, { errs });
            continue;
          }
          stats.emitted++;
          yield job;
          if (ctx.limit !== undefined && stats.emitted >= ctx.limit) break;
        }
      } catch (e) {
        if (ctx.signal.aborted) throw e;
        throw new Error(`${company.slug}: ${errorMessage(e)}`, { cause: e });
      } finally {
        stats.ms = Date.now() - t0;
        log.info(`${company.slug}: listed ${stats.listed}${stats.siteTotal !== null ? ` (site total ${stats.siteTotal})` : ""}, emitted ${stats.emitted}`, {
          skipped: stats.skipped,
          invalid: stats.invalid,
          details: stats.details,
          detailErrors: stats.detailErrors,
          deferred: stats.deferred,
        });
      }
    },
  };
  return scraper;
}
