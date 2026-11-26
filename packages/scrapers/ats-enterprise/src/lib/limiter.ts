import { sleep } from "@easyjobs/contract/node";

/**
 * Per-key politeness gate: at most `concurrency` tasks in flight and at least `gapMs`
 * between task starts. Layered on top of the contract HTTP client's per-host limits,
 * so a tenant stays polite even when the worker's shared client is configured loosely.
 */
export interface Limiter {
  readonly concurrency: number;
  readonly gapMs: number;
  run<T>(fn: () => Promise<T>, signal?: AbortSignal): Promise<T>;
  /** Push the next allowed start at least `ms` into the future (used after 429s). */
  pause(ms: number): void;
}

export function createLimiter(concurrency: number, gapMs: number): Limiter {
  const max = Math.max(1, Math.floor(concurrency));
  const gap = Math.max(0, gapMs);
  let active = 0;
  /** Actual start time of the previous task (not its scheduled slot). */
  let lastStart = Number.NEGATIVE_INFINITY;
  let pausedUntil = 0;
  /** Serialises start decisions so the gap is measured between *actual* starts. */
  let gate: Promise<void> = Promise.resolve();
  const queue: (() => void)[] = [];

  const release = (): void => {
    const waiter = queue.shift();
    if (waiter) waiter();
    else active--;
  };

  async function waitForStartSlot(signal?: AbortSignal): Promise<void> {
    const previous = gate;
    let done!: () => void;
    gate = new Promise<void>((resolve) => (done = resolve));
    try {
      await previous;
      // Loop: timers may fire late (busy event loop), so re-check against the real clock and the
      // previous task's *actual* start — two tasks never start closer than `gap`, even under load.
      for (;;) {
        const now = Date.now();
        const startAt = Math.max(lastStart + gap, pausedUntil);
        if (startAt <= now) break;
        await sleep(startAt - now, signal);
      }
      lastStart = Date.now();
    } finally {
      done();
    }
  }

  async function acquire(signal?: AbortSignal): Promise<void> {
    if (signal?.aborted) throw signal.reason;
    if (active < max) {
      active++;
    } else {
      await new Promise<void>((resolve, reject) => {
        const onAbort = (): void => {
          const i = queue.indexOf(entry);
          if (i >= 0) queue.splice(i, 1);
          reject(signal?.reason);
        };
        const entry = (): void => {
          signal?.removeEventListener("abort", onAbort);
          resolve();
        };
        queue.push(entry);
        signal?.addEventListener("abort", onAbort, { once: true });
      });
    }
    try {
      await waitForStartSlot(signal);
    } catch (e) {
      release();
      throw e;
    }
  }

  return {
    concurrency: max,
    gapMs: gap,
    async run<T>(fn: () => Promise<T>, signal?: AbortSignal): Promise<T> {
      await acquire(signal);
      try {
        return await fn();
      } finally {
        release();
      }
    },
    pause(ms: number): void {
      pausedUntil = Math.max(pausedUntil, Date.now() + Math.max(0, ms));
    },
  };
}

const shared = new Map<string, Limiter>();

/** Process-wide limiter per key (e.g. a tenant host). The first registration's settings win. */
export function sharedLimiter(key: string, concurrency: number, gapMs: number): Limiter {
  let limiter = shared.get(key);
  if (!limiter) {
    limiter = createLimiter(concurrency, gapMs);
    shared.set(key, limiter);
  }
  return limiter;
}

/** Per limiter key: epoch ms until which the source is known to be challenging us (no requests sent). */
const blockedUntil = new Map<string, number>();

export function markBlocked(key: string, untilMs: number): void {
  blockedUntil.set(key, Math.max(untilMs, blockedUntil.get(key) ?? 0));
}

export function blockedFor(key: string, now = Date.now()): number {
  const until = blockedUntil.get(key) ?? 0;
  return until > now ? until : 0;
}

/** Test helper. */
export function resetSharedLimiters(): void {
  shared.clear();
  blockedUntil.clear();
}

/**
 * Map `items` with at most `concurrency` calls in flight, yielding results in input order
 * as soon as each prefix is ready. Stops scheduling new work when the consumer stops.
 */
export async function* orderedMap<T, R>(
  items: readonly T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): AsyncGenerator<R> {
  const width = Math.max(1, Math.floor(concurrency));
  const inflight: Promise<R>[] = [];
  let i = 0;
  const schedule = (): void => {
    while (inflight.length < width && i < items.length) {
      const idx = i++;
      const p = fn(items[idx] as T, idx);
      // Avoid unhandled-rejection warnings for promises we have not awaited yet.
      p.catch(() => undefined);
      inflight.push(p);
    }
  };
  schedule();
  while (inflight.length > 0) {
    const head = inflight.shift() as Promise<R>;
    const value = await head;
    schedule();
    yield value;
  }
}
