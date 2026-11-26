/**
 * pnpm --filter @easyjobs/db seed [--count 2000] [--seed 42] [--batch 500] [--reset] [--via-api] [--pglite-dir <dir>]
 *
 * Generates synthetic JobInputs and ingests them through the real upsert path (validation, sanitising,
 * merging). Uses DATABASE_URL (Postgres) or PGlite. If PGlite is locked by a running API (or --via-api),
 * the jobs are POSTed to the API's /v1/ingest/jobs instead.
 */
import { gzipSync } from "node:zlib";
import { sql } from "drizzle-orm";
import { API_ROUTES, type IngestResponse, type JobInput, type RunReport } from "@easyjobs/contract";
import { PgliteLockedError } from "../client";
import { resetData } from "../maintenance";
import { loadRootEnv } from "../paths";
import { openRepository, type Repository } from "../repository";
import { generateSeedJobs, seedCompanyProfiles } from "./generate";

loadRootEnv();

const argv = process.argv.slice(2);
const arg = (name: string): string | undefined => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
};
const flag = (name: string): boolean => argv.includes(`--${name}`);

const count = Math.max(1, Number(arg("count") ?? 2000));
const seed = Number(arg("seed") ?? 42);
const batchSize = Math.min(500, Math.max(1, Number(arg("batch") ?? 500)));
const pgliteDir = arg("pglite-dir");

function summarize(label: string, totals: IngestResponse, ms: number, n: number): void {
  console.log(
    `${label}: ${n} inputs in ${(ms / 1000).toFixed(1)}s (${Math.round(n / (ms / 1000))}/s) → ` +
      `inserted ${totals.inserted}, updated ${totals.updated}, merged ${totals.merged}, rejected ${totals.rejected.length}`,
  );
  if (totals.rejected.length > 0) console.log("first rejections:", totals.rejected.slice(0, 3));
}

function runReports(jobs: readonly JobInput[], startedAt: string): RunReport[] {
  const bySource = new Map<string, number>();
  for (const j of jobs) bySource.set(j.source, (bySource.get(j.source) ?? 0) + 1);
  const finishedAt = new Date().toISOString();
  return [...bySource].map(([source, emitted]) => ({
    runId: `seed-${seed}-${source}`,
    source,
    target: null,
    startedAt,
    finishedAt,
    status: "ok" as const,
    emitted,
    invalid: 0,
    errors: [],
  }));
}

async function seedDirect(repo: Repository, jobs: JobInput[]): Promise<void> {
  if (flag("reset")) {
    await resetData(repo.db);
    console.log("reset: all tables truncated");
  }
  const startedAt = new Date().toISOString();
  const totals: IngestResponse = { inserted: 0, updated: 0, merged: 0, rejected: [] };
  const t0 = Date.now();
  for (let i = 0; i < jobs.length; i += batchSize) {
    const res = await repo.upsertJobs(jobs.slice(i, i + batchSize));
    totals.inserted += res.inserted;
    totals.updated += res.updated;
    totals.merged += res.merged;
    totals.rejected.push(...res.rejected.map((r) => ({ ...r, index: r.index + i })));
    if (jobs.length >= 10_000 && (i / batchSize) % 20 === 0) {
      process.stdout.write(`  … ${Math.min(i + batchSize, jobs.length)}/${jobs.length} (${Math.round((Date.now() - t0) / 1000)}s)\n`);
    }
  }
  summarize("seed", totals, Date.now() - t0, jobs.length);
  for (const r of runReports(jobs, startedAt)) await repo.recordRun(r);
  const enriched = await repo.syncCompanyProfiles(seedCompanyProfiles());
  const expired = await repo.expireStale();
  console.log(`companies enriched: ${enriched} · closed by freshness rules: ${expired.closed}`);
  const tA = Date.now();
  await repo.db.query(repo.db.driver === "postgres" ? sql`VACUUM ANALYZE` : sql`ANALYZE`);
  console.log(`${repo.db.driver === "postgres" ? "VACUUM ANALYZE" : "ANALYZE"} ${Date.now() - tA} ms`);
  const s = await repo.stats();
  console.log(
    `db: ${repo.db.location} · open ${s.totalOpen} · new 24h ${s.newLast24h} · companies ${s.companies} · sources ${s.sources.map((x) => `${x.id}=${x.open}`).join(" ")}`,
  );
}

async function seedViaApi(jobs: JobInput[]): Promise<void> {
  const base = process.env.API_URL ?? `http://localhost:${process.env.API_PORT ?? 4000}`;
  const key = process.env.INGEST_API_KEY ?? "dev-ingest-key";
  const health = await fetch(`${base}${API_ROUTES.health}`).catch(() => null);
  if (!health?.ok) throw new Error(`API not reachable at ${base} (start it with: pnpm --filter @easyjobs/api dev)`);
  console.log(`seeding through the API at ${base}`);
  const totals: IngestResponse = { inserted: 0, updated: 0, merged: 0, rejected: [] };
  const t0 = Date.now();
  const startedAt = new Date().toISOString();
  for (let i = 0; i < jobs.length; i += batchSize) {
    const body = gzipSync(JSON.stringify({ source: "seed", runId: `seed-${seed}-${i}`, jobs: jobs.slice(i, i + batchSize) }));
    const res = await fetch(`${base}${API_ROUTES.ingestJobs}`, {
      method: "POST",
      headers: { "content-type": "application/json", "content-encoding": "gzip", "x-ingest-key": key },
      body,
    });
    if (!res.ok) throw new Error(`ingest failed: HTTP ${res.status} ${await res.text()}`);
    const r = (await res.json()) as IngestResponse;
    totals.inserted += r.inserted;
    totals.updated += r.updated;
    totals.merged += r.merged;
    totals.rejected.push(...r.rejected);
  }
  for (const r of runReports(jobs, startedAt)) {
    await fetch(`${base}${API_ROUTES.ingestRuns}`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-ingest-key": key },
      body: JSON.stringify(r),
    });
  }
  summarize("seed (via API)", totals, Date.now() - t0, jobs.length);
}

async function main(): Promise<void> {
  const t0 = Date.now();
  const jobs = generateSeedJobs({ count, seed });
  console.log(`generated ${jobs.length} synthetic JobInputs in ${Date.now() - t0} ms (seed ${seed})`);
  if (flag("via-api")) return seedViaApi(jobs);
  let repo: Repository;
  try {
    repo = await openRepository({ pgliteDir });
  } catch (e) {
    if (e instanceof PgliteLockedError) {
      console.log(`${e.message}\n→ falling back to the running API`);
      return seedViaApi(jobs);
    }
    throw e;
  }
  try {
    await seedDirect(repo, jobs);
  } finally {
    await repo.close();
  }
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
