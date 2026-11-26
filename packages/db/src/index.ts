/**
 * @easyjobs/db — Drizzle schema + migrations, Postgres/PGlite driver, ingest/merge/freshness and search.
 * Only apps/api (and the seed CLI) use this package.
 */
export { createDatabase, PgliteLockedError, type Database, type DatabaseOptions, type Driver, type Executor, type PubSub } from "./client";
export { runMigrations } from "./migrate";
export { resetData } from "./maintenance";
/** Escape hatch for maintenance scripts (bench, seed). */
export { sql } from "drizzle-orm";
export { DEFAULT_PGLITE_DIR, MIGRATIONS_DIR, REPO_ROOT, fromRepoRoot, loadRootEnv } from "./paths";
export * as schema from "./schema";
export type { ClosedReason, JobStatus } from "./schema";
export { createRepository, openRepository, recordToEvent, type IngestResult, type Repository } from "./repository";
export { JobEvents, type JobCreatedEvent, type JobEventListener } from "./events";
export {
  MAX_JOBS_PER_REQUEST,
  formatZodError,
  ingestEnvelopeSchema,
  jobInputSchema,
  runReportSchema,
  sweepSchema,
  validateJob,
  type RunReportInput,
  type SweepInput,
} from "./validate";
export { sanitizeDescription, htmlToPlainText, summarizeText } from "./sanitize";
export { prepareInputs } from "./ingest";
export type { SweepResult } from "./freshness";
export { computeStatus, displayLocations, BOARD_MAX_AGE_MS, BOARD_UNSEEN_CLOSE_MS } from "./merge";
export { canonicalizeQuery, matchesFilters, CITY_ALIASES, FILTERS, type FacetKey, type FilterDictionary, type MatchableJob } from "./search/filters";
export { MAX_PAGES, effectiveFilterKey, totalFromFacets, type Memo, type TextMatch } from "./search/engine";
export { SYNONYM_GROUPS, normalizeSearchText, parseText } from "./search/text";
export type { CompanyListParams } from "./queries";
export type { JobRecord, SourceRecord } from "./records";
