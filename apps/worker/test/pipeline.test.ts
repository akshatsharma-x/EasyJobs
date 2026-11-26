import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import type { IngestRequest, RawJob, RunReport, SweepRequest } from "@easyjobs/contract";
import type { ScrapeContext, Scraper } from "@easyjobs/contract/node";
import { ShutdownAbort, TaskTimeout } from "../src/abort";
import { IngestApiClient } from "../src/api-client";
import { Delivery } from "../src/delivery";
import { startFakeIngest, type FakeIngestServer } from "../src/dev/fake-ingest";
import { runPipeline, sweepDeferred, type PipelineInput } from "../src/pipeline";
import { DryRunSink, type JobSink } from "../src/sink";
import { Spool } from "../src/spool";
import { cleanupTempDirs, company, fakeScraper, memoryLogger, pipelineContext, rawJob, tempDir, waitFor } from "./helpers";

const jobsFor = (source: string, n: number, target: string | null = "feed-1", from = 0): RawJob[] =>
  Array.from({ length: n }, (_, i) => rawJob(from + i, { source, target, description: undefined } as Partial<RawJob>));

let server: FakeIngestServer;
beforeEach(async () => {
  server = await startFakeIngest();
});
afterEach(async () => {
  await server.close();
});
afterAll(cleanupTempDirs);

function makeDelivery(o: { url?: string; key?: string; gzip?: boolean; autoReplay?: boolean; spoolDir?: string } = {}) {
  const log = memoryLogger();
  const api = new IngestApiClient({ baseUrl: o.url ?? server.url, key: o.key ?? "dev-ingest-key", retries: 1, retryBaseMs: 5, retryMaxMs: 20, timeoutMs: 3000, gzip: o.gzip ?? true, log });
  const spool = new Spool(o.spoolDir ?? tempDir("p05-spool-"), { log });
  const delivery = new Delivery(api, spool, { log, autoReplay: o.autoReplay ?? false, replayMinMs: 10, replayMaxMs: 40 });
  return { api, spool, delivery, log };
}

function run(scraper: Scraper, sink: JobSink, o: Partial<PipelineInput> = {}) {
  return runPipeline({ taskId: scraper.id, scraper, target: null, signal: new AbortController().signal, ...o }, pipelineContext(sink));
}

const ingestPaths = (): string[] => server.requests.filter((r) => r.path.startsWith("/v1/ingest/") && r.method === "POST").map((r) => r.path.replace("/v1/ingest/", ""));

describe("pipeline → fake ingest API", () => {
  it("batches 450 jobs as 200/200/50 gzip POSTs, then sweeps, then reports the run", async () => {
    const { delivery } = makeDelivery();
    const scraper = fakeScraper({ id: "feed", kind: "job_board", jobs: () => jobsFor("feed", 450) });
    const r = await run(scraper, delivery);
    expect(r.status).toBe("ok");
    const batches = server.calls("/v1/ingest/jobs");
    expect(batches.map((b) => (b.body as IngestRequest).jobs.length)).toEqual([200, 200, 50]);
    expect(batches.every((b) => b.gzip)).toBe(true);
    expect(new Set(batches.map((b) => (b.body as IngestRequest).runId)).size).toBe(1);
    expect(ingestPaths()).toEqual(["jobs", "jobs", "jobs", "sweep", "runs"]);
    const sweep = server.calls("/v1/ingest/sweep")[0]?.body as SweepRequest;
    expect(sweep).toMatchObject({ source: "feed", target: "feed-1" });
    expect(sweep.seenSourceJobIds).toHaveLength(450);
    const report = server.runs[0] as RunReport;
    expect(report).toMatchObject({ source: "feed", target: null, status: "ok", emitted: 450, invalid: 0, runId: r.runId });
    expect(r.counts).toMatchObject({ raw: 450, valid: 450, sent: 450, inserted: 450, batches: 3 });
    expect(server.jobs.size).toBe(450);
    expect(r.summary).toMatch(/^ok\s+feed .*450 read, 450 valid, 0 invalid, 0 dup \| sent 450 \(450 new, 0 upd, 0 merged\) \| sweep 1 target\(s\)/);
  });

  it("drops and counts invalid jobs, dedupes by fingerprint, and still counts every listed id as seen", async () => {
    const { delivery } = makeDelivery();
    const jobs = [
      ...jobsFor("feed", 5),
      rawJob("bad-url", { source: "feed", target: "feed-1", sourceUrl: "not-a-url" }),
      rawJob("no-title", { source: "feed", target: "feed-1", title: "   " }),
      rawJob("dup-1", { source: "feed", target: "feed-1", applyUrl: "https://jobs.acme.test/postings/0" }),
      rawJob("dup-2", { source: "feed", target: "feed-1", applyUrl: "https://jobs.acme.test/postings/1?utm_source=x" }),
    ];
    const r = await run(fakeScraper({ id: "feed", jobs: () => jobs }), delivery);
    expect(r.counts).toMatchObject({ raw: 9, valid: 5, invalid: 2, duplicates: 2 });
    expect(r.status).toBe("ok");
    expect(server.runs[0]?.invalid).toBe(2);
    expect(server.runs[0]?.errors.join(" ")).toMatch(/2 invalid jobs: .*sourceUrl must be an absolute http\(s\) URL \(1\).*title is required \(1\)/);
    const seen = (server.calls("/v1/ingest/sweep")[0]?.body as SweepRequest).seenSourceJobIds;
    expect(seen).toHaveLength(9);
  });

  it("sweeps ONLY after a complete full run (not after errors, limits, incremental runs or aborts)", async () => {
    const { delivery } = makeDelivery();
    const ok = fakeScraper({ id: "feed", jobs: () => jobsFor("feed", 10) });
    const failing = fakeScraper({ id: "feed", jobs: () => jobsFor("feed", 10), failAfter: 6, error: "boom on page 2" });

    const partial = await run(failing, delivery);
    expect(partial.status).toBe("partial");
    expect(partial.failure).toBe(false);
    expect(partial.complete).toBe(false);
    expect(server.runs.at(-1)?.errors[0]).toMatch(/scrape failed: boom on page 2/);
    expect(server.jobs.size).toBe(6); // partial results are still ingested

    expect((await run(ok, delivery, { limit: 5 })).complete).toBe(false);
    expect((await run(ok, delivery, { since: new Date("2026-11-20T00:00:00Z") })).complete).toBe(false);
    const ac = new AbortController();
    ac.abort(new TaskTimeout("timed out after 30m"));
    const timedOut = await run(ok, delivery, { signal: ac.signal });
    expect(timedOut).toMatchObject({ status: "error", failure: true, aborted: "timeout", complete: false });
    expect(server.calls("/v1/ingest/sweep")).toHaveLength(0);

    const full = await run(ok, delivery);
    expect(full.complete).toBe(true);
    expect(server.calls("/v1/ingest/sweep")).toHaveLength(1);

    // a later complete run without jobs 8 and 9 closes exactly those two
    const shrunk = await run(fakeScraper({ id: "feed", jobs: () => jobsFor("feed", 8) }), delivery, { previousTargetCounts: full.targetCounts ?? {} });
    expect(shrunk.sweeps).toEqual([{ target: "feed-1", seen: 8, outcome: "sent", closed: 2 }]);
    expect(server.stats().closed).toBe(2);
  });

  it("defers a sweep when a target suddenly drops to zero (or by >80 %) until the next complete run confirms it", async () => {
    expect(sweepDeferred(0, 50)).toBe(true);
    expect(sweepDeferred(0, undefined)).toBe(true);
    expect(sweepDeferred(0, 0)).toBe(false);
    expect(sweepDeferred(3, 100)).toBe(true);
    expect(sweepDeferred(30, 100)).toBe(false);
    expect(sweepDeferred(3, 10)).toBe(false);

    const { delivery } = makeDelivery();
    const acme = company("acme");
    const empty = fakeScraper({ id: "gh", handlesAts: ["greenhouse"], jobs: () => [] });
    const first = await run(empty, delivery, { target: acme, previousTargetCounts: { acme: 50 } });
    expect(first.sweeps).toEqual([expect.objectContaining({ target: "acme", seen: 0, outcome: "deferred" })]);
    expect(first.targetCounts).toEqual({ acme: 0 });
    expect(server.calls("/v1/ingest/sweep")).toHaveLength(0);
    const second = await run(empty, delivery, { target: acme, previousTargetCounts: first.targetCounts ?? {} });
    expect(second.sweeps).toEqual([{ target: "acme", seen: 0, outcome: "sent", closed: 0 }]);
  });

  it("ATS tasks: passes ONE target, fills target/source, and backs ctx.isKnown with GET /v1/ingest/known (once per run)", async () => {
    const { delivery } = makeDelivery();
    const log = memoryLogger();
    const acme = company("acme");
    const seenCtx: ScrapeContext[] = [];
    const knownAnswers: boolean[] = [];
    const scraper = fakeScraper({
      id: "gh",
      handlesAts: ["greenhouse"],
      onScrape: (ctx) => seenCtx.push(ctx),
      jobs: (ctx) =>
        Array.from({ length: 4 }, (_, i) => {
          knownAnswers.push(ctx.isKnown?.(`job-${i}`, "acme") ?? false);
          return rawJob(i, { source: "greenhouse-typo", target: null });
        }),
    });
    await runPipeline({ taskId: "gh:acme", scraper, target: acme, signal: new AbortController().signal }, pipelineContext(delivery, { log }));
    expect(server.calls("/v1/ingest/known")).toHaveLength(1);
    expect(server.calls("/v1/ingest/known")[0]?.query).toEqual({ source: "gh", target: "acme" });
    expect(seenCtx[0]?.targets).toEqual([acme]);
    expect(knownAnswers).toEqual([false, false, false, false]);
    const stored = [...server.jobs.values()].map((j) => j.job);
    expect(stored.every((j) => j.source === "gh" && j.target === "acme" && j.company === "Acme" && j.companyTags[0] === "startup")).toBe(true);
    expect(log.lines.some((l) => l.level === "warn" && /needed fix-ups/.test(l.msg))).toBe(true);

    knownAnswers.length = 0;
    await run(scraper, delivery, { target: acme });
    expect(knownAnswers).toEqual([true, true, true, true]);
    expect(server.calls("/v1/ingest/known")).toHaveLength(2);
  });

  it("spools to .spool/*.jsonl when the API is down and replays everything in order once it is back", async () => {
    const spoolDir = tempDir("p05-spool-order-");
    const { delivery, spool } = makeDelivery({ spoolDir });
    server.failWith = 503;
    const first = await run(fakeScraper({ id: "feed", jobs: () => jobsFor("feed", 450) }), delivery);
    expect(first.status).toBe("ok"); // an API outage is not a scrape failure
    expect(first.counts.spooled).toBe(450);
    expect(first.sweeps[0]?.outcome).toBe("spooled");
    expect(spool.pending).toBe(5);
    expect(readdirSync(spoolDir).some((f) => f.endsWith(".jsonl"))).toBe(true);

    // API comes back, but nothing may jump the queue: the second run is appended behind the first
    server.failWith = null;
    const second = await run(fakeScraper({ id: "other", jobs: () => jobsFor("other", 3, "feed-2", 1000) }), delivery);
    expect(second.counts.spooled).toBe(3);
    expect(spool.pending).toBe(8);
    const before = server.requests.length;

    const drained = await delivery.drain(1);
    expect(drained).toEqual({ replayed: 8, dropped: 0, remaining: 0 });
    const replayed = server.requests.slice(before).map((r) => `${r.path.replace("/v1/ingest/", "")}:${(r.body as { source?: string }).source}`);
    expect(replayed).toEqual(["jobs:feed", "jobs:feed", "jobs:feed", "sweep:feed", "runs:feed", "jobs:other", "sweep:other", "runs:other"]);
    expect(server.jobs.size).toBe(453);
    expect(readdirSync(spoolDir).filter((f) => f.endsWith(".jsonl"))).toEqual([]);
  });

  it("treats a refused connection and a wrong key (401) as unavailable → spooled, nothing lost", async () => {
    const dead = makeDelivery({ url: "http://127.0.0.1:9" });
    const r1 = await run(fakeScraper({ id: "feed", jobs: () => jobsFor("feed", 3) }), dead.delivery);
    expect(r1.counts.spooled).toBe(3);
    expect(dead.delivery.health.reachable).toBe(false);
    expect(dead.delivery.health.lastError).toMatch(/fetch failed|ECONNREFUSED/);

    const wrongKey = makeDelivery({ key: "nope" });
    const r2 = await run(fakeScraper({ id: "feed", jobs: () => jobsFor("feed", 3) }), wrongKey.delivery);
    expect(r2.counts.spooled).toBe(3);
    expect(wrongKey.spool.pending).toBe(3); // jobs + sweep + run
  });

  it("adopts spool segments left by a dead process and resumes after the last committed item", async () => {
    const dir = tempDir("p05-spool-crash-");
    const crashed = new Spool(dir, { pid: 999_999 });
    await crashed.init();
    await crashed.append("jobs", { source: "x", runId: "r1", jobs: [] });
    await crashed.append("run", { runId: "r1", source: "x", target: null, startedAt: "2026-11-26T00:00:00Z", finishedAt: "2026-11-26T00:00:01Z", status: "ok", emitted: 0, invalid: 0, errors: [] });
    await crashed.append("run", { runId: "r2", source: "x", target: null, startedAt: "2026-11-26T00:00:00Z", finishedAt: "2026-11-26T00:00:01Z", status: "ok", emitted: 0, invalid: 0, errors: [] });
    const head = await crashed.peek();
    await crashed.commit(head!); // delivered before the "crash"

    const fresh = new Spool(dir);
    expect(await fresh.init()).toBe(2);
    const { api } = makeDelivery();
    const delivery = new Delivery(api, fresh, { log: memoryLogger(), autoReplay: false });
    const r = await delivery.drain(1);
    expect(r.remaining).toBe(0);
    expect(server.runs.map((x) => x.runId)).toEqual(["r1", "r2"]);
    expect(server.calls("/v1/ingest/jobs")).toHaveLength(0); // the committed item was not re-sent
  });

  it("background replay delivers spooled requests as soon as the API recovers", async () => {
    const { delivery, spool } = makeDelivery({ autoReplay: true });
    server.failWith = 500;
    await run(fakeScraper({ id: "feed", jobs: () => jobsFor("feed", 5) }), delivery);
    expect(spool.pending).toBe(3);
    server.failWith = null;
    await waitFor(() => spool.pending === 0 && server.runs.length === 1);
    expect(server.jobs.size).toBe(5);
    await delivery.stop();
  });

  it("dead-letters a spooled request that keeps failing while the API is healthy, so the FIFO is never blocked", async () => {
    const { delivery, spool } = makeDelivery({ autoReplay: true });
    server.failNext(500, 500, "/v1/ingest/jobs"); // a payload-specific API bug: this batch always 500s
    await run(fakeScraper({ id: "feed", jobs: () => jobsFor("feed", 3) }), delivery);
    await waitFor(() => server.runs.length === 1, 10_000); // sweep + run report got through behind it
    expect(server.calls("/v1/ingest/sweep")).toHaveLength(1);
    const dead = readFileSync(join(spool.dir, "dead-letter.jsonl"), "utf8").trim().split("\n");
    expect(dead).toHaveLength(1);
    expect(JSON.parse(dead[0]!)).toMatchObject({ kind: "jobs", reason: expect.stringMatching(/HTTP 500/) });
    expect(delivery.stats()).toMatchObject({ deadLettered: 1 });
    expect(spool.pending).toBe(0);
    await delivery.stop();
  });

  it("never dead-letters on a wrong ingest key (401 is a config problem): everything stays spooled", async () => {
    const { delivery, spool, log } = makeDelivery({ key: "wrong-key", autoReplay: true });
    await run(fakeScraper({ id: "feed", jobs: () => jobsFor("feed", 3) }), delivery);
    await waitFor(() => server.requests.filter((r) => r.status === 401).length >= 12, 10_000); // ≥ 2× the poison threshold
    expect(spool.pending).toBe(3);
    expect(delivery.stats().deadLettered).toBe(0);
    expect(log.lines.some((l) => /check INGEST_API_KEY/.test(l.msg))).toBe(true);
    await delivery.stop();
  });

  it("splits a batch on 413 and falls back to plain JSON when gzip is refused (415)", async () => {
    await server.close();
    server = await startFakeIngest({ maxBodyBytes: 40_000, acceptGzip: false });
    const { delivery, api, log } = makeDelivery();
    const r = await run(fakeScraper({ id: "feed", jobs: () => jobsFor("feed", 200) }), delivery);
    expect(r.counts.sent).toBe(200);
    expect(server.jobs.size).toBe(200);
    expect(api.gzipEnabled).toBe(false);
    expect(server.requests.some((x) => x.status === 415)).toBe(true);
    expect(server.requests.some((x) => x.status === 413)).toBe(true);
    expect(log.lines.some((l) => /splitting/.test(l.msg))).toBe(true);
  });

  it("a batch the API rejects (400) is dropped and reported; the run is partial and never sweeps", async () => {
    const { delivery } = makeDelivery();
    server.failNext(1, 400, "/v1/ingest/jobs");
    const r = await run(fakeScraper({ id: "feed", jobs: () => jobsFor("feed", 250) }), delivery);
    expect(r.status).toBe("partial");
    expect(r.counts).toMatchObject({ failedJobs: 200, sent: 50 });
    expect(r.complete).toBe(false);
    expect(server.calls("/v1/ingest/sweep")).toHaveLength(0);
    expect(server.runs[0]?.errors.join(" ")).toMatch(/ingest batch 1 \(200 jobs\) failed: .*HTTP 400/);
  });

  it("dry run writes normalized JobInputs to <out>/<source>.jsonl and makes no API calls", async () => {
    const out = tempDir("p05-out-");
    const sink = new DryRunSink(out);
    const r = await run(fakeScraper({ id: "feed", jobs: () => jobsFor("feed", 7) }), sink);
    expect(r.counts.written).toBe(7);
    const lines = readFileSync(join(out, "feed.jsonl"), "utf8").trim().split("\n");
    expect(lines).toHaveLength(7);
    expect(JSON.parse(lines[0]!)).toMatchObject({ source: "feed", sourceName: "Fake feed" });
    const report = JSON.parse(readFileSync(join(out, "feed.report.json"), "utf8")) as { wouldSweep: unknown[]; runs: RunReport[] };
    expect(report.wouldSweep).toEqual([{ target: "feed-1", seen: 7 }]);
    expect(report.runs[0]?.status).toBe("ok");
    expect(server.requests).toHaveLength(0);
    expect(existsSync(join(out, "feed.jsonl"))).toBe(true);
  });

  it("stops promptly on abort even when a scraper ignores its signal, and a shutdown is not a failure", async () => {
    const { delivery } = makeDelivery();
    const hanging: Scraper = {
      id: "hang",
      name: "Hang",
      kind: "job_board",
      intervalMinutes: 30,
      async *scrape() {
        yield rawJob(1, { source: "hang" });
        await new Promise(() => undefined); // never resolves, ignores ctx.signal
      },
    };
    const ac = new AbortController();
    setTimeout(() => ac.abort(new ShutdownAbort()), 50);
    const r = await run(hanging, delivery, { signal: ac.signal });
    expect(r).toMatchObject({ status: "partial", failure: false, aborted: "shutdown", complete: false });
    expect(r.counts.valid).toBe(1);
    expect(server.jobs.size).toBe(1);
  });

  it("honours scraper sweep opt-outs: Scraper.sweep === false and ctx.markIncomplete() (P10/P11 requests)", async () => {
    const { delivery } = makeDelivery();
    const optOut = { ...fakeScraper({ id: "feed", jobs: () => jobsFor("feed", 5) }), sweep: false } as Scraper;
    const a = await run(optOut, delivery);
    expect(a).toMatchObject({ status: "ok", complete: false });
    expect(a.summary).toMatch(/no sweep \(scraper opted out of sweeps/);
    const marks = fakeScraper({
      id: "feed",
      jobs: (ctx) => {
        (ctx as ScrapeContext & { markIncomplete?: (r?: string) => void }).markIncomplete?.("stopped at the first page of known ids");
        return jobsFor("feed", 5);
      },
    });
    const b = await run(marks, delivery);
    expect(b).toMatchObject({ status: "ok", complete: false });
    expect(server.calls("/v1/ingest/sweep")).toHaveLength(0);
    expect(server.jobs.size).toBe(5);
  });

  it("ctx.report(): 'blocked' with retryAt → partial, no sweep, retryAt passed to the scheduler; stats are kept (P09/P11 requests)", async () => {
    const { delivery } = makeDelivery();
    type Report = (s: "partial" | "blocked" | Record<string, number>, info?: { reason?: string; retryAt?: string }) => void;
    const retryAt = "2026-12-01T06:00:00.000Z";
    const blocked = fakeScraper({
      id: "portal",
      jobs: (ctx) => {
        const report = (ctx as ScrapeContext & { report?: Report }).report;
        report?.({ siteTotal: 2054, pages: 3 });
        report?.("blocked", { reason: "HTTP 999 challenge page", retryAt });
        return jobsFor("portal", 2);
      },
    });
    const r = await run(blocked, delivery);
    expect(r).toMatchObject({ status: "partial", failure: false, complete: false, retryAt: Date.parse(retryAt), stats: { siteTotal: 2054, pages: 3 } });
    expect(server.runs[0]?.status).toBe("partial");
    expect(server.runs[0]?.errors[0]).toMatch(/^blocked \(reported by scraper\): HTTP 999 challenge page — retry after 2026-12-01T06:00:00.000Z/);
    expect(server.calls("/v1/ingest/sweep")).toHaveLength(0);

    const noRetry = fakeScraper({ id: "portal", jobs: (ctx) => ((ctx as ScrapeContext & { report?: Report }).report?.("blocked", { reason: "403" }), []) });
    expect(await run(noRetry, delivery)).toMatchObject({ status: "partial", failure: true, retryAt: null });
  });

  it("reports scrapers that throw synchronously or return garbage as failed runs (status error)", async () => {
    const { delivery } = makeDelivery();
    const sync: Scraper = { id: "sync", name: "S", kind: "job_board", intervalMinutes: 30, scrape: () => { throw new Error("no API key"); } };
    const garbage = { id: "garbage", name: "G", kind: "job_board", intervalMinutes: 30, scrape: () => 42 } as unknown as Scraper;
    const allBad = fakeScraper({ id: "bad", jobs: () => [rawJob(1, { source: "bad", sourceUrl: "nope" })] });
    expect(await run(sync, delivery)).toMatchObject({ status: "error", failure: true });
    const g = await run(garbage, delivery);
    expect(g.errors[0]).toMatch(/did not return an AsyncIterable/);
    const b = await run(allBad, delivery);
    expect(b).toMatchObject({ status: "error", failure: true });
    expect(b.errors[0]).toMatch(/all 1 jobs were invalid/);
  });
});

describe("contract 1.1 run hooks", () => {
  const scraperFrom = (id: string, body: (ctx: ScrapeContext) => AsyncIterable<RawJob>): Scraper => ({
    id,
    name: id,
    kind: "job_board",
    intervalMinutes: 60,
    scrape: body,
  });

  it("markSeen adds unchanged ids to the sweep's seen set without ingesting them", async () => {
    const { delivery } = makeDelivery();
    const scraper = scraperFrom("feed", async function* (ctx) {
      ctx.markSeen?.(["unchanged-1", "unchanged-2"], "feed-1");
      yield* jobsFor("feed", 3);
    });
    const r = await run(scraper, delivery);
    expect(r.status).toBe("ok");
    const ingested = server.calls("/v1/ingest/jobs").flatMap((c) => (c.body as IngestRequest).jobs.map((j) => j.sourceJobId));
    expect(ingested).not.toContain("unchanged-1");
    const sweep = server.calls("/v1/ingest/sweep")[0]?.body as SweepRequest | undefined;
    expect(sweep?.target).toBe("feed-1");
    expect(sweep?.seenSourceJobIds).toEqual(expect.arrayContaining(["unchanged-1", "unchanged-2"]));
    expect(sweep?.seenSourceJobIds).toHaveLength(5);
  });

  it("a thrown SourceBlockedError is a graceful blocked stop: partial, no sweep, paused until retryAt", async () => {
    const { delivery } = makeDelivery();
    const retryAt = new Date(Date.now() + 3_600_000);
    const scraper = scraperFrom("feed", async function* () {
      yield* jobsFor("feed", 2);
      const e = new Error("Cloudflare challenge on page 2") as Error & { retryAt: Date };
      e.name = "SourceBlockedError";
      e.retryAt = retryAt;
      throw e;
    });
    const r = await run(scraper, delivery);
    expect(r.status).toBe("partial");
    expect(r.failure).toBe(false);
    expect(r.retryAt).toBe(retryAt.getTime());
    expect(server.calls("/v1/ingest/sweep")).toHaveLength(0);
    expect(r.errors[0]).toMatch(/^blocked \(reported by scraper\): .*Cloudflare challenge/);
  });
});
