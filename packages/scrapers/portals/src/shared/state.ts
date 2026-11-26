import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Env } from "@easyjobs/contract/node";

export type PortalId = "linkedin" | "naukri";

/**
 * rate_limited – HTTP 429 · denied – HTTP 403/401/999 or an edge "Access Denied" page ·
 * challenge – CAPTCHA / auth wall / bot check · robots – robots.txt disallows our user agent ·
 * unavailable – robots.txt unreachable (RFC 9309 → assume disallow) or headless browser missing.
 */
export type BlockKind = "rate_limited" | "denied" | "challenge" | "robots" | "unavailable";

export interface BlockRecord {
  at: string;
  kind: BlockKind;
  status: number | null;
  url: string;
  detail: string;
  /** Consecutive-block count this record contributed to (0 for robots/unavailable pauses). */
  strike: number;
  backoffUntil: string;
}

export type RunOutcome =
  | "ok"
  | "partial"
  | "blocked"
  | "robots_disallowed"
  | "unavailable"
  | "skipped_backoff"
  | "budget_exhausted"
  | "aborted";

export interface RunSummary {
  startedAt: string;
  finishedAt: string;
  outcome: RunOutcome;
  requests: number;
  listingRequests: number;
  detailRequests: number;
  emitted: number;
  errors: number;
  queries: string[];
  note: string | null;
}

/** Everything a portal scraper remembers between runs (one JSON file per portal). */
export interface PortalState {
  version: 1;
  /** Consecutive blocked runs; drives the exponential backoff. Reset by a clean run. */
  strikes: number;
  /** ISO time before which runs are skipped without any request. */
  blockedUntil: string | null;
  lastBlock: BlockRecord | null;
  /** Index of the next query in the rotation plan. */
  rotationCursor: number;
  /** Fingerprint of the plan the cursor refers to; a changed plan restarts the rotation. */
  planKey: string | null;
  lastRun: RunSummary | null;
  /** Recent blocks, newest first (≤ 20) — evidence for README/status. */
  history: BlockRecord[];
}

export function emptyState(): PortalState {
  return { version: 1, strikes: 0, blockedUntil: null, lastBlock: null, rotationCursor: 0, planKey: null, lastRun: null, history: [] };
}

export interface StateStore {
  load(): Promise<PortalState>;
  save(state: PortalState): Promise<void>;
  /** Human-readable location for log lines. */
  readonly where: string;
}

const PACKAGE_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

/** PORTALS_STATE_DIR, else packages/scrapers/portals/.state (git-ignored). */
export function stateDir(env: Env): string {
  const dir = env.PORTALS_STATE_DIR?.trim();
  return dir ? resolve(dir) : join(PACKAGE_DIR, ".state");
}

function coerce(raw: unknown): PortalState {
  const base = emptyState();
  if (!raw || typeof raw !== "object") return base;
  const r = raw as Partial<PortalState>;
  return {
    version: 1,
    strikes: typeof r.strikes === "number" && r.strikes >= 0 ? Math.floor(r.strikes) : 0,
    blockedUntil: typeof r.blockedUntil === "string" && !Number.isNaN(Date.parse(r.blockedUntil)) ? r.blockedUntil : null,
    lastBlock: r.lastBlock && typeof r.lastBlock === "object" ? r.lastBlock : null,
    rotationCursor: typeof r.rotationCursor === "number" && r.rotationCursor >= 0 ? Math.floor(r.rotationCursor) : 0,
    planKey: typeof r.planKey === "string" ? r.planKey : null,
    lastRun: r.lastRun && typeof r.lastRun === "object" ? r.lastRun : null,
    history: Array.isArray(r.history) ? r.history.slice(0, 20) : [],
  };
}

/** JSON file store with atomic replace; a missing or corrupt file yields a fresh state. */
export function createFileStateStore(file: string): StateStore {
  return {
    where: file,
    async load() {
      try {
        return coerce(JSON.parse(await readFile(file, "utf8")));
      } catch {
        // Missing (first run) or unreadable/corrupt JSON: start clean rather than crash the run.
        return emptyState();
      }
    },
    async save(state) {
      await mkdir(dirname(file), { recursive: true });
      const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
      await writeFile(tmp, JSON.stringify(state, null, 2) + "\n", "utf8");
      await rename(tmp, file);
    },
  };
}

export function defaultStateStore(portal: PortalId, env: Env): StateStore {
  return createFileStateStore(join(stateDir(env), `${portal}.json`));
}

/** In-memory store for tests. */
export function createMemoryStateStore(initial: Partial<PortalState> = {}): StateStore & { current(): PortalState; saves: number } {
  let state: PortalState = { ...emptyState(), ...initial };
  const store = {
    where: "memory",
    saves: 0,
    async load() {
      return structuredClone(state);
    },
    async save(next: PortalState) {
      state = structuredClone(next);
      store.saves++;
    },
    current() {
      return structuredClone(state);
    },
  };
  return store;
}
