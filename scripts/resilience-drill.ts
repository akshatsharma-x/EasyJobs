/**
 * `pnpm resilience-drill` — W2 resilience drill against a real worker process (apps/worker, `start` mode):
 *
 *   1. one source answers HTTP 500 → the polite HTTP client retries, the task fails, the scheduler backs off
 *      exponentially and opens the circuit breaker after WORKER_BREAKER_THRESHOLD (5) consecutive failures;
 *   2. one scraper package is broken (throws at import) → discovery reports it and the worker keeps running;
 *   3. a healthy source keeps delivering jobs the whole time.
 *
 * Isolated: the worker gets a throwaway WORKER_REPO_ROOT holding only the three drill packages, its own
 * state/spool dirs and port, and a local stub in place of the API — the real database is never touched.
 * Timings are shortened (backoff base 1.2 s, breaker pause 36 s); the thresholds are the production defaults.
 * The API-outage drill (spool + replay) runs against the real API: see docs/qa-report.md.
 */
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DRILL_PORT = Number(process.env.DRILL_WORKER_PORT ?? 4198);
const BACKOFF_MIN = 0.02; // 1.2 s base → 1.2, 2.4, 4.8, 9.6 s
const PAUSE_HOURS = 0.01; // 36 s breaker pause
const THRESHOLD = 5;

/* ───────────── stub API + failing upstream ───────────── */

const hits = { fail: [] as number[], ok: 0, ingestedJobs: 0, runs: [] as { source: string; status: string; at: number }[] };
const readBody = (req: IncomingMessage): Promise<Buffer> =>
  new Promise((ok) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => ok(Buffer.concat(chunks)));
  });
const json = (res: ServerResponse, status: number, body: unknown) => {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
};
const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://stub");
  const body = await readBody(req);
  if (url.pathname === "/robots.txt") return void res.end("User-agent: *\nAllow: /\n");
  if (url.pathname === "/upstream/fail") {
    hits.fail.push(Date.now());
    return json(res, 500, { error: "simulated upstream failure" });
  }
  if (url.pathname === "/upstream/ok") {
    hits.ok++;
    return json(res, 200, { ok: true });
  }
  if (url.pathname === "/health") return json(res, 200, { ok: true, db: "stub", version: "drill" });
  if (url.pathname === "/v1/ingest/jobs") {
    const { gunzipSync } = await import("node:zlib");
    const raw = req.headers["content-encoding"] === "gzip" ? gunzipSync(body) : body;
    const payload = JSON.parse(raw.toString("utf8")) as { jobs: unknown[] };
    hits.ingestedJobs += payload.jobs.length;
    return json(res, 200, { inserted: payload.jobs.length, updated: 0, merged: 0, rejected: [] });
  }
  if (url.pathname === "/v1/ingest/runs") {
    const run = JSON.parse(body.toString("utf8")) as { source: string; status: string };
    hits.runs.push({ source: run.source, status: run.status, at: Date.now() });
    return json(res, 200, { ok: true });
  }
  if (url.pathname === "/v1/ingest/sweep") return json(res, 200, { closed: 0, removed: 0 });
  if (url.pathname === "/v1/ingest/known") return json(res, 200, { ids: [] });
  return json(res, 404, { error: { code: "not_found", message: url.pathname } });
});
await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok));
const STUB = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

/* ───────────── drill packages ───────────── */

const drillRoot = mkdtempSync(join(tmpdir(), "ej-drill-"));
const pkg = (name: string, index: string) => {
  const dir = join(drillRoot, "packages", "scrapers", name);
  mkdirSync(join(dir, "src"), { recursive: true });
  writeFileSync(join(dir, "package.json"), JSON.stringify({ name: `@easyjobs/scraper-${name}`, type: "module", main: "./src/index.ts" }));
  writeFileSync(join(dir, "src", "index.ts"), index);
};
pkg(
  "drill-500",
  `export const scrapers = [{
  id: "drill-500", name: "Drill: always 500", kind: "job_board", intervalMinutes: 0.02,
  async *scrape(ctx) { await ctx.http.json(${JSON.stringify(`${STUB}/upstream/fail`)}); },
}];\n`,
);
pkg(
  "drill-ok",
  `let run = 0;
export const scrapers = [{
  id: "drill-ok", name: "Drill: healthy", kind: "job_board", intervalMinutes: 0.05,
  async *scrape(ctx) {
    await ctx.http.json(${JSON.stringify(`${STUB}/upstream/ok`)});
    run++;
    for (let i = 0; i < 3; i++) yield { source: "drill-ok", sourceKind: "job_board", sourceJobId: \`r\${run}-\${i}\`, sourceUrl: \`https://drill.test/\${run}/\${i}\`,
      target: null, applyUrl: \`https://drill.test/\${run}/\${i}\`, title: \`Drill Engineer \${i}\`, company: "Drill Co", locations: ["Bengaluru"], descriptionHtml: "<p>drill</p>", postedAt: new Date().toISOString() };
  },
}];\n`,
);
pkg("drill-broken", "throw new Error('drill: kaboom at import time');\nexport const scrapers = [];\n");

/* ───────────── worker ───────────── */

const workerDir = join(ROOT, "apps", "worker");
const scratch = mkdtempSync(join(tmpdir(), "ej-drill-state-"));
const worker = spawn(join(ROOT, "node_modules", ".bin", "tsx"), ["src/cli.ts", "start"], {
  cwd: workerDir,
  env: {
    ...process.env,
    WORKER_REPO_ROOT: drillRoot,
    API_URL: STUB,
    WORKER_PORT: String(DRILL_PORT),
    WORKER_STATE_DIR: join(scratch, "state"),
    WORKER_SPOOL_DIR: join(scratch, "spool"),
    WORKER_OUT_DIR: join(scratch, "out"),
    WORKER_BACKOFF_BASE_MINUTES: String(BACKOFF_MIN),
    WORKER_BREAKER_THRESHOLD: String(THRESHOLD),
    WORKER_BREAKER_PAUSE_HOURS: String(PAUSE_HOURS),
    WORKER_INITIAL_SPREAD_MINUTES: "0",
    WORKER_MIN_INTERVAL_MINUTES: "0",
    WORKER_JITTER: "0",
    WORKER_DISABLED_SOURCES: "",
    LOG_LEVEL: "warn",
  },
  stdio: ["ignore", "pipe", "pipe"],
});
let workerLog = "";
worker.stdout.on("data", (d: Buffer) => (workerLog += d.toString()));
worker.stderr.on("data", (d: Buffer) => (workerLog += d.toString()));
const workerExited = new Promise<number | null>((ok) => worker.on("exit", (code) => ok(code)));

type Task = { id: string; lastStatus: string | null; consecutiveFailures: number; failures: number; runs: number; paused: boolean; pausedUntil: string | null; pausedReason: string | null; nextRunAt: string | null };
type Status = { tasks: Task[]; discovery: { packages: { name: string; status: string; problems: string[] }[] } };
const status = async (): Promise<Status | null> => {
  try {
    return (await (await fetch(`http://127.0.0.1:${DRILL_PORT}/status`)).json()) as Status;
  } catch {
    return null;
  }
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const timeline: string[] = [];
const checks: { name: string; ok: boolean; detail: string }[] = [];
const check = (name: string, ok: boolean, detail: string) => checks.push({ name, ok, detail });
const t0 = Date.now();
const at = () => `${((Date.now() - t0) / 1000).toFixed(1)}s`;

try {
  let s: Status | null = null;
  for (let i = 0; i < 60 && !s; i++) {
    s = await status();
    if (!s) await sleep(500);
  }
  if (!s) throw new Error(`drill worker never answered on :${DRILL_PORT}\n${workerLog}`);
  timeline.push(`${at()} worker up; tasks: ${s.tasks.map((t) => t.id).join(", ")}`);

  // Watch until the breaker has opened, the pause has passed and the half-open probe has failed again.
  let openedAt: number | null = null;
  let failuresAtOpen = 0;
  let lastFailures = 0;
  let reopened = false;
  const deadline = Date.now() + 150_000;
  while (Date.now() < deadline) {
    s = (await status()) ?? s;
    const bad = s.tasks.find((t) => t.id === "drill-500");
    if (bad && bad.failures !== lastFailures) {
      lastFailures = bad.failures;
      timeline.push(`${at()} drill-500 failure #${bad.failures} (consecutive ${bad.consecutiveFailures}) → next ${bad.paused ? `paused until ${bad.pausedUntil} (${bad.pausedReason})` : bad.nextRunAt}`);
    }
    if (bad?.paused && openedAt === null) {
      openedAt = Date.now();
      failuresAtOpen = hits.fail.length;
    }
    if (openedAt !== null && bad && bad.failures > THRESHOLD) {
      reopened = Boolean(bad.paused);
      if (reopened) break;
    }
    await sleep(500);
  }
  s = (await status()) ?? s;
  const bad = s.tasks.find((t) => t.id === "drill-500");
  const good = s.tasks.find((t) => t.id === "drill-ok");
  const broken = s.discovery.packages.find((p) => p.name === "@easyjobs/scraper-drill-broken");

  // 1. 500s: per-request retries, exponential task backoff, breaker
  const runsOf500 = hits.runs.filter((r) => r.source === "drill-500");
  const perRun = runsOf500.length > 0 ? hits.fail.length / Math.max(1, bad?.failures ?? 1) : 0;
  check("HTTP client retries a 500 before giving up", perRun >= 2, `${hits.fail.length} upstream requests over ${bad?.failures ?? 0} failed runs (≈ ${perRun.toFixed(1)} per run)`);
  // Wait = from a failed run's report to the next run's first upstream request (excludes the run's own retries).
  const ends = runsOf500.filter((r) => r.status === "error").map((r) => r.at);
  const waits = ends
    .slice(0, THRESHOLD - 1)
    .map((end) => {
      const next = hits.fail.find((t) => t > end);
      return next === undefined ? Number.NaN : (next - end) / 1000;
    })
    .filter(Number.isFinite);
  const growing = waits.length >= 3 && waits.slice(1).every((w, i) => w > waits[i]!) && waits[waits.length - 1]! >= 3 * waits[0]!;
  check("task backoff grows exponentially between failures", growing, `wait after each failed run: ${waits.map((w) => `${w.toFixed(1)} s`).join(" → ")} (base ${(BACKOFF_MIN * 60).toFixed(1)} s, doubling)`);
  check(`breaker opens after ${THRESHOLD} consecutive failures`, openedAt !== null && (bad?.failures ?? 0) >= THRESHOLD, `paused: ${bad?.paused} · ${bad?.pausedReason ?? ""}`);
  const duringPause = hits.fail.filter((t) => openedAt !== null && t > openedAt + 1000 && t < openedAt + PAUSE_HOURS * 3_600_000 - 1000).length;
  check("no upstream requests while the breaker is open", openedAt !== null && duringPause === 0, `${duringPause} requests during the ${PAUSE_HOURS * 3600} s pause (${failuresAtOpen} before it)`);
  check("half-open probe after the pause; failing again re-opens", reopened, `failures: ${bad?.failures} · paused again: ${bad?.paused}`);

  // 2. broken package
  check("a package that throws at import is reported, not fatal", broken?.status === "broken" && /kaboom/.test(broken.problems.join(" ")), `${broken?.status}: ${broken?.problems[0] ?? "—"}`);
  // 3. the healthy source kept working, and the worker never died
  check("the healthy source kept delivering", (good?.runs ?? 0) >= 2 && good?.lastStatus === "ok" && hits.ingestedJobs >= 6, `drill-ok: ${good?.runs} runs, last ${good?.lastStatus}; ${hits.ingestedJobs} jobs ingested`);
  check("the worker process stayed up", worker.exitCode === null, `exit code ${worker.exitCode}`);
} finally {
  worker.kill("SIGTERM");
  await Promise.race([workerExited, sleep(10_000)]);
  server.close();
  rmSync(drillRoot, { recursive: true, force: true });
  rmSync(scratch, { recursive: true, force: true });
}

console.log("## Resilience drill (isolated worker, stub API)\n");
for (const line of timeline) console.log(`    ${line}`);
console.log("");
for (const c of checks) console.log(`- ${c.ok ? "✅" : "❌"} ${c.name} — ${c.detail}`);
const failed = checks.filter((c) => !c.ok).length;
console.log(`\n${checks.length - failed}/${checks.length} checks passed`);
if (failed > 0 && process.env.DRILL_VERBOSE) console.log(workerLog.slice(-4000));
process.exit(failed > 0 ? 1 : 0);
