import type { Logger } from "@easyjobs/contract/node";
import { backoffDelayMs, type BackoffPolicy } from "./backoff";
import type { BlockSignal } from "./block";
import { formatDuration, type Clock, type RandomSource } from "./clock";
import type { Pacer } from "./pacer";
import type { BlockKind, BlockRecord, PortalId, PortalState, RunOutcome, RunSummary, StateStore } from "./state";

export type RequestKind = "robots" | "listing" | "detail";

export interface RunGuardDeps {
  portal: PortalId;
  store: StateStore;
  clock: Clock;
  random: RandomSource;
  pacer: Pacer;
  log: Logger;
  policy: BackoffPolicy;
  /** Per-run cap on requests (LINKEDIN_MAX_REQ_PER_RUN / NAUKRI_MAX_REQ_PER_RUN). */
  maxRequests: number;
  signal: AbortSignal;
}

/** After this many non-block errors (5xx, timeouts, unparseable pages) in one run, stop early. */
const MAX_ERRORS_PER_RUN = 3;
const HISTORY_LIMIT = 20;

/**
 * Per-run safety envelope shared by both portals:
 * - refuses to start while a backoff from an earlier block is active (zero requests)
 * - enforces the per-run request cap and the 4–6 s pacing (via the process-wide pacer)
 * - turns a block (429/999/403/challenge) into an exponential, hours-long backoff and stops the run
 * - persists strikes, backoff, rotation cursor and a run summary, and logs one clear summary line
 */
export class RunGuard {
  private readonly deps: RunGuardDeps;
  private readonly state: PortalState;
  private readonly startedAt: number;
  private used = 0;
  private readonly byKind: Record<RequestKind, number> = { robots: 0, listing: 0, detail: 0 };
  private okContent = 0;
  private errors = 0;
  private capHit = false;
  private stopInfo: { outcome: RunOutcome; message: string } | null = null;
  private holding = false;

  private constructor(deps: RunGuardDeps, state: PortalState) {
    this.deps = deps;
    this.state = state;
    this.startedAt = deps.clock.now();
  }

  static async open(deps: RunGuardDeps): Promise<RunGuard> {
    return new RunGuard(deps, await deps.store.load());
  }

  get portal(): PortalId {
    return this.deps.portal;
  }

  /** Copy of the persisted state as loaded/updated during this run. */
  get snapshot(): PortalState {
    return structuredClone(this.state);
  }

  get requests(): number {
    return this.used;
  }

  get remaining(): number {
    return Math.max(0, this.deps.maxRequests - this.used);
  }

  get stopped(): boolean {
    return this.stopInfo !== null;
  }

  get outcome(): RunOutcome | null {
    return this.stopInfo?.outcome ?? null;
  }

  /** Log-ready reason to skip this run, or null when no backoff is active. */
  activeBackoff(): string | null {
    const until = this.state.blockedUntil ? Date.parse(this.state.blockedUntil) : Number.NaN;
    const now = this.deps.clock.now();
    if (!Number.isFinite(until) || until <= now) return null;
    const last = this.state.lastBlock;
    const why = last ? `${last.kind}: ${last.detail}` : "an earlier block";
    return `${this.portal}: backing off until ${new Date(until).toISOString()} (${formatDuration(until - now)} left) after ${why} — skipping this run without sending any request`;
  }

  /** Marks the run as skipped (backoff active / already running) without touching backoff state. */
  skip(message: string): void {
    this.stopInfo = { outcome: "skipped_backoff", message };
  }

  /**
   * Reserve one request slot. Waits for the pacer (4–6 s since the previous request finished).
   * Returns false — send nothing — when the run is stopped or the per-run cap is used up.
   */
  async acquire(kind: RequestKind): Promise<boolean> {
    if (this.stopInfo) return false;
    if (this.used >= this.deps.maxRequests) {
      if (!this.capHit) this.deps.log.info(`${this.portal}: per-run request cap reached (${this.deps.maxRequests}) — stopping here`);
      this.capHit = true;
      return false;
    }
    await this.deps.pacer.acquire(this.deps.signal);
    this.holding = true;
    this.used++;
    this.byKind[kind]++;
    return true;
  }

  /** Must follow every successful acquire() (use try/finally). */
  release(): void {
    if (!this.holding) return;
    this.holding = false;
    this.deps.pacer.release();
  }

  /** A listing/detail response with usable content (resets strikes at the end of a clean run). */
  noteOk(): void {
    this.okContent++;
  }

  /** Non-block failure (5xx, timeout, unparseable page). Stops the run after a few of them. */
  noteError(message: string): void {
    this.errors++;
    this.deps.log.warn(`${this.portal}: ${message}`);
    if (this.errors >= MAX_ERRORS_PER_RUN && !this.stopInfo) {
      this.stopInfo = { outcome: "partial", message: `${this.errors} errors in one run — stopping early` };
    }
  }

  /** 429 / 999 / 403 / challenge page: exponential backoff in hours, then end the run gracefully. */
  block(signal: BlockSignal, url: string): void {
    const strike = this.state.strikes + 1;
    const delay = backoffDelayMs(strike, this.deps.policy, signal.retryAfterMs, this.deps.random);
    const record = this.record(signal.kind, signal.status, url, signal.detail, strike, delay);
    this.state.strikes = strike;
    this.deps.log.warn(
      `${this.portal}: BLOCKED (${signal.kind}) — ${signal.detail} on ${url}. Backing off ${formatDuration(delay)} ` +
        `(strike ${strike}) until ${record.backoffUntil}; ending this run gracefully after ${this.used} request(s).`,
      { kind: signal.kind, status: signal.status, strike, backoffUntil: record.backoffUntil },
    );
    this.stopInfo = { outcome: "blocked", message: signal.detail };
  }

  /** robots.txt disallows our user agent: send nothing else; re-read robots.txt after the recheck period. */
  robotsDisallowed(url: string, detail: string): void {
    const delay = this.deps.policy.robotsRecheckMs;
    const record = this.record("robots", 200, url, detail, 0, delay);
    this.deps.log.warn(
      `${this.portal}: robots.txt disallows us — ${detail}. Not fetching anything (prompts.md §0.8.6: HTML pages obey robots.txt). ` +
        `Re-checking robots.txt after ${record.backoffUntil}. See packages/scrapers/portals/README.md#evidence.`,
      { robots: url, until: record.backoffUntil },
    );
    this.stopInfo = { outcome: "robots_disallowed", message: detail };
  }

  /** robots.txt unreachable (5xx/network → assume disallow) or no headless browser: short pause, no strike. */
  unavailable(url: string, detail: string): void {
    const delay = this.deps.policy.unavailablePauseMs;
    const record = this.record("unavailable", null, url, detail, 0, delay);
    this.deps.log.warn(`${this.portal}: ${detail} — pausing until ${record.backoffUntil} and ending this run.`);
    this.stopInfo = { outcome: "unavailable", message: detail };
  }

  /** The worker/CLI aborted us (shutdown or --limit reached mid-run). */
  aborted(message: string): void {
    if (!this.stopInfo) this.stopInfo = { outcome: "aborted", message };
  }

  /** Persists state and logs a one-line summary. Call exactly once, in a finally block. */
  async finish(info: { emitted: number; queries: string[]; rotationCursor?: number; planKey?: string; note?: string }): Promise<RunSummary> {
    const outcome: RunOutcome = this.stopInfo?.outcome ?? (this.errors > 0 ? "partial" : "ok");
    if ((outcome === "ok" || outcome === "partial") && this.okContent > 0) {
      // A run that got real content without being blocked clears the strike counter.
      this.state.strikes = 0;
      if (this.state.blockedUntil && Date.parse(this.state.blockedUntil) <= this.deps.clock.now()) this.state.blockedUntil = null;
    }
    if (info.rotationCursor !== undefined) this.state.rotationCursor = info.rotationCursor;
    if (info.planKey !== undefined) this.state.planKey = info.planKey;
    const summary: RunSummary = {
      startedAt: new Date(this.startedAt).toISOString(),
      finishedAt: new Date(this.deps.clock.now()).toISOString(),
      outcome,
      requests: this.used,
      listingRequests: this.byKind.listing,
      detailRequests: this.byKind.detail,
      emitted: info.emitted,
      errors: this.errors,
      queries: info.queries,
      note: info.note ?? this.stopInfo?.message ?? (this.capHit ? "request cap reached" : null),
    };
    this.state.lastRun = summary;
    try {
      await this.deps.store.save(this.state);
    } catch (e) {
      this.deps.log.error(`${this.portal}: could not persist state to ${this.deps.store.where}`, { error: e instanceof Error ? e.message : String(e) });
    }
    if (outcome !== "skipped_backoff") {
      this.deps.log.info(
        `${this.portal}: run ${outcome} — ${info.emitted} job(s), ${this.used} request(s) ` +
          `(robots ${this.byKind.robots}, listing ${this.byKind.listing}, detail ${this.byKind.detail}), ${this.errors} error(s)`,
        { queries: info.queries, ...(summary.note ? { note: summary.note } : {}) },
      );
    }
    return summary;
  }

  private record(kind: BlockKind, status: number | null, url: string, detail: string, strike: number, delayMs: number): BlockRecord {
    const now = this.deps.clock.now();
    const record: BlockRecord = {
      at: new Date(now).toISOString(),
      kind,
      status,
      url,
      detail,
      strike,
      backoffUntil: new Date(now + delayMs).toISOString(),
    };
    this.state.blockedUntil = record.backoffUntil;
    this.state.lastBlock = record;
    this.state.history = [record, ...this.state.history].slice(0, HISTORY_LIMIT);
    return record;
  }
}
