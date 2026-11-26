/**
 * SQL search: text matching (FTS → typo-corrected FTS → trigram), filters, sorts, pagination and disjunctive
 * facets (each facet applies every active filter except its own) as parallel statements. The in-memory facet
 * index (facet-index.ts) reuses the text matching and must agree with these results exactly (tested).
 */
import { sql, type SQL } from "drizzle-orm";
import { LABELS, type FacetBucket, type Facets, type JobListItem, type SearchQuery } from "@easyjobs/contract";
import type { Executor } from "../client";
import { labelForCompanyTag, labelForTag } from "../merge";
import { LIST_COLUMNS, toListItem, type ListRow } from "../rows";
import { textArray } from "../sql-util";
import { filterConditions, FILTERS, type FacetKey } from "./filters";
import { parseText, tsqueryExpr, type ParsedText } from "./text";

export type TextMatch =
  | { mode: "none" }
  | { mode: "fts"; tsquery: string; corrections: Record<string, string> }
  | { mode: "trgm"; plain: string };

export const MAX_PAGES = 500;
const TOP_BUCKETS = 30;
/** Description-only matches still rank above zero. */
const RANK_FLOOR = 0.03;

async function probe(db: Executor, expr: SQL): Promise<{ tsq: string; nodes: number; hit: boolean } | null> {
  const [row] = await db.queryIndexed<{ tsq: string; nodes: number; hit: boolean }>(sql`
    WITH t AS (SELECT ${expr} AS q)
    SELECT t.q::text AS tsq, numnode(t.q) AS nodes,
           EXISTS (SELECT 1 FROM jobs j WHERE j.status = 'open' AND j.search @@ t.q) AS hit
    FROM t`);
  return row ?? null;
}

/** The plain FTS interpretation of q, without probing the table (callers check for matches themselves). */
export async function tentativeText(db: Executor, q: string | undefined): Promise<TextMatch> {
  const parsed = parseText(q);
  const expr = tsqueryExpr(parsed);
  if (!expr) return { mode: "none" };
  const [row] = await db.query<{ tsq: string; nodes: number }>(sql`WITH t AS (SELECT ${expr} AS q) SELECT t.q::text AS tsq, numnode(t.q) AS nodes FROM t`);
  if (!row || row.nodes === 0) return parsed.plain.length >= 3 ? { mode: "trgm", plain: parsed.plain } : { mode: "none" };
  return { mode: "fts", tsquery: row.tsq, corrections: {} };
}

/** Resolve how free text matches. Typo correction / trigram only kick in when FTS matches nothing at all. */
export async function prepareText(db: Executor, q: string | undefined): Promise<TextMatch> {
  const parsed: ParsedText = parseText(q);
  const expr = tsqueryExpr(parsed);
  if (!expr) return { mode: "none" };
  const first = await probe(db, expr);
  if (!first || first.nodes === 0) return parsed.plain.length >= 3 ? { mode: "trgm", plain: parsed.plain } : { mode: "none" };
  if (first.hit) return { mode: "fts", tsquery: first.tsq, corrections: {} };

  if (parsed.words.length > 0) {
    const fixes = await db.query<{ word: string; fix: string | null }>(sql`
      SELECT w.word, (
        SELECT t.term FROM search_terms t
        WHERE t.term % w.word AND t.term <> w.word AND similarity(t.term, w.word) >= 0.4
        ORDER BY similarity(t.term, w.word) DESC, t.freq DESC
        LIMIT 1
      ) AS fix
      FROM unnest(${textArray(parsed.words)}) AS w(word)
      WHERE NOT EXISTS (SELECT 1 FROM search_terms t WHERE t.term = w.word)`);
    const corrections = new Map(fixes.filter((f) => f.fix).map((f) => [f.word, f.fix!]));
    if (corrections.size > 0) {
      const second = await probe(db, tsqueryExpr(parsed, corrections)!);
      if (second?.hit) return { mode: "fts", tsquery: second.tsq, corrections: Object.fromEntries(corrections) };
    }
  }
  return parsed.plain.length >= 3 ? { mode: "trgm", plain: parsed.plain } : { mode: "fts", tsquery: first.tsq, corrections: {} };
}

export function textCondition(t: TextMatch): SQL | null {
  if (t.mode === "fts") return sql`j.search @@ ${t.tsquery}::tsquery`;
  if (t.mode === "trgm") return sql`(lower(j.company) % ${t.plain} OR ${t.plain} <% lower(j.title))`;
  return null;
}

function textRank(t: TextMatch): SQL | null {
  if (t.mode === "fts") return sql`ts_rank(j.search_head, ${t.tsquery}::tsquery)`;
  if (t.mode === "trgm") return sql`greatest(similarity(lower(j.company), ${t.plain}), word_similarity(${t.plain}, lower(j.title)))`;
  return null;
}

function whereClause(q: SearchQuery, text: TextMatch, now: Date, exceptFacet: FacetKey | null = null): SQL {
  const conds: SQL[] = [sql`j.status = 'open'`];
  const tc = textCondition(text);
  if (tc) conds.push(tc);
  conds.push(...filterConditions(q, now, exceptFacet));
  return sql.join(conds, sql` AND `);
}

/** Relevance score for text queries: ln(text rank + floor) + rank_base (text rank × freshness decay × boosts). */
export function relevanceScore(text: TextMatch): SQL {
  const rank = textRank(text);
  return rank ? sql`(ln(${rank} + ${RANK_FLOOR}) + j.rank_base)` : sql`j.rank_base`;
}

/** Relevance = text rank × freshness decay × boosts; computed in log space: ln(rank) + rank_base. */
function orderBy(q: SearchQuery, text: TextMatch): SQL {
  switch (q.sort) {
    case "newest":
      return sql`j.posted_at DESC, j.id COLLATE "C"`;
    case "salary":
      return sql`coalesce(j.salary_inr_yearly_max, j.salary_inr_yearly_min) DESC NULLS LAST, j.rank_base DESC, j.id COLLATE "C"`;
    default: {
      const rank = textRank(text);
      return rank ? sql`${relevanceScore(text)} DESC, j.id COLLATE "C"` : sql`j.rank_base DESC, j.id COLLATE "C"`;
    }
  }
}

/** Text-conditioned statements must use the GIN/trigram indexes (see Executor.queryIndexed). */
const run = <T>(db: Executor, text: TextMatch, q: SQL): Promise<T[]> => (text.mode === "none" ? db.query<T>(q) : db.queryIndexed<T>(q));

export async function searchPage(db: Executor, q: SearchQuery, text: TextMatch, now: Date): Promise<JobListItem[]> {
  const rows = await run<ListRow>(db, text, sql`
    SELECT ${LIST_COLUMNS} FROM jobs j
    WHERE ${whereClause(q, text, now)}
    ORDER BY ${orderBy(q, text)}
    LIMIT ${q.pageSize} OFFSET ${(Math.min(q.page, MAX_PAGES) - 1) * q.pageSize}`);
  return rows.map(toListItem);
}

/* ─────────────── facets ─────────────── */

export interface FacetDef {
  key: FacetKey;
  /** Scalar expression, or a text[] expression to unnest. */
  expr: SQL;
  array: boolean;
  /** Keep only the top N buckets (+ selected values); null = all (bounded enums). */
  top: number | null;
  /** Optional label join. */
  labelJoin?: "companies" | "sources";
  label: (v: string) => string;
  selected: (q: SearchQuery) => string[];
}

const enumLabel = (map: Record<string, string>) => (v: string) => map[v] ?? v;

export const FACET_DEFS: readonly FacetDef[] = [
  { key: "type", expr: sql`j.job_type`, array: false, top: null, label: enumLabel(LABELS.jobType), selected: (q) => q.type ?? [] },
  { key: "level", expr: sql`j.experience_level`, array: false, top: null, label: enumLabel(LABELS.level), selected: (q) => q.level ?? [] },
  { key: "mode", expr: sql`j.work_mode`, array: false, top: null, label: enumLabel(LABELS.workMode), selected: (q) => q.mode ?? [] },
  { key: "category", expr: sql`j.category`, array: false, top: null, label: enumLabel(LABELS.category), selected: (q) => q.category ?? [] },
  {
    key: "location",
    expr: sql`(j.cities || CASE WHEN j.is_remote THEN ARRAY['Remote']::text[] ELSE ARRAY[]::text[] END)`,
    array: true,
    top: TOP_BUCKETS,
    label: (v) => v,
    selected: (q) => q.location ?? [],
  },
  { key: "company", expr: sql`j.company_slug`, array: false, top: TOP_BUCKETS, labelJoin: "companies", label: (v) => v, selected: (q) => q.company ?? [] },
  { key: "ctype", expr: sql`j.company_tags`, array: true, top: TOP_BUCKETS, label: labelForCompanyTag, selected: (q) => q.ctype ?? [] },
  { key: "skills", expr: sql`j.skills`, array: true, top: TOP_BUCKETS, label: (v) => v, selected: (q) => q.skills ?? [] },
  { key: "batch", expr: sql`j.batches::text[]`, array: true, top: TOP_BUCKETS, label: (v) => v, selected: (q) => (q.batch ?? []).map(String) },
  { key: "source", expr: sql`j.source_ids`, array: true, top: TOP_BUCKETS, labelJoin: "sources", label: (v) => v, selected: (q) => q.source ?? [] },
  { key: "tag", expr: sql`j.tags`, array: true, top: TOP_BUCKETS, label: labelForTag, selected: (q) => q.tag ?? [] },
];

function facetSql(f: FacetDef, q: SearchQuery, text: TextMatch, now: Date): SQL {
  const where = whereClause(q, text, now, f.key);
  // unnest() in the select list (ProjectSet) is ~25 % cheaper than CROSS JOIN LATERAL unnest()
  const grouped = f.array
    ? sql`SELECT s.v, count(*)::int AS c FROM (SELECT unnest(${f.expr}) AS v FROM jobs j WHERE ${where}) s WHERE s.v IS NOT NULL GROUP BY 1`
    : sql`SELECT ${f.expr} AS v, count(*)::int AS c FROM jobs j WHERE ${where} AND ${f.expr} IS NOT NULL GROUP BY 1`;
  const selected = f.selected(q);
  const picked =
    f.top === null
      ? sql`SELECT v, c FROM f`
      : sql`(SELECT v, c FROM f ORDER BY c DESC, v COLLATE "C" LIMIT ${f.top}) UNION (SELECT v, c FROM f WHERE v = ANY(${textArray(selected)}))`;
  const label =
    f.labelJoin === "companies"
      ? { col: sql`co.name`, join: sql`LEFT JOIN companies co ON co.slug = p.v` }
      : f.labelJoin === "sources"
        ? { col: sql`so.name`, join: sql`LEFT JOIN sources so ON so.id = p.v` }
        : { col: sql`NULL::text`, join: sql`` };
  return sql`
    WITH f AS (${grouped}), p AS (${picked})
    SELECT p.v AS value, p.c AS count, ${label.col} AS label FROM p ${label.join}`;
}

export function toBuckets(f: FacetDef, rows: { value: string; count: number; label: string | null }[], q: SearchQuery): FacetBucket[] {
  const buckets: FacetBucket[] = rows.map((r) => ({ value: String(r.value), label: r.label ?? f.label(String(r.value)), count: r.count }));
  for (const s of f.selected(q)) {
    if (!buckets.some((b) => b.value === s)) buckets.push({ value: s, label: f.label(s), count: 0 });
  }
  return buckets.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

/**
 * Scalar facets that share the full WHERE clause (their own filter is inactive), computed in one scan with
 * GROUPING SETS — same result as one query per facet at ~¼ of the CPU.
 */
function groupedScalarSql(defs: readonly FacetDef[], q: SearchQuery, text: TextMatch, now: Date): SQL {
  const where = whereClause(q, text, now, null);
  const sets = sql.join(defs.map((f) => sql`(${f.expr})`), sql`, `);
  const facetName = sql.join(defs.map((f) => sql`WHEN GROUPING(${f.expr}) = 0 THEN ${f.key}::text`), sql` `);
  const value = sql.join(defs.map((f) => sql`(${f.expr})::text`), sql`, `);
  const limits = sql.join(defs.map((f) => sql`WHEN ${f.key}::text THEN ${f.top ?? 1_000_000}`), sql` `);
  return sql`
    WITH g AS (
      SELECT CASE ${facetName} END AS f, coalesce(${value}) AS v, count(*)::int AS c
      FROM jobs j WHERE ${where}
      GROUP BY GROUPING SETS (${sets})
    ), r AS (
      SELECT g.f, g.v, g.c, row_number() OVER (PARTITION BY g.f ORDER BY g.c DESC, g.v COLLATE "C") AS rn FROM g WHERE g.v IS NOT NULL
    )
    SELECT r.f AS facet, r.v AS value, r.c AS count, CASE WHEN r.f = 'company' THEN co.name END AS label
    FROM r LEFT JOIN companies co ON r.f = 'company' AND co.slug = r.v
    WHERE r.rn <= CASE r.f ${limits} ELSE 30 END`;
}

/**
 * Disjunctive facets: each facet applies every active filter except its own. Scalar facets whose own filter
 * is inactive share one GROUPING SETS scan; every other facet (arrays, or a facet whose filter is active)
 * gets its own query. All facet queries run in parallel.
 */
/** Memoiser supplied by callers that cache (the API): same key → same result. */
export type Memo = <T>(key: string, compute: () => Promise<T>) => Promise<T>;
const noMemo: Memo = (_key, compute) => compute();

const textKey = (t: TextMatch): string => (t.mode === "fts" ? `fts:${t.tsquery}` : t.mode === "trgm" ? `trgm:${t.plain}` : "none");

/** Canonical description of the filters a statement actually applies (all active filters except `except`'s). */
export function effectiveFilterKey(q: SearchQuery, except: FacetKey | null): string {
  return FILTERS.filter((f) => f.active(q) && (except === null || f.facet !== except))
    .map((f) => {
      const v = q[f.key];
      return `${f.key}=${Array.isArray(v) ? [...v].map(String).sort().join(",") : String(v)}`;
    })
    .join("&");
}

export async function searchFacets(db: Executor, q: SearchQuery, text: TextMatch, now: Date, memo: Memo = noMemo): Promise<Facets> {
  const activeOwn = new Set(FILTERS.filter((f) => f.facet !== null && f.active(q)).map((f) => f.facet!));
  const grouped = FACET_DEFS.filter((f) => !f.array && !activeOwn.has(f.key));
  const singles = grouped.length >= 2 ? FACET_DEFS.filter((f) => !grouped.includes(f)) : [...FACET_DEFS];
  type Row = { facet?: string; value: string; count: number; label: string | null };
  const tk = textKey(text);
  // Keys describe exactly what each statement computes, so e.g. the `location` facet of
  // {level=intern, location=Pune} is shared with the facets of {level=intern}.
  const [groupedRows, ...singleRows] = await Promise.all([
    grouped.length >= 2
      ? memo(`facet:${grouped.map((f) => f.key).join("+")}|${tk}|${effectiveFilterKey(q, null)}`, () => run<Row>(db, text, groupedScalarSql(grouped, q, text, now)))
      : Promise.resolve<Row[]>([]),
    ...singles.map((f) =>
      memo(`facet:${f.key}|${tk}|${effectiveFilterKey(q, f.key)}|sel=${f.selected(q).slice().sort().join(",")}`, () => run<Row>(db, text, facetSql(f, q, text, now))),
    ),
  ]);
  const out: Partial<Record<FacetKey, FacetBucket[]>> = {};
  if (grouped.length >= 2) for (const f of grouped) out[f.key] = toBuckets(f, groupedRows!.filter((r) => r.facet === f.key), q);
  singles.forEach((f, i) => {
    out[f.key] = toBuckets(f, singleRows[i]!, q);
  });
  return Object.fromEntries(FACET_DEFS.map((f) => [f.key, out[f.key] ?? []])) as unknown as Facets;
}

/** Every job has exactly one jobType, so the `type` facet (computed without the type filter) yields the total. */
export function totalFromFacets(facets: Facets, q: SearchQuery): number {
  const selected = q.type && q.type.length > 0 ? new Set<string>(q.type) : null;
  return facets.type.reduce((sum, b) => sum + (selected === null || selected.has(b.value) ? b.count : 0), 0);
}
