import { describe, expect, it } from "vitest";
import { validateRawJob } from "@easyjobs/contract";
import { RobotsDisallowedError } from "@easyjobs/contract/node";
import { BlockedError } from "../src/fetch";
import { FIXED_NOW, ORIGIN, detailHtml, fakeHttp, ids, listingHtml, runScraper, siteRoutes, type Route } from "./helpers";

/** Pages for one feed: pages[n-1] = ids on page n. */
const pagesOf =
  (pages: string[][], opts: { kind?: "internship" | "job"; feedPath?: string } = {}) =>
  (n: number): Route | undefined => {
    const cards = pages[n - 1];
    if (!cards) return { body: listingHtml({ ...opts, page: n, lastPage: pages.length, cards: [] }) };
    return { body: listingHtml({ ...opts, page: n, lastPage: pages.length, cards }) };
  };

const listingCalls = (calls: string[]): string[] => calls.filter((u) => !u.includes("/detail/")).map((u) => u.replace(ORIGIN, ""));
const detailCalls = (calls: string[]): string[] => calls.filter((u) => u.includes("/detail/"));
const knownSet = (...values: string[][]): ((id: string) => boolean) => {
  const s = new Set(values.flat());
  return (id) => s.has(id);
};

describe("incremental pagination — stop at the first page made entirely of known ids", () => {
  const pages = [ids(1, 5), ids(6, 10), ids(11, 15), ids(16, 20)];

  it("stops after a fully-known page and never requests the pages behind it", async () => {
    const { jobs, calls, error } = await runScraper("internship", siteRoutes({ feeds: { "/internships/": pagesOf(pages) } }), {
      options: { feeds: ["main"] },
      ctx: { isKnown: knownSet(ids(3, 10)) },
    });
    expect(error).toBeNull();
    expect(listingCalls(calls)).toEqual(["/internships/", "/internships/page-2/"]);
    expect(jobs.map((j) => j.sourceJobId)).toEqual(ids(1, 10)); // known ones are re-emitted as light records
    expect(detailCalls(calls)).toHaveLength(2); // details only for the unknown ids 1 and 2
    expect(jobs.filter((j) => j.descriptionHtml !== null).map((j) => j.sourceJobId)).toEqual(["1", "2"]);
  });

  it("keeps going while pages still contain unknown ids", async () => {
    const { calls } = await runScraper("internship", siteRoutes({ feeds: { "/internships/": pagesOf(pages) } }), {
      options: { feeds: ["main"] },
      ctx: { isKnown: knownSet(ids(2, 5), ids(6, 9), ids(11, 15)) }, // page 2 has unknown id 10
    });
    expect(listingCalls(calls)).toEqual(["/internships/", "/internships/page-2/", "/internships/page-3/"]);
  });

  it("a fully-known first page ends the feed after one request", async () => {
    const { jobs, calls } = await runScraper("internship", siteRoutes({ feeds: { "/internships/": pagesOf(pages) } }), {
      options: { feeds: ["main"] },
      ctx: { isKnown: () => true },
    });
    expect(listingCalls(calls)).toEqual(["/internships/"]);
    expect(detailCalls(calls)).toEqual([]);
    expect(jobs).toHaveLength(5);
    expect(jobs.every((j) => j.descriptionHtml === null && j.descriptionText === undefined)).toBe(true);
  });

  it("stopAfterKnownPages: 2 requires two consecutive known pages", async () => {
    const { calls } = await runScraper("internship", siteRoutes({ feeds: { "/internships/": pagesOf(pages) } }), {
      options: { feeds: ["main"], stopAfterKnownPages: 2 },
      ctx: { isKnown: () => true },
    });
    expect(listingCalls(calls)).toEqual(["/internships/", "/internships/page-2/"]);
  });

  it("without isKnown (CLI) it crawls up to maxPages (--pages)", async () => {
    const { jobs, calls } = await runScraper("internship", siteRoutes({ feeds: { "/internships/": pagesOf(pages) } }), {
      options: { feeds: ["main"], maxPages: 3 },
    });
    expect(listingCalls(calls)).toEqual(["/internships/", "/internships/page-2/", "/internships/page-3/"]);
    expect(jobs).toHaveLength(15);
  });

  it("stops on the last page", async () => {
    const { calls, jobs } = await runScraper("internship", siteRoutes({ feeds: { "/internships/": pagesOf([ids(1, 3), ids(4, 6)]) } }), {
      options: { feeds: ["main"], maxPages: 50 },
    });
    expect(listingCalls(calls)).toEqual(["/internships/", "/internships/page-2/"]);
    expect(jobs).toHaveLength(6);
  });

  it("stops on an empty page", async () => {
    const route = siteRoutes({
      feeds: { "/internships/": (n) => ({ body: listingHtml({ page: n, lastPage: 9, cards: n === 1 ? ids(1, 3) : [] }) }) },
    });
    const { calls } = await runScraper("internship", route, { options: { feeds: ["main"], maxPages: 50 } });
    expect(listingCalls(calls)).toEqual(["/internships/", "/internships/page-2/"]);
  });

  it("stops when the server renders a different page than requested", async () => {
    const route = siteRoutes({
      feeds: { "/internships/": (n) => ({ body: listingHtml({ page: n, renderedPage: 1, lastPage: 9, cards: n === 1 ? ids(1, 3) : ids(1, 3) }) }) },
    });
    const { calls, jobs } = await runScraper("internship", route, { options: { feeds: ["main"], maxPages: 50 } });
    expect(listingCalls(calls)).toEqual(["/internships/", "/internships/page-2/"]);
    expect(jobs).toHaveLength(3);
  });
});

describe("multiple feeds", () => {
  it("dedupes across feeds; ids already emitted count as known", async () => {
    const route = siteRoutes({
      feeds: {
        "/internships/": pagesOf([ids(1, 4), ids(5, 8)]),
        "/internships/work-from-home-internships/": pagesOf([["2", "3", "50"], ["4", "5"], ["60"]], { feedPath: "/internships/work-from-home-internships/" }),
        "/internships-for-women/": pagesOf([["1", "2"], ["70"]], { feedPath: "/internships-for-women/" }),
      },
    });
    const { jobs, calls } = await runScraper("internship", route, { options: { maxPages: 5 }, ctx: { isKnown: () => false } });
    const emitted = jobs.map((j) => j.sourceJobId);
    expect(new Set(emitted).size).toBe(emitted.length);
    expect(emitted).toEqual([...ids(1, 8), "50"]);
    // wfh: page 1 has a new id (50) → page 2 is all already-emitted → stop. women: page 1 all emitted → stop.
    expect(listingCalls(calls)).toEqual([
      "/internships/",
      "/internships/page-2/",
      "/internships/work-from-home-internships/",
      "/internships/work-from-home-internships/page-2/",
      "/internships-for-women/",
    ]);
    expect(jobs.find((j) => j.sourceJobId === "50")?.extra).toMatchObject({ feed: "wfh" });
  });

  it("jobs found first in the women feed carry the women tag", async () => {
    const route = siteRoutes({
      feeds: {
        "/internships/": pagesOf([ids(1, 2)]),
        "/internships-for-women/": pagesOf([["2", "9"]], { feedPath: "/internships-for-women/" }),
      },
    });
    const { jobs } = await runScraper("internship", route, { options: { feeds: ["main", "women"] } });
    expect(jobs.find((j) => j.sourceJobId === "9")?.tags).toContain("women");
    expect(jobs.filter((j) => j.sourceJobId === "2")).toHaveLength(1);
  });

  it("the jobs scraper crawls /jobs/, WFH and fresher feeds", async () => {
    const kind = "job" as const;
    const route = siteRoutes({
      kind,
      feeds: {
        "/jobs/": pagesOf([["1"]], { kind }),
        "/jobs/work-from-home/": pagesOf([["2"]], { kind, feedPath: "/jobs/work-from-home/" }),
        "/fresher-jobs/": pagesOf([["3"]], { kind, feedPath: "/fresher-jobs/" }),
      },
      details: (id) => ({ body: detailHtml(kind, id) }),
    });
    const { jobs, calls } = await runScraper(kind, route);
    expect(listingCalls(calls)).toEqual(["/jobs/", "/jobs/work-from-home/", "/fresher-jobs/"]);
    expect(jobs.map((j) => [j.sourceJobId, j.source, j.jobType])).toEqual([
      ["1", "internshala-jobs", "full_time"],
      ["2", "internshala-jobs", "full_time"],
      ["3", "internshala-jobs", "full_time"],
    ]);
  });

  it("a feed that lists the other kind (like /jobs-for-women/, which serves internships) is skipped after one page", async () => {
    const route = siteRoutes({ kind: "job", feeds: { "/jobs/": pagesOf([ids(1, 3), ids(4, 6)]) } }); // internship cards on a jobs feed
    const { jobs, calls, error } = await runScraper("job", route, { options: { feeds: ["main"], maxPages: 5 } });
    expect(error).toBeNull();
    expect(jobs).toEqual([]);
    expect(listingCalls(calls)).toEqual(["/jobs/"]);
    expect(detailCalls(calls)).toEqual([]);
  });

  it("a deeper page made only of the other kind neither stops nor extends the known streak", async () => {
    const kind = "job" as const;
    const jobPage = (n: number, cards: string[]): Route => ({ body: listingHtml({ kind, page: n, lastPage: 4, cards }) });
    const route = siteRoutes({
      kind,
      feeds: {
        "/jobs/": (n) =>
          n === 1 ? jobPage(1, ["1", "2"]) : n === 2 ? { body: listingHtml({ page: 2, lastPage: 4, cards: ids(50, 52) }) } : n === 3 ? jobPage(3, ["3", "4"]) : jobPage(4, ["5"]),
      },
      details: (id) => ({ body: detailHtml(kind, id) }),
    });
    // page 1: id 2 unknown → continue; page 2: internships only (PPO cards) — all "known" for us, but it must not
    // end the feed; page 3: unknown jobs, so it is still crawled; page 4 is the last page.
    const { jobs, calls } = await runScraper(kind, route, { options: { feeds: ["main"], maxPages: 10 }, ctx: { isKnown: knownSet(["1", "5"]) } });
    expect(listingCalls(calls)).toEqual(["/jobs/", "/jobs/page-2/", "/jobs/page-3/", "/jobs/page-4/"]);
    expect(jobs.map((j) => j.sourceJobId)).toEqual(["1", "2", "3", "4", "5"]);
  });
});

describe("detail pages", () => {
  const route = (details?: (id: string) => Route | undefined) => siteRoutes({ feeds: { "/internships/": pagesOf([ids(1, 5)]) }, details });

  it("are capped per run; the rest are emitted from their card", async () => {
    const { jobs, calls } = await runScraper("internship", route(), { options: { feeds: ["main"], maxDetails: 2 } });
    expect(detailCalls(calls)).toHaveLength(2);
    expect(jobs).toHaveLength(5);
    expect(jobs.map((j) => j.extra?.detail === true)).toEqual([true, true, false, false, false]);
    // over-cap unknown jobs get the card preview so they are still searchable
    expect(jobs[4]?.descriptionText).toMatch(/^Selected intern's day-to-day responsibilities include working on role 5 with the…$/);
  });

  it("maxDetails 0 disables detail fetching", async () => {
    const { calls } = await runScraper("internship", route(), { options: { feeds: ["main"], maxDetails: 0 } });
    expect(detailCalls(calls)).toEqual([]);
  });

  it("a 404 detail falls back to the card", async () => {
    const { jobs, error } = await runScraper("internship", route((id) => (id === "3" ? { status: 404 } : undefined)), { options: { feeds: ["main"] } });
    expect(error).toBeNull();
    expect(jobs).toHaveLength(5);
    expect(jobs[2]?.descriptionHtml).toBeNull();
    expect(jobs[1]?.descriptionHtml).toContain("Full description of role 2");
  });

  it("a posting whose detail page is no longer active is not emitted", async () => {
    const { jobs } = await runScraper("internship", route((id) => (id === "2" ? { body: detailHtml("internship", id, { status: "closed" }) } : undefined)), {
      options: { feeds: ["main"] },
    });
    expect(jobs.map((j) => j.sourceJobId)).toEqual(["1", "3", "4", "5"]);
  });

  it("a detail page for another id is ignored (card only)", async () => {
    const { jobs } = await runScraper("internship", route((id) => ({ body: detailHtml("internship", id === "1" ? "999" : id) })), {
      options: { feeds: ["main"] },
    });
    expect(jobs[0]?.descriptionHtml).toBeNull();
    expect(jobs[1]?.descriptionHtml).not.toBeNull();
  });

  it("403 on a detail page stops detail fetching for the run but keeps emitting", async () => {
    const { jobs, calls, error } = await runScraper("internship", route((id) => (id === "2" ? { status: 403 } : undefined)), { options: { feeds: ["main"] } });
    expect(error).toBeNull();
    expect(detailCalls(calls)).toHaveLength(2); // 1 ok, 2 → 403, then no more
    expect(jobs).toHaveLength(5);
  });

  it("redirects are followed hop by hop through the HTTP client", async () => {
    const r = siteRoutes({ feeds: { "/internships/": pagesOf([["1"]]) } });
    const { jobs, calls } = await runScraper(
      "internship",
      (url) => {
        if (url.endsWith("/internship/detail/moved-role-at-acme1795600001")) return { body: detailHtml("internship", "1") };
        if (url.includes("/detail/role-1-")) return { status: 301, headers: { location: "/internship/detail/moved-role-at-acme1795600001" } };
        return r(url);
      },
      { options: { feeds: ["main"] } },
    );
    expect(detailCalls(calls)).toHaveLength(2);
    expect(jobs[0]?.descriptionHtml).toContain("Full description of role 1");
  });
});

describe("limits, errors, politeness", () => {
  const route = siteRoutes({ feeds: { "/internships/": pagesOf([ids(1, 5), ids(6, 10)]) } });

  it("honours ctx.limit (and fetches no details beyond it)", async () => {
    const { jobs, calls } = await runScraper("internship", route, { options: { feeds: ["main"] }, ctx: { limit: 3 } });
    expect(jobs).toHaveLength(3);
    expect(detailCalls(calls)).toHaveLength(3);
    expect(listingCalls(calls)).toEqual(["/internships/"]);
  });

  it("a failing first listing request fails the run", async () => {
    const { jobs, error } = await runScraper("internship", () => ({ status: 500, body: "oops" }), { options: { feeds: ["main"] } });
    expect(jobs).toEqual([]);
    expect(error).toBeInstanceOf(Error);
  });

  it("403 on the first listing request throws BlockedError", async () => {
    const { error } = await runScraper("internship", () => ({ status: 403 }), { options: { feeds: ["main"] } });
    expect(error).toBeInstanceOf(BlockedError);
  });

  it("a later listing failure ends that feed but keeps what was found", async () => {
    const r = siteRoutes({ feeds: { "/internships/": (n) => (n === 1 ? { body: listingHtml({ page: 1, lastPage: 5, cards: ids(1, 3) }) } : { status: 500 }) } });
    const { jobs, error } = await runScraper("internship", r, { options: { feeds: ["main"], maxDetails: 0 } });
    expect(error).toBeNull();
    expect(jobs).toHaveLength(3);
  });

  it("robots.txt refusals skip the feed instead of failing", async () => {
    const r = siteRoutes({ feeds: { "/internships/": pagesOf([ids(1, 2)]) } });
    const { http, calls } = fakeHttp(r);
    const robotsHttp = {
      ...http,
      fetch: async (url: string, init?: RequestInit) => {
        if (url.includes("work-from-home")) throw new RobotsDisallowedError(url);
        return http.fetch(url, init);
      },
    };
    const { jobs, error } = await runScraper("internship", r, { options: { feeds: ["main", "wfh"] }, ctx: { http: robotsHttp } });
    expect(error).toBeNull();
    expect(jobs).toHaveLength(2);
    expect(calls.length).toBeGreaterThan(0);
  });

  it("an aborted signal stops the run", async () => {
    const ac = new AbortController();
    ac.abort(new Error("shutdown"));
    const { jobs, error } = await runScraper("internship", route, { options: { feeds: ["main"] }, ctx: { signal: ac.signal } });
    expect(jobs).toEqual([]);
    expect(error).toBeInstanceOf(Error);
  });

  it("only ever requests robots-allowed, query-free Internshala URLs", async () => {
    const { calls, jobs } = await runScraper("internship", route, { options: { feeds: ["main"], maxPages: 2 } });
    expect(calls.length).toBeGreaterThan(0);
    for (const url of calls) {
      expect(url).toMatch(/^https:\/\/internshala\.com\/(internships\/(page-\d+\/)?|internship\/detail\/[^/?,]+)$/);
      expect(url).not.toMatch(/[?,]|\/details\/|\/api\//);
    }
    expect(jobs.every((j) => validateRawJob(j).length === 0)).toBe(true);
  });
});

describe("refresh rotation (incremental runs)", () => {
  const deep = Array.from({ length: 10 }, (_, i) => ids(i * 3 + 1, i * 3 + 3));
  const route = siteRoutes({ feeds: { "/internships/": pagesOf(deep) } });

  it("revisits a rotating window of deeper pages so old postings stay seen", async () => {
    const { calls, jobs } = await runScraper("internship", route, {
      options: { feeds: ["main"], refreshPages: 2 },
      ctx: { isKnown: () => true },
    });
    const listings = listingCalls(calls);
    expect(listings[0]).toBe("/internships/");
    expect(listings).toHaveLength(3);
    // slot = floor(now / 20 min); window of 2 pages among pages 2..10
    const slot = Math.floor(FIXED_NOW.getTime() / (20 * 60_000));
    const expected = [0, 1].map((j) => `/internships/page-${2 + ((slot * 2 + j) % 9)}/`);
    expect(listings.slice(1)).toEqual(expected);
    expect(jobs).toHaveLength(9);
    expect(detailCalls(calls)).toEqual([]);
  });

  it("is skipped without ctx.isKnown (CLI runs)", async () => {
    const { calls } = await runScraper("internship", route, { options: { feeds: ["main"], refreshPages: 2, maxPages: 1 } });
    expect(listingCalls(calls)).toEqual(["/internships/"]);
  });
});
