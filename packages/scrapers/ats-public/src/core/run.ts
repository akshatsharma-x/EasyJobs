/**
 * Turns an AtsAdapter into a contract Scraper that works from ctx.targets.
 *
 * - The worker passes ONE target per call; the CLI passes all fixture targets of the ATS.
 * - ctx.limit is shared fairly across targets (each gets an equal share of what is left), so a CLI run
 *   with --limit 50 still exercises every target.
 * - A dead board (404/410 before any job) — or a careers host whose robots.txt forbids the feed — is logged
 *   once and the target finishes cleanly (the registry drops it; the worker's sweep closes jobs stored before).
 *   The same error after jobs were emitted (e.g. on page 2) fails the target instead: never sweep a partial run.
 * - Any other failure fails the run: with one target the original error is rethrown (HttpError keeps its
 *   status for the worker's backoff); with several, the other targets still run and one aggregated error
 *   is thrown at the end, so the worker never sweeps after an incomplete run.
 * - ctx.since is deliberately ignored: these APIs return whole boards in one or a few requests, and the
 *   worker sweeps after complete runs, so every open job must be emitted every time (see README).
 */
import type { RawJob } from "@easyjobs/contract";
import { RobotsDisallowedError, type Env, type ScrapeContext, type Scraper } from "@easyjobs/contract/node";
import { BoardNotFoundError, describeError } from "./errors";
import type { AtsAdapter, TargetContext } from "./types";

/** Comma-separated scraper ids to disable, or "all". */
export const DISABLE_ENV = "ATS_PUBLIC_DISABLED";
/** Max detail requests per target per run for list+detail APIs (SmartRecruiters, BambooHR). */
export const MAX_DETAILS_ENV = "ATS_MAX_DETAILS";
export const DEFAULT_MAX_DETAILS = 200;

export function isScraperEnabled(id: string, env: Env): boolean {
  const disabled = (env[DISABLE_ENV] ?? "")
    .split(/[\s,]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return !disabled.includes("all") && !disabled.includes(id.toLowerCase());
}

export function maxDetails(env: Env): number {
  const n = Number(env[MAX_DETAILS_ENV]);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : DEFAULT_MAX_DETAILS;
}

export function createAtsScraper(adapter: AtsAdapter): Scraper {
  return {
    id: adapter.id,
    name: adapter.name,
    kind: "ats",
    intervalMinutes: 60,
    handlesAts: [adapter.ats],
    isEnabled: (env) => isScraperEnabled(adapter.id, env),
    scrape: (ctx) => scrapeTargets(adapter, ctx),
  };
}

export async function* scrapeTargets(adapter: AtsAdapter, ctx: ScrapeContext): AsyncGenerator<RawJob, void, undefined> {
  const all = ctx.targets ?? [];
  const targets = all.filter((t) => t.ats === adapter.ats);
  if (targets.length < all.length) ctx.log.debug(`ignoring ${all.length - targets.length} target(s) of other ATS types`);
  if (targets.length === 0) {
    ctx.log.warn(`no ${adapter.ats} targets in ctx.targets — nothing to scrape`);
    return;
  }
  const limit = ctx.limit !== undefined && Number.isFinite(ctx.limit) ? Math.max(0, Math.floor(ctx.limit)) : Number.POSITIVE_INFINITY;
  const failures: { slug: string; error: unknown }[] = [];
  let emitted = 0;

  for (let i = 0; i < targets.length; i++) {
    ctx.signal.throwIfAborted();
    const left = limit - emitted;
    if (left <= 0) break;
    const share = Number.isFinite(left) ? Math.ceil(left / (targets.length - i)) : left;
    const target = targets[i]!;
    const log = ctx.log.child(target.slug);
    const skipped: Record<string, number> = {};
    const seen = new Set<string>();
    let n = 0;
    const startedAt = Date.now();
    const tctx: TargetContext = {
      target,
      http: ctx.http,
      log,
      signal: ctx.signal,
      env: ctx.env,
      remaining: () => share - n,
      isKnown: (id) => ctx.isKnown?.(id, target.slug) ?? false,
      skip: (reason, count = 1) => {
        skipped[reason] = (skipped[reason] ?? 0) + count;
      },
    };
    try {
      for await (const job of adapter.scrapeTarget(tctx)) {
        if (seen.has(job.sourceJobId)) {
          tctx.skip("duplicate id");
          continue;
        }
        seen.add(job.sourceJobId);
        n++;
        emitted++;
        yield job;
        if (n >= share) break;
      }
      const meta = Object.keys(skipped).length > 0 ? { skipped } : undefined;
      log.info(`${n} jobs in ${((Date.now() - startedAt) / 1000).toFixed(1)}s`, meta);
    } catch (error) {
      if (ctx.signal.aborted) throw ctx.signal.reason ?? error;
      // Only a board that is gone from the very first request is "dead": a 404 on page 2 after jobs were
      // emitted is a glitch, and finishing cleanly would let the worker sweep on a partial run.
      if (error instanceof BoardNotFoundError && n === 0) {
        log.warn(`board not found (HTTP ${error.status}) for token "${target.token}" — finishing; the registry should drop it`, {
          url: error.url,
        });
        continue;
      }
      if (error instanceof RobotsDisallowedError && n === 0) {
        log.warn(`robots.txt disallows the feed for token "${target.token}" — finishing; the registry should drop it`, {
          url: error.url,
        });
        continue;
      }
      log.error(`failed after ${n} jobs: ${describeError(error)}`);
      failures.push({ slug: target.slug, error });
    }
  }

  if (failures.length === 0) return;
  if (targets.length === 1) throw failures[0]!.error;
  throw new Error(
    `${adapter.id}: ${failures.length}/${targets.length} targets failed — ${failures.map((f) => `${f.slug}: ${describeError(f.error)}`).join("; ")}`,
    { cause: failures[0]!.error },
  );
}
