import { describe, expect, it } from "vitest";
import {
  eligibilityBatches,
  eligibilityDegrees,
  eligibilityExperience,
  mapUnstopOpportunity,
  parseEligibility,
  unstopScraper,
  type UnstopOpportunity,
  type UnstopPage,
} from "../src/sources/unstop";
import { collect, expectValidJobs, fakeHttp, fixture, fixtureJson, testCtx } from "./helpers";

const jobs = fixtureJson<UnstopPage>("unstop-jobs.json").data?.data ?? [];
const internships = fixtureJson<UnstopPage>("unstop-internships.json").data?.data ?? [];
const byId = (list: UnstopOpportunity[], id: number): UnstopOpportunity => {
  const o = list.find((x) => x.id === id);
  if (!o) throw new Error(`fixture ${id} missing`);
  return o;
};

describe("unstop · mapping", () => {
  it("maps a fresher job: salary, locations, skills, dates", () => {
    const job = mapUnstopOpportunity(byId(jobs, 1828345), "jobs", "unstop:jobs");
    expect(job).toMatchObject({
      source: "unstop",
      sourceKind: "job_board",
      sourceJobId: "1828345",
      sourceUrl: "https://unstop.com/jobs/media-research-associate-citadex-1828345",
      applyUrl: "https://unstop.com/jobs/media-research-associate-citadex-1828345",
      target: "unstop:jobs",
      title: "Media Research Associate",
      company: "Citadex",
      jobType: "full_time",
      experienceLevel: "fresher",
      workMode: "onsite",
      isRemote: false,
      postedAt: "2026-11-25T15:24:54.000Z",
      validThrough: "2026-12-08T18:30:00.000Z",
      degrees: ["Any graduate"],
    });
    expect(job?.salary).toMatchObject({ min: 540000, max: 864000, currency: "INR", period: "year" });
    expect(job?.salary?.raw).toMatch(/₹5,40,000 – ₹8,64,000 \/year/);
    // "Bangalore Urban" → "Bangalore"
    expect(job?.locations).toEqual(expect.arrayContaining(["Bangalore, Karnataka, India", "Pune, Maharashtra, India"]));
    expect(job?.skills).toContain("Research Skills");
    expect(job?.companyLogoUrl).toMatch(/^https:\/\//);
  });

  it("maps eligibility to batches and degrees; unpaid WFH internship", () => {
    const job = mapUnstopOpportunity(byId(internships, 1828400), "internships", "unstop:internships");
    expect(job).toMatchObject({
      jobType: "internship",
      experienceLevel: "intern",
      workMode: "remote",
      isRemote: true,
      salary: null,
      salaryRaw: "Unpaid",
      locations: ["Remote (India)"],
      batches: [2028, 2029, 2030, 2031, 2032, 2033],
      degrees: ["B.E/B.Tech", "BCA", "MCA"],
    });
    expect(job?.tags).toEqual(expect.arrayContaining(["wfh", "unpaid"]));
    expect(job?.experienceMin).toBeUndefined();
  });

  it("reads nested professional eligibility; ignores stale fresher years for a professionals-only job", () => {
    const job = mapUnstopOpportunity(byId(jobs, 1827552), "jobs", null);
    expect(job).toMatchObject({ degrees: ["B.E/B.Tech"], batches: [], experienceMin: 1, experienceMax: 3, experienceRaw: "1–3 years", target: null });
    expect(job?.extra?.specializations).toEqual(["Electrical Engineering", "Electronics and Instrumentation"]);
  });

  it("monthly stipend becomes a month-period INR salary", () => {
    const job = mapUnstopOpportunity(byId(internships, 1826497), "internships", null);
    expect(job?.salary).toMatchObject({ min: 15000, max: 15000, currency: "INR", period: "month" });
    expect(job?.batches).toEqual([2026]);
  });

  it("eligibility helpers are defensive", () => {
    expect(parseEligibility("{not json")).toEqual({});
    expect(parseEligibility(null)).toEqual({});
    expect(eligibilityExperience({ experience: ["all"] })).toEqual({ min: null, max: null });
    expect(eligibilityExperience({ experience: ["3 years", "10 years", "4 years"] })).toEqual({ min: 3, max: 10 });
    expect(eligibilityBatches({ sector: ["students"], studentPassoutYearsSelected: [2027, "2028", "all"], fresherPassoutYearsSelected: [2026] })).toEqual([2027, 2028]);
    expect(eligibilityDegrees({ engineering: ["allCourses"], others: ["all"] })).toEqual(["Any engineering course"]);
    expect(eligibilityDegrees({ others: ["all"] })).toEqual(["Any graduate"]);
  });

  it("rejects records without id/title/company", () => {
    expect(mapUnstopOpportunity({ id: 0, title: "x" }, "jobs", null)).toBeNull();
    expect(mapUnstopOpportunity({ id: 5, title: "x", seo_url: "https://unstop.com/jobs/x-5" }, "jobs", null)).toBeNull();
  });
});

describe("unstop · scrape", () => {
  const routes = [
    { match: "opportunity=jobs", body: fixture("unstop-jobs.json") },
    { match: "opportunity=internships", body: fixture("unstop-internships.json") },
  ];

  it("fetches internships then jobs, emits valid RawJobs with per-kind sweep targets", async () => {
    const http = fakeHttp(routes);
    const out = await collect(unstopScraper, testCtx(http));
    expect(out).toHaveLength(internships.length + jobs.length);
    expectValidJobs(out, unstopScraper);
    expect(http.calls.map((c) => c.url)).toEqual([
      "https://unstop.com/api/public/opportunity/search-result?opportunity=internships&page=1&per_page=50&oppstatus=open",
      "https://unstop.com/api/public/opportunity/search-result?opportunity=jobs&page=1&per_page=50&oppstatus=open",
    ]);
    expect(new Set(out.map((j) => j.target))).toEqual(new Set(["unstop:internships", "unstop:jobs"]));
  });

  it("stops at ctx.limit without fetching more pages", async () => {
    const http = fakeHttp(routes);
    const out = await collect(unstopScraper, testCtx(http, {}, { limit: 2 }));
    expect(out).toHaveLength(2);
    expect(http.calls).toHaveLength(1);
  });

  it("is not sweepable (target null) when the page cap is below last_page", async () => {
    const page = fixtureJson<UnstopPage>("unstop-jobs.json");
    const big = JSON.stringify({ data: { ...page.data, last_page: 99 } });
    const http = fakeHttp([{ match: "opportunity=", body: big }]);
    const out = await collect(unstopScraper, testCtx(http, { UNSTOP_MAX_PAGES: "1" }));
    expect(out.every((j) => j.target === null)).toBe(true);
    expect(http.calls).toHaveLength(2);
  });
});
