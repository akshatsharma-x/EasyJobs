import { sleep } from "@easyjobs/contract/node";

/**
 * Serialises request starts so that consecutive starts are at least `gapMs` apart.
 * Sits on top of the contract HTTP client's own per-host spacing (750 ms in the worker), which is
 * too fast for Internshala's ≤ 1 request / 1.5 s budget.
 */
export class Throttle {
  readonly gapMs: number;
  private nextAt = 0;
  private tail: Promise<void> = Promise.resolve();

  constructor(gapMs: number) {
    this.gapMs = Math.max(0, gapMs);
  }

  /** Resolves when the caller may start its request. Rejects if `signal` aborts while waiting. */
  wait(signal?: AbortSignal | null): Promise<void> {
    const turn = this.tail.then(async () => {
      if (signal?.aborted) throw signal.reason;
      const now = Date.now();
      const startAt = Math.max(now, this.nextAt);
      this.nextAt = startAt + this.gapMs;
      // Timers may fire ~1 ms early relative to Date.now(); re-sleep so the gap is never undercut.
      for (let left = startAt - now; left > 0; left = startAt - Date.now()) await sleep(left, signal);
    });
    this.tail = turn.catch(() => undefined);
    return turn;
  }
}

/**
 * Kept on globalThis (registered symbol) rather than in module scope: the worker re-scans and may re-import
 * scraper packages, and a fresh module instance must still share the throttle of a run that is in progress.
 */
const REGISTRY = Symbol.for("easyjobs.scraper-internshala.throttles");
const holder = globalThis as typeof globalThis & { [REGISTRY]?: Map<string, Throttle> };
const shared: Map<string, Throttle> = (holder[REGISTRY] ??= new Map<string, Throttle>());

/**
 * One throttle per key for the whole process: "internshala-internships" and "internshala-jobs" may run
 * concurrently in the worker, and together they must still respect the per-site budget.
 */
export function sharedThrottle(key: string, gapMs: number): Throttle {
  const existing = shared.get(key);
  if (existing && existing.gapMs >= gapMs) return existing;
  const t = new Throttle(gapMs);
  shared.set(key, t);
  return t;
}
