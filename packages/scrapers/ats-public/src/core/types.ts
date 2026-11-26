import type { AtsType, CompanyTarget, RawJob } from "@easyjobs/contract";
import type { Env, HttpClient, Logger } from "@easyjobs/contract/node";

/** What an adapter gets for ONE registry target. Built by the runner from the ScrapeContext. */
export interface TargetContext {
  readonly target: CompanyTarget;
  readonly http: HttpClient;
  readonly log: Logger;
  readonly signal: AbortSignal;
  readonly env: Env;
  /** Jobs this target may still emit in this run (Infinity when unlimited). */
  remaining(): number;
  /** true → already stored: skip detail requests and emit a light record (descriptionHtml: null). */
  isKnown(sourceJobId: string): boolean;
  /** Counts a source item that was skipped, by reason (reported in the per-target summary log). */
  skip(reason: string, n?: number): void;
}

/** One ATS family. The runner turns it into a contract `Scraper` (see core/run.ts). */
export interface AtsAdapter {
  /** Scraper id = RawJob.source, e.g. "greenhouse". */
  readonly id: string;
  /** Display name, e.g. "Greenhouse". */
  readonly name: string;
  /** Registry `ats` value this adapter handles. */
  readonly ats: AtsType;
  /** Endpoint documentation shown in README/logs. */
  readonly endpoint: string;
  /** Lazily yields the target's jobs. Throw BoardNotFoundError for a dead board; any other error fails the target. */
  scrapeTarget(ctx: TargetContext): AsyncIterable<RawJob>;
}
