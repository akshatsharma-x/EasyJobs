/**
 * Per-IP token bucket: `burst` tokens, refilled at `rps` per second. 429 + Retry-After when empty.
 */
import type { MiddlewareHandler } from "hono";
import { HttpError } from "./http";

interface Bucket {
  tokens: number;
  updated: number;
}

export interface RateLimiter {
  middleware: MiddlewareHandler;
  /** Drop idle buckets (call periodically). */
  sweep(): void;
  readonly size: number;
}

export function createRateLimiter(opts: { rps: number; burst: number; keyOf: (c: Parameters<MiddlewareHandler>[0]) => string; maxKeys?: number }): RateLimiter {
  const buckets = new Map<string, Bucket>();
  const maxKeys = opts.maxKeys ?? 100_000;
  const refill = (b: Bucket, now: number): void => {
    b.tokens = Math.min(opts.burst, b.tokens + ((now - b.updated) / 1000) * opts.rps);
    b.updated = now;
  };
  return {
    middleware: async (c, next) => {
      const key = opts.keyOf(c);
      const now = Date.now();
      let b = buckets.get(key);
      if (!b) {
        if (buckets.size >= maxKeys) buckets.delete(buckets.keys().next().value!);
        b = { tokens: opts.burst, updated: now };
        buckets.set(key, b);
      } else {
        refill(b, now);
      }
      if (b.tokens < 1) {
        const retryAfter = Math.max(1, Math.ceil((1 - b.tokens) / opts.rps));
        throw new HttpError(429, "rate_limited", `Too many requests — retry in ${retryAfter}s`, {
          "Retry-After": String(retryAfter),
          "RateLimit-Limit": String(opts.burst),
          "RateLimit-Remaining": "0",
        });
      }
      b.tokens -= 1;
      c.header("RateLimit-Limit", String(opts.burst));
      c.header("RateLimit-Remaining", String(Math.floor(b.tokens)));
      await next();
    },
    sweep() {
      const now = Date.now();
      for (const [k, b] of buckets) {
        refill(b, now);
        if (b.tokens >= opts.burst) buckets.delete(k);
      }
    },
    get size() {
      return buckets.size;
    },
  };
}
