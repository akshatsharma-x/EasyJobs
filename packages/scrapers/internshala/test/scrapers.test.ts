import { describe, expect, it } from "vitest";
import { validateRawJob, type RawJob } from "@easyjobs/contract";
import type { ScraperModule } from "@easyjobs/contract/node";
import * as mod from "../src/index";
import { parseCliOptions } from "../src/cli-options";
import { DEFAULTS, MIN_DELAY_MS, parseCount, resolveOptions } from "../src/config";
import { pageUrl } from "../src/feeds";
import { isInternshalaEnabled } from "../src/scrapers";
import { Throttle, sharedThrottle } from "../src/throttle";
import { ORIGIN, fixture, listingHtml, runScraper, type Route } from "./helpers";

describe("package module", () => {
  it("exports the two scrapers as a ScraperModule", () => {
    const m: ScraperModule = mod;
    expect(m.default).toBe(mod.scrapers);
    expect(mod.scrapers.map((s) => [s.id, s.name, s.kind, s.intervalMinutes, s.handlesAts])).toEqual([
      ["internshala-internships", "Internshala Internships", "job_board", 20, undefined],
      ["internshala-jobs", "Internshala Jobs", "job_board", 20, undefined],
    ]);
    for (const s of mod.scrapers) expect(typeof s.scrape).toBe("function");
  });

  it("is enabled unless INTERNSHALA_ENABLED is 0/false/off", () => {
    expect(isInternshalaEnabled({})).toBe(true);
    expect(isInternshalaEnabled({ INTERNSHALA_ENABLED: "1" })).toBe(true);
    for (const v of ["0", "false", "OFF", "no"]) expect(isInternshalaEnabled({ INTERNSHALA_ENABLED: v })).toBe(false);
  });
});

describe("configuration", () => {
  it("defaults", () => {
    const o = resolveOptions("internship", {});
    expect(o).toMatchObject({ ...DEFAULTS, delayMs: MIN_DELAY_MS, devCacheDir: null, origin: "https://internshala.com" });
    expect(o.feeds.map((f) => f.id)).toEqual(["main", "wfh", "women"]);
    expect(resolveOptions("job", {}).feeds.map((f) => f.id)).toEqual(["main", "wfh", "fresher"]);
  });

  it("env vars", () => {
    const o = resolveOptions("job", {
      INTERNSHALA_MAX_PAGES: "all",
      INTERNSHALA_MAX_DETAILS: "25",
      INTERNSHALA_REFRESH_PAGES: "0",
      INTERNSHALA_STOP_AFTER_KNOWN_PAGES: "2",
      INTERNSHALA_JOB_FEEDS: "fresher,main,bogus",
      INTERNSHALA_DEV_CACHE: "1",
    });
    expect(o).toMatchObject({ maxPages: Number.POSITIVE_INFINITY, maxDetails: 25, refreshPages: 0, stopAfterKnownPages: 2 });
    expect(o.feeds.map((f) => f.id)).toEqual(["fresher", "main"]);
    expect(o.devCacheDir).toMatch(/internshala[\\/]\.cache[\\/]http$/);
  });

  it("never goes faster than 1 request / 1.5 s via env; code (tests) may", () => {
    expect(resolveOptions("internship", { INTERNSHALA_DELAY_MS: "200" }).delayMs).toBe(1500);
    expect(resolveOptions("internship", { INTERNSHALA_DELAY_MS: "3000" }).delayMs).toBe(3000);
    expect(resolveOptions("internship", {}, { delayMs: 0 }).delayMs).toBe(0);
  });

  it("overrides beat env", () => {
    expect(resolveOptions("internship", { INTERNSHALA_MAX_PAGES: "3" }, { maxPages: 7 }).maxPages).toBe(7);
  });

  it.each([
    ["all", Number.POSITIVE_INFINITY],
    ["12", 12],
    ["0", 0],
    ["-1", undefined],
    ["x", undefined],
    ["", undefined],
    [undefined, undefined],
  ])("parseCount(%j) = %j", (input, expected) => {
    expect(parseCount(input)).toBe(expected);
  });

  it("CLI flags --pages / --details / --cache", () => {
    expect(parseCliOptions(["--limit", "30", "--pages", "5", "--details", "all", "--cache"])).toEqual({
      overrides: { maxPages: 5, maxDetails: Number.POSITIVE_INFINITY },
      devCache: true,
    });
    expect(parseCliOptions(["--pages", "all"]).overrides.maxPages).toBe(Number.POSITIVE_INFINITY);
    expect(parseCliOptions([])).toEqual({ overrides: {}, devCache: false });
    expect(() => parseCliOptions(["--pages", "many"])).toThrow(/--pages/);
  });

  it("page URLs are path-based (robots.txt forbids query strings)", () => {
    const feed = { id: "wfh", path: "/internships/work-from-home-internships/" };
    expect(pageUrl(ORIGIN, feed, 1)).toBe("https://internshala.com/internships/work-from-home-internships/");
    expect(pageUrl(ORIGIN, feed, 3)).toBe("https://internshala.com/internships/work-from-home-internships/page-3/");
  });
});

describe("Throttle", () => {
  it("spaces request starts by at least the gap", async () => {
    const t = new Throttle(40);
    const t0 = Date.now();
    const starts = (
      await Promise.all(
        [0, 1, 2].map(async () => {
          await t.wait();
          return Date.now();
        }),
      )
    ).sort((a, b) => a - b);
    // the k-th start may not happen before t0 + k × gap
    expect((starts[1] ?? 0) - t0).toBeGreaterThanOrEqual(40);
    expect((starts[2] ?? 0) - t0).toBeGreaterThanOrEqual(80);
  });

  it("rejects when aborted while waiting", async () => {
    const t = new Throttle(10_000);
    await t.wait();
    const ac = new AbortController();
    const p = t.wait(ac.signal);
    ac.abort(new Error("stop"));
    await expect(p).rejects.toThrow("stop");
  });

  it("is shared per host across both scrapers", () => {
    expect(sharedThrottle("example.test", 1500)).toBe(sharedThrottle("example.test", 1500));
  });
});

describe("end to end on the saved pages", () => {
  /** Serves the real listing fixtures as page 1 and the real detail fixtures for their URLs. */
  const realSite = (listing: string, details: Record<string, string>) => {
    const listingBody = fixture(listing);
    const detailBodies = new Map(Object.entries(details).map(([id, name]) => [id, fixture(name)]));
    const byPath = new Map<string, string>();
    for (const m of listingBody.matchAll(/internshipid="(\d+)"[^>]*data-href="([^"]+)"/gi)) {
      const body = m[1] ? detailBodies.get(m[1]) : undefined;
      if (body && m[2]) byPath.set(m[2], body);
    }
    return (url: string): Route | undefined => {
      const u = new URL(url);
      if (u.pathname === "/internships/" || u.pathname === "/jobs/") return { body: listingBody };
      const body = byPath.get(u.pathname);
      if (body) return { body };
      if (/\/page-\d+\/$/.test(u.pathname)) return { body: listingHtml({ page: 2, lastPage: 2, cards: [] }) };
      return undefined; // other detail pages → 404 → card-only record
    };
  };

  const check = (jobs: RawJob[]): void => {
    expect(jobs.length).toBeGreaterThan(5);
    const invalid = jobs.filter((j) => validateRawJob(j).length > 0);
    expect(invalid).toEqual([]);
    for (const j of jobs) {
      expect(j.applyUrl).toBe(j.sourceUrl);
      expect(j.postedAt).not.toBeNull();
      expect(j.title.length).toBeGreaterThan(1);
      expect(j.company.length).toBeGreaterThan(1);
    }
  };

  it("internships: every card becomes a valid RawJob; fetched details enrich them", async () => {
    const { jobs, error } = await runScraper("internship", realSite("listing-internships", { "3334805": "detail-internship" }), {
      options: { feeds: ["main"], maxPages: 1 },
    });
    expect(error).toBeNull();
    check(jobs);
    expect(jobs.find((j) => j.sourceJobId === "3334805")?.descriptionHtml).toContain("Key Account Management");
    expect(jobs.every((j) => j.jobType === "internship" && j.experienceLevel === "intern")).toBe(true);
  });

  it("jobs: every card becomes a valid RawJob with CTC + level", async () => {
    const { jobs, error } = await runScraper(
      "job",
      realSite("listing-jobs", { "3341218": "detail-job-ctc", "3341143": "detail-job-hybrid-fresher", "3340461": "detail-job-no-jsonld" }),
      { options: { feeds: ["main"], maxPages: 1 } },
    );
    expect(error).toBeNull();
    check(jobs);
    expect(jobs.filter((j) => j.descriptionHtml !== null)).toHaveLength(3);
    for (const j of jobs) {
      expect(j.salary?.period).toBe("year");
      expect(["fresher", "entry", "mid", "senior", "lead"]).toContain(j.experienceLevel);
    }
  });
});
