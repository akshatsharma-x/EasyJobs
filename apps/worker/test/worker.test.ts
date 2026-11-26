import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadConfig, type WorkerConfig } from "../src/config";
import { startFakeIngest, type FakeIngestServer } from "../src/dev/fake-ingest";
import type { TaskStatus } from "../src/scheduler";
import { Worker } from "../src/worker";
import { cleanupTempDirs, memoryLogger, tempDir, waitFor, writeFiles } from "./helpers";

let api: FakeIngestServer;
const workers: Worker[] = [];
beforeEach(async () => {
  api = await startFakeIngest();
});
afterEach(async () => {
  for (const w of workers.splice(0)) await w.stop();
  await api.close();
});
afterAll(cleanupTempDirs);

function config(repoRoot: string, extra: Record<string, string> = {}): WorkerConfig {
  const base = tempDir("p05-worker-");
  return loadConfig({
    WORKER_REPO_ROOT: repoRoot,
    WORKER_STATE_DIR: join(base, ".state"),
    WORKER_SPOOL_DIR: join(base, ".spool"),
    WORKER_OUT_DIR: join(base, "out"),
    API_URL: api.url,
    INGEST_API_KEY: "dev-ingest-key",
    WORKER_PORT: "0",
    WORKER_INITIAL_SPREAD_MINUTES: "0",
    WORKER_API_RETRIES: "0",
    ...extra,
  });
}

async function startWorker(cfg: WorkerConfig): Promise<{ worker: Worker; base: string }> {
  const worker = new Worker({ config: cfg, log: memoryLogger(), replayMinMs: 20, replayMaxMs: 100 });
  workers.push(worker);
  await worker.start();
  return { worker, base: `http://127.0.0.1:${worker.listeningPort}` };
}

const getJson = async <T>(url: string, init?: RequestInit): Promise<{ status: number; body: T }> => {
  const res = await fetch(url, init);
  return { status: res.status, body: (await res.json()) as T };
};

const PKG = (name: string): string => JSON.stringify({ name: `@easyjobs/scraper-${name}`, type: "module" });
const ATS_PKG = `export const scrapers = [{
  id: "fake-gh", name: "Fake Greenhouse", kind: "ats", intervalMinutes: 60, handlesAts: ["greenhouse"],
  async *scrape(ctx) {
    const t = ctx.targets[0];
    for (let i = 0; i < 3; i++) yield { source: "fake-gh", sourceKind: "ats", sourceJobId: t.slug + "-" + i,
      sourceUrl: "https://job-boards.greenhouse.io/" + t.token + "/jobs/" + (1000 + i) + t.slug.length,
      target: t.slug, applyUrl: null, title: "Engineer " + i, company: t.name, locations: ["Bengaluru, India"],
      descriptionHtml: "<p>Real job text</p>", postedAt: new Date().toISOString() };
  },
}];
export default scrapers;\n`;

describe("worker (scheduler + pipeline + status server) against a fake ingest API", () => {
  it("with no scraper packages, schedules the demo scraper and ingests its jobs", async () => {
    const cfg = config(tempDir("p05-empty-repo-"));
    const { worker, base } = await startWorker(cfg);
    await waitFor(() => api.runs.length >= 1, 10_000);
    expect(api.runs[0]).toMatchObject({ source: "demo", status: "ok", emitted: 30 });
    expect(api.stats().open).toBe(30);

    const health = await getJson<Record<string, unknown>>(`${base}/health`);
    expect(health.status).toBe(200);
    expect(health.body).toMatchObject({ ok: true, tasks: 1, normalizer: "fallback", registry: { kind: "fallback", companies: 10 } });

    const status = await getJson<{ tasks: TaskStatus[]; discovery: { scrapers: { id: string; scheduled: boolean }[] } }>(`${base}/status`);
    const demo = status.body.tasks.find((t) => t.id === "demo");
    expect(demo).toMatchObject({ lastStatus: "ok", emitted: 30, invalid: 0, paused: false, enabled: true });
    expect(demo?.nextRunAt).not.toBeNull();
    expect(demo?.lastDurationMs).toBeGreaterThanOrEqual(0);
    expect(status.body.discovery.scrapers).toEqual([expect.objectContaining({ id: "demo", scheduled: true })]);

    // manual trigger requires x-ingest-key
    expect((await getJson(`${base}/run/demo`, { method: "POST" })).status).toBe(401);
    expect((await getJson(`${base}/run/demo`, { method: "POST", headers: { "x-ingest-key": "wrong" } })).status).toBe(401);
    expect((await getJson(`${base}/run/nope`, { method: "POST", headers: { "x-ingest-key": "dev-ingest-key" } })).status).toBe(404);
    const triggered = await getJson<{ queued: string[] }>(`${base}/run/demo`, { method: "POST", headers: { "x-ingest-key": "dev-ingest-key" } });
    expect(triggered.status).toBe(202);
    expect(triggered.body.queued).toEqual(["demo"]);
    await waitFor(() => api.runs.length >= 2, 10_000);
    expect(api.sweeps.length).toBe(2);
    expect((await getJson(`${base}/nope`)).status).toBe(404);

    await worker.stop();
    const state = JSON.parse(readFileSync(join(cfg.stateDir, "state.json"), "utf8")) as { tasks: Record<string, { runs: number; lastSuccessAt: string }> };
    expect(state.tasks.demo?.runs).toBe(2);
    expect(state.tasks.demo?.lastSuccessAt).toBeTruthy();
    expect(existsSync(join(cfg.stateDir, "worker.lock"))).toBe(false);
  });

  it("schedules one task per (ATS scraper, registry target), survives a broken package, and picks up new packages on re-scan", async () => {
    const repo = tempDir("p05-repo-");
    writeFiles(repo, {
      "packages/scrapers/fake-ats/package.json": PKG("fake-ats"),
      "packages/scrapers/fake-ats/src/index.ts": ATS_PKG,
      "packages/scrapers/broken/package.json": PKG("broken"),
      "packages/scrapers/broken/src/index.ts": "export const scrapers = [ { id: 'x', ;\n",
    });
    const { worker, base } = await startWorker(config(repo));
    await waitFor(() => api.runs.length >= 3, 10_000);
    const targets = api.runs.map((r) => r.target).sort();
    expect(targets).toEqual(["databricks", "inmobi", "mongodb"]);
    expect(api.sweeps.map((s) => `${s.source}/${s.target}:${s.seenSourceJobIds.length}`).sort()).toEqual(["fake-gh/databricks:3", "fake-gh/inmobi:3", "fake-gh/mongodb:3"]);
    const status = await getJson<{ tasks: TaskStatus[]; discovery: { packages: { name: string; status: string }[] } }>(`${base}/status`);
    expect(status.body.tasks.map((t) => t.id)).toEqual(["fake-gh:databricks", "fake-gh:inmobi", "fake-gh:mongodb"]);
    expect(status.body.tasks.find((t) => t.id === "fake-gh:inmobi")?.intervalMinutes).toBe(15);
    expect(status.body.discovery.packages.find((p) => p.name.endsWith("broken"))?.status).toBe("broken");

    writeFiles(repo, {
      "packages/scrapers/late/package.json": PKG("late"),
      "packages/scrapers/late/src/index.ts": `export const scrapers = [{ id: "late-feed", name: "Late", kind: "job_board", intervalMinutes: 30, async *scrape() {} }];\n`,
    });
    await worker.rescan("test");
    const after = await getJson<{ tasks: TaskStatus[] }>(`${base}/status?source=late-feed`);
    expect(after.body.tasks.map((t) => t.id)).toEqual(["late-feed"]);
  });

  it("spools while the API is down and replays in the background when it is back (also across restarts)", async () => {
    api.failWith = 503;
    const cfg = config(tempDir("p05-empty-repo-"));
    const first = await startWorker(cfg);
    await waitFor(() => (first.worker.health().spool as { pending: number }).pending >= 3, 10_000);
    await first.worker.stop(); // stop with a non-empty spool
    expect(api.runs).toHaveLength(0);

    api.failWith = null;
    const second = await startWorker(cfg); // adopts the leftover spool segment and replays it first
    await waitFor(() => api.runs.length >= 1 && (second.worker.health().spool as { pending: number }).pending === 0, 10_000);
    expect(api.runs[0]).toMatchObject({ source: "demo", status: "ok" });
    expect(api.stats().open).toBe(30);
  });
});
