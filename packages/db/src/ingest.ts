/**
 * Ingest: validate → sanitise → merge by fingerprint (§0.4) → write jobs, job_sources, companies,
 * sources and the typo vocabulary in one transaction. Writes are serialised per process and, on Postgres,
 * across processes with an advisory transaction lock, so read-merge-write can never interleave.
 */
import { sql, type SQL } from "drizzle-orm";
import type { IngestResponse, JobInput, SourceTerms } from "@easyjobs/contract";
import type { Database, Executor } from "./client";
import { finalizeJob, mergeJob, priorityOf, recordChanged } from "./merge";
import { insertColumns, JOB_COLUMNS, recordset, selectList, SOURCE_COLUMNS, type JobRecord, type SourceRecord } from "./records";
import { htmlToPlainText, sanitizeDescription, summarizeText } from "./sanitize";
import type { JobStatus } from "./schema";
import { jobIdFor, textArray } from "./sql-util";
import { validateJob } from "./validate";

const INGEST_LOCK = 482_901_338;
/** Unchanged re-sightings refresh jobs.last_seen_at at most this often (keeps steady-state writes HOT-only). */
const LAST_SEEN_REFRESH_MS = 3_600_000;
const WRITE_CHUNK = 250;

const writeChains = new WeakMap<Database, Promise<unknown>>();

/** Serialise a write transaction (per process; plus pg_advisory_xact_lock on Postgres for multi-instance). */
export function withWriteLock<T>(db: Database, fn: (tx: Executor) => Promise<T>): Promise<T> {
  const prev = writeChains.get(db) ?? Promise.resolve();
  const run = prev
    .catch(() => undefined)
    .then(() =>
      db.transaction(async (tx) => {
        if (db.driver === "postgres") await tx.query(sql`select pg_advisory_xact_lock(${INGEST_LOCK})`);
        return fn(tx);
      }),
    );
  writeChains.set(db, run.catch(() => undefined));
  return run;
}

export interface PreparedInputs {
  valid: { index: number; job: JobInput }[];
  rejected: IngestResponse["rejected"];
}

/** Validate each item independently (bad items are rejected one at a time) and re-sanitise descriptions. */
export function prepareInputs(items: readonly unknown[]): PreparedInputs {
  const valid: PreparedInputs["valid"] = [];
  const rejected: PreparedInputs["rejected"] = [];
  items.forEach((item, index) => {
    const res = validateJob(item);
    if (!res.ok) {
      rejected.push({ index, error: res.error });
      return;
    }
    const job = res.job;
    job.descriptionHtml = sanitizeDescription(job.descriptionHtml);
    if (!job.descriptionText && job.descriptionHtml) job.descriptionText = htmlToPlainText(job.descriptionHtml) || null;
    if (!job.summary && job.descriptionText) job.summary = summarizeText(job.descriptionText) || null;
    valid.push({ index, job });
  });
  return { valid, rejected };
}

export interface UpsertResult extends IngestResponse {
  /** New open jobs created by this call (for "job created" events). */
  created: JobRecord[];
  /** Jobs whose row was written (inserted or changed). */
  written: number;
  /** Ids of every job row written (new, changed, re-opened, closed). */
  changedIds: string[];
}

const uniq = <T>(xs: Iterable<T>): T[] => [...new Set(xs)];
const pairKey = (source: string, sourceJobId: string): string => `${source}\u0000${sourceJobId}`;

export async function upsertJobs(db: Database, items: readonly unknown[], now: Date = new Date()): Promise<UpsertResult> {
  const { valid, rejected } = prepareInputs(items);
  if (valid.length === 0) return { inserted: 0, updated: 0, merged: 0, rejected, created: [], written: 0, changedIds: [] };
  const res = await withWriteLock(db, (tx) => applyInputs(tx, valid.map((v) => v.job), now));
  return { ...res, rejected };
}

export async function loadJobs(tx: Executor, where: SQL): Promise<JobRecord[]> {
  return tx.query<JobRecord>(sql`SELECT ${selectList(JOB_COLUMNS, "j")} FROM jobs j WHERE ${where}`);
}
export async function loadSources(tx: Executor, jobIds: readonly string[]): Promise<SourceRecord[]> {
  if (jobIds.length === 0) return [];
  return tx.query<SourceRecord>(
    sql`SELECT ${selectList(SOURCE_COLUMNS, "s")} FROM job_sources s WHERE s.job_id = ANY(${textArray(jobIds)}) ORDER BY s.id`,
  );
}

/** Deterministic ids from fingerprints; re-salted on the (astronomically rare) collision. */
async function assignIds(tx: Executor, fingerprints: readonly string[], idByFp: Map<string, string>): Promise<void> {
  let pending = fingerprints.map((fp) => ({ fp, id: jobIdFor(fp), salt: 0 }));
  const used = new Set(idByFp.values());
  while (pending.length > 0) {
    const taken = new Set(
      (await tx.query<{ id: string }>(sql`SELECT id FROM jobs WHERE id = ANY(${textArray(pending.map((p) => p.id))})`)).map((r) => r.id),
    );
    const retry: typeof pending = [];
    for (const p of pending) {
      if (taken.has(p.id) || used.has(p.id)) {
        retry.push({ fp: p.fp, id: jobIdFor(p.fp, p.salt + 1), salt: p.salt + 1 });
      } else {
        used.add(p.id);
        idByFp.set(p.fp, p.id);
      }
    }
    pending = retry;
  }
}

async function applyInputs(tx: Executor, inputs: readonly JobInput[], now: Date): Promise<Omit<UpsertResult, "rejected">> {
  const nowIso = now.toISOString();

  const fps = uniq(inputs.map((j) => j.fingerprint));
  const existing = await loadJobs(tx, sql`j.fingerprint = ANY(${textArray(fps)})`);
  const idByFp = new Map(existing.map((r) => [r.fingerprint, r.id]));
  await assignIds(
    tx,
    fps.filter((fp) => !idByFp.has(fp)),
    idByFp,
  );

  // Current owners of this batch's (source, sourceJobId) pairs — may belong to other fingerprints (moved).
  const pairs = uniq(inputs.map((j) => pairKey(j.source, j.sourceJobId))).map((k) => {
    const [source, sid] = k.split("\u0000") as [string, string];
    return { source, sid };
  });
  const owners = await tx.query<SourceRecord>(sql`
    SELECT ${selectList(SOURCE_COLUMNS, "s")}
    FROM job_sources s
    JOIN jsonb_to_recordset(${JSON.stringify(pairs)}::jsonb) AS p(source text, sid text)
      ON s.source = p.source AND s.source_job_id = p.sid`);

  const existingIds = new Set(existing.map((r) => r.id));
  const otherIds = uniq(owners.map((o) => o.jobId)).filter((id) => !existingIds.has(id));
  const others = otherIds.length > 0 ? await loadJobs(tx, sql`j.id = ANY(${textArray(otherIds)})`) : [];
  const original = new Map<string, JobRecord>([...existing, ...others].map((r) => [r.id, r]));

  const sourcesByJob = new Map<string, SourceRecord[]>();
  for (const s of await loadSources(tx, [...original.keys()])) {
    const list = sourcesByJob.get(s.jobId) ?? [];
    list.push(s);
    sourcesByJob.set(s.jobId, list);
  }
  const ownerByPair = new Map(owners.map((o) => [pairKey(o.source, o.sourceJobId), o]));

  const working = new Map<string, JobRecord>();
  const dirty = new Set<string>();
  const sourceWrites = new Map<string, SourceRecord>();
  let inserted = 0;
  let updated = 0;
  let merged = 0;

  for (const input of inputs) {
    const id = idByFp.get(input.fingerprint)!;
    const current = working.get(id) ?? original.get(id) ?? null;
    const key = pairKey(input.source, input.sourceJobId);
    const owner = ownerByPair.get(key);
    if (!current) inserted++;
    else if (owner && owner.jobId === id) updated++;
    else merged++;

    working.set(id, mergeJob(current, input, { id, now: nowIso }));
    dirty.add(id);

    if (owner && owner.jobId !== id) {
      // (source, sourceJobId) now resolves to a different fingerprint: move it; the old job is re-evaluated.
      const old = sourcesByJob.get(owner.jobId) ?? [];
      sourcesByJob.set(
        owner.jobId,
        old.filter((s) => pairKey(s.source, s.sourceJobId) !== key),
      );
      dirty.add(owner.jobId);
    }
    const rec: SourceRecord = {
      jobId: id,
      source: input.source,
      sourceName: input.sourceName,
      sourceKind: input.sourceKind,
      sourceJobId: input.sourceJobId,
      target: input.target,
      url: input.sourceUrl,
      firstSeenAt: owner?.firstSeenAt ?? nowIso,
      lastSeenAt: nowIso,
      removedAt: null,
      attribution: attributionOf(input.extra),
      terms: termsOf(input.extra),
    };
    const list = (sourcesByJob.get(id) ?? []).filter((s) => pairKey(s.source, s.sourceJobId) !== key);
    list.push(rec);
    sourcesByJob.set(id, list);
    ownerByPair.set(key, rec);
    sourceWrites.set(key, rec);
  }

  const toWrite: JobRecord[] = [];
  const created: JobRecord[] = [];
  const touchedCompanies = new Set<string>();
  for (const id of dirty) {
    const orig = original.get(id) ?? null;
    const base = working.get(id) ?? { ...orig!, fieldPrio: { ...orig!.fieldPrio } };
    const prevStatus: JobStatus | null = orig?.status ?? null;
    const job = finalizeJob(base, sourcesByJob.get(id) ?? [], now, prevStatus);
    if (!orig) {
      job.updatedAt = nowIso;
      toWrite.push(job);
      touchedCompanies.add(job.companySlug);
      if (job.status === "open") created.push(job);
      continue;
    }
    if (recordChanged(orig, job)) {
      job.updatedAt = nowIso;
      toWrite.push(job);
      touchedCompanies.add(job.companySlug);
      touchedCompanies.add(orig.companySlug);
    } else if (working.has(id) && now.getTime() - Date.parse(orig.lastSeenAt) > LAST_SEEN_REFRESH_MS) {
      job.updatedAt = orig.updatedAt;
      toWrite.push(job); // only last_seen_at differs → HOT update (no indexed column changes)
    }
  }

  const jobCols = insertColumns(JOB_COLUMNS);
  for (let i = 0; i < toWrite.length; i += WRITE_CHUNK) {
    const chunk = toWrite.slice(i, i + WRITE_CHUNK);
    await tx.query(sql`
      INSERT INTO jobs (${jobCols.cols})
      SELECT ${jobCols.values} FROM ${recordset(JOB_COLUMNS, chunk)}
      ON CONFLICT (id) DO UPDATE SET ${jobCols.updates(["id"])}`);
  }

  const srcCols = insertColumns(SOURCE_COLUMNS);
  const srcRows = [...sourceWrites.values()];
  for (let i = 0; i < srcRows.length; i += WRITE_CHUNK * 2) {
    const chunk = srcRows.slice(i, i + WRITE_CHUNK * 2);
    await tx.query(sql`
      INSERT INTO job_sources (${srcCols.cols})
      SELECT ${srcCols.values} FROM ${recordset(SOURCE_COLUMNS, chunk)}
      ON CONFLICT (source, source_job_id) DO UPDATE SET
        job_id = excluded.job_id, source_name = excluded.source_name, source_kind = excluded.source_kind,
        target = excluded.target, url = excluded.url, last_seen_at = excluded.last_seen_at, removed_at = NULL,
        attribution = coalesce(excluded.attribution, job_sources.attribution), terms = coalesce(excluded.terms, job_sources.terms)`);
  }

  await upsertSourcesTable(tx, inputs, nowIso);
  await upsertCompanies(tx, toWrite, nowIso);
  await refreshCompanyCounts(tx, [...touchedCompanies]);
  if (created.length > 0) await addVocabulary(tx, created.map((j) => j.id));

  return { inserted, updated, merged, created, written: toWrite.length, changedIds: toWrite.map((j) => j.id) };
}

async function upsertSourcesTable(tx: Executor, inputs: readonly JobInput[], nowIso: string): Promise<void> {
  const byId = new Map<string, { id: string; name: string; kind: string; at: string }>();
  for (const j of inputs) byId.set(j.source, { id: j.source, name: j.sourceName, kind: j.sourceKind, at: nowIso });
  await tx.query(sql`
    INSERT INTO sources (id, name, kind, first_seen_at, last_seen_at)
    SELECT x.id, x.name, x.kind, x.at, x.at
    FROM jsonb_to_recordset(${JSON.stringify([...byId.values()])}::jsonb) AS x(id text, name text, kind text, at timestamptz)
    ON CONFLICT (id) DO UPDATE SET name = excluded.name, kind = excluded.kind, last_seen_at = excluded.last_seen_at`);
}

/** Companies are upserted from job records: name/domain/logo from the most official source, tags unioned. */
async function upsertCompanies(tx: Executor, jobs: readonly JobRecord[], nowIso: string): Promise<void> {
  if (jobs.length === 0) return;
  const bySlug = new Map<string, { slug: string; name: string; domain: string | null; logoUrl: string | null; tags: string[]; prio: number }>();
  for (const j of jobs) {
    const prio = Math.max(j.fieldPrio.company ?? 0, priorityOf(j.bestSourceKind));
    const cur = bySlug.get(j.companySlug);
    if (!cur) {
      bySlug.set(j.companySlug, { slug: j.companySlug, name: j.company, domain: j.companyDomain, logoUrl: j.companyLogoUrl, tags: [...j.companyTags], prio });
      continue;
    }
    if (prio > cur.prio) {
      cur.name = j.company;
      cur.domain = j.companyDomain ?? cur.domain;
      cur.logoUrl = j.companyLogoUrl ?? cur.logoUrl;
      cur.prio = prio;
    } else {
      cur.domain ??= j.companyDomain;
      cur.logoUrl ??= j.companyLogoUrl;
    }
    cur.tags = uniq([...cur.tags, ...j.companyTags]);
  }
  await tx.query(sql`
    INSERT INTO companies (slug, name, domain, logo_url, tags, source_prio, open_jobs, updated_at)
    SELECT x.slug, x.name, x."domain", x."logoUrl", x.tags, x.prio, 0, ${nowIso}::timestamptz
    FROM jsonb_to_recordset(${JSON.stringify([...bySlug.values()])}::jsonb)
      AS x(slug text, name text, "domain" text, "logoUrl" text, tags text[], prio int)
    ON CONFLICT (slug) DO UPDATE SET
      name = CASE WHEN excluded.source_prio >= companies.source_prio THEN excluded.name ELSE companies.name END,
      domain = CASE WHEN excluded.domain IS NOT NULL AND (excluded.source_prio >= companies.source_prio OR companies.domain IS NULL)
                    THEN excluded.domain ELSE companies.domain END,
      logo_url = CASE WHEN excluded.logo_url IS NOT NULL AND (excluded.source_prio >= companies.source_prio OR companies.logo_url IS NULL)
                      THEN excluded.logo_url ELSE companies.logo_url END,
      tags = ARRAY(SELECT DISTINCT t FROM unnest(companies.tags || excluded.tags) AS t ORDER BY t),
      source_prio = greatest(companies.source_prio, excluded.source_prio),
      updated_at = excluded.updated_at`);
}

export async function refreshCompanyCounts(tx: Executor, slugs: readonly string[]): Promise<void> {
  if (slugs.length === 0) return;
  await tx.query(sql`
    UPDATE companies c SET open_jobs = x.n
    FROM (
      SELECT s.slug, (SELECT count(*)::int FROM jobs j WHERE j.company_slug = s.slug AND j.status = 'open') AS n
      FROM unnest(${textArray(uniq(slugs))}) AS s(slug)
    ) x
    WHERE c.slug = x.slug AND c.open_jobs IS DISTINCT FROM x.n`);
}

/** Title/company/skill/meta lexemes ('simple' config) of new jobs → typo-correction vocabulary. */
async function addVocabulary(tx: Executor, ids: readonly string[]): Promise<void> {
  await tx.query(sql`
    INSERT INTO search_terms (term, freq)
    SELECT u.lexeme, count(*)::int
    FROM jobs j,
      unnest(to_tsvector('simple', ej_search_norm(j.title || ' ' || j.company || ' ' || array_to_string(j.skills, ' ') || ' ' || j.search_meta))) AS u
    WHERE j.id = ANY(${textArray(ids)}) AND length(u.lexeme) BETWEEN 3 AND 40 AND u.lexeme ~ '^[a-z]'
    GROUP BY u.lexeme
    ON CONFLICT (term) DO UPDATE SET freq = search_terms.freq + excluded.freq`);
}

const TERM_KEYS = [
  "linkBackRequired", "followLinkRequired", "applyUrlUnchanged", "noJobPostingSchema",
  "noThirdPartySyndication", "creditRequired", "noLogoUse", "removeWhenExpired",
] as const satisfies readonly (keyof SourceTerms)[];

/** Contract 1.1: `extra.attribution` (worker copies `Scraper.attribution`), trimmed to 200 chars. */
function attributionOf(extra: Record<string, unknown> | undefined): string | null {
  const v = extra?.attribution;
  return typeof v === "string" && v.trim() ? v.trim().slice(0, 200) : null;
}

/** Contract 1.1: `extra.terms` (open-API scrapers), reduced to the known boolean flags. */
function termsOf(extra: Record<string, unknown> | undefined): SourceTerms | null {
  const raw = extra?.terms;
  if (!raw || typeof raw !== "object") return null;
  const out: SourceTerms = {};
  for (const k of TERM_KEYS) if ((raw as Record<string, unknown>)[k] === true) out[k] = true;
  return Object.keys(out).length > 0 ? out : null;
}
