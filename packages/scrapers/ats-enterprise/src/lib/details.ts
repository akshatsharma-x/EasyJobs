import type { RawJob } from "@easyjobs/contract";
import { describeError, isBlocked, isGone, isThrottled } from "./http";
import { orderedMap } from "./limiter";
import type { OverflowPolicy, TargetContext } from "./run";

/** Mutable per-run detail budget shared across list pages of one target. */
export interface DetailBudget {
  remaining: number;
  overflow: OverflowPolicy;
  concurrency: number;
  /** "throttled": stop fetching, defer the rest · "broken": stop fetching, emit light records. */
  circuit: "closed" | "throttled" | "broken";
  consecutiveFailures: number;
}

export function createDetailBudget(max: number, overflow: OverflowPolicy, concurrency = 2): DetailBudget {
  return { remaining: Math.max(0, max), overflow, concurrency, circuit: "closed", consecutiveFailures: 0 };
}

/**
 * A run with ctx.limit is a sample (the worker never sweeps it): once the detail budget is spent and
 * overflow is deferred, further list pages can only produce deferrals — stop paging.
 */
export const samplingDone = (tctx: Pick<TargetContext, "limit">, budget: DetailBudget): boolean =>
  tctx.limit !== undefined && budget.overflow === "defer" && (budget.remaining <= 0 || budget.circuit !== "closed");

export interface Listed<L> {
  /** RawJob.sourceJobId — must be derivable from list data (isKnown runs before any detail call). */
  id: string;
  item: L;
}

export interface DetailHandlers<L, D> {
  fetchDetail: (item: L) => Promise<D>;
  /** Full record from list + detail; null if the detail is unusable (schema drift) → light fallback. */
  toFull: (item: L, detail: D) => RawJob | null;
  /** Record from list data only (descriptionHtml null). null if the list data is too thin. */
  toLight: (item: L) => RawJob | null;
}

type Plan<L> = { kind: "light" | "fetch" | "defer"; entry: Listed<L> };

/** Light records carry extra.light = true (proposed RawJob.light, docs/contract-requests/P05.md #4). */
export function markLight(job: RawJob | null): RawJob | null {
  return job ? { ...job, extra: { ...job.extra, light: true } } : null;
}
type Outcome = { job: RawJob | null };

const THROTTLE_TRIP = 3;
const BROKEN_TRIP = 5;

/**
 * known → light record (no request) · unknown → detail fetch while the budget lasts ·
 * over budget → defer (default; the job is picked up with a description on a later run, and since
 * it was never stored the sweep is unaffected) or light (env *_OVERFLOW=light).
 */
export async function* resolveDetails<L, D>(
  tctx: TargetContext,
  entries: readonly Listed<L>[],
  budget: DetailBudget,
  handlers: DetailHandlers<L, D>,
): AsyncGenerator<RawJob> {
  const { stats, log } = tctx;
  const plans: Plan<L>[] = entries.map((entry) => {
    if (tctx.isKnown(entry.id)) {
      stats.known++;
      return { kind: "light", entry };
    }
    if (budget.circuit === "broken") return { kind: "light", entry };
    if (budget.circuit === "throttled" || budget.remaining <= 0) {
      if (budget.overflow === "light" && budget.circuit !== "throttled") return { kind: "light", entry };
      stats.deferred++;
      return { kind: "defer", entry };
    }
    budget.remaining--;
    return { kind: "fetch", entry };
  });

  const run = async (plan: Plan<L>): Promise<Outcome> => {
    if (plan.kind === "defer") return { job: null };
    if (plan.kind === "light") return { job: markLight(handlers.toLight(plan.entry.item)) };
    if (budget.circuit !== "closed") {
      if (budget.circuit === "broken") return { job: markLight(handlers.toLight(plan.entry.item)) };
      stats.deferred++;
      return { job: null };
    }
    try {
      const detail = await handlers.fetchDetail(plan.entry.item);
      budget.consecutiveFailures = 0;
      stats.detailed++;
      const full = handlers.toFull(plan.entry.item, detail);
      if (full) return { job: full };
      // toFull reports the schema problem via tctx.drift; fall back to list data.
      stats.invalidItems++;
      return { job: markLight(handlers.toLight(plan.entry.item)) };
    } catch (e) {
      if (tctx.signal.aborted) throw e;
      if (isGone(e)) {
        stats.gone++;
        return { job: null };
      }
      stats.detailErrors++;
      budget.consecutiveFailures++;
      if (isThrottled(e)) {
        // An anti-bot challenge trips the breaker at once; plain throttling after a few in a row.
        if ((isBlocked(e) || budget.consecutiveFailures >= THROTTLE_TRIP) && budget.circuit === "closed") {
          budget.circuit = "throttled";
          log.warn("detail requests throttled — deferring remaining unknown jobs to the next run", { error: describeError(e) });
        }
        stats.deferred++;
        return { job: null };
      }
      if (budget.consecutiveFailures >= BROKEN_TRIP && budget.circuit === "closed") {
        budget.circuit = "broken";
        log.warn("detail endpoint failing — emitting list data only for the rest of this run", { error: describeError(e) });
      } else if (stats.detailErrors <= 3) {
        log.warn("detail fetch failed — using list data", { id: plan.entry.id, error: describeError(e) });
      }
      return { job: markLight(handlers.toLight(plan.entry.item)) };
    }
  };

  for await (const outcome of orderedMap(plans, budget.concurrency, run)) {
    if (outcome.job) yield outcome.job;
  }
}
