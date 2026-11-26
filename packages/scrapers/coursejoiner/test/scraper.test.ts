import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { validateRawJob, type RawJob } from "@easyjobs/contract";
import { createScrapeContext, type ScrapeContext } from "@easyjobs/contract/node";
import { createWpJobBlogScraper } from "../src/wp/scraper";
import { COURSEJOINER, FRESHERSHUNT } from "../src/sites";
import { extractArticle } from "../src/wp/html";
import { parseFeed } from "../src/wp/rss";
import { BLOG_HOSTS, FIXTURES, fakeHttp, loadFixtures, testLogger, wpRestRoute, type Route } from "./helpers";

const NOW = new Date("2026-11-26T00:00:00Z");
const site = { ...COURSEJOINER, minGapMs: 0 };
const cjFixtures = loadFixtures("coursejoiner").map((f) => f.fixture);
const tmpDirs: string[] = [];
const tmp = (): string => {
  const d = mkdtempSync(join(tmpdir(), "p06-cache-"));
  tmpDirs.push(d);
  return d;
};
afterEach(() => {
  for (const d of tmpDirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

async function run(route: Route, opts: { cacheDir?: string | null; now?: Date; ctx?: Partial<ScrapeContext>; config?: typeof site } = {}) {
  const http = fakeHttp(route);
  const scraper = createWpJobBlogScraper(opts.config ?? site, { cacheDir: opts.cacheDir ?? null, now: () => opts.now ?? NOW, extraBlogHosts: BLOG_HOSTS });
  const ctx = createScrapeContext({ http, log: testLogger(), env: {}, ...opts.ctx });
  const jobs: RawJob[] = [];
  for await (const j of scraper.scrape(ctx)) jobs.push(j);
  return { jobs, calls: http.calls, scraper };
}

describe("createWpJobBlogScraper (WP REST)", () => {
  it("exposes the Scraper contract", () => {
    const s = createWpJobBlogScraper(COURSEJOINER);
    expect(s).toMatchObject({ id: "coursejoiner", name: "CourseJoiner", kind: "aggregator", intervalMinutes: 15, attribution: "Jobs via CourseJoiner" });
    expect(s.isEnabled?.({})).toBe(true);
    expect(s.isEnabled?.({ ENABLE_COURSEJOINER: "0" })).toBe(false);
  });

  it("full run: backfill window, job posts only, valid aggregator RawJobs", async () => {
    const { jobs, calls } = await run(wpRestRoute(cjFixtures));
    expect(jobs.length).toBeGreaterThanOrEqual(14);
    for (const j of jobs) {
      expect(validateRawJob(j)).toEqual([]);
      expect(j).toMatchObject({ source: "coursejoiner", sourceKind: "aggregator", target: null });
      expect(j.sourceJobId).toMatch(/^\d+#\d+$/);
      expect(j.applyUrl).toMatch(/^https:\/\//);
      expect(new URL(j.applyUrl!).hostname).not.toMatch(/coursejoiner\.com$/);
    }
    const ids = jobs.map((j) => j.sourceJobId);
    expect(ids).toContain("40193#1");
    for (const nonJob of ["40176#1", "40160#1", "39892#1", "39829#1", "39850#1"]) expect(ids).not.toContain(nonJob);
    // Older than the 60-day window → not listed.
    expect(ids).not.toContain("28593#1");
    // Newest first.
    expect(Date.parse(jobs[0]!.postedAt!)).toBeGreaterThanOrEqual(Date.parse(jobs[jobs.length - 1]!.postedAt!));
    // Listing uses `after`, content is fetched in batches with `include`.
    expect(calls.some((u) => /\/posts\?.*after=/.test(u))).toBe(true);
    expect(calls.some((u) => /\/posts\?include=/.test(u))).toBe(true);
  });

  it("honours ctx.limit and --backfill-days (env)", async () => {
    const limited = await run(wpRestRoute(cjFixtures), { ctx: { limit: 3 } });
    expect(limited.jobs).toHaveLength(3);
    const wide = await run(wpRestRoute(cjFixtures), { ctx: { env: { WPJOBS_BACKFILL_DAYS: "400" } } });
    expect(wide.jobs.map((j) => j.sourceJobId)).toContain("28539#1"); // Feb 2026, no deadline
  });

  it("skips jobs whose deadline has passed", async () => {
    const later = await run(wpRestRoute(cjFixtures), { now: new Date("2026-12-01T00:00:00Z") });
    expect(later.jobs.map((j) => j.sourceJobId)).not.toContain("40054#1"); // LIC: apply by 28 Nov
  });

  it("caches parses, runs incrementally with ctx.since, and emits light records for known posts", async () => {
    const dir = tmp();
    const first = await run(wpRestRoute(cjFixtures), { cacheDir: dir });
    expect(first.jobs.length).toBeGreaterThan(0);
    const meta = JSON.parse(readFileSync(join(dir, "coursejoiner", "meta.json"), "utf8")) as Record<string, string>;
    expect(meta.lastFullAt).toBe(NOW.toISOString());

    // Incremental: nothing modified since → listing only, no content fetch, nothing emitted.
    const t1 = new Date(NOW.getTime() + 30 * 60_000);
    const inc = await run(wpRestRoute(cjFixtures), { cacheDir: dir, now: t1, ctx: { since: NOW, isKnown: () => true } });
    expect(inc.jobs).toEqual([]);
    expect(inc.calls.some((u) => /modified_after=/.test(u))).toBe(true);
    expect(inc.calls.some((u) => /\/posts\?include=/.test(u))).toBe(false);

    // One post is edited after `since` → only that post is refetched, re-parsed and emitted in full.
    const edited = cjFixtures.map((f) => (f.post.id === 40193 ? { ...f, post: { ...f.post, modified_gmt: "2026-11-26T00:20:00" } } : f));
    const inc2 = await run(wpRestRoute(edited), { cacheDir: dir, now: t1, ctx: { since: NOW, isKnown: () => true } });
    expect(inc2.jobs.map((j) => j.sourceJobId)).toEqual(["40193#1"]);
    expect(inc2.jobs[0]!.descriptionHtml).toBeTruthy();
    expect(inc2.calls.filter((u) => /\/posts\?include=/.test(u))).toHaveLength(1);

    // Daily refresh (full window): unchanged posts come from the cache as light records — no content refetch.
    const t2 = new Date(NOW.getTime() + 25 * 3_600_000);
    const refresh = await run(wpRestRoute(edited), { cacheDir: dir, now: t2, ctx: { since: new Date(t2.getTime() - 15 * 60_000), isKnown: () => true } });
    expect(refresh.jobs.length).toBe(first.jobs.length);
    expect(refresh.jobs.every((j) => j.descriptionHtml === null && j.extra?.light === true)).toBe(true);
    expect(refresh.jobs.map((j) => j.title)).toEqual(first.jobs.map((j) => j.title)); // hints kept
    expect(refresh.calls.some((u) => /\/posts\?include=/.test(u))).toBe(false);
  });

  it("uses ctx.isKnown to skip unchanged posts entirely when nothing is cached", async () => {
    const { jobs, calls } = await run(wpRestRoute(cjFixtures), { ctx: { since: new Date(NOW.getTime() - 3_600_000), isKnown: () => true } });
    expect(jobs).toEqual([]);
    expect(calls.some((u) => /\/posts\?include=/.test(u))).toBe(false);
  });

  it("reports run stats through the worker's optional ctx.report hook", async () => {
    const seen: Record<string, number>[] = [];
    const report = (s: Record<string, number>): void => void seen.push(s);
    const { jobs } = await run(wpRestRoute(cjFixtures), { ctx: { report } as Partial<ScrapeContext> });
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ emitted: jobs.length, fetched: expect.any(Number), skipped: expect.any(Number) });
  });

  it("fails clearly when no strategy is usable (REST-only site, REST blocked)", async () => {
    const blocked: Route = () => new Response("forbidden", { status: 403 });
    await expect(run(blocked, { config: { ...FRESHERSHUNT, minGapMs: 0 } })).rejects.toThrow(/no usable source/);
  });
});

describe("RSS + HTML fallback", () => {
  const feedXml = readFileSync(join(FIXTURES, "raw", "coursejoiner-feed.xml"), "utf8");
  const pageHtml = readFileSync(join(FIXTURES, "raw", "coursejoiner-post-40193.html"), "utf8");

  it("parses the real feed (ids from guid, categories from <category>)", () => {
    const items = parseFeed(feedXml);
    expect(items.length).toBeGreaterThanOrEqual(10);
    expect(items[0]!.ref.id).toBe(40193);
    expect(items[0]!.ref.categories.map((c) => c.slug)).toContain("internship");
    expect(items[0]!.contentHtml).toBeNull(); // CourseJoiner's feed carries excerpts only
  });

  it("extracts the article from a real post page", () => {
    const post = extractArticle(pageHtml, "https://coursejoiner.com/internship/ea-internship-2027-software/");
    expect(post).not.toBeNull();
    expect(post!.id).toBe(40193);
    expect(post!.dateGmt).toBe("2026-11-25T11:51:31.000Z");
    expect(post!.categories.map((c) => c.slug)).toContain("internship");
    expect(post!.contentHtml).toContain("Key Highlights");
  });

  it("falls back to RSS (+ page fetch) when the REST API is unavailable", async () => {
    const route: Route = (url) => {
      if (url.pathname.startsWith("/wp-json/")) return new Response("Not Found", { status: 404 });
      if (url.pathname === "/feed/" && !url.searchParams.has("paged")) return new Response(feedXml, { status: 200, headers: { "content-type": "application/rss+xml", etag: '"abc"' } });
      if (url.pathname === "/feed/") return new Response("Not Found", { status: 404 });
      if (url.pathname === "/internship/ea-internship-2027-software/") return new Response(pageHtml, { status: 200, headers: { "content-type": "text/html" } });
      return new Response("Not Found", { status: 404 });
    };
    const { jobs, calls } = await run(route);
    const ea = jobs.find((j) => j.sourceJobId === "40193#1");
    expect(ea).toBeDefined();
    expect(ea!.applyUrl).toBe("https://jobs.ea.com/en_US/careers/JobDetail/Software-Engineering-Intern/216554");
    expect(calls[0]).toMatch(/\/wp-json\/wp\/v2\/posts\?per_page=1/);
    expect(calls.some((u) => u.endsWith("/feed/"))).toBe(true);
  });
});
