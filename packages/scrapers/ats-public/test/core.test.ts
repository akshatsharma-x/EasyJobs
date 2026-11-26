import type { RawJob } from "@easyjobs/contract";
import { HttpError } from "@easyjobs/contract/node";
import { describe, expect, it } from "vitest";
import { DetailBudget } from "../src/core/details";
import { BoardNotFoundError } from "../src/core/errors";
import { paginateOffset } from "../src/core/paginate";
import { createAtsScraper, isScraperEnabled, maxDetails } from "../src/core/run";
import type { AtsAdapter, TargetContext } from "../src/core/types";
import { scrapers } from "../src/index";
import { captureLog, collect, ctx, fakeHttp, target } from "./helpers";

const job = (tctx: TargetContext, id: string): RawJob => ({
  source: "fake",
  sourceKind: "ats",
  sourceJobId: id,
  sourceUrl: `https://ats.example/${tctx.target.slug}/${id}`,
  target: tctx.target.slug,
  applyUrl: null,
  title: `Job ${id}`,
  company: tctx.target.name,
  locations: [],
  descriptionHtml: null,
  postedAt: null,
});

/** An adapter whose boards are defined per target slug: a job count, or an error to throw after N jobs. */
function fakeAdapter(boards: Record<string, number | { jobs: number; error: Error }>, seen: string[] = []): AtsAdapter {
  return {
    id: "fake",
    name: "Fake",
    ats: "greenhouse",
    endpoint: "fake",
    async *scrapeTarget(tctx) {
      seen.push(tctx.target.slug);
      const spec = boards[tctx.target.slug] ?? 0;
      const n = typeof spec === "number" ? spec : spec.jobs;
      for (let i = 0; i < n; i++) yield job(tctx, `${tctx.target.slug}-${i}`);
      if (typeof spec !== "number") throw spec.error;
    },
  };
}

const gh = (slug: string) => target({ slug, ats: "greenhouse", token: slug });
const run = (adapter: AtsAdapter, slugs: string[], extra: Parameters<typeof ctx>[2] = {}) => {
  const c = ctx(fakeHttp({}), slugs.map(gh), extra);
  return { c, result: collect(createAtsScraper(adapter).scrape(c)) };
};

describe("scraper factory", () => {
  it("exposes one ATS scraper per platform with kind 'ats' and handlesAts", () => {
    expect(scrapers.map((s) => s.id)).toEqual([
      "greenhouse", "lever", "ashby", "smartrecruiters", "workable", "recruitee", "bamboohr", "personio", "breezy", "teamtailor",
    ]);
    for (const s of scrapers) {
      expect(s.kind).toBe("ats");
      expect(s.handlesAts).toEqual([s.id]);
      expect(s.isEnabled?.({})).toBe(true);
    }
  });

  it("honours the ATS_PUBLIC_DISABLED kill switch", () => {
    expect(isScraperEnabled("lever", { ATS_PUBLIC_DISABLED: "workable, lever" })).toBe(false);
    expect(isScraperEnabled("ashby", { ATS_PUBLIC_DISABLED: "workable,lever" })).toBe(true);
    expect(isScraperEnabled("ashby", { ATS_PUBLIC_DISABLED: "all" })).toBe(false);
  });

  it("reads ATS_MAX_DETAILS with a safe default", () => {
    expect(maxDetails({})).toBe(200);
    expect(maxDetails({ ATS_MAX_DETAILS: "25" })).toBe(25);
    expect(maxDetails({ ATS_MAX_DETAILS: "nope" })).toBe(200);
  });
});

describe("target runner", () => {
  it("shares ctx.limit fairly across targets and rolls over unused share", async () => {
    const { result } = run(fakeAdapter({ a: 1, b: 10, c: 10 }), ["a", "b", "c"], { limit: 7 });
    const jobs = await result;
    // a: share ceil(7/3)=3 but has 1 → b: ceil(6/2)=3 → c: 3
    expect(jobs.map((j) => j.target)).toEqual(["a", "b", "b", "b", "c", "c", "c"]);
  });

  it("emits everything without a limit and never exceeds a limit", async () => {
    expect(await run(fakeAdapter({ a: 4, b: 5 }), ["a", "b"]).result).toHaveLength(9);
    expect(await run(fakeAdapter({ a: 40, b: 50 }), ["a", "b"], { limit: 11 }).result).toHaveLength(11);
  });

  it("ignores targets of other ATS types and warns when none are left", async () => {
    const seen: string[] = [];
    const c = ctx(fakeHttp({}), [gh("a"), target({ slug: "x", ats: "lever", token: "x" })]);
    await collect(createAtsScraper(fakeAdapter({ a: 1 }, seen)).scrape(c));
    expect(seen).toEqual(["a"]);
    const empty = ctx(fakeHttp({}), [target({ slug: "x", ats: "lever", token: "x" })]);
    expect(await collect(createAtsScraper(fakeAdapter({})).scrape(empty))).toEqual([]);
    expect(empty.log.lines.some((l) => l.level === "warn" && /no greenhouse targets/.test(l.msg))).toBe(true);
  });

  it("finishes a dead board cleanly and continues with the next target", async () => {
    const adapter = fakeAdapter({ a: { jobs: 0, error: new BoardNotFoundError("https://ats.example/a", 404) }, b: 2 });
    const { c, result } = run(adapter, ["a", "b"]);
    expect((await result).map((j) => j.sourceJobId)).toEqual(["b-0", "b-1"]);
    expect(c.log.lines.filter((l) => l.level === "warn" && /board not found/.test(l.msg))).toHaveLength(1);
  });

  it("fails (does not finish cleanly) when the board disappears mid-walk", async () => {
    const adapter = fakeAdapter({ a: { jobs: 2, error: new BoardNotFoundError("https://ats.example/a?page=2", 404) } });
    const { result } = run(adapter, ["a"]);
    await expect(result).rejects.toBeInstanceOf(BoardNotFoundError);
  });

  it("rethrows the original error for a single failing target", async () => {
    const { result } = run(fakeAdapter({ a: { jobs: 2, error: new HttpError(500, "https://ats.example/a") } }), ["a"]);
    await expect(result).rejects.toMatchObject({ name: "HttpError", status: 500 });
  });

  it("runs every target, then throws one aggregated error, when several targets fail", async () => {
    const seen: string[] = [];
    const adapter = fakeAdapter({ a: { jobs: 1, error: new HttpError(502, "https://ats.example/a") }, b: 2, c: { jobs: 0, error: new Error("boom") } }, seen);
    const scraper = createAtsScraper(adapter);
    const emitted: string[] = [];
    let error: unknown;
    try {
      for await (const j of scraper.scrape(ctx(fakeHttp({}), ["a", "b", "c"].map(gh)))) emitted.push(j.sourceJobId);
    } catch (e) {
      error = e;
    }
    expect(seen).toEqual(["a", "b", "c"]);
    expect(emitted).toEqual(["a-0", "b-0", "b-1"]);
    expect(String(error)).toMatch(/2\/3 targets failed — a: HTTP 502.*; c: boom/);
  });

  it("drops duplicate ids within a target", async () => {
    const adapter: AtsAdapter = {
      ...fakeAdapter({}),
      async *scrapeTarget(tctx) {
        yield job(tctx, "1");
        yield job(tctx, "1");
        yield job(tctx, "2");
      },
    };
    expect((await run(adapter, ["a"]).result).map((j) => j.sourceJobId)).toEqual(["1", "2"]);
  });

  it("stops on abort and propagates the abort reason", async () => {
    const controller = new AbortController();
    const adapter: AtsAdapter = {
      ...fakeAdapter({}),
      async *scrapeTarget(tctx) {
        yield job(tctx, "1");
        controller.abort(new Error("shutdown"));
        tctx.signal.throwIfAborted();
        yield job(tctx, "2");
      },
    };
    const { result } = run(adapter, ["a", "b"], { signal: controller.signal });
    await expect(result).rejects.toThrow("shutdown");
  });
});

describe("paginateOffset", () => {
  it("stops at the reported total even when pages are full", async () => {
    const calls: number[] = [];
    const items = await collectAll(
      paginateOffset<number>({
        pageSize: 2,
        idOf: String,
        fetchPage: async (offset) => {
          calls.push(offset);
          return { items: [offset, offset + 1], total: 4 };
        },
      }),
    );
    expect(items).toEqual([0, 1, 2, 3]);
    expect(calls).toEqual([0, 2]);
  });

  it("stops at the safety cap", async () => {
    const log = captureLog();
    const items = await collectAll(
      paginateOffset<number>({ pageSize: 1, maxPages: 3, log, idOf: String, fetchPage: async (offset) => ({ items: [offset] }) }),
    );
    expect(items).toEqual([0, 1, 2]);
    expect(log.lines.some((l) => /safety cap/.test(l.msg))).toBe(true);
  });
});

describe("DetailBudget", () => {
  it("defers beyond the cap and after throttling", () => {
    const b = new DetailBudget(2, captureLog());
    expect([b.take(), b.take(), b.take()]).toEqual([true, true, false]);
    expect(b.deferred).toBe(1);
    const t = new DetailBudget(10, captureLog());
    expect(t.take()).toBe(true);
    t.failedWith(new HttpError(429, "https://ats.example"));
    expect(t.take()).toBe(false);
    expect(t.deferred).toBe(2);
  });

  it("stops after five failures in a row", () => {
    const b = new DetailBudget(100, captureLog());
    for (let i = 0; i < 5; i++) {
      expect(b.take()).toBe(true);
      b.failedWith(new Error("socket hang up"));
    }
    expect(b.take()).toBe(false);
  });
});

async function collectAll<T>(iter: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const x of iter) out.push(x);
  return out;
}
