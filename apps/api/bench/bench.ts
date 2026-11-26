/**
 * Load test for GET /v1/jobs (and /v1/suggest) with autocannon against a large synthetic DB.
 *
 *   pnpm --filter @easyjobs/api bench -- [--db pglite|postgres] [--url postgres://…] [--pglite-dir .data/pglite-bench]
 *                                        [--jobs 100000] [--duration 20] [--connections 10] [--scenarios single,moderate,cold,suggest,cached]
 *
 * Seeds the target DB through the real upsert path when it has fewer than --jobs jobs, runs the API in a child
 * process (so load generation and serving don't share an event loop), and records exact p50/p95/p99 from every
 * response time (autocannon itself reports p97.5, not p95). Results go to bench/results/*.json.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { cpus, tmpdir, totalmem } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import autocannon from "autocannon";
import { fromRepoRoot, loadRootEnv, openRepository, resetData, sql } from "@easyjobs/db";
import { generateSeedJobs } from "@easyjobs/db/seed";
import { buildRequestMix, SUGGEST_PREFIXES, urlPicker } from "./queries";

loadRootEnv();
const here = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const arg = (k: string, d?: string): string | undefined => {
  const i = argv.indexOf(`--${k}`);
  return i >= 0 ? argv[i + 1] : d;
};

const dbKind = (arg("db") ?? (arg("url") || process.env.DATABASE_URL ? "postgres" : "pglite")) as "pglite" | "postgres";
const url = dbKind === "postgres" ? (arg("url") ?? process.env.BENCH_DATABASE_URL ?? process.env.DATABASE_URL) : undefined;
const pgliteDir = fromRepoRoot(arg("pglite-dir") ?? ".data/pglite-bench");
const targetJobs = Number(arg("jobs") ?? 100_000);
const duration = Number(arg("duration") ?? 20);
const connections = Number(arg("connections") ?? 10);
const scenarios = (arg("scenarios") ?? "single,moderate,cold,suggest,cached").split(",");
if (dbKind === "postgres" && !url) throw new Error("--db postgres needs --url or DATABASE_URL");

const dbEnv: Record<string, string> = dbKind === "postgres" ? { DATABASE_URL: url! } : { DATABASE_URL: "", PGLITE_DIR: pgliteDir };

async function ensureData(): Promise<{ jobs: number; open: number }> {
  const repo = await openRepository(dbKind === "postgres" ? { url } : { url: null, pgliteDir });
  try {
    const count = async () => (await repo.db.query<{ n: number; o: number }>(sql`SELECT count(*)::int AS n, count(*) FILTER (WHERE status = 'open')::int AS o FROM jobs`))[0]!;
    let c = await count();
    if (c.n < targetJobs * 0.95) {
      const inputs = Math.round(targetJobs * 1.226); // ≈ 18 % cross-source duplicates merge away
      console.log(`seeding ${dbKind} with ~${targetJobs} jobs (${inputs} inputs) through the real upsert path…`);
      await resetData(repo.db);
      const jobs = generateSeedJobs({ count: inputs, seed: 42 });
      const t0 = Date.now();
      for (let i = 0; i < jobs.length; i += 500) {
        await repo.upsertJobs(jobs.slice(i, i + 500));
        if ((i / 500) % 40 === 0) console.log(`  ${i}/${jobs.length} (${Math.round((Date.now() - t0) / 1000)}s)`);
      }
      console.log(`seeded in ${Math.round((Date.now() - t0) / 1000)}s`);
      await repo.db.query(repo.db.driver === "postgres" ? sql`VACUUM ANALYZE` : sql`ANALYZE`);
      c = await count();
    }
    return { jobs: c.n, open: c.o };
  } finally {
    await repo.close();
  }
}

async function startApi(env: Record<string, string>, label: string): Promise<{ base: string; child: ChildProcess }> {
  const portFile = resolve(tmpdir(), `easyjobs-bench-port-${process.pid}-${Date.now()}`);
  const tsx = resolve(here, "../node_modules/.bin/tsx");
  const logFile = resolve(here, "results", `api-${dbKind}-${label}.log`);
  mkdirSync(dirname(logFile), { recursive: true });
  const log = openSync(logFile, "w");
  const child = spawn(tsx, ["src/index.ts"], {
    cwd: resolve(here, ".."),
    env: { ...process.env, ...dbEnv, API_PORT: "0", API_PORT_FILE: portFile, RATE_LIMIT_RPS: "0", LOG_LEVEL: "info", NODE_ENV: "production", ...env },
    stdio: ["ignore", log, log],
  });
  const deadline = Date.now() + 180_000;
  for (;;) {
    if (child.exitCode !== null) throw new Error(`API exited with ${child.exitCode} (see ${logFile})`);
    if (existsSync(portFile)) {
      const base = `http://127.0.0.1:${readFileSync(portFile, "utf8").trim()}`;
      try {
        const r = await fetch(`${base}/health`);
        // wait until the suggest + facet indexes are built (logged by the server)
        if (r.ok && /indexes ready|index warm-up failed/.test(readFileSync(logFile, "utf8"))) {
          rmSync(portFile, { force: true });
          return { base, child };
        }
      } catch {
        /* not up yet */
      }
    }
    if (Date.now() > deadline) throw new Error("API did not become healthy");
    await new Promise((r) => setTimeout(r, 250));
  }
}

async function stopApi(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null) return;
  const exited = new Promise<void>((res) => child.once("exit", () => res()));
  child.kill("SIGTERM");
  await Promise.race([exited, new Promise((r) => setTimeout(r, 15_000))]);
  if (child.exitCode === null) child.kill("SIGKILL");
}

interface Result {
  scenario: string;
  connections: number;
  durationS: number;
  requests: number;
  rps: number;
  p50: number;
  p95: number;
  p99: number;
  max: number;
  non2xx: number;
  errors: number;
}

const pct = (sorted: number[], p: number): number => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))]! : 0);

async function load(scenario: string, base: string, next: () => string, conns: number, seconds: number): Promise<Result> {
  // warm-up (not measured)
  await autocannon({ url: base, connections: conns, duration: 3, requests: [{ setupRequest: (req) => ({ ...req, path: next() }) }] });
  const latencies: number[] = [];
  const res = await new Promise<autocannon.Result>((resolveRun, reject) => {
    const instance = autocannon(
      { url: base, connections: conns, duration: seconds, requests: [{ setupRequest: (req) => ({ ...req, path: next() }) }] },
      (err, result) => (err ? reject(err) : resolveRun(result)),
    );
    instance.on("response", (_client, _status, _bytes, responseTime) => latencies.push(responseTime));
  });
  latencies.sort((a, b) => a - b);
  const r: Result = {
    scenario,
    connections: conns,
    durationS: seconds,
    requests: latencies.length,
    rps: Math.round(latencies.length / seconds),
    p50: Math.round(pct(latencies, 50) * 10) / 10,
    p95: Math.round(pct(latencies, 95) * 10) / 10,
    p99: Math.round(pct(latencies, 99) * 10) / 10,
    max: Math.round((latencies[latencies.length - 1] ?? 0) * 10) / 10,
    non2xx: res.non2xx,
    errors: res.errors + res.timeouts,
  };
  console.log(`  ${scenario.padEnd(26)} ${String(r.requests).padStart(6)} req  ${String(r.rps).padStart(5)} req/s  p50 ${r.p50} ms  p95 ${r.p95} ms  p99 ${r.p99} ms  max ${r.max} ms  non2xx ${r.non2xx}`);
  return r;
}

async function main(): Promise<void> {
  console.log(`benchmark: ${dbKind} (${dbKind === "postgres" ? url!.replace(/\/\/[^@]*@/, "//") : pgliteDir}) · ${cpus().length} CPUs · ${Math.round(totalmem() / 2 ** 30)} GB RAM`);
  const data = await ensureData();
  console.log(`dataset: ${data.jobs} jobs (${data.open} open)`);
  const mix = buildRequestMix();
  const results: Result[] = [];

  const run = async (env: Record<string, string>, label: string, fn: (base: string) => Promise<void>): Promise<void> => {
    const { base, child } = await startApi(env, label);
    try {
      await fn(base);
    } finally {
      await stopApi(child);
    }
  };

  if (["cold", "single", "moderate", "suggest"].some((x) => scenarios.includes(x))) {
    await run({ CACHE_TTL_MS: "0" }, "cache-off", async (base) => {
      if (scenarios.includes("single")) results.push(await load("/v1/jobs cache off, 1 conn", base, urlPicker(mix, 1), 1, duration));
      if (scenarios.includes("moderate")) results.push(await load("/v1/jobs cache off, 4 conn", base, urlPicker(mix, 4), 4, duration));
      if (scenarios.includes("cold")) results.push(await load(`/v1/jobs cache off, ${connections} conn`, base, urlPicker(mix, 2), connections, duration));
      if (scenarios.includes("suggest")) {
        let i = 0;
        results.push(await load(`/v1/suggest cache off, ${connections} conn`, base, () => `/v1/suggest?q=${encodeURIComponent(SUGGEST_PREFIXES[i++ % SUGGEST_PREFIXES.length]!)}`, connections, Math.min(duration, 10)));
      }
    });
  }
  if (scenarios.includes("cached")) {
    await run({ CACHE_TTL_MS: "20000" }, "cache-on", async (base) => {
      results.push(await load(`/v1/jobs cache on (20 s), ${connections} conn`, base, urlPicker(mix, 3), connections, duration));
    });
  }

  const out = resolve(here, "results");
  mkdirSync(out, { recursive: true });
  const file = resolve(out, `${dbKind}-${data.jobs}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  writeFileSync(file, JSON.stringify({ db: dbKind, dataset: data, cpus: cpus().length, node: process.version, at: new Date().toISOString(), results }, null, 2));
  console.log(`\n| scenario | req/s | p50 ms | p95 ms | p99 ms | non-2xx |\n|---|---|---|---|---|---|`);
  for (const r of results) console.log(`| ${r.scenario} | ${r.rps} | ${r.p50} | ${r.p95} | ${r.p99} | ${r.non2xx} |`);
  console.log(`\nresults → ${file}`);
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
