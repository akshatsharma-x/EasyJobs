import { validateRawJob, type AtsType, type CompanyTarget, type RawJob } from "@easyjobs/contract";
import type { Env, HttpClient, Logger, ScrapeContext } from "@easyjobs/contract/node";
import { createDevCache, type DevCache } from "./cache";
import { envInt } from "./env";
import { BlockedError, describeError, isAbortError, statusOf } from "./http";
import { isTestPosting } from "./mapping";

/** Counters reported once per target (and used by tests / docs). */
export interface TargetStats {
  listed: number;
  emitted: number;
  /** Known jobs emitted as light records (no detail fetch). */
  known: number;
  /** Detail fetches that succeeded. */
  detailed: number;
  /** Unknown jobs left for a later run (detail budget or throttling). */
  deferred: number;
  detailErrors: number;
  /** Items dropped because they failed schema validation (zod) — schema drift. */
  invalidItems: number;
  /** Jobs whose RawJob failed validateRawJob (never emitted). */
  invalidJobs: number;
  /** Listed but gone (404/410) or expired by validThrough. */
  gone: number;
  /** Fetched pages that turned out not to contain a JobPosting. */
  notJobPages: number;
  /** Internal test requisitions dropped ("DO NOT APPLY - TEST REQ"). */
  testPostings: number;
  pages: number;
}

export const newStats = (): TargetStats => ({
  listed: 0, emitted: 0, known: 0, detailed: 0, deferred: 0, detailErrors: 0, invalidItems: 0, invalidJobs: 0, gone: 0, notJobPages: 0, testPostings: 0, pages: 0,
});

/**
 * Optional worker hooks (implemented by apps/worker, proposed for the contract in
 * docs/contract-requests/P05.md). Probed structurally; absent in the CLI and in v1.0.0.
 */
export interface WorkerHooks {
  markIncomplete?(reason?: string): void;
  report?(statusOrStats: "partial" | "blocked" | Record<string, number>, info?: { reason?: string; retryAt?: string }): void;
}

function rootCause(e: unknown): unknown {
  let cur = e;
  for (let i = 0; i < 5 && cur instanceof Error && cur.cause !== undefined; i++) {
    if (cur instanceof BlockedError) return cur;
    cur = cur.cause;
  }
  return cur;
}

/**
 * Tell the worker this run must not sweep. Returns true when a hook took the signal (no need to
 * throw); false → the caller throws so callers without hooks (CLI, older workers) also skip sweeps.
 */
export function signalIncomplete(ctx: ScrapeContext, error: unknown, reason: string, emitted: number, now: Date = new Date()): boolean {
  const hooks = ctx as ScrapeContext & WorkerHooks;
  const cause = rootCause(error);
  const status = statusOf(cause);
  if (hooks.report && cause instanceof BlockedError) {
    hooks.report("blocked", { reason, retryAt: new Date(now.getTime() + 60 * 60_000).toISOString() });
    return true;
  }
  if (hooks.report && (status === 429 || status === 503)) {
    hooks.report("partial", { reason, retryAt: new Date(now.getTime() + 15 * 60_000).toISOString() });
    return emitted > 0;
  }
  if (hooks.markIncomplete) {
    hooks.markIncomplete(reason);
    // Nothing emitted is a real failure (worker back-off / circuit breaker should see it).
    return emitted > 0;
  }
  return false;
}

/** Thrown (after yielding what we could) when a listing was not complete, so the worker must not sweep. */
export class IncompleteRunError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "IncompleteRunError";
  }
}

export interface TargetContext {
  target: CompanyTarget;
  http: HttpClient;
  log: Logger;
  /** Aborts on ctx.signal or when the per-target time budget runs out. */
  signal: AbortSignal;
  env: Env;
  /** Max jobs to emit for this target (share of ctx.limit). */
  limit?: number;
  isKnown: (sourceJobId: string) => boolean;
  now: Date;
  stats: TargetStats;
  cache: DevCache | null;
  /** Logs the first few schema-drift problems per target, then only counts. */
  drift: (what: string, issue: unknown) => void;
}

export type TargetScrape = (tctx: TargetContext) => AsyncGenerator<RawJob>;

export interface RunTargetsOptions {
  scraperId: string;
  handlesAts: AtsType[];
  /** Per-target wall-clock budget; env ATS_ENTERPRISE_TARGET_BUDGET_MIN overrides. */
  budgetMinutes?: number;
}

/**
 * Drive one adapter over ctx.targets (the worker passes exactly one; the CLI passes all fixtures).
 * - each target gets ceil(limit / targets) so a CLI run samples every fixture target
 * - jobs failing validateRawJob are counted and never emitted
 * - a failing target does not stop the others; failures are re-thrown at the end so callers
 *   (the worker) treat the run as incomplete and skip the sweep
 */
export async function* runTargets(ctx: ScrapeContext, opts: RunTargetsOptions, scrapeTarget: TargetScrape): AsyncGenerator<RawJob> {
  const targets = (ctx.targets ?? []).filter((t) => opts.handlesAts.includes(t.ats));
  if (targets.length === 0) {
    ctx.log.warn(`${opts.scraperId}: no targets for ats ${opts.handlesAts.join("/")} — nothing to do`);
    return;
  }
  const share = ctx.limit !== undefined ? Math.max(1, Math.ceil(ctx.limit / targets.length)) : undefined;
  const budgetMs = envInt(ctx.env, "ATS_ENTERPRISE_TARGET_BUDGET_MIN", opts.budgetMinutes ?? 25, 1) * 60_000;
  const cache = createDevCache(ctx.env);
  const failures: string[] = [];
  let total = 0;
  for (const target of targets) {
    if (ctx.signal.aborted) break;
    if (ctx.limit !== undefined && total >= ctx.limit) break;
    const log = ctx.log.child(target.slug);
    const stats = newStats();
    const budget = AbortSignal.timeout(budgetMs);
    const signal = AbortSignal.any([ctx.signal, budget]);
    let driftLogged = 0;
    const tctx: TargetContext = {
      target,
      http: ctx.http,
      log,
      signal,
      env: ctx.env,
      limit: share,
      isKnown: (id) => ctx.isKnown?.(id, target.slug) ?? false,
      now: new Date(),
      stats,
      cache,
      drift: (what, issue) => {
        if (++driftLogged <= 3) log.warn(`schema drift: skipped ${what}`, { issue: summarizeIssue(issue) });
      },
    };
    const t0 = Date.now();
    let emitted = 0;
    try {
      for await (const job of scrapeTarget(tctx)) {
        if (isTestPosting(job.title)) {
          stats.testPostings++;
          continue;
        }
        const errs = validateRawJob(job);
        if (errs.length > 0) {
          stats.invalidJobs++;
          if (stats.invalidJobs <= 3) log.warn("dropping invalid RawJob", { sourceJobId: job.sourceJobId, errs });
          continue;
        }
        stats.emitted++;
        emitted++;
        total++;
        yield job;
        if (share !== undefined && emitted >= share) break;
        if (ctx.limit !== undefined && total >= ctx.limit) break;
      }
    } catch (e) {
      if (ctx.signal.aborted) throw ctx.signal.reason ?? e;
      const reason = budget.aborted && isAbortError(e) ? `time budget of ${budgetMs / 60_000} min exceeded` : describeError(e);
      // One target per call (worker): hand the signal to the worker hooks when it has them.
      const handled = targets.length === 1 && signalIncomplete(ctx, e, `${target.slug}: ${reason}`, emitted);
      if (handled) log.warn(`${opts.scraperId}: run incomplete — no sweep`, { error: reason });
      else {
        failures.push(`${target.slug}: ${reason}`);
        log.error(`${opts.scraperId}: target failed${e instanceof IncompleteRunError ? " (incomplete listing)" : ""}`, { error: reason });
      }
    } finally {
      log.info(`${opts.scraperId}: ${target.slug} done in ${((Date.now() - t0) / 1000).toFixed(1)}s`, { ...stats });
      if (targets.length === 1) (ctx as ScrapeContext & WorkerHooks).report?.({ ...stats });
    }
  }
  if (failures.length > 0) {
    throw new IncompleteRunError(`${opts.scraperId}: ${failures.length}/${targets.length} target(s) incomplete — ${failures.join(" | ")}`);
  }
}

function summarizeIssue(issue: unknown): unknown {
  if (issue && typeof issue === "object" && "issues" in issue && Array.isArray((issue as { issues: unknown[] }).issues)) {
    return (issue as { issues: { path?: unknown[]; message?: string }[] }).issues
      .slice(0, 3)
      .map((i) => `${(i.path ?? []).join(".")}: ${i.message ?? ""}`);
  }
  return issue instanceof Error ? issue.message : issue;
}

/** Fields every RawJob from a registry target shares. */
export function targetBase(target: CompanyTarget): Pick<RawJob, "target" | "company"> & {
  companySlug: string;
  companyDomain: string | null;
} {
  return { target: target.slug, company: target.name, companySlug: target.slug, companyDomain: target.domain };
}

/** String value of target.extra[key]. */
export function extraString(target: CompanyTarget, key: string): string | undefined {
  const v = target.extra?.[key];
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

/** String or string[] value of target.extra[key]. */
export function extraStrings(target: CompanyTarget, key: string): string[] {
  const v = target.extra?.[key];
  if (typeof v === "string" && v.trim()) return v.split(",").map((s) => s.trim()).filter(Boolean);
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === "string" && x.trim().length > 0).map((s) => s.trim());
  return [];
}

/** Overflow policy for unknown jobs beyond the per-run detail budget. */
export type OverflowPolicy = "defer" | "light";
export function overflowPolicy(env: Env, name: string): OverflowPolicy {
  return env[name]?.trim().toLowerCase() === "light" ? "light" : "defer";
}
