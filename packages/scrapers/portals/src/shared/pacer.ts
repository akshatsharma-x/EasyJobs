import type { Clock, RandomSource } from "./clock";

/** Hard floor from the P11 rules: never faster than one request per 4 s. */
export const MIN_GAP_FLOOR_MS = 4000;

export interface PacerOptions {
  /** Lower bound of the random gap between the end of one request and the start of the next (≥ 4000). */
  minGapMs: number;
  /** Upper bound of the random gap (≥ minGapMs). */
  maxGapMs: number;
  clock: Clock;
  random: RandomSource;
}

/**
 * One-request-at-a-time pacer: `acquire()` waits until a random 4–6 s gap has passed since the
 * previous request *finished*, then hands out the slot; `release()` marks the request as done.
 * Measuring from completion (not start) keeps slow responses and browser page loads from bunching up.
 * A pacer is meant to live for the whole process (one per portal), so back-to-back runs stay paced too.
 */
export interface Pacer {
  acquire(signal?: AbortSignal): Promise<number>;
  release(): void;
  readonly minGapMs: number;
  readonly maxGapMs: number;
}

export function createPacer(options: PacerOptions): Pacer {
  const minGapMs = Math.max(MIN_GAP_FLOOR_MS, options.minGapMs);
  const maxGapMs = Math.max(minGapMs, options.maxGapMs);
  const { clock, random } = options;
  let nextAt = 0;
  let tail: Promise<void> = Promise.resolve();
  let releaseCurrent: (() => void) | null = null;

  return {
    minGapMs,
    maxGapMs,
    async acquire(signal) {
      // Serialize holders: a second caller waits for the first to release.
      const previous = tail;
      let done!: () => void;
      tail = new Promise<void>((resolve) => (done = resolve));
      await previous;
      const waitMs = Math.max(0, nextAt - clock.now());
      try {
        if (waitMs > 0) await clock.sleep(waitMs, signal);
      } catch (e) {
        done();
        throw e;
      }
      releaseCurrent = () => {
        nextAt = clock.now() + minGapMs + (maxGapMs - minGapMs) * random();
        done();
      };
      return waitMs;
    },
    release() {
      const r = releaseCurrent;
      releaseCurrent = null;
      r?.();
    },
  };
}
