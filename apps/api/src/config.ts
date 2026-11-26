/**
 * API configuration from environment variables (§0.7 + API-specific knobs documented in README.md).
 */
export interface ApiConfig {
  port: number;
  /** Listen address; undefined = all interfaces. */
  host: string | undefined;
  /** CORS allow-list (WEB_ORIGIN, comma-separated). */
  webOrigins: string[];
  ingestKey: string;
  /** Per-IP token bucket for public routes; null = disabled. */
  rateLimit: { rps: number; burst: number } | null;
  /** Use X-Forwarded-For for the client IP (only behind a trusted proxy). */
  trustProxy: boolean;
  cacheTtlMs: number;
  cacheMaxEntries: number;
  sse: { heartbeatMs: number; statsMs: number; maxPerIp: number; maxClients: number };
  expireIntervalMs: number;
  limits: { ingestJobsBytes: number; ingestInflatedBytes: number; ingestOtherBytes: number };
  version: string;
}

type Env = Record<string, string | undefined>;

const num = (env: Env, key: string, fallback: number): number => {
  const raw = env[key];
  if (raw === undefined || raw.trim() === "") return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) throw new Error(`${key} must be a number (got "${raw}")`);
  return n;
};

export const API_VERSION = "0.1.0";
export const DEFAULT_INGEST_KEY = "dev-ingest-key";

export function loadConfig(env: Env = process.env): ApiConfig {
  const rps = num(env, "RATE_LIMIT_RPS", 20);
  const burst = num(env, "RATE_LIMIT_BURST", 100);
  return {
    port: num(env, "API_PORT", 4000),
    host: env.API_HOST?.trim() || undefined,
    webOrigins: (env.WEB_ORIGIN ?? "http://localhost:3000")
      .split(",")
      .map((s) => s.trim().replace(/\/$/, ""))
      .filter(Boolean),
    ingestKey: env.INGEST_API_KEY?.trim() || DEFAULT_INGEST_KEY,
    rateLimit: rps > 0 && burst > 0 ? { rps, burst } : null,
    trustProxy: env.TRUST_PROXY === "1" || env.TRUST_PROXY === "true",
    cacheTtlMs: num(env, "CACHE_TTL_MS", 20_000),
    cacheMaxEntries: num(env, "CACHE_MAX_ENTRIES", 2000),
    sse: {
      heartbeatMs: num(env, "SSE_HEARTBEAT_MS", 25_000),
      statsMs: num(env, "SSE_STATS_MS", 30_000),
      maxPerIp: num(env, "SSE_MAX_PER_IP", 20),
      maxClients: num(env, "SSE_MAX_CLIENTS", 5000),
    },
    expireIntervalMs: num(env, "EXPIRE_INTERVAL_MS", 3_600_000),
    limits: {
      ingestJobsBytes: num(env, "INGEST_MAX_BYTES", 16 * 1024 * 1024),
      ingestInflatedBytes: num(env, "INGEST_MAX_INFLATED_BYTES", 64 * 1024 * 1024),
      ingestOtherBytes: num(env, "INGEST_OTHER_MAX_BYTES", 16 * 1024 * 1024),
    },
    version: API_VERSION,
  };
}
