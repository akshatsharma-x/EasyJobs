import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Logger } from "@easyjobs/contract/node";
import { errorMessage, isObject, parseTime } from "./util";

export type RunStatus = "ok" | "partial" | "error";

/** Persisted per-task schedule state (apps/worker/.state/state.json). */
export interface TaskState {
  nextRunAt: string | null;
  /** Start of the last run. */
  lastRunAt: string | null;
  lastFinishedAt: string | null;
  lastDurationMs: number | null;
  lastStatus: RunStatus | null;
  lastEmitted: number;
  lastInvalid: number;
  lastErrors: string[];
  /** Start of the last run with status "ok". */
  lastSuccessAt: string | null;
  /** Start of the last "ok" run that was a full listing (no `since`) — what sweeps rely on. */
  lastFullSuccessAt: string | null;
  consecutiveFailures: number;
  pausedUntil: string | null;
  pausedReason: string | null;
  /** Incremental cursor handed to the scraper as ctx.since. */
  cursor: { since: string | null };
  /** Jobs seen per target in the last complete run (sweep safety guard). */
  targetCounts: Record<string, number>;
  runs: number;
  failures: number;
  /** Numeric stats the scraper reported on its last run (ctx.report). */
  lastStats: Record<string, number> | null;
  /** Last time the task existed in the task set (state of vanished tasks is pruned after 30 days). */
  lastSeenAt: string | null;
}

export interface StateFile {
  version: 1;
  updatedAt: string;
  tasks: Record<string, TaskState>;
}

const PRUNE_AFTER_MS = 30 * 86_400_000;

export function emptyTaskState(): TaskState {
  return {
    nextRunAt: null,
    lastRunAt: null,
    lastFinishedAt: null,
    lastDurationMs: null,
    lastStatus: null,
    lastEmitted: 0,
    lastInvalid: 0,
    lastErrors: [],
    lastSuccessAt: null,
    lastFullSuccessAt: null,
    consecutiveFailures: 0,
    pausedUntil: null,
    pausedReason: null,
    cursor: { since: null },
    targetCounts: {},
    runs: 0,
    failures: 0,
    lastStats: null,
    lastSeenAt: null,
  };
}

const str = (v: unknown): string | null => (typeof v === "string" && parseTime(v) !== null ? v : null);
const int = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0);

function reviveTaskState(v: unknown): TaskState {
  const s = emptyTaskState();
  if (!isObject(v)) return s;
  s.nextRunAt = str(v.nextRunAt);
  s.lastRunAt = str(v.lastRunAt);
  s.lastFinishedAt = str(v.lastFinishedAt);
  s.lastDurationMs = typeof v.lastDurationMs === "number" ? v.lastDurationMs : null;
  s.lastStatus = v.lastStatus === "ok" || v.lastStatus === "partial" || v.lastStatus === "error" ? v.lastStatus : null;
  s.lastEmitted = int(v.lastEmitted);
  s.lastInvalid = int(v.lastInvalid);
  s.lastErrors = Array.isArray(v.lastErrors) ? v.lastErrors.filter((e): e is string => typeof e === "string").slice(0, 20) : [];
  s.lastSuccessAt = str(v.lastSuccessAt);
  s.lastFullSuccessAt = str(v.lastFullSuccessAt);
  s.consecutiveFailures = int(v.consecutiveFailures);
  s.pausedUntil = str(v.pausedUntil);
  s.pausedReason = typeof v.pausedReason === "string" ? v.pausedReason : null;
  s.cursor = { since: isObject(v.cursor) ? str(v.cursor.since) : null };
  if (isObject(v.targetCounts)) {
    for (const [k, n] of Object.entries(v.targetCounts)) if (typeof n === "number" && n >= 0) s.targetCounts[k] = n;
  }
  s.runs = int(v.runs);
  s.failures = int(v.failures);
  if (isObject(v.lastStats)) {
    const stats: Record<string, number> = {};
    for (const [k, n] of Object.entries(v.lastStats)) if (typeof n === "number" && Number.isFinite(n)) stats[k] = n;
    s.lastStats = stats;
  }
  s.lastSeenAt = str(v.lastSeenAt);
  return s;
}

/**
 * In-memory task state with optional debounced, atomic persistence (write tmp + rename).
 * `file === null` → memory only (tests, `once`).
 */
export class StateStore {
  private readonly tasks = new Map<string, TaskState>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private dirty = false;

  constructor(
    readonly file: string | null,
    private readonly opts: { log?: Logger; debounceMs?: number } = {},
  ) {}

  static forDir(dir: string, log?: Logger): StateStore {
    return new StateStore(join(dir, "state.json"), { log });
  }

  /** Loads the file if present; a corrupt file is moved aside and the worker starts fresh. */
  load(now = Date.now()): this {
    if (!this.file) return this;
    let text: string;
    try {
      text = readFileSync(this.file, "utf8");
    } catch {
      return this;
    }
    try {
      const parsed: unknown = JSON.parse(text);
      const tasks = isObject(parsed) && isObject(parsed.tasks) ? parsed.tasks : {};
      for (const [id, raw] of Object.entries(tasks)) {
        const st = reviveTaskState(raw);
        const seen = parseTime(st.lastSeenAt);
        if (seen !== null && now - seen > PRUNE_AFTER_MS) continue;
        this.tasks.set(id, st);
      }
    } catch (e) {
      const aside = `${this.file}.corrupt-${now}`;
      try {
        renameSync(this.file, aside);
      } catch {
        /* ignore */
      }
      this.opts.log?.warn(`state file was corrupt — moved to ${aside}, starting fresh`, { error: errorMessage(e) });
    }
    return this;
  }

  get(id: string): TaskState | undefined {
    return this.tasks.get(id);
  }

  ensure(id: string): TaskState {
    let st = this.tasks.get(id);
    if (!st) {
      st = emptyTaskState();
      this.tasks.set(id, st);
    }
    return st;
  }

  entries(): [string, TaskState][] {
    return [...this.tasks.entries()];
  }

  /** Marks state as changed; persisted after a short debounce. */
  markDirty(): void {
    if (!this.file) return;
    this.dirty = true;
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.flushSync();
    }, this.opts.debounceMs ?? 1000);
    this.timer.unref?.();
  }

  flushSync(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (!this.file || !this.dirty) return;
    this.dirty = false;
    const data: StateFile = { version: 1, updatedAt: new Date().toISOString(), tasks: Object.fromEntries(this.tasks) };
    const tmp = `${this.file}.tmp-${process.pid}`;
    try {
      mkdirSync(join(this.file, ".."), { recursive: true });
      writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`);
      renameSync(tmp, this.file);
    } catch (e) {
      this.dirty = true;
      this.opts.log?.error("failed to persist worker state", { file: this.file, error: errorMessage(e) });
    }
  }

  async flush(): Promise<void> {
    this.flushSync();
  }
}
