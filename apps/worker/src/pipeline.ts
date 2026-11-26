import { randomUUID } from "node:crypto";
import { validateJobInput, validateRawJob, type CompanyTarget, type JobInput, type RawJob, type RunReport } from "@easyjobs/contract";
import { HttpError, type Env, type HttpClient, type Logger, type ScrapeContext, type Scraper } from "@easyjobs/contract/node";
import { abortKind } from "./abort";
import type { NormalizerHandle } from "./discovery/normalizer";
import type { RegistryHandle } from "./discovery/registry";
import type { RunOutcome } from "./scheduler";
import type { JobSink } from "./sink";
import type { RunStatus } from "./state";
import { Tally, errorMessage, formatDuration, isObject, truncate } from "./util";

export interface PipelineContext {
  /** One shared polite client for every scraper (per-host limits apply across all of them). */
  http: HttpClient;
  normalizer: NormalizerHandle;
  registry: RegistryHandle;
  sink: JobSink;
  log: Logger;
  env: Env;
  batchSize: number;
  maxJobsPerRun: number;
}

export interface PipelineInput {
  taskId: string;
  scraper: Scraper;
  target: CompanyTarget | null;
  signal: AbortSignal;
  since?: Date;
  limit?: number;
  previousTargetCounts?: Record<string, number>;
  annotate?: (draft: { failure: boolean }) => string[];
  runId?: string;
}

/**
 * Worker extensions to ScrapeContext (not in contract v1.0.0; proposed in docs/contract-requests/P05.md, asked for by P09/P10/P11).
 * Scrapers call them with optional chaining, e.g. `(ctx as { markIncomplete?: (r?: string) => void }).markIncomplete?.("stopped at known ids")`.
 */
/** The run hooks are part of the contract since 1.1 (`ScrapeContext.markIncomplete/report/markSeen`); the worker always provides them. */
export type WorkerScrapeExtensions = Required<Pick<ScrapeContext, "markIncomplete" | "report" | "markSeen">>;

/** Default pause for an anti-bot wall without a retry time (`SourceBlockedError`, 999, Cloudflare challenge). */
const BLOCKED_DEFAULT_PAUSE_MS = 6 * 3_600_000;

function blockedInfo(e: unknown): { reason: string; retryAt: number } | null {
  if (!(e instanceof Error)) return null;
  const blockedHttp = e instanceof HttpError && e.blocked;
  if (e.name !== "SourceBlockedError" && !blockedHttp) return null;
  const at = (e as { retryAt?: unknown }).retryAt;
  const retry = at instanceof Date ? at.getTime() : typeof at === "string" ? Date.parse(at) : Number.NaN;
  return { reason: truncate(errorMessage(e), 300), retryAt: Number.isFinite(retry) ? retry : Date.now() + BLOCKED_DEFAULT_PAUSE_MS };
}

export interface SweepResult {
  target: string;
  seen: number;
  outcome: "sent" | "spooled" | "failed" | "written" | "deferred";
  closed?: number;
  note?: string;
}

export interface PipelineCounts {
  raw: number;
  valid: number;
  invalid: number;
  duplicates: number;
  batches: number;
  sent: number;
  spooled: number;
  written: number;
  failedJobs: number;
  inserted: number;
  updated: number;
  merged: number;
  rejected: number;
  coerced: number;
}

export interface PipelineResult extends RunOutcome {
  runId: string;
  taskId: string;
  report: RunReport;
  counts: PipelineCounts;
  sweeps: SweepResult[];
  /** Eligible for a sweep: finished cleanly, full listing (no since), no limit. */
  complete: boolean;
  invalidReasons: Record<string, number>;
}

/** Sweep safety guard: a target that suddenly shows 0 jobs, or < 20 % of a previous ≥ 20, must be confirmed by the next complete run. */
export function sweepDeferred(seen: number, previous: number | undefined): boolean {
  if (seen === 0) return previous === undefined || previous > 0;
  return previous !== undefined && previous >= 20 && seen < previous * 0.2;
}

type AnyIterable<T> = AsyncIterable<T> | Iterable<T>;

function asIterable(value: unknown): AnyIterable<unknown> | null {
  if (value && (typeof value === "object" || typeof value === "function")) {
    if (typeof (value as AsyncIterable<unknown>)[Symbol.asyncIterator] === "function") return value as AsyncIterable<unknown>;
    if (typeof (value as Iterable<unknown>)[Symbol.iterator] === "function") return value as Iterable<unknown>;
  }
  return null;
}

/** Iterates a scraper's output, but stops promptly on abort even if the scraper ignores its signal. */
async function* abortable<T>(source: AnyIterable<T>, signal: AbortSignal): AsyncGenerator<T, void, undefined> {
  const it: AsyncIterator<T> | Iterator<T> =
    Symbol.asyncIterator in source ? (source as AsyncIterable<T>)[Symbol.asyncIterator]() : (source as Iterable<T>)[Symbol.iterator]();
  let rejectAbort: (reason: unknown) => void = () => undefined;
  const aborted = new Promise<never>((_, reject) => {
    rejectAbort = reject;
  });
  aborted.catch(() => undefined);
  const onAbort = (): void => rejectAbort(signal.reason);
  if (signal.aborted) onAbort();
  else signal.addEventListener("abort", onAbort, { once: true });
  let done = false;
  try {
    for (;;) {
      const next = Promise.resolve(it.next());
      next.catch(() => undefined); // an orphaned scraper promise must never become an unhandled rejection
      const r = await Promise.race([next, aborted]);
      if (r.done) {
        done = true;
        return;
      }
      yield r.value;
    }
  } finally {
    signal.removeEventListener("abort", onAbort);
    if (!done) {
      try {
        Promise.resolve(it.return?.()).catch(() => undefined);
      } catch {
        /* ignore */
      }
    }
  }
}

/** Fill-ins for sloppy scrapers: wrong/missing `source`, missing nullable fields, ATS target left null. */
function prepare(item: unknown, source: string, taskTarget: string | null, fixes: Tally): unknown {
  if (!isObject(item)) return item;
  const patch: Record<string, unknown> = {};
  if (item.source !== source) {
    patch.source = source;
    fixes.add(`source "${String(item.source)}" → "${source}"`);
  }
  if (item.target === undefined || (item.target === null && taskTarget)) {
    patch.target = taskTarget;
    if (item.target === undefined) fixes.add("target missing");
  }
  for (const k of ["applyUrl", "descriptionHtml", "postedAt"] as const) {
    if (item[k] === undefined) {
      patch[k] = null;
      fixes.add(`${k} missing`);
    }
  }
  if (item.locations === undefined) {
    patch.locations = [];
    fixes.add("locations missing");
  }
  return Object.keys(patch).length > 0 ? { ...item, ...patch } : item;
}

const jsonLogs = (): boolean => process.env.LOG_FORMAT === "json";

/** Runs one task end to end: scrape → validate → normalize → validate → dedupe → batches → sweep → run report. */
export async function runPipeline(input: PipelineInput, ctx: PipelineContext): Promise<PipelineResult> {
  const startedAt = new Date();
  const runId = input.runId ?? randomUUID();
  const { scraper } = input;
  const source = scraper.id;
  const targetSlug = input.target?.slug ?? null;
  const log = ctx.log;
  const counts: PipelineCounts = {
    raw: 0, valid: 0, invalid: 0, duplicates: 0, batches: 0, sent: 0, spooled: 0, written: 0,
    failedJobs: 0, inserted: 0, updated: 0, merged: 0, rejected: 0, coerced: 0,
  };
  const errors: string[] = [];
  const invalidReasons = new Tally();
  const fixes = new Tally();
  const rejections = new Tally();
  const seen = new Map<string, Set<string>>();
  const fingerprints = new Set<string>();
  let batch: JobInput[] = [];
  let invalidLogged = 0;

  // 1a. Known ids (GET /v1/ingest/known), fetched once per run; unavailable → every job counts as new.
  let known: Set<string> | null = null;
  try {
    known = await ctx.sink.known(source, targetSlug);
  } catch {
    known = null;
  }

  const companyCache = new Map<string, CompanyTarget | undefined>();
  const lookupCompany = (raw: RawJob): CompanyTarget | undefined => {
    if (input.target) return input.target;
    for (const key of [raw.target, raw.companySlug]) {
      const hit = key ? ctx.registry.get(key) : undefined;
      if (hit) return hit;
    }
    const cacheKey = `${raw.company}\u0000${raw.companyDomain ?? ""}`.toLowerCase();
    if (companyCache.has(cacheKey)) return companyCache.get(cacheKey);
    const hit = ctx.registry.find(raw.company) ?? (raw.companyDomain ? ctx.registry.find(raw.companyDomain) : undefined);
    companyCache.set(cacheKey, hit);
    return hit;
  };

  const flush = async (): Promise<void> => {
    if (batch.length === 0) return;
    const jobs = batch;
    batch = [];
    counts.batches++;
    let res;
    try {
      res = await ctx.sink.jobs({ source, runId, jobs });
    } catch (e) {
      res = { status: "failed" as const, error: errorMessage(e) };
    }
    if (res.status === "sent") {
      counts.sent += jobs.length;
      counts.inserted += res.data.inserted;
      counts.updated += res.data.updated;
      counts.merged += res.data.merged;
      counts.rejected += res.data.rejected.length;
      for (const r of res.data.rejected) rejections.add(truncate(r.error, 120));
    } else if (res.status === "spooled") counts.spooled += jobs.length;
    else if (res.status === "written") counts.written += jobs.length;
    else {
      counts.failedJobs += jobs.length;
      errors.push(`ingest batch ${counts.batches} (${jobs.length} jobs) failed: ${res.error}`);
    }
  };

  let incomplete: string | null = (scraper as { sweep?: unknown }).sweep === false ? "scraper opted out of sweeps (sweep: false)" : null;
  let reported: { status: "partial" | "blocked"; reason: string; retryAt: number | null } | null = null;
  const scraperStats: Record<string, number> = {};
  const scrapeCtx: ScrapeContext & WorkerScrapeExtensions = {
    http: ctx.http,
    log: log,
    signal: input.signal,
    env: ctx.env,
    limit: input.limit,
    since: input.since,
    targets: input.target ? [input.target] : undefined,
    isKnown: (id: string) => known !== null && known.has(id),
    markIncomplete: (reason?: string) => {
      incomplete = truncate(String(reason ?? "marked incomplete by the scraper"), 200);
    },
    markSeen: (sourceJobIds: string[], target?: string | null) => {
      const t = typeof target === "string" && target ? target : targetSlug;
      if (!t || !Array.isArray(sourceJobIds)) return;
      let ids = seen.get(t);
      if (!ids) seen.set(t, (ids = new Set()));
      for (const id of sourceJobIds) if (typeof id === "string" && id.trim()) ids.add(id);
    },
    report: (statusOrStats, info) => {
      if (statusOrStats === "partial" || statusOrStats === "blocked") {
        const retry = info?.retryAt instanceof Date ? info.retryAt.getTime() : typeof info?.retryAt === "string" ? Date.parse(info.retryAt) : Number.NaN;
        reported = { status: statusOrStats, reason: truncate(String(info?.reason ?? statusOrStats), 300), retryAt: Number.isFinite(retry) ? retry : null };
      } else if (isObject(statusOrStats)) {
        for (const [k, v] of Object.entries(statusOrStats)) {
          if (typeof v === "number" && Number.isFinite(v) && Object.keys(scraperStats).length < 50) scraperStats[k.slice(0, 60)] = v;
        }
      }
    },
  };

  // 1–4. Scrape, validate, normalize, validate, dedupe — streaming, batches go out as they fill (backpressure).
  let scrapeError: unknown = null;
  let limitHit = false;
  let capHit = false;
  try {
    let produced: unknown = scraper.scrape(scrapeCtx);
    if (produced && typeof (produced as PromiseLike<unknown>).then === "function") produced = await (produced as PromiseLike<unknown>);
    const iterable = asIterable(produced);
    if (!iterable) throw new Error("scrape() did not return an AsyncIterable");
    for await (const item of abortable(iterable, input.signal)) {
      counts.raw++;
      const prepared = prepare(item, source, targetSlug, fixes);
      if (isObject(prepared) && typeof prepared.sourceJobId === "string" && prepared.sourceJobId.trim()) {
        const t = typeof prepared.target === "string" && prepared.target ? prepared.target : targetSlug;
        if (t) {
          let ids = seen.get(t);
          if (!ids) seen.set(t, (ids = new Set()));
          ids.add(prepared.sourceJobId);
        }
      }
      const rawProblems = validateRawJob(prepared as Partial<RawJob>);
      let job: JobInput | null = null;
      let problems: string[] = rawProblems;
      if (rawProblems.length === 0) {
        const raw = prepared as RawJob;
        try {
          job = await ctx.normalizer.normalize(raw, { sourceName: scraper.name, company: lookupCompany(raw), now: startedAt });
          // Contract 1.1: the source's credit line travels with the job (→ JobSourceRef.attribution).
          if (job && scraper.attribution && job.extra.attribution === undefined) job.extra = { ...job.extra, attribution: scraper.attribution };
          problems = validateJobInput(job).map((p) => `normalized: ${p}`);
        } catch (e) {
          problems = [`normalizeJob threw: ${truncate(errorMessage(e), 120)}`];
        }
      }
      if (problems.length > 0 || !job) {
        counts.invalid++;
        for (const p of problems) invalidReasons.add(p);
        if (invalidLogged++ < 3) {
          log.debug("invalid job dropped", { sourceJobId: isObject(prepared) ? prepared.sourceJobId : undefined, problems });
        }
      } else if (fingerprints.has(job.fingerprint)) {
        counts.duplicates++;
      } else {
        fingerprints.add(job.fingerprint);
        counts.valid++;
        batch.push(job);
        if (batch.length >= ctx.batchSize) await flush();
      }
      if (input.limit !== undefined && counts.raw >= input.limit) {
        limitHit = true;
        break;
      }
      if (counts.raw >= ctx.maxJobsPerRun) {
        capHit = true;
        errors.push(`stopped at WORKER_MAX_JOBS_PER_RUN=${ctx.maxJobsPerRun} raw jobs`);
        break;
      }
    }
  } catch (e) {
    // An anti-bot wall is a graceful "blocked" stop (pause until retryAt), not a crash to retry.
    const blocked = blockedInfo(e);
    if (blocked) reported = { status: "blocked", reason: blocked.reason, retryAt: blocked.retryAt };
    else scrapeError = e;
  }
  // 5. Ship whatever is left — partial results of a failed run are still worth ingesting.
  await flush();

  const aborted = abortKind(input.signal);
  let status: RunStatus = "ok";
  let failure = false;
  if (aborted || scrapeError) {
    status = counts.valid > 0 ? "partial" : "error";
    failure = aborted !== "shutdown" && counts.valid === 0;
    errors.unshift(
      aborted === "timeout"
        ? `${errorMessage(input.signal.reason)} (${counts.raw} jobs read)`
        : aborted === "shutdown"
          ? `aborted: worker shutting down (${counts.raw} jobs read)`
          : `scrape failed: ${errorMessage(scrapeError)}`,
    );
  } else if (counts.raw > 0 && counts.valid === 0) {
    status = "error";
    failure = true;
    errors.unshift(`all ${counts.raw} jobs were invalid`);
  }
  const graceful = reported as { status: "partial" | "blocked"; reason: string; retryAt: number | null } | null;
  if (graceful && status !== "error") {
    status = "partial";
    // A scraper that stopped gracefully handled the problem; only "blocked" without a retry time gets the backoff path.
    failure = graceful.status === "blocked" && graceful.retryAt === null && counts.valid === 0;
  } else if (graceful && status === "error" && aborted === null && scrapeError === null) {
    failure = graceful.status === "blocked" && graceful.retryAt === null;
  }
  if (graceful) {
    errors.unshift(`${graceful.status} (reported by scraper): ${graceful.reason}${graceful.retryAt !== null ? ` — retry after ${new Date(graceful.retryAt).toISOString()}` : ""}`);
  }
  if (status === "ok" && counts.failedJobs > 0) status = "partial";
  if (counts.invalid > 0) errors.push(`${counts.invalid} invalid jobs: ${invalidReasons.summary(4)}`);
  if (counts.rejected > 0) errors.push(`${counts.rejected} jobs rejected by the API: ${rejections.summary(3)}`);
  if (fixes.size > 0) {
    counts.coerced = fixes.top(100).reduce((n, [, v]) => n + v, 0);
    log.warn(`${input.taskId}: scraper output needed fix-ups (contract: prompts.md §0.2 RawJob)`, { fixes: fixes.toJSON() });
  }

  // 6. Sweep only after a complete run: no error, full listing (no since), no limit, nothing dropped.
  const complete =
    status === "ok" && !limitHit && !capHit && input.limit === undefined && input.since === undefined && counts.failedJobs === 0 && incomplete === null;
  if (status === "ok" && incomplete !== null) log.debug(`${input.taskId}: no sweep — ${incomplete}`);
  const sweeps: SweepResult[] = [];
  let targetCounts: Record<string, number> | null = null;
  if (complete) {
    const prev = input.previousTargetCounts ?? {};
    const next: Record<string, number> = {};
    const candidates = new Set<string>([...seen.keys(), ...Object.keys(prev)]);
    if (targetSlug) candidates.add(targetSlug);
    for (const target of [...candidates].sort()) {
      const ids = seen.get(target) ?? new Set<string>();
      if (sweepDeferred(ids.size, prev[target])) {
        sweeps.push({ target, seen: ids.size, outcome: "deferred", note: `${ids.size} jobs vs ${prev[target] ?? "none"} last time — needs confirmation by the next run` });
        next[target] = ids.size;
        continue;
      }
      const res = await ctx.sink.sweep({ source, target, seenSourceJobIds: [...ids] });
      if (res.status === "sent") sweeps.push({ target, seen: ids.size, outcome: "sent", closed: res.data.closed });
      else if (res.status === "failed") {
        sweeps.push({ target, seen: ids.size, outcome: "failed", note: res.error });
        errors.push(`sweep ${target} failed: ${res.error}`);
      } else sweeps.push({ target, seen: ids.size, outcome: res.status });
      if (ids.size > 0 || target === targetSlug) next[target] = ids.size;
    }
    targetCounts = next;
    const deferred = sweeps.filter((s) => s.outcome === "deferred");
    if (deferred.length > 0) log.warn(`${input.taskId}: sweep deferred by the safety guard`, { targets: deferred.map((s) => `${s.target} (${s.note})`) });
  }

  // 7. Run report.
  const finishedAt = new Date();
  const extra = input.annotate?.({ failure }) ?? [];
  const report: RunReport = {
    runId,
    source,
    target: targetSlug,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    status,
    emitted: counts.valid,
    invalid: counts.invalid,
    errors: [...errors, ...extra].slice(0, 20).map((e) => truncate(e, 500)),
  };
  const runRes = await ctx.sink.run(report).catch((e: unknown) => ({ status: "failed" as const, error: errorMessage(e) }));
  if (runRes.status === "failed") log.warn(`${input.taskId}: run report not delivered`, { error: runRes.error });

  const summary = formatSummary({ taskId: input.taskId, status, startedAt, finishedAt, counts, sweeps, since: input.since, limited: limitHit || input.limit !== undefined, sinkKind: ctx.sink.kind, error: errors[0], incomplete: status === "ok" ? incomplete : null });
  return {
    status,
    failure,
    aborted,
    startedAt,
    finishedAt,
    emitted: counts.valid,
    invalid: counts.invalid,
    errors: report.errors,
    full: input.since === undefined,
    targetCounts,
    retryAt: graceful?.retryAt ?? null,
    stats: Object.keys(scraperStats).length > 0 ? scraperStats : null,
    summary,
    meta: jsonLogs() ? { runId, counts, sweeps, complete } : undefined,
    runId,
    taskId: input.taskId,
    report,
    counts,
    sweeps,
    complete,
    invalidReasons: invalidReasons.toJSON(),
  };
}

/** One concise line per task: "ok greenhouse:stripe 3.2s | 120 read, 118 valid, 2 invalid, 0 dup | sent 118 (5 new, 110 upd, 3 merged) | sweep 1 target (4 closed)". */
export function formatSummary(x: {
  taskId: string;
  status: RunStatus;
  startedAt: Date;
  finishedAt: Date;
  counts: PipelineCounts;
  sweeps: SweepResult[];
  since?: Date;
  limited: boolean;
  sinkKind: JobSink["kind"];
  error?: string;
  incomplete?: string | null;
}): string {
  const c = x.counts;
  const parts = [
    `${x.status.padEnd(7)} ${x.taskId} ${formatDuration(x.finishedAt.getTime() - x.startedAt.getTime())}${x.since ? " (incremental)" : ""}${x.limited ? " (limited)" : ""}`,
    `${c.raw} read, ${c.valid} valid, ${c.invalid} invalid, ${c.duplicates} dup`,
  ];
  const out: string[] = [];
  if (c.sent > 0) out.push(`sent ${c.sent} (${c.inserted} new, ${c.updated} upd, ${c.merged} merged${c.rejected ? `, ${c.rejected} rejected` : ""})`);
  if (c.spooled > 0) out.push(`spooled ${c.spooled}`);
  if (c.written > 0) out.push(`wrote ${c.written}`);
  if (c.failedJobs > 0) out.push(`failed ${c.failedJobs}`);
  if (out.length > 0) parts.push(out.join(", "));
  if (x.sweeps.length > 0) {
    const closed = x.sweeps.reduce((n, s) => n + (s.closed ?? 0), 0);
    const deferred = x.sweeps.filter((s) => s.outcome === "deferred").length;
    const spooled = x.sweeps.filter((s) => s.outcome === "spooled").length;
    const label = x.sinkKind === "dry-run" ? "would sweep" : "sweep";
    parts.push(`${label} ${x.sweeps.length - deferred} target(s)${x.sinkKind === "api" && closed > 0 ? `, ${closed} closed` : ""}${spooled ? `, ${spooled} spooled` : ""}${deferred ? `, ${deferred} deferred` : ""}`);
  } else if (x.incomplete) {
    parts.push(`no sweep (${truncate(x.incomplete, 80)})`);
  } else if (x.status === "ok" && !x.since && !x.limited) {
    parts.push("no sweep target");
  } else {
    parts.push("no sweep");
  }
  if (x.status !== "ok" && x.error) parts.push(truncate(x.error, 160));
  return parts.join(" | ");
}
