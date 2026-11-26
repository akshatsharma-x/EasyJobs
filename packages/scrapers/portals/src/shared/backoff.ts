import type { Env } from "@easyjobs/contract/node";
import { HOUR_MS, type RandomSource } from "./clock";
import { envNumber } from "./env";

/** Exponential backoff measured in hours: base × factor^(strike−1), capped, with a little jitter. */
export interface BackoffPolicy {
  baseMs: number;
  factor: number;
  maxMs: number;
  /** 0.1 → add 0–10 % so several workers don't come back in lockstep. */
  jitter: number;
  /** How long to wait before re-reading a robots.txt that disallowed us. */
  robotsRecheckMs: number;
  /** Pause after robots.txt was unreachable (RFC 9309: treat as full disallow) or the browser was unavailable. */
  unavailablePauseMs: number;
}

export function backoffPolicyFromEnv(env: Env): BackoffPolicy {
  return {
    baseMs: envNumber(env, "PORTALS_BACKOFF_BASE_HOURS", 2, 0.5, 48) * HOUR_MS,
    factor: 2,
    maxMs: envNumber(env, "PORTALS_BACKOFF_MAX_HOURS", 168, 1, 24 * 30) * HOUR_MS,
    jitter: 0.1,
    robotsRecheckMs: envNumber(env, "PORTALS_ROBOTS_RECHECK_HOURS", 24, 1, 24 * 30) * HOUR_MS,
    unavailablePauseMs: HOUR_MS,
  };
}

/** Delay for the n-th consecutive block (n ≥ 1). A longer server Retry-After wins, still capped at maxMs. */
export function backoffDelayMs(strike: number, policy: BackoffPolicy, retryAfterMs: number | null, random: RandomSource): number {
  const n = Math.max(1, Math.floor(strike));
  const exp = Math.min(policy.maxMs, policy.baseMs * policy.factor ** (n - 1));
  const jittered = exp * (1 + policy.jitter * random());
  return Math.min(policy.maxMs, Math.max(jittered, retryAfterMs ?? 0));
}

/** Retry-After as delta-seconds or an HTTP-date → milliseconds from `now`; null if absent/invalid. */
export function parseRetryAfter(value: string | null | undefined, now: number): number | null {
  if (!value) return null;
  const v = value.trim();
  if (/^\d+$/.test(v)) return Number(v) * 1000;
  const at = Date.parse(v);
  return Number.isNaN(at) ? null : Math.max(0, at - now);
}
