import type { Logger } from "@easyjobs/contract/node";
import { describeError, isThrottle } from "./errors";

const MAX_FAILURES_IN_ROW = 5;

/**
 * Budget for per-posting detail requests on list+detail APIs.
 *
 * Unknown postings beyond the cap — or after the API throttles us (429/403 after the client's retries) —
 * are DEFERRED, not emitted: they are not stored yet, so a sweep cannot close them, and the next run picks
 * them up with full details. Known postings are always emitted as light records, so sweeps stay correct.
 */
export class DetailBudget {
  private calls = 0;
  private failuresInRow = 0;
  private stopped: string | null = null;
  deferred = 0;
  failed = 0;

  constructor(
    private readonly cap: number,
    private readonly log: Logger,
  ) {}

  /** Reserve one detail request; false → defer this posting. */
  take(): boolean {
    if (this.stopped !== null || this.calls >= this.cap) {
      this.deferred++;
      return false;
    }
    this.calls++;
    return true;
  }

  succeeded(): void {
    this.failuresInRow = 0;
  }

  /** Records a failed detail request; the posting is deferred to the next run. */
  failedWith(error: unknown): void {
    this.deferred++;
    this.failed++;
    if (isThrottle(error)) {
      this.stopped = `throttled (${describeError(error)})`;
      this.log.warn(`detail requests ${this.stopped} — deferring the remaining unknown postings to the next run`);
      return;
    }
    this.log.debug(`detail request failed: ${describeError(error)}`);
    if (++this.failuresInRow >= MAX_FAILURES_IN_ROW) {
      this.stopped = `${MAX_FAILURES_IN_ROW} failures in a row`;
      this.log.warn(`detail requests stopped after ${this.stopped} — deferring the rest to the next run`);
    }
  }

  get used(): number {
    return this.calls;
  }

  report(): void {
    if (this.deferred === 0) return;
    const why = this.stopped ?? `detail cap of ${this.cap} per run (ATS_MAX_DETAILS)`;
    this.log.info(`deferred ${this.deferred} unknown posting(s) to later runs: ${why}`);
  }
}
