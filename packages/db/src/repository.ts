/**
 * Typed repository used by the API (and the seed): ingest, freshness, search and read paths over one
 * Database handle (postgres.js or PGlite).
 */
import { sql } from "drizzle-orm";
import type {
  CompaniesResponse,
  CompanySummary,
  CompanyTarget,
  IngestResponse,
  JobDetail,
  JobListItem,
  JobsSearchResponse,
  SearchQuery,
  StatsResponse,
  SuggestResponse,
} from "@easyjobs/contract";
import { createDatabase, type Database, type DatabaseOptions } from "./client";
import { JobEvents, type JobCreatedEvent } from "./events";
import { expireStale, knownIds, recordRun, sweep, type SweepResult } from "./freshness";
import { upsertJobs } from "./ingest";
import { runMigrations } from "./migrate";
import {
  getCompany,
  getJob,
  getListItems,
  pageRows,
  listCompanies,
  similarJobs,
  stats,
  syncCompanyProfiles,
  type CompanyListParams,
} from "./queries";
import type { JobRecord } from "./records";
import { toListItem, toMatchable } from "./rows";
import { MAX_PAGES, searchFacets, searchPage, prepareText, tentativeText, totalFromFacets, type Memo, type TextMatch } from "./search/engine";
import { FacetIndex, textScores } from "./search/facet-index";
import { canonicalizeQuery, type FilterDictionary } from "./search/filters";
import { SuggestIndex } from "./suggest";
import type { RunReportInput, SweepInput } from "./validate";

export interface IngestResult extends IngestResponse {
  /** New open jobs (also emitted on `events`). */
  created: number;
}

export interface Repository {
  readonly db: Database;
  /** "job created" events for new open rows, emitted after commit. */
  readonly events: JobEvents;
  upsertJobs(items: readonly unknown[], opts?: { now?: Date }): Promise<IngestResult>;
  sweep(req: SweepInput, opts?: { now?: Date }): Promise<Omit<SweepResult, "changedIds">>;
  knownIds(source: string, target?: string | null): Promise<string[]>;
  recordRun(run: RunReportInput): Promise<void>;
  expireStale(opts?: { now?: Date }): Promise<{ closed: number }>;

  /** Canonicalise filter values against the data dictionary (bangalore → Bengaluru, react → React). */
  normalizeQuery(q: SearchQuery): Promise<SearchQuery>;
  searchJobs(q: SearchQuery, opts?: { now?: Date }): Promise<JobsSearchResponse>;
  /** Search steps for callers that cache them (the API). Pass normalised queries. */
  prepareText(q: string | undefined): Promise<TextMatch>;
  /** Page + facets + the text interpretation (in-memory index when ready, SQL otherwise). q must be normalised. */
  search(q: SearchQuery, now?: Date, memo?: Memo): Promise<{ page: JobListItem[]; facets: JobsSearchResponse["facets"]; text: TextMatch }>;
  /** SQL reference implementations (always available). */
  searchPage(q: SearchQuery, text: TextMatch, now?: Date): Promise<JobListItem[]>;
  searchFacets(q: SearchQuery, text: TextMatch, now?: Date, memo?: Memo): Promise<JobsSearchResponse["facets"]>;

  /** Build the suggest index and (if enabled) the in-memory facet index now instead of on first use. */
  warmup(): Promise<void>;
  /** Jobs changed elsewhere (another instance): refresh derived in-memory state. */
  jobsChanged(ids: readonly string[]): void;
  /** Ids of jobs written by this process (for cross-instance fan-out). */
  onJobsChanged(listener: (ids: readonly string[]) => void): () => void;
  /** Which facet engine answers searchFacets right now. */
  facetEngine(): "memory" | "sql";

  getJob(id: string): Promise<JobDetail | null>;
  getListItems(ids: readonly string[]): Promise<JobCreatedEvent[]>;
  similarJobs(id: string, limit: number): Promise<JobListItem[] | null>;
  suggest(q: string): Promise<SuggestResponse>;
  stats(opts?: { now?: Date }): Promise<StatsResponse>;
  listCompanies(params: CompanyListParams): Promise<CompaniesResponse>;
  getCompany(slug: string): Promise<CompanySummary | null>;
  syncCompanyProfiles(targets: readonly CompanyTarget[]): Promise<number>;
  /** true if the database answers. */
  ping(): Promise<boolean>;
  close(): Promise<void>;
}

export function recordToEvent(r: JobRecord): JobCreatedEvent {
  return { item: toListItem(r), match: toMatchable(r) };
}

export interface RepositoryOptions {
  suggestTtlMs?: number;
  /** "memory" (default): in-memory columnar facet index; "sql": parallel facet statements only. */
  facetEngine?: "memory" | "sql";
  facetRebuildMs?: number;
}

export function createRepository(db: Database, opts: RepositoryOptions = {}): Repository {
  const events = new JobEvents();
  // PGlite has one connection and one writer (this process): every change reaches the overlay, so full rebuilds
  // only compact it — do them rarely, because a rebuild blocks the single connection while it reads.
  const pglite = db.driver === "pglite";
  const suggestIndex = new SuggestIndex(db, opts.suggestTtlMs ?? (pglite ? 300_000 : 60_000));
  const facetIndex = (opts.facetEngine ?? (process.env.FACET_ENGINE as "memory" | "sql" | undefined) ?? "memory") === "memory"
    ? new FacetIndex(db, { rebuildMs: opts.facetRebuildMs ?? (Number(process.env.FACET_REBUILD_MS) || (pglite ? 30 * 60_000 : 120_000)) })
    : null;
  const changeListeners = new Set<(ids: readonly string[]) => void>();
  const changed = (ids: readonly string[]): void => {
    if (ids.length === 0) return;
    facetIndex?.applyChanges(ids).catch((e: unknown) => console.warn("[db] facet index update failed:", e));
    for (const l of changeListeners) l(ids);
  };
  const passMemo: Memo = (_key, compute) => compute();
  const textKey = (q: SearchQuery): string => (q.q ?? "").toLowerCase().replace(/\s+/g, " ").trim();
  /**
   * Page + facets for a canonicalised query, plus how its text was interpreted.
   * With the in-memory index: the text's relevance scores come from one GIN statement (memoised per text and
   * doubling as the "anything matches?" probe — typo correction/trigram only run when nothing matches), then
   * filters, facets, total and page selection run in memory and the page rows are fetched by primary key.
   * Without it (still building, or FACET_ENGINE=sql): the SQL page query and parallel facet statements.
   */
  const search = async (
    q: SearchQuery,
    now: Date,
    memo: Memo = passMemo,
  ): Promise<{ page: JobListItem[]; facets: JobsSearchResponse["facets"]; text: TextMatch }> => {
    if (facetIndex?.ready) {
      void facetIndex.ensure();
      let text = await memo(`text0:${textKey(q)}`, () => tentativeText(db, q.q));
      const scoresFor = (t: TextMatch) => memo(`scores:${JSON.stringify(t)}`, () => textScores(db, t));
      let scores = text.mode === "none" ? null : await scoresFor(text);
      if (text.mode === "fts" && scores && scores.size === 0) {
        text = await memo(`text:${textKey(q)}`, () => prepareText(db, q.q));
        scores = text.mode === "none" ? null : await scoresFor(text);
      }
      const offset = (Math.min(q.page, MAX_PAGES) - 1) * q.pageSize;
      const r = await facetIndex.search(q, scores, now, { offset, limit: q.pageSize });
      if (r) return { page: await pageRows(db, r.pageIds), facets: r.facets, text };
    } else if (facetIndex) {
      void facetIndex.rebuild().catch((e: unknown) => console.warn("[db] facet index build failed:", e));
    }
    const text = await memo(`text:${textKey(q)}`, () => prepareText(db, q.q));
    const [page, facets] = await Promise.all([searchPage(db, q, text, now), searchFacets(db, q, text, now, memo)]);
    return { page, facets, text };
  };
  const dict = async (): Promise<FilterDictionary> => {
    await suggestIndex.ready();
    return suggestIndex.dictionary();
  };

  return {
    db,
    events,
    async upsertJobs(items, o) {
      const res = await upsertJobs(db, items, o?.now ?? new Date());
      changed(res.changedIds);
      if (res.created.length > 0) {
        suggestIndex.invalidate();
        events.emit(res.created.map(recordToEvent));
      }
      return { inserted: res.inserted, updated: res.updated, merged: res.merged, rejected: res.rejected, created: res.created.length };
    },
    async sweep(req, o) {
      const res = await sweep(db, req, o?.now ?? new Date());
      changed(res.changedIds);
      return { closed: res.closed, removed: res.removed };
    },
    knownIds: (source, target) => knownIds(db, source, target),
    recordRun: (run) => recordRun(db, run),
    async expireStale(o) {
      const res = await expireStale(db, o?.now ?? new Date());
      changed(res.changedIds);
      return { closed: res.closed };
    },

    normalizeQuery: async (q) => canonicalizeQuery(q, await dict()),
    async searchJobs(query, o) {
      const t0 = performance.now();
      const now = o?.now ?? new Date();
      const q = canonicalizeQuery(query, await dict());
      const { page: data, facets: f } = await search(q, now);
      const total = totalFromFacets(f, q);
      return { data, page: q.page, pageSize: q.pageSize, total, totalPages: Math.min(MAX_PAGES, Math.ceil(total / q.pageSize)), facets: f, tookMs: Math.round(performance.now() - t0) };
    },
    prepareText: (q) => prepareText(db, q),
    search: (q, now, memo) => search(q, now ?? new Date(), memo),
    searchPage: (q, text, now) => searchPage(db, q, text, now ?? new Date()),
    searchFacets: (q, text, now, memo) => searchFacets(db, q, text, now ?? new Date(), memo),

    async warmup() {
      await Promise.all([suggestIndex.refresh(), facetIndex?.rebuild()]);
    },
    jobsChanged(ids) {
      facetIndex?.applyChanges(ids).catch(() => {});
      suggestIndex.invalidate();
    },
    onJobsChanged(listener) {
      changeListeners.add(listener);
      return () => changeListeners.delete(listener);
    },
    facetEngine: () => (facetIndex?.ready ? "memory" : "sql"),

    getJob: (id) => getJob(db, id),
    getListItems: (ids) => getListItems(db, ids),
    similarJobs: (id, limit) => similarJobs(db, id, limit),
    async suggest(q) {
      await suggestIndex.ready();
      return suggestIndex.suggest(q);
    },
    stats: (o) => stats(db, o?.now ?? new Date()),
    listCompanies: (p) => listCompanies(db, p),
    getCompany: (slug) => getCompany(db, slug),
    syncCompanyProfiles: (targets) => syncCompanyProfiles(db, targets),
    async ping() {
      try {
        await db.query(sql`select 1`);
        return true;
      } catch {
        return false;
      }
    },
    close: () => db.close(),
  };
}

/** Open the configured database (DATABASE_URL → Postgres, else PGlite), migrate, and wrap it. */
export async function openRepository(opts: DatabaseOptions & RepositoryOptions & { migrate?: boolean } = {}): Promise<Repository> {
  const db = await createDatabase(opts);
  try {
    if (opts.migrate !== false) await runMigrations(db);
  } catch (e) {
    await db.close().catch(() => {});
    throw e;
  }
  return createRepository(db, opts);
}
