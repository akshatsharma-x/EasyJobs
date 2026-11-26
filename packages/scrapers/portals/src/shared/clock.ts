import { sleep } from "@easyjobs/contract/node";

/** Injectable time source so pacing and backoff are testable without real waits. */
export interface Clock {
  now(): number;
  sleep(ms: number, signal?: AbortSignal): Promise<void>;
}

export const systemClock: Clock = {
  now: () => Date.now(),
  sleep: (ms, signal) => sleep(ms, signal),
};

export type RandomSource = () => number;

export const HOUR_MS = 3_600_000;
export const DAY_MS = 24 * HOUR_MS;

/** "2.0 h", "45 min", "3.5 d" — for log lines. */
export function formatDuration(ms: number): string {
  if (ms >= 2 * DAY_MS) return `${(ms / DAY_MS).toFixed(1)} d`;
  if (ms >= HOUR_MS) return `${(ms / HOUR_MS).toFixed(1)} h`;
  if (ms >= 60_000) return `${Math.round(ms / 60_000)} min`;
  return `${Math.round(ms / 1000)} s`;
}
