import type { Logger } from "@easyjobs/contract/node";
import { ShutdownAbort, TaskTimeout } from "./abort";
import type { RunStatus, StateStore, TaskState } from "./state";
import type { TaskDef } from "./tasks";
import { errorMessage, formatClock, formatDuration, parseTime, toIso } from "./util";

export interface SchedulerConfig {
  concurrency: number;
  perScraperConcurrency: number;
  taskTimeoutMs: number;
  jitterRatio: number;
  backoffBaseMs: number;
  breakerThreshold: number;
  breakerPauseMs: number;
  initialSpreadMs: number;
  fullRefreshMs: number;
  sinceOverlapMs: number;
}

export interface RunRequest {
  task: TaskDef;
  signal: AbortSignal;
  manual: boolean;
  /** Incremental cutoff (start of last successful run − overlap); undefined on full runs. */
  since: Date | undefined;
  full: boolean;
  previousTargetCounts: Record<string, number>;
  /** Extra RunReport error lines decided by the scheduler (circuit breaker) for a draft outcome. */
  annotate: (draft: { failure: boolean }) => string[];
}

export interface RunOutcome {
  status: RunStatus;
  /** Counts towards backoff / circuit breaker. */
  failure: boolean;
  aborted: "shutdown" | "timeout" | null;
  startedAt: Date;
  finishedAt: Date;
  emitted: number;
  invalid: number;
  errors: string[];
  /** Ran without `since`. */
  full: boolean;
  /** Sweep-guard counts after a complete run; null keeps the previous ones. */
  targetCounts: Record<string, number> | null;
  /** The source asked (ctx.report) not to be run again before this time (ms since epoch). */
  retryAt?: number | null;
  /** Numeric stats reported by the scraper (ctx.report({...})). */
  stats?: Record<string, number> | null;
  /** One-line human summary; the scheduler logs it with the next run time. */
  summary?: string;
  meta?: Record<string, unknown>;
}

export type TaskRunner = (req: RunRequest) => Promise<RunOutcome>;

export interface TaskStatus {
  id: string;
  source: string;
  target: string | null;
  package: string;
  priority: number | null;
  intervalMinutes: number;
  enabled: boolean;
  disabledReason: string | null;
  running: boolean;
  runningSince: string | null;
  manualPending: boolean;
  lastRunAt: string | null;
  lastFinishedAt: string | null;
  lastDurationMs: number | null;
  lastStatus: RunStatus | null;
  emitted: number;
  invalid: number;
  errors: string[];
  lastSuccessAt: string | null;
  nextRunAt: string | null;
  paused: boolean;
  pausedUntil: string | null;
  pausedReason: string | null;
  consecutiveFailures: number;
  runs: number;
  failures: number;
  /** Numeric stats the scraper reported on its last run (ctx.report). */
  stats: Record<string, number> | null;
}

export interface TriggerResult {
  unknown: boolean;
  queued: string[];
  running: string[];
  disabled: string[];
}

export interface SchedulerOptions {
  config: SchedulerConfig;
  store: StateStore;
  runner: TaskRunner;
  log: Logger;
  now?: () => number;
  random?: () => number;
  /** Max timer delay (re-evaluates the queue at least this often). */
  heartbeatMs?: number;
  onRunFinished?: (task: TaskDef, outcome: RunOutcome, nextAt: number) => void;
}

/** Due time is aged by priority: p2 waits 5 min behind p1, p3 10 min — a strong preference without starvation. */
export const PRIORITY_AGING_MS = 5 * 60_000;
/** Minimum gap between the end of a run and the next one. */
export const MIN_GAP_MS = 60_000;
/**
 * First runs of feed scrapers (no target) are staggered over at most 5 minutes: each one hits a different host,
 * so there is no herd to avoid — only a startup spike. ATS targets share a few hosts and get the full window.
 */
export const FEED_SPREAD_MS = 5 * 60_000;

/** Window over which first runs (or overdue runs after a restart) of a task are spread. */
export function spreadWindowMs(task: Pick<TaskDef, "intervalMs" | "target">, initialSpreadMs: number): number {
  return Math.min(task.intervalMs, initialSpreadMs, task.target ? Number.POSITIVE_INFINITY : FEED_SPREAD_MS);
}
const HEARTBEAT_MS = 30_000;

interface Runtime {
  def: TaskDef;
  nextAt: number;
  running: boolean;
  runningSince: number | null;
  controller: AbortController | null;
  manual: boolean;
  removed: boolean;
}

const prio = (rt: Runtime): number => rt.def.priority ?? 1;
const jsonLogs = (): boolean => process.env.LOG_FORMAT === "json";

export class Scheduler {
  private readonly rts = new Map<string, Runtime>();
  private readonly perScraper = new Map<string, number>();
  private readonly promises = new Map<string, Promise<void>>();
  private runningCount = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private started = false;
  private stopping = false;
  private idleWaiters: (() => void)[] = [];

  constructor(private readonly o: SchedulerOptions) {}

  private get cfg(): SchedulerConfig {
    return this.o.config;
  }
  private now(): number {
    return this.o.now ? this.o.now() : Date.now();
  }
  private rand(): number {
    return this.o.random ? this.o.random() : Math.random();
  }
  /** Symmetric jitter factor in [1 − j, 1 + j]. */
  private jitter(): number {
    return 1 + (this.rand() * 2 - 1) * this.cfg.jitterRatio;
  }
  private state(id: string): TaskState {
    return this.o.store.ensure(id);
  }

  get size(): number {
    return this.rts.size;
  }
  get running(): number {
    return this.runningCount;
  }

  /** Adds/updates/removes tasks. New tasks (and overdue ones after a restart) are spread over their window. */
  setTasks(defs: TaskDef[]): { added: string[]; removed: string[]; updated: string[] } {
    const now = this.now();
    const incoming = new Set(defs.map((d) => d.id));
    const added: string[] = [];
    const removed: string[] = [];
    const updated: string[] = [];
    for (const [id, rt] of this.rts) {
      if (incoming.has(id)) continue;
      removed.push(id);
      if (rt.running) rt.removed = true;
      else this.rts.delete(id);
    }
    const toSpread: Runtime[] = [];
    for (const def of defs) {
      const st = this.state(def.id);
      st.lastSeenAt = toIso(now);
      const existing = this.rts.get(def.id);
      if (existing) {
        const prev = existing.def;
        existing.def = def;
        existing.removed = false;
        if (prev.intervalMs !== def.intervalMs || prev.enabled !== def.enabled || prev.target?.token !== def.target?.token) updated.push(def.id);
        if (prev.intervalMs !== def.intervalMs && !existing.running && !this.isPaused(st, now)) {
          // Cadence got shorter (e.g. priority 3 → 1): don't wait out the old, longer interval.
          if (existing.nextAt > now + def.intervalMs * (1 + this.cfg.jitterRatio)) {
            existing.nextAt = Math.round(now + this.rand() * Math.min(def.intervalMs, this.cfg.initialSpreadMs));
            st.nextRunAt = toIso(existing.nextAt);
          }
        }
        continue;
      }
      const rt: Runtime = { def, nextAt: Number.POSITIVE_INFINITY, running: false, runningSince: null, controller: null, manual: false, removed: false };
      this.rts.set(def.id, rt);
      added.push(def.id);
      const paused = parseTime(st.pausedUntil);
      const planned = parseTime(st.nextRunAt);
      if (paused !== null && paused > now) rt.nextAt = paused;
      else if (planned !== null && planned > now && planned <= now + def.intervalMs * (1 + this.cfg.jitterRatio) + MIN_GAP_MS) rt.nextAt = planned;
      else toSpread.push(rt);
    }
    this.spread(toSpread, now);
    this.o.store.markDirty();
    if (this.started) this.tick();
    return { added, removed, updated };
  }

  /**
   * Stratified spread: within each cadence group (ATS targets vs feeds, same interval), task i of n first runs at
   * now + (i + u·j)·(window/n), window = spreadWindowMs(), u ∈ [0,1), j = jitter ratio. Overdue tasks go first.
   */
  private spread(list: Runtime[], now: number): void {
    const groups = new Map<string, Runtime[]>();
    for (const rt of list) {
      const key = `${rt.def.target ? "ats" : "feed"}:${rt.def.intervalMs}`;
      const g = groups.get(key);
      if (g) g.push(rt);
      else groups.set(key, [rt]);
    }
    for (const group of groups.values()) {
      const planned = (rt: Runtime): number => parseTime(this.state(rt.def.id).nextRunAt) ?? Number.MAX_SAFE_INTEGER;
      group.sort((a, b) => planned(a) - planned(b) || prio(a) - prio(b) || a.def.id.localeCompare(b.def.id));
      const first = group[0];
      if (!first) continue;
      const slot = spreadWindowMs(first.def, this.cfg.initialSpreadMs) / group.length;
      group.forEach((rt, i) => {
        rt.nextAt = Math.round(now + (i + this.rand() * this.cfg.jitterRatio) * slot);
        this.state(rt.def.id).nextRunAt = toIso(rt.nextAt);
      });
    }
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    this.tick();
  }

  private isPaused(st: TaskState, now: number): boolean {
    const until = parseTime(st.pausedUntil);
    return until !== null && until > now;
  }

  private isDue(rt: Runtime, now: number): boolean {
    return !rt.running && !rt.removed && rt.def.enabled && (rt.manual || rt.nextAt <= now);
  }

  /** Lower runs sooner: manual triggers first, then due time aged by priority. */
  private urgency(rt: Runtime): number {
    return rt.manual ? Number.NEGATIVE_INFINITY : rt.nextAt + (prio(rt) - 1) * PRIORITY_AGING_MS;
  }

  private tick(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (!this.started || this.stopping) return;
    const now = this.now();
    const due = [...this.rts.values()]
      .filter((rt) => this.isDue(rt, now))
      .sort((a, b) => this.urgency(a) - this.urgency(b) || a.def.id.localeCompare(b.def.id));
    for (const rt of due) {
      if (this.runningCount >= this.cfg.concurrency) break;
      if ((this.perScraper.get(rt.def.scraperId) ?? 0) >= this.cfg.perScraperConcurrency) continue;
      this.launch(rt, now);
    }
    let next = Number.POSITIVE_INFINITY;
    for (const rt of this.rts.values()) {
      if (!rt.running && !rt.removed && rt.def.enabled && rt.nextAt > now) next = Math.min(next, rt.nextAt);
    }
    const wait = Math.max(0, Math.min(next - now, this.o.heartbeatMs ?? HEARTBEAT_MS));
    this.timer = setTimeout(() => {
      this.timer = null;
      this.tick();
    }, wait);
  }

  private launch(rt: Runtime, now: number): void {
    const def = rt.def;
    const st = this.state(def.id);
    const manual = rt.manual;
    rt.manual = false;
    rt.running = true;
    rt.runningSince = now;
    this.runningCount++;
    this.perScraper.set(def.scraperId, (this.perScraper.get(def.scraperId) ?? 0) + 1);
    const controller = new AbortController();
    rt.controller = controller;
    const timeout = setTimeout(
      () => controller.abort(new TaskTimeout(`timed out after ${formatDuration(this.cfg.taskTimeoutMs)}`)),
      this.cfg.taskTimeoutMs,
    );
    const lastOk = parseTime(st.cursor.since);
    const lastFull = parseTime(st.lastFullSuccessAt);
    // Sweeps need full listings, so a run without `since` happens at least every WORKER_FULL_REFRESH_MINUTES
    // (−10 % tolerance so jittered hourly tasks don't alternate); manual triggers are always full.
    const full =
      manual || this.cfg.fullRefreshMs <= 0 || lastOk === null || lastFull === null || now - lastFull >= this.cfg.fullRefreshMs * 0.9;
    const since = full || lastOk === null ? undefined : new Date(Math.min(now, lastOk - this.cfg.sinceOverlapMs));
    const failuresBefore = st.consecutiveFailures;
    const req: RunRequest = {
      task: def,
      signal: controller.signal,
      manual,
      since,
      full,
      previousTargetCounts: { ...st.targetCounts },
      annotate: ({ failure }) =>
        failure && failuresBefore + 1 >= this.cfg.breakerThreshold
          ? [`circuit breaker opened after ${failuresBefore + 1} consecutive failures — task paused for ${formatDuration(this.cfg.breakerPauseMs)}`]
          : [],
    };
    const promise = (async (): Promise<void> => {
      let outcome: RunOutcome;
      try {
        outcome = await this.o.runner(req);
      } catch (e) {
        const aborted = controller.signal.aborted ? (controller.signal.reason instanceof TaskTimeout ? "timeout" : "shutdown") : null;
        outcome = {
          status: "error",
          failure: aborted !== "shutdown",
          aborted,
          startedAt: new Date(now),
          finishedAt: new Date(this.now()),
          emitted: 0,
          invalid: 0,
          errors: [`runner crashed: ${errorMessage(e)}`],
          full,
          targetCounts: null,
        };
      } finally {
        clearTimeout(timeout);
      }
      try {
        this.finish(rt, outcome);
      } catch (e) {
        this.o.log.error(`scheduler bookkeeping failed for ${def.id}`, { error: errorMessage(e) });
      }
    })();
    this.promises.set(def.id, promise);
  }

  backoffMs(consecutiveFailures: number): number {
    const base = Math.min(this.cfg.breakerPauseMs, this.cfg.backoffBaseMs * 2 ** Math.max(0, consecutiveFailures - 1));
    return Math.round(base * this.jitter());
  }

  private finish(rt: Runtime, o: RunOutcome): void {
    const def = rt.def;
    const now = this.now();
    const st = this.state(def.id);
    rt.running = false;
    rt.runningSince = null;
    rt.controller = null;
    this.promises.delete(def.id);
    this.runningCount = Math.max(0, this.runningCount - 1);
    this.perScraper.set(def.scraperId, Math.max(0, (this.perScraper.get(def.scraperId) ?? 1) - 1));

    st.runs++;
    st.lastRunAt = o.startedAt.toISOString();
    st.lastFinishedAt = o.finishedAt.toISOString();
    st.lastDurationMs = o.finishedAt.getTime() - o.startedAt.getTime();
    st.lastStatus = o.status;
    st.lastEmitted = o.emitted;
    st.lastInvalid = o.invalid;
    st.lastErrors = o.errors.slice(0, 20);
    if (o.targetCounts) st.targetCounts = o.targetCounts;
    st.lastStats = o.stats ?? null;

    let breakerOpened = false;
    let recovered = false;
    if (o.aborted === "shutdown") {
      rt.nextAt = now; // interrupted: run again soon after the restart
    } else if (o.failure) {
      st.consecutiveFailures++;
      st.failures++;
      if (st.consecutiveFailures >= this.cfg.breakerThreshold) {
        rt.nextAt = now + this.cfg.breakerPauseMs;
        st.pausedUntil = toIso(rt.nextAt);
        st.pausedReason = `${st.consecutiveFailures} consecutive failures; last: ${o.errors[0] ?? "unknown error"}`;
        breakerOpened = true;
      } else {
        rt.nextAt = now + this.backoffMs(st.consecutiveFailures);
      }
    } else {
      recovered = st.pausedUntil !== null || st.consecutiveFailures > 0;
      st.consecutiveFailures = 0;
      st.pausedUntil = null;
      st.pausedReason = null;
      if (o.status === "ok") {
        st.lastSuccessAt = st.lastRunAt;
        st.cursor = { since: st.lastRunAt };
        if (o.full) st.lastFullSuccessAt = st.lastRunAt;
      }
      rt.nextAt = Math.round(Math.max(o.startedAt.getTime() + def.intervalMs * this.jitter(), now + MIN_GAP_MS));
    }
    if (o.aborted !== "shutdown" && typeof o.retryAt === "number" && Number.isFinite(o.retryAt) && o.retryAt > rt.nextAt) {
      rt.nextAt = Math.round(o.retryAt); // the source asked us to stay away until then (e.g. blocked / rate limited)
      this.o.log.warn(`${def.id}: scraper asked not to run again before ${toIso(rt.nextAt)}`);
    }
    st.nextRunAt = toIso(rt.nextAt);
    this.o.store.markDirty();
    if (rt.removed) this.rts.delete(def.id);

    this.logRun(def, o, rt.nextAt, now, { breakerOpened, recovered, failures: st.consecutiveFailures });
    this.o.onRunFinished?.(def, o, rt.nextAt);

    if (this.runningCount === 0 && this.idleWaiters.length > 0) {
      const waiters = this.idleWaiters;
      this.idleWaiters = [];
      for (const w of waiters) w();
    }
    this.tick();
  }

  private logRun(def: TaskDef, o: RunOutcome, nextAt: number, now: number, x: { breakerOpened: boolean; recovered: boolean; failures: number }): void {
    const next = o.aborted === "shutdown" ? "next: after restart" : `next ${formatClock(nextAt, now)} (in ${formatDuration(nextAt - now)})`;
    const line = `${o.summary ?? `${o.status} ${def.id} emitted=${o.emitted} invalid=${o.invalid}`} | ${next}`;
    // JSON logs get the full structured record; pretty logs stay one line (the summary already holds the first error).
    const meta = jsonLogs()
      ? { task: def.id, status: o.status, emitted: o.emitted, invalid: o.invalid, errors: o.errors.slice(0, 5), nextRunAt: toIso(nextAt), ...o.meta }
      : o.status !== "ok" && o.errors.length > 1
        ? { moreErrors: o.errors.slice(1, 4) }
        : undefined;
    if (o.status === "ok") this.o.log.info(line, meta);
    else if (o.status === "partial") this.o.log.warn(line, meta);
    else this.o.log.error(line, meta);
    if (x.breakerOpened) {
      this.o.log.error(`circuit breaker OPEN for ${def.id}: ${x.failures} consecutive failures — paused until ${toIso(nextAt)}`, { lastError: o.errors[0] });
    } else if (o.failure) {
      this.o.log.warn(`${def.id} failed (${x.failures}/${this.cfg.breakerThreshold} before the circuit opens) — backing off ${formatDuration(nextAt - now)}`);
    } else if (x.recovered) {
      this.o.log.info(`${def.id} recovered — failure count reset${o.status === "ok" ? "" : ` (status ${o.status})`}`);
    }
  }

  /** Manual trigger (POST /run/:source): runs now even if paused; already-running tasks are left alone. */
  trigger(source: string, target?: string): TriggerResult {
    const matches = [...this.rts.values()].filter((rt) => !rt.removed && rt.def.scraperId === source && (!target || rt.def.target?.slug === target));
    const result: TriggerResult = { unknown: matches.length === 0, queued: [], running: [], disabled: [] };
    for (const rt of matches) {
      if (!rt.def.enabled) result.disabled.push(rt.def.id);
      else if (rt.running) result.running.push(rt.def.id);
      else {
        rt.manual = true;
        result.queued.push(rt.def.id);
      }
    }
    if (result.queued.length > 0) this.tick();
    return result;
  }

  /** Resolves true when nothing is running, false on timeout. */
  whenIdle(timeoutMs = Number.POSITIVE_INFINITY): Promise<boolean> {
    if (this.runningCount === 0) return Promise.resolve(true);
    return new Promise((resolve) => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const done = (v: boolean): void => {
        if (timer) clearTimeout(timer);
        resolve(v);
      };
      this.idleWaiters.push(() => done(true));
      if (Number.isFinite(timeoutMs)) timer = setTimeout(() => done(false), timeoutMs);
    });
  }

  /** Stops scheduling, aborts running tasks (ShutdownAbort) and waits up to graceMs for them to wrap up. */
  async stop(graceMs = 15_000): Promise<void> {
    this.stopping = true;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    for (const rt of this.rts.values()) if (rt.running) rt.controller?.abort(new ShutdownAbort());
    const idle = await this.whenIdle(graceMs);
    if (!idle) this.o.log.warn(`shutdown: ${this.runningCount} task(s) still running after ${formatDuration(graceMs)} — giving up on them`);
    await this.o.store.flush();
  }

  snapshot(): TaskStatus[] {
    const now = this.now();
    return [...this.rts.values()]
      .sort((a, b) => a.def.id.localeCompare(b.def.id))
      .map((rt) => {
        const st = this.state(rt.def.id);
        return {
          id: rt.def.id,
          source: rt.def.scraperId,
          target: rt.def.target?.slug ?? null,
          package: rt.def.packageName,
          priority: rt.def.priority,
          intervalMinutes: Math.round(rt.def.intervalMs / 60_000),
          enabled: rt.def.enabled,
          disabledReason: rt.def.disabledReason,
          running: rt.running,
          runningSince: rt.runningSince !== null ? toIso(rt.runningSince) : null,
          manualPending: rt.manual,
          lastRunAt: st.lastRunAt,
          lastFinishedAt: st.lastFinishedAt,
          lastDurationMs: st.lastDurationMs,
          lastStatus: st.lastStatus,
          emitted: st.lastEmitted,
          invalid: st.lastInvalid,
          errors: st.lastErrors,
          lastSuccessAt: st.lastSuccessAt,
          nextRunAt: rt.def.enabled && Number.isFinite(rt.nextAt) ? toIso(rt.nextAt) : null,
          paused: this.isPaused(st, now),
          pausedUntil: this.isPaused(st, now) ? st.pausedUntil : null,
          pausedReason: this.isPaused(st, now) ? st.pausedReason : null,
          consecutiveFailures: st.consecutiveFailures,
          runs: st.runs,
          failures: st.failures,
          stats: st.lastStats,
        };
      });
  }
}
