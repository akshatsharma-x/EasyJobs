/**
 * Read paths besides search: job detail, similar jobs, stats, companies.
 */
import { sql } from "drizzle-orm";
import {
  EXPERIENCE_LEVELS,
  JOB_TYPES,
  type CompaniesResponse,
  type CompanySummary,
  type CompanyTarget,
  type ExperienceLevel,
  type JobDetail,
  type JobListItem,
  type JobType,
  type SourceKind,
  type StatsResponse,
} from "@easyjobs/contract";
import type { Executor } from "./client";
import { DETAIL_COLUMNS, LIST_COLUMNS, toDetail, toListItem, toMatchable, type DetailRow, type ListRow } from "./rows";
import type { MatchableJob } from "./search/filters";
import { iso, textArray } from "./sql-util";

export async function getJob(db: Executor, id: string): Promise<JobDetail | null> {
  const [row] = await db.query<DetailRow>(sql`SELECT ${LIST_COLUMNS}, ${DETAIL_COLUMNS} FROM jobs j WHERE j.id = ${id}`);
  return row ? toDetail(row) : null;
}

/** List items + matchable projections by id (SSE fan-out across instances). */
export async function getListItems(db: Executor, ids: readonly string[]): Promise<{ item: JobListItem; match: MatchableJob }[]> {
  if (ids.length === 0) return [];
  const rows = await db.query<ListRow>(sql`SELECT ${LIST_COLUMNS} FROM jobs j WHERE j.id = ANY(${textArray(ids)})`);
  const byId = new Map(rows.map((r) => [r.id, r]));
  return ids.flatMap((id) => {
    const r = byId.get(id);
    return r ? [{ item: toListItem(r), match: toMatchable(r) }] : [];
  });
}

/** List items for ids, in the given order; ids that are missing or no longer open are skipped. */
export async function pageRows(db: Executor, ids: readonly string[]): Promise<JobListItem[]> {
  if (ids.length === 0) return [];
  const rows = await db.query<ListRow>(sql`SELECT ${LIST_COLUMNS} FROM jobs j WHERE j.id = ANY(${textArray(ids)}) AND j.status = 'open'`);
  const byId = new Map(rows.map((r) => [r.id, r]));
  return ids.flatMap((id) => {
    const r = byId.get(id);
    return r ? [toListItem(r)] : [];
  });
}

/**
 * Similar open jobs: candidates from the same category+level and from overlapping skills (each capped by
 * freshness so the cost is bounded), scored by skill overlap, title similarity, category, level and city.
 * Returns null when the job does not exist.
 */
export async function similarJobs(db: Executor, id: string, limit: number): Promise<JobListItem[] | null> {
  const [me] = await db.query<{ id: string }>(sql`SELECT id FROM jobs WHERE id = ${id}`);
  if (!me) return null;
  const rows = await db.query<ListRow>(sql`
    WITH me AS (SELECT * FROM jobs WHERE id = ${id}),
    cand AS (
      (SELECT j.id FROM jobs j, me WHERE j.status = 'open' AND j.id <> me.id
         AND j.category = me.category AND j.experience_level = me.experience_level
       ORDER BY j.rank_base DESC LIMIT 400)
      UNION
      (SELECT j.id FROM jobs j, me WHERE j.status = 'open' AND j.id <> me.id AND j.skills && me.skills
       ORDER BY j.rank_base DESC LIMIT 400)
    )
    SELECT ${LIST_COLUMNS}
    FROM jobs j JOIN cand ON cand.id = j.id, me
    ORDER BY (
        2.0 * cardinality(ARRAY(SELECT unnest(j.skills) INTERSECT SELECT unnest(me.skills)))
      + 4.0 * similarity(lower(j.title), lower(me.title))
      + CASE WHEN j.category = me.category THEN 2 ELSE 0 END
      + CASE WHEN j.experience_level = me.experience_level THEN 1.5 ELSE 0 END
      + CASE WHEN j.cities && me.cities THEN 1 ELSE 0 END
      + CASE WHEN j.company_slug = me.company_slug THEN 0.5 ELSE 0 END
      + 0.02 * (j.rank_base - me.rank_base)
    ) DESC, j.id
    LIMIT ${limit}`);
  return rows.map(toListItem);
}

export async function stats(db: Executor, now: Date = new Date()): Promise<StatsResponse> {
  const h1 = new Date(now.getTime() - 3_600_000).toISOString();
  const h24 = new Date(now.getTime() - 86_400_000).toISOString();
  const [counts, levels, types, companies, sources, updated] = await Promise.all([
    db.query<{ total: number; h1: number; h24: number }>(sql`
      SELECT count(*)::int AS total,
             count(*) FILTER (WHERE posted_at >= ${h1}::timestamptz)::int AS h1,
             count(*) FILTER (WHERE posted_at >= ${h24}::timestamptz)::int AS h24
      FROM jobs WHERE status = 'open'`),
    db.query<{ k: string; n: number }>(sql`SELECT experience_level AS k, count(*)::int AS n FROM jobs WHERE status = 'open' GROUP BY 1`),
    db.query<{ k: string; n: number }>(sql`SELECT job_type AS k, count(*)::int AS n FROM jobs WHERE status = 'open' GROUP BY 1`),
    db.query<{ n: number }>(sql`SELECT count(*)::int AS n FROM companies WHERE open_jobs > 0`),
    db.query<{ id: string; name: string; kind: SourceKind; open: number; lastRunAt: string | null }>(sql`
      SELECT s.id, s.name, s.kind, coalesce(o.open, 0)::int AS open, ${iso(sql`r.last`)} AS "lastRunAt"
      FROM sources s
      LEFT JOIN (
        SELECT u.v AS id, count(*)::int AS open
        FROM jobs j CROSS JOIN LATERAL unnest(j.source_ids) AS u(v)
        WHERE j.status = 'open' GROUP BY 1
      ) o ON o.id = s.id
      LEFT JOIN (SELECT source, max(finished_at) AS last FROM scrape_runs GROUP BY source) r ON r.source = s.id
      ORDER BY open DESC, s.id`),
    db.query<{ at: string | null }>(sql`
      SELECT ${iso(sql`greatest((SELECT max(last_seen_at) FROM sources), (SELECT max(finished_at) FROM scrape_runs))`)} AS at`),
  ]);
  const byLevel = Object.fromEntries(EXPERIENCE_LEVELS.map((l) => [l, 0])) as Record<ExperienceLevel, number>;
  for (const r of levels) if (r.k in byLevel) byLevel[r.k as ExperienceLevel] = r.n;
  const byType = Object.fromEntries(JOB_TYPES.map((t) => [t, 0])) as Record<JobType, number>;
  for (const r of types) if (r.k in byType) byType[r.k as JobType] = r.n;
  return {
    totalOpen: counts[0]?.total ?? 0,
    newLastHour: counts[0]?.h1 ?? 0,
    newLast24h: counts[0]?.h24 ?? 0,
    companies: companies[0]?.n ?? 0,
    byLevel,
    byType,
    sources: sources.map((s) => ({ id: s.id, name: s.name, kind: s.kind, open: s.open, lastRunAt: s.lastRunAt })),
    lastUpdatedAt: updated[0]?.at ?? null,
  };
}

const COMPANY_COLUMNS = sql`c.slug, c.name, c.domain, c.logo_url AS "logoUrl", c.tags, c.hq, c.careers_url AS "careersUrl", c.open_jobs AS "openJobs"`;

export interface CompanyListParams {
  q?: string;
  ctype?: string[];
  page: number;
  pageSize: number;
}

/** By openJobs desc. Without q only companies with open jobs are listed; with q every match is. */
export async function listCompanies(db: Executor, p: CompanyListParams): Promise<CompaniesResponse> {
  const conds = [sql`TRUE`];
  const q = p.q?.trim().toLowerCase().slice(0, 100);
  if (q) {
    const like = `%${q.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
    conds.push(sql`(lower(c.name) LIKE ${like} OR c.slug LIKE ${like} OR c.domain LIKE ${like} OR lower(c.name) % ${q})`);
  } else {
    conds.push(sql`c.open_jobs > 0`);
  }
  if (p.ctype && p.ctype.length > 0) conds.push(sql`c.tags && ${textArray(p.ctype)}`);
  const where = sql.join(conds, sql` AND `);
  const order = q
    ? sql`(lower(c.name) LIKE ${`${q}%`}) DESC, c.open_jobs DESC, c.name`
    : sql`c.open_jobs DESC, c.name`;
  const [rows, total] = await Promise.all([
    db.query<CompanySummary>(sql`
      SELECT ${COMPANY_COLUMNS} FROM companies c WHERE ${where}
      ORDER BY ${order} LIMIT ${p.pageSize} OFFSET ${(p.page - 1) * p.pageSize}`),
    db.query<{ n: number }>(sql`SELECT count(*)::int AS n FROM companies c WHERE ${where}`),
  ]);
  return { data: rows, page: p.page, pageSize: p.pageSize, total: total[0]?.n ?? 0 };
}

export async function getCompany(db: Executor, slug: string): Promise<CompanySummary | null> {
  const [row] = await db.query<CompanySummary>(sql`SELECT ${COMPANY_COLUMNS} FROM companies c WHERE c.slug = ${slug}`);
  return row ?? null;
}

/**
 * Optional enrichment from @easyjobs/registry (hq, careers URL, tags, domain) for companies we already
 * know. Never overwrites a non-null value with null. Returns the number of rows updated.
 */
export async function syncCompanyProfiles(db: Executor, targets: readonly CompanyTarget[]): Promise<number> {
  if (targets.length === 0) return 0;
  const rows = targets.map((t) => ({ slug: t.slug, domain: t.domain, tags: t.tags, hq: t.hq, careersUrl: t.careersUrl }));
  const updated = await db.query<{ slug: string }>(sql`
    UPDATE companies c SET
      hq = coalesce(x.hq, c.hq),
      careers_url = coalesce(x."careersUrl", c.careers_url),
      domain = coalesce(c.domain, x.domain),
      tags = ARRAY(SELECT DISTINCT t FROM unnest(c.tags || coalesce(x.tags, '{}')) AS t ORDER BY t)
    FROM jsonb_to_recordset(${JSON.stringify(rows)}::jsonb) AS x(slug text, domain text, tags text[], hq text, "careersUrl" text)
    WHERE c.slug = x.slug
      AND (c.hq IS DISTINCT FROM coalesce(x.hq, c.hq)
        OR c.careers_url IS DISTINCT FROM coalesce(x."careersUrl", c.careers_url)
        OR (c.domain IS NULL AND x.domain IS NOT NULL)
        OR NOT (coalesce(x.tags, '{}') <@ c.tags))
    RETURNING c.slug`);
  return updated.length;
}
