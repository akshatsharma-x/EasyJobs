import { describe, expect, it } from "vitest";
import { adzunaMaxDaysOld, adzunaScraper, adzunaUrl, mapAdzunaJob, type AdzunaResponse } from "../src/sources/adzuna";
import { collect, expectValidJobs, fakeHttp, fixture, fixtureJson, testCtx } from "./helpers";

const KEYS = { ADZUNA_APP_ID: "test-id", ADZUNA_APP_KEY: "test-secret-key" };
const results = fixtureJson<AdzunaResponse>("adzuna-in.json").results ?? [];

describe("adzuna · gating", () => {
  it("is enabled only when both keys exist", () => {
    expect(adzunaScraper.isEnabled?.({})).toBe(false);
    expect(adzunaScraper.isEnabled?.({ ADZUNA_APP_ID: "x" })).toBe(false);
    expect(adzunaScraper.isEnabled?.({ ADZUNA_APP_ID: "x", ADZUNA_APP_KEY: "  " })).toBe(false);
    expect(adzunaScraper.isEnabled?.(KEYS)).toBe(true);
    expect(adzunaScraper.isEnabled?.({ ...KEYS, OPEN_APIS_DISABLED: "adzuna" })).toBe(false);
  });
});

describe("adzuna · mapping (synthetic fixture in the documented format)", () => {
  it("maps title (tags stripped), company, India location, salary and type", () => {
    const job = mapAdzunaJob(results[0]!);
    expect(job).toMatchObject({
      source: "adzuna",
      sourceKind: "aggregator",
      sourceJobId: "4123456789",
      title: "Graduate Engineer Trainee - Software",
      company: "Example Technologies Pvt Ltd",
      locations: ["Bangalore, Karnataka, India"],
      jobType: "full_time",
      department: "IT",
      postedAt: "2026-11-25T09:15:00.000Z",
      target: null,
    });
    expect(job?.salary).toMatchObject({ min: 350000, max: 500000, currency: "INR", period: "year" });
    expect(job?.applyUrl).toBe(results[0]!.redirect_url);
    expect(job?.descriptionText).toContain("Python & SQL"); // entity decoded
    expect(job?.extra?.geo).toEqual({ lat: 12.9716, lng: 77.5946 });
  });

  it("never presents a predicted salary as the posted salary", () => {
    const job = mapAdzunaJob(results[1]!);
    expect(job?.salary).toBeNull();
    expect(job?.salaryRaw).toBeNull();
    expect(job?.extra?.predictedSalary).toMatchObject({ min: 180000, max: 180000 });
    expect(job?.jobType).toBe("part_time");
  });

  it("skips listings without an employer; maps contracts", () => {
    expect(mapAdzunaJob(results[2]!)).toBeNull();
    expect(mapAdzunaJob(results[3]!)?.jobType).toBe("contract");
  });

  it("builds the India endpoint with max_days_old and sort_by=date", () => {
    const url = new URL(adzunaUrl({ ...KEYS, ADZUNA_WHAT: "developer" }, 2, 3, 50));
    expect(url.pathname).toBe("/v1/api/jobs/in/search/2");
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      app_id: "test-id",
      app_key: "test-secret-key",
      results_per_page: "50",
      max_days_old: "3",
      sort_by: "date",
      what: "developer",
    });
    const now = Date.parse("2026-11-26T00:00:00Z");
    expect(adzunaMaxDaysOld({}, new Date(now - 30 * 60_000), now)).toBe(2);
    expect(adzunaMaxDaysOld({}, undefined, now)).toBe(3);
    expect(adzunaMaxDaysOld({ ADZUNA_MAX_DAYS_OLD: "7" }, undefined, now)).toBe(7);
  });
});

describe("adzuna · scrape", () => {
  it("emits valid jobs and stops when a page is short", async () => {
    const http = fakeHttp([{ match: "api.adzuna.com/v1/api/jobs/in/search/1", body: fixture("adzuna-in.json") }]);
    const out = await collect(adzunaScraper, testCtx(http, KEYS));
    expect(out.map((j) => j.sourceJobId)).toEqual(["4123456789", "4123456790", "4123456792"]);
    expectValidJobs(out, adzunaScraper);
    expect(http.calls).toHaveLength(1);
    expect(http.calls[0]?.init?.robots).toBe(false);
  });

  it("redacts the API key from errors", async () => {
    const http = fakeHttp([{ match: "api.adzuna.com", status: 401, body: '{"exception":"AUTH_FAIL"}' }]);
    const err = await collect(adzunaScraper, testCtx(http, KEYS)).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
    expect(String((err as Error).message)).not.toContain("test-secret-key");
    expect(String((err as Error).message)).toContain("***");
  });
});
