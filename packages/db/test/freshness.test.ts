import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { DEFAULT_SEARCH_QUERY } from "@easyjobs/contract";
import { createRepository, type Repository } from "../src/repository";
import { runReportSchema } from "../src/validate";
import { createTestDb, daysAgo, makeJob, type TestDb } from "./helpers";

const NOW = new Date("2026-11-20T12:00:00.000Z");
let t: TestDb;
let repo: Repository;

beforeAll(async () => {
  t = await createTestDb();
  repo = createRepository(t.db);
});
afterAll(async () => {
  await t.cleanup();
});

const status = async (fingerprint: string): Promise<{ status: string; closed_reason: string | null }> =>
  (await t.db.query<{ status: string; closed_reason: string | null }>(sql`SELECT status, closed_reason FROM jobs WHERE fingerprint = ${fingerprint}`))[0]!;

const board = (key: string, over: Parameters<typeof makeJob>[0] = {}) =>
  makeJob({ key, fingerprint: `t:${key}`, source: "naukri", sourceName: "Naukri", sourceKind: "job_board", target: null, sourceUrl: `https://www.naukri.com/job-listings-${key}`, applyUrl: `https://www.naukri.com/job-listings-${key}`, ...over });

describe("sweep", () => {
  it("removes unseen (source, target) postings; jobs without remaining sources close", async () => {
    const seen = makeJob({ key: "sw-seen", target: "acme" });
    const gone = makeJob({ key: "sw-gone", target: "acme" });
    const otherTarget = makeJob({ key: "sw-other", target: "globex" });
    const alsoOnBoard = makeJob({ key: "sw-merged", target: "acme" });
    const boardCopy = board("sw-merged-board", { fingerprint: alsoOnBoard.fingerprint });
    await repo.upsertJobs([seen, gone, otherTarget, alsoOnBoard, boardCopy], { now: NOW });

    const res = await repo.sweep({ source: "greenhouse", target: "acme", seenSourceJobIds: [seen.sourceJobId] }, { now: NOW });
    expect(res).toEqual({ closed: 1, removed: 2 });
    expect((await status(seen.fingerprint)).status).toBe("open");
    expect(await status(gone.fingerprint)).toEqual({ status: "closed", closed_reason: "swept" });
    expect((await status(otherTarget.fingerprint)).status).toBe("open"); // other target untouched
    // still listed on a job board → stays open, but is no longer official
    const merged = (await t.db.query<{ status: string; is_official: boolean; source_ids: string[] }>(sql`SELECT status, is_official, source_ids FROM jobs WHERE fingerprint = ${alsoOnBoard.fingerprint}`))[0]!;
    expect(merged).toEqual({ status: "open", is_official: false, source_ids: ["naukri"] });
  });

  it("null/empty target sweeps the source's target-less postings only", async () => {
    const a = board("swn-a");
    const b = board("swn-b");
    const targeted = board("swn-t", { target: "feed-1" });
    await repo.upsertJobs([a, b, targeted], { now: NOW });
    expect(await repo.sweep({ source: "naukri", target: null, seenSourceJobIds: [a.sourceJobId, "sw-merged-board"] }, { now: NOW })).toEqual({ closed: 1, removed: 1 });
    expect((await status(a.fingerprint)).status).toBe("open");
    expect((await status(b.fingerprint)).status).toBe("closed");
    expect((await status(targeted.fingerprint)).status).toBe("open");
  });

  it("closed jobs still resolve by id but never appear in search", async () => {
    const gone = makeJob({ key: "sw-gone" });
    const id = (await t.db.query<{ id: string }>(sql`SELECT id FROM jobs WHERE fingerprint = ${gone.fingerprint}`))[0]!.id;
    const detail = await repo.getJob(id);
    expect(detail?.status).toBe("closed");
    const res = await repo.searchJobs({ ...DEFAULT_SEARCH_QUERY, pageSize: 50 }, { now: NOW });
    expect(res.data.map((j) => j.id)).not.toContain(id);
  });
});

describe("expireStale (hourly)", () => {
  it("closes validThrough-past jobs and stale/old board-only jobs; official jobs only by validThrough", async () => {
    const later = new Date(NOW.getTime() + 22 * 86_400_000);
    const expiring = makeJob({ key: "ex-valid", validThrough: new Date(NOW.getTime() + 86_400_000).toISOString() });
    const unseenBoard = board("ex-unseen");
    const oldBoard = board("ex-old", { postedAt: daysAgo(40, NOW) });
    const officialOld = makeJob({ key: "ex-official-old", postedAt: daysAgo(40, NOW) });
    const boardFresh = board("ex-fresh");
    await repo.upsertJobs([expiring, unseenBoard, oldBoard, officialOld, boardFresh], { now: NOW });
    // boardFresh keeps being seen
    await repo.upsertJobs([boardFresh], { now: new Date(later.getTime() - 86_400_000) });

    const res = await repo.expireStale({ now: later });
    expect(res.closed).toBeGreaterThanOrEqual(3);
    expect(await status(expiring.fingerprint)).toEqual({ status: "closed", closed_reason: "expired" });
    expect(await status(unseenBoard.fingerprint)).toEqual({ status: "closed", closed_reason: "stale" });
    expect(await status(oldBoard.fingerprint)).toEqual({ status: "closed", closed_reason: "stale" });
    expect((await status(officialOld.fingerprint)).status).toBe("open");
    expect((await status(boardFresh.fingerprint)).status).toBe("open");
    // idempotent
    expect((await repo.expireStale({ now: later })).closed).toBe(0);
  });

  it("board-only jobs older than 45 days close even if still seen", async () => {
    const ancient = board("ex-ancient", { postedAt: daysAgo(50, NOW) });
    const res = await repo.upsertJobs([ancient], { now: NOW });
    expect(res.inserted).toBe(1);
    expect(await status(ancient.fingerprint)).toEqual({ status: "closed", closed_reason: "too_old" });
  });

  it("validThrough in the past closes at ingest time too", async () => {
    const j = makeJob({ key: "ex-born-closed", validThrough: daysAgo(1, NOW) });
    await repo.upsertJobs([j], { now: NOW });
    expect(await status(j.fingerprint)).toEqual({ status: "closed", closed_reason: "expired" });
  });
});

describe("known ids and run reports", () => {
  it("lists stored sourceJobIds per source and target", async () => {
    await repo.upsertJobs([makeJob({ key: "kn-1", target: "known-co" }), makeJob({ key: "kn-2", target: "known-co" }), makeJob({ key: "kn-3", target: "other-co" })], { now: NOW });
    expect(await repo.knownIds("greenhouse", "known-co")).toEqual(["kn-1", "kn-2"]);
    expect(await repo.knownIds("greenhouse")).toEqual(expect.arrayContaining(["kn-1", "kn-2", "kn-3"]));
    expect(await repo.knownIds("nope")).toEqual([]);
  });

  it("does not list jobs stored without a description (light/card-only), so their details get fetched", async () => {
    await repo.upsertJobs(
      [makeJob({ key: "kn-full", target: "light-co" }), makeJob({ key: "kn-light", target: "light-co", descriptionHtml: null, descriptionText: null })],
      { now: NOW },
    );
    expect(await repo.knownIds("greenhouse", "light-co")).toEqual(["kn-full"]);
  });

  it("records RunReports idempotently and exposes lastRunAt in stats", async () => {
    const run = { runId: "run-1", source: "greenhouse", target: "known-co", startedAt: daysAgo(0.01, NOW), finishedAt: NOW.toISOString(), status: "ok" as const, emitted: 3, invalid: 0, errors: [] };
    await repo.recordRun(run);
    await repo.recordRun({ ...run, emitted: 4 });
    const rows = await t.db.query<{ emitted: number }>(sql`SELECT emitted FROM scrape_runs WHERE run_id = 'run-1'`);
    expect(rows).toEqual([{ emitted: 4 }]);
    const s = await repo.stats({ now: NOW });
    expect(s.sources.find((x) => x.id === "greenhouse")?.lastRunAt).toBe(NOW.toISOString());
  });

  it("stores the optional complete/stats extras (P05 request) and drops malformed ones", async () => {
    const base = { runId: "run-2", source: "greenhouse", target: "known-co", startedAt: NOW.toISOString(), finishedAt: NOW.toISOString(), status: "ok" as const, emitted: 1, invalid: 0, errors: [] };
    await repo.recordRun({ ...base, complete: true, stats: { raw: 10, valid: 9, duplicates: 1 } });
    const rows = await t.db.query<{ complete: boolean | null; stats: unknown }>(sql`SELECT complete, stats FROM scrape_runs WHERE run_id = 'run-2'`);
    expect(rows).toEqual([{ complete: true, stats: { raw: 10, valid: 9, duplicates: 1 } }]);
    const parsed = runReportSchema.parse({ ...base, complete: "yes", stats: { raw: "ten" } });
    expect(parsed.complete).toBeUndefined();
    expect(parsed.stats).toBeUndefined();
  });
});

describe("source terms (contract 1.1)", () => {
  it("stores extra.attribution / extra.terms per source and returns them on the job's source refs", async () => {
    const j = makeJob({
      key: "terms-1",
      source: "remotive",
      sourceName: "Remotive",
      sourceKind: "job_board",
      target: "remotive",
      extra: { attribution: "Jobs via Remotive", terms: { linkBackRequired: true, noJobPostingSchema: true, bogus: "x" } },
    });
    await repo.upsertJobs([j], { now: NOW });
    const id = (await t.db.query<{ id: string }>(sql`SELECT id FROM jobs WHERE fingerprint = ${j.fingerprint}`))[0]!.id;
    const detail = await repo.getJob(id);
    expect(detail?.sources).toEqual([
      expect.objectContaining({ id: "remotive", attribution: "Jobs via Remotive", terms: { linkBackRequired: true, noJobPostingSchema: true } }),
    ]);
  });
});

describe("test postings (W1)", () => {
  it("jobs tagged test-posting are born closed (resolvable by id, never in search)", async () => {
    const j = makeJob({ key: "test-req-1", title: "DO NOT APPLY - TEST REQ", tags: ["test-posting"] });
    await repo.upsertJobs([j], { now: NOW });
    expect(await status(j.fingerprint)).toEqual({ status: "closed", closed_reason: "test_posting" });
  });
});
