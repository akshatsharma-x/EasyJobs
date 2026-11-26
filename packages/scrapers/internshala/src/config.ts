import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Env } from "@easyjobs/contract/node";
import { FEEDS, type FeedSpec } from "./feeds";
import { INTERNSHALA_ORIGIN } from "./parse/text";
import type { Throttle } from "./throttle";
import type { InternshalaKind } from "./types";

/** Internshala's politeness budget: at most one request every 1.5 s (both scrapers combined). */
export const MIN_DELAY_MS = 1500;

export const DEFAULTS = {
  /** Listing pages per feed per run (the incremental stop usually ends far earlier). */
  maxPages: 10,
  /** Detail pages per scraper run; unknown jobs beyond the cap are emitted from their card. */
  maxDetails: 100,
  /** Extra rotating deep pages of the main feed per run (keeps long-lived postings fresh). */
  refreshPages: 2,
  /** Stop a feed after this many consecutive pages made entirely of known ids. */
  stopAfterKnownPages: 1,
} as const;

/** Programmatic options (tests, CLI flags). They take precedence over env vars. */
export interface InternshalaOptions {
  maxPages?: number;
  maxDetails?: number;
  refreshPages?: number;
  stopAfterKnownPages?: number;
  /** Gap between requests. Values below 1500 ms are only honoured when passed in code (tests). */
  delayMs?: number;
  /** Feed ids to crawl, in order (default: all feeds of the kind). */
  feeds?: string[];
  /** Development cache directory for raw HTML (null/undefined = off). */
  devCacheDir?: string | null;
  origin?: string;
  now?: () => Date;
  /** Inject a throttle (tests). Default: a process-wide one shared by both scrapers. */
  throttle?: Throttle;
}

export interface ResolvedOptions {
  maxPages: number;
  maxDetails: number;
  refreshPages: number;
  stopAfterKnownPages: number;
  delayMs: number;
  feeds: FeedSpec[];
  devCacheDir: string | null;
  origin: string;
  now: () => Date;
  throttle?: Throttle;
}

const PACKAGE_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** "all" / "∞" → Infinity, positive integers as-is, anything else → undefined. */
export function parseCount(value: string | number | undefined | null): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value === "number") return Number.isFinite(value) || value === Number.POSITIVE_INFINITY ? Math.max(0, value) : undefined;
  const v = value.trim().toLowerCase();
  if (v === "all" || v === "inf" || v === "infinity" || v === "∞") return Number.POSITIVE_INFINITY;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : undefined;
}

function feedsFor(kind: InternshalaKind, ids: string[] | undefined): FeedSpec[] {
  const all = FEEDS[kind];
  if (!ids || ids.length === 0) return [...all];
  const picked = ids.map((id) => all.find((f) => f.id === id.trim())).filter((f): f is FeedSpec => f !== undefined);
  return picked.length > 0 ? picked : [...all];
}

export function resolveOptions(kind: InternshalaKind, env: Env, overrides: InternshalaOptions = {}): ResolvedOptions {
  const envDelay = parseCount(env.INTERNSHALA_DELAY_MS);
  const delayMs = overrides.delayMs ?? Math.max(MIN_DELAY_MS, envDelay ?? MIN_DELAY_MS);
  const feedEnv = kind === "internship" ? env.INTERNSHALA_INTERNSHIP_FEEDS : env.INTERNSHALA_JOB_FEEDS;
  const devCacheEnv = env.INTERNSHALA_DEV_CACHE;
  const devCacheDir =
    overrides.devCacheDir !== undefined
      ? overrides.devCacheDir
      : devCacheEnv && devCacheEnv !== "0" && devCacheEnv !== "false"
        ? devCacheEnv === "1" || devCacheEnv === "true"
          ? join(PACKAGE_DIR, ".cache", "http")
          : resolve(devCacheEnv)
        : null;
  return {
    maxPages: overrides.maxPages ?? parseCount(env.INTERNSHALA_MAX_PAGES) ?? DEFAULTS.maxPages,
    maxDetails: overrides.maxDetails ?? parseCount(env.INTERNSHALA_MAX_DETAILS) ?? DEFAULTS.maxDetails,
    refreshPages: overrides.refreshPages ?? parseCount(env.INTERNSHALA_REFRESH_PAGES) ?? DEFAULTS.refreshPages,
    stopAfterKnownPages: Math.max(1, overrides.stopAfterKnownPages ?? parseCount(env.INTERNSHALA_STOP_AFTER_KNOWN_PAGES) ?? DEFAULTS.stopAfterKnownPages),
    delayMs,
    feeds: feedsFor(kind, overrides.feeds ?? feedEnv?.split(",").filter(Boolean)),
    devCacheDir,
    origin: overrides.origin ?? INTERNSHALA_ORIGIN,
    now: overrides.now ?? (() => new Date()),
    throttle: overrides.throttle,
  };
}
