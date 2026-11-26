/**
 * Freshness (§0.4): sweeps after complete runs, hourly expiry, known-id lookups and run reports.
 */
import { sql, type SQL } from "drizzle-orm";
import type { Database, Executor } from "./client";
import { loadJobs, loadSources, refreshCompanyCounts, withWriteLock } from "./ingest";
import { BOARD_MAX_AGE_MS, BOARD_UNSEEN_CLOSE_MS, finalizeJob, recordChanged } from "./merge";
import { insertColumns, JOB_COLUMNS, recordset, type JobRecord } from "./records";
import { textArray } from "./sql-util";
import type { RunReportInput, SweepInput } from "./validate";

/** target null/"" matches sources whose target is null or empty (non-ATS scrapers). */
const targetMatches = (target: string | null): SQL =>
  target === null ? sql`(s.target IS NULL OR s.target = '')` : sql`s.target = ${target}`;

export interface SweepResult {
  /** Jobs that became closed because no source remains. */
  closed: number;
  /** (source, sourceJobId) rows removed by this sweep. */
  removed: number;
  /** Ids of job rows rewritten (closed or with changed source aggregates). */
  changedIds: string[];
}

/**
 * A complete run of (source, target) saw `seenSourceJobIds`: every other active source row of that
 * (source, target) is removed; jobs left without any active source are closed.
 */
export async function sweep(db: Database, req: SweepInput, now: Date = new Date()): Promise<SweepResult> {
  const nowIso = now.toISOString();
  return withWriteLock(db, async (tx) => {
    const seen = textArray(req.seenSourceJobIds);
    const removedRows = await tx.query<{ jobId: string }>(sql`
      UPDATE job_sources s SET removed_at = ${nowIso}::timestamptz
      WHERE s.source = ${req.source} AND ${targetMatches(req.target)} AND s.removed_at IS NULL
        AND s.source_job_id NOT IN (SELECT unnest(${seen}))
      RETURNING s.job_id AS "jobId"`);

    // Seen rows count as sightings (some scrapers skip re-emitting known jobs).
    await tx.query(sql`
      UPDATE job_sources s SET last_seen_at = ${nowIso}::timestamptz
      WHERE s.source = ${req.source} AND ${targetMatches(req.target)} AND s.removed_at IS NULL
        AND s.source_job_id = ANY(${seen})`);
    await tx.query(sql`
      UPDATE jobs j SET last_seen_at = ${nowIso}::timestamptz
      FROM job_sources s
      WHERE s.job_id = j.id AND s.source = ${req.source} AND ${targetMatches(req.target)} AND s.removed_at IS NULL
        AND s.source_job_id = ANY(${seen}) AND j.status = 'open'
        AND j.last_seen_at < ${new Date(now.getTime() - 3_600_000).toISOString()}::timestamptz`);

    const ids = [...new Set(removedRows.map((r) => r.jobId))];
    const { closed, changedIds } = await reevaluate(tx, ids, now);
    return { closed, removed: removedRows.length, changedIds };
  });
}

/** Recompute aggregates + status for jobs whose sources changed; returns how many went open → closed. */
async function reevaluate(tx: Executor, ids: readonly string[], now: Date): Promise<{ closed: number; changedIds: string[] }> {
  if (ids.length === 0) return { closed: 0, changedIds: [] };
  const jobs = await loadJobs(tx, sql`j.id = ANY(${textArray(ids)})`);
  const sourcesByJob = new Map<string, Awaited<ReturnType<typeof loadSources>>>();
  for (const s of await loadSources(tx, ids)) {
    const list = sourcesByJob.get(s.jobId) ?? [];
    list.push(s);
    sourcesByJob.set(s.jobId, list);
  }
  const changed: JobRecord[] = [];
  let closed = 0;
  for (const orig of jobs) {
    const job = finalizeJob({ ...orig, fieldPrio: { ...orig.fieldPrio } }, sourcesByJob.get(orig.id) ?? [], now, orig.status);
    if (orig.status === "open" && job.status === "closed") closed++;
    if (recordChanged(orig, job)) {
      job.updatedAt = now.toISOString();
      changed.push(job);
    }
  }
  if (changed.length > 0) {
    const cols = insertColumns(JOB_COLUMNS);
    await tx.query(sql`
      INSERT INTO jobs (${cols.cols}) SELECT ${cols.values} FROM ${recordset(JOB_COLUMNS, changed)}
      ON CONFLICT (id) DO UPDATE SET ${cols.updates(["id"])}`);
    await refreshCompanyCounts(tx, changed.map((j) => j.companySlug));
  }
  return { closed, changedIds: changed.map((j) => j.id) };
}

/**
 * Hourly: validThrough in the past → closed; board/aggregator-only jobs unseen for 21 days or posted more
 * than 45 days ago → closed. Official jobs only close through sweeps or validThrough.
 */
export async function expireStale(db: Database, now: Date = new Date()): Promise<{ closed: number; changedIds: string[] }> {
  const nowIso = now.toISOString();
  const unseenCutoff = new Date(now.getTime() - BOARD_UNSEEN_CLOSE_MS).toISOString();
  const ageCutoff = new Date(now.getTime() - BOARD_MAX_AGE_MS).toISOString();
  return withWriteLock(db, async (tx) => {
    const rows = await tx.query<{ id: string; slug: string }>(sql`
      UPDATE jobs SET
        status = 'closed',
        closed_reason = CASE
          WHEN valid_through < ${nowIso}::timestamptz THEN 'expired'
          WHEN last_seen_at < ${unseenCutoff}::timestamptz THEN 'stale'
          ELSE 'too_old' END,
        closed_at = ${nowIso}::timestamptz,
        updated_at = ${nowIso}::timestamptz
      WHERE status = 'open' AND (
        valid_through < ${nowIso}::timestamptz
        OR (NOT is_official AND (last_seen_at < ${unseenCutoff}::timestamptz OR posted_at < ${ageCutoff}::timestamptz))
      )
      RETURNING id, company_slug AS slug`);
    await refreshCompanyCounts(tx, rows.map((r) => r.slug));
    return { closed: rows.length, changedIds: rows.map((r) => r.id) };
  });
}

/**
 * sourceJobIds already stored **with details** for (source[, target]) — lets scrapers skip detail fetches.
 * Jobs stored only as light/card records (no description yet) are not "known", so the next run fetches their
 * details (contract 1.1: `isKnown` means "stored with details"; P07 #2, P08 #2).
 */
export async function knownIds(db: Database, source: string, target?: string | null): Promise<string[]> {
  const cond = target === undefined ? sql`TRUE` : targetMatches(target && target.trim() ? target.trim() : null);
  const rows = await db.query<{ id: string }>(sql`
    SELECT s.source_job_id AS id FROM job_sources s
    JOIN jobs j ON j.id = s.job_id
    WHERE s.source = ${source} AND ${cond} AND j.description_html IS NOT NULL
    ORDER BY s.source_job_id`);
  return rows.map((r) => r.id);
}

export async function recordRun(db: Database, run: RunReportInput, now: Date = new Date()): Promise<void> {
  await db.query(sql`
    INSERT INTO scrape_runs (run_id, source, target, started_at, finished_at, status, emitted, invalid, errors, complete, stats, received_at)
    VALUES (${run.runId}, ${run.source}, ${run.target}, ${run.startedAt}::timestamptz, ${run.finishedAt}::timestamptz,
            ${run.status}, ${run.emitted}, ${run.invalid}, ${JSON.stringify(run.errors)}::jsonb,
            ${run.complete ?? null}::boolean, ${run.stats ? JSON.stringify(run.stats) : null}::jsonb, ${now.toISOString()}::timestamptz)
    ON CONFLICT (run_id, source, (coalesce(target, ''))) DO UPDATE SET
      started_at = excluded.started_at, finished_at = excluded.finished_at, status = excluded.status,
      emitted = excluded.emitted, invalid = excluded.invalid, errors = excluded.errors,
      complete = excluded.complete, stats = excluded.stats, received_at = excluded.received_at`);
}
