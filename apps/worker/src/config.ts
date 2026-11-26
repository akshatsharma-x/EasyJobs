import { join, resolve } from "node:path";
import type { Env } from "@easyjobs/contract/node";
import { WORKER_DIR, findRepoRoot } from "./paths";

export type DemoMode = "auto" | "on" | "off";
export type Priority = 1 | 2 | 3;

export interface WorkerConfig {
  apiUrl: string;
  ingestKey: string;
  port: number;
  host: string;
  /** Global max running tasks. */
  concurrency: number;
  /** Max running tasks per scraper (ATS scrapers fan out over targets). */
  perScraperConcurrency: number;
  taskTimeoutMs: number;
  /** Jobs per POST /v1/ingest/jobs (contract max 500). */
  batchSize: number;
  gzip: boolean;
  rescanMs: number;
  /** A run without `since` (eligible for sweeps) happens at least this often; 0 = every run is full. */
  fullRefreshMs: number;
  /** ctx.since = start of last successful run minus this overlap. */
  sinceOverlapMs: number;
  priorityIntervalsMs: Record<Priority, number>;
  /** First runs (no state, or overdue after a restart) are spread over min(interval, this). */
  initialSpreadMs: number;
  /** Floor for scraper.intervalMinutes. */
  minIntervalMs: number;
  /** ± fraction applied to intervals and backoff. */
  jitterRatio: number;
  backoffBaseMs: number;
  breakerThreshold: number;
  breakerPauseMs: number;
  demo: DemoMode;
  demoJobs: number;
  /** Safety cap on raw jobs consumed per run (a capped run never sweeps). */
  maxJobsPerRun: number;
  apiTimeoutMs: number;
  apiRetries: number;
  spoolMaxBytes: number;
  importTimeoutMs: number;
  shutdownGraceMs: number;
  repoRoot: string;
  stateDir: string;
  spoolDir: string;
  outDir: string;
}

const MINUTE = 60_000;
const HOUR = 3_600_000;

function num(env: Env, key: string, def: number, min: number, max: number): number {
  const raw = env[key];
  if (raw === undefined || raw.trim() === "") return def;
  const n = Number(raw);
  if (!Number.isFinite(n)) return def;
  return Math.min(max, Math.max(min, n));
}

function bool(env: Env, key: string, def: boolean): boolean {
  const raw = env[key]?.trim().toLowerCase();
  if (!raw) return def;
  if (["1", "true", "yes", "on"].includes(raw)) return true;
  if (["0", "false", "no", "off"].includes(raw)) return false;
  return def;
}

function demoMode(raw: string | undefined): DemoMode {
  const v = raw?.trim().toLowerCase();
  if (v === "1" || v === "on" || v === "true" || v === "always") return "on";
  if (v === "0" || v === "off" || v === "false" || v === "never") return "off";
  return "auto";
}

function priorityIntervals(raw: string | undefined): Record<Priority, number> {
  const parts = (raw ?? "").split(",").map((s) => Number(s.trim()));
  const pick = (i: number, def: number): number => {
    const v = parts[i];
    return v !== undefined && Number.isFinite(v) && v >= 1 ? v * MINUTE : def * MINUTE;
  };
  return { 1: pick(0, 15), 2: pick(1, 60), 3: pick(2, 1440) };
}

/** Reads every worker setting from env (documented in apps/worker/README.md and .env.example). */
export function loadConfig(env: Env = process.env, overrides: Partial<WorkerConfig> = {}): WorkerConfig {
  const repoRoot = env.WORKER_REPO_ROOT ? resolve(env.WORKER_REPO_ROOT) : findRepoRoot();
  const config: WorkerConfig = {
    apiUrl: (env.API_URL?.trim() || "http://localhost:4000").replace(/\/+$/, ""),
    ingestKey: env.INGEST_API_KEY?.trim() || "dev-ingest-key",
    port: num(env, "WORKER_PORT", 4100, 0, 65535),
    host: env.WORKER_HOST?.trim() || "127.0.0.1",
    concurrency: Math.floor(num(env, "WORKER_CONCURRENCY", 6, 1, 64)),
    perScraperConcurrency: Math.floor(num(env, "WORKER_PER_SCRAPER_CONCURRENCY", 2, 1, 2)),
    taskTimeoutMs: num(env, "WORKER_TASK_TIMEOUT_MINUTES", 30, 0.05, 24 * 60) * MINUTE,
    batchSize: Math.floor(num(env, "WORKER_BATCH_SIZE", 200, 1, 500)),
    gzip: bool(env, "WORKER_GZIP", true),
    rescanMs: num(env, "WORKER_RESCAN_MINUTES", 10, 0.1, 24 * 60) * MINUTE,
    fullRefreshMs: num(env, "WORKER_FULL_REFRESH_MINUTES", 60, 0, 7 * 24 * 60) * MINUTE,
    sinceOverlapMs: num(env, "WORKER_SINCE_OVERLAP_MINUTES", 10, 0, 24 * 60) * MINUTE,
    priorityIntervalsMs: priorityIntervals(env.WORKER_PRIORITY_MINUTES),
    initialSpreadMs: num(env, "WORKER_INITIAL_SPREAD_MINUTES", 60, 0, 7 * 24 * 60) * MINUTE,
    minIntervalMs: num(env, "WORKER_MIN_INTERVAL_MINUTES", 5, 0, 24 * 60) * MINUTE,
    jitterRatio: num(env, "WORKER_JITTER", 0.1, 0, 0.5),
    backoffBaseMs: num(env, "WORKER_BACKOFF_BASE_MINUTES", 2, 0.01, 24 * 60) * MINUTE,
    breakerThreshold: Math.floor(num(env, "WORKER_BREAKER_THRESHOLD", 5, 1, 100)),
    breakerPauseMs: num(env, "WORKER_BREAKER_PAUSE_HOURS", 6, 0.01, 30 * 24) * HOUR,
    demo: demoMode(env.WORKER_DEMO),
    demoJobs: Math.floor(num(env, "WORKER_DEMO_JOBS", 30, 1, 5000)),
    maxJobsPerRun: Math.floor(num(env, "WORKER_MAX_JOBS_PER_RUN", 20_000, 1, 1_000_000)),
    apiTimeoutMs: num(env, "WORKER_API_TIMEOUT_MS", 30_000, 100, 600_000),
    apiRetries: Math.floor(num(env, "WORKER_API_RETRIES", 3, 0, 10)),
    spoolMaxBytes: num(env, "WORKER_SPOOL_MAX_MB", 1024, 1, 1_000_000) * 1024 * 1024,
    importTimeoutMs: num(env, "WORKER_IMPORT_TIMEOUT_MS", 30_000, 100, 600_000),
    shutdownGraceMs: num(env, "WORKER_SHUTDOWN_GRACE_MS", 15_000, 0, 600_000),
    repoRoot,
    stateDir: env.WORKER_STATE_DIR ? resolve(env.WORKER_STATE_DIR) : join(WORKER_DIR, ".state"),
    spoolDir: env.WORKER_SPOOL_DIR ? resolve(env.WORKER_SPOOL_DIR) : join(WORKER_DIR, ".spool"),
    outDir: env.WORKER_OUT_DIR ? resolve(env.WORKER_OUT_DIR) : join(WORKER_DIR, "out"),
  };
  return { ...config, ...overrides };
}
