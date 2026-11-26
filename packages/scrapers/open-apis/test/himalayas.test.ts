import { describe, expect, it } from "vitest";
import { himalayasId, himalayasScraper, himalayasSearchUrl, mapHimalayasJob, type HimalayasResponse } from "../src/sources/himalayas";
import { collect, expectValidJobs, fakeHttp, fixture, fixtureJson, testCtx } from "./helpers";

const rows = fixtureJson<HimalayasResponse>("himalayas-search.json").jobs ?? [];
const byTitle = (t: string) => {
  const j = rows.find((x) => x.title?.startsWith(t));
  if (!j) throw new Error(`fixture "${t}" missing`);
  return j;
};

describe("himalayas · mapping (live capture of search?country=IN&sort=recent)", () => {
  it("India-restricted role: salary, seniority, expiry, unchanged applicationLink", () => {
    const row = byTitle("Program Manager - Skilling, Pune");
    const job = mapHimalayasJob(row);
    expect(job).toMatchObject({
      source: "himalayas",
      company: "Ground Zero",
      locations: ["Remote (India)"],
      isRemote: true,
      tags: ["remote"],
      jobType: "full_time",
      experienceLevel: "senior",
      department: row.parentCategories?.[0],
    });
    expect(job?.salary).toMatchObject({ min: 1200000, max: 1200000, currency: "INR", period: "year" });
    expect(job?.applyUrl).toBe(row.applicationLink);
    expect(job?.sourceUrl).toBe(row.guid);
    expect(job?.validThrough).toBe(new Date((row.expiryDate ?? 0) * 1000).toISOString());
    expect(job?.extra?.terms).toMatchObject({ applyUrlUnchanged: true, noJobPostingSchema: true });
  });

  it("worldwide (no restrictions) role with monthly USD salary; lowest seniority wins", () => {
    const job = mapHimalayasJob(byTitle("Chat Support Specialist"));
    expect(job).toMatchObject({ locations: ["Remote (Anywhere)"], experienceLevel: "entry" });
    expect(job?.salary).toMatchObject({ min: 1200, max: 5000, currency: "USD", period: "month" });
  });

  it("hourly contract salary", () => {
    expect(mapHimalayasJob(byTitle("Math Programmer"))?.salary).toMatchObject({ min: 60, max: 120, period: "hour", currency: "USD" });
  });

  it("a long multi-country list that includes India is India-eligible (and summarised in extra)", () => {
    const job = mapHimalayasJob(byTitle("Software Engineer - Java/Kotlin"));
    expect(job?.locations).toEqual(["Remote (India)"]);
    expect(job?.extra?.locationRestrictionCount).toBeGreaterThan(100);
  });

  it("drops a 'U.S. Based' title even when restrictions are empty", () => {
    expect(mapHimalayasJob(byTitle("Web Developer: WordPress"))).toBeNull();
  });

  it("derives a stable id from the guid", () => {
    expect(himalayasId("https://himalayas.app/companies/acme/jobs/backend-engineer")).toBe("acme/jobs/backend-engineer");
    expect(himalayasSearchUrl(2, "IN")).toBe("https://himalayas.app/jobs/api/search?country=IN&sort=recent&page=2");
  });
});

describe("himalayas · scrape", () => {
  it("pages search results until an empty page; optional API key goes in Authorization", async () => {
    const empty = JSON.stringify({ jobs: [] });
    const http = fakeHttp([
      { match: "page=1", body: fixture("himalayas-search.json") },
      { match: "page=2", body: empty },
    ]);
    const out = await collect(himalayasScraper, testCtx(http, { HIMALAYAS_API_KEY: "hk-test" }));
    expect(out).toHaveLength(19);
    expectValidJobs(out, himalayasScraper);
    expect(http.calls.map((c) => new URL(c.url).searchParams.get("page"))).toEqual(["1", "2"]);
    expect(new Headers(http.calls[0]?.init?.headers).get("authorization")).toBe("Bearer hk-test");
  });

  it("honours HIMALAYAS_MAX_PAGES", async () => {
    const http = fakeHttp([{ match: "page=", body: fixture("himalayas-search.json") }]);
    await collect(himalayasScraper, testCtx(http, { HIMALAYAS_MAX_PAGES: "3" }));
    expect(http.calls).toHaveLength(3);
  });
});
