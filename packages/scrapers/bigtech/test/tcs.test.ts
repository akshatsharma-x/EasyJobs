import { describe, expect, it } from "vitest";
import { mapTcsJob, tcs, TCS_DISABLED_REASON, tcsJobUrl, tcsSearchBody, type TcsSearchResponse } from "../src/sites/tcs";
import { collect, fakeHttp, fixtureJson, invalidJobs } from "./helpers";

describe("tcs (disabled: session/anti-bot tokens required)", () => {
  it("is disabled with a documented reason", () => {
    expect(tcs.isEnabled?.({})).toBe(false);
    expect(tcs.disabledReason).toBe(TCS_DISABLED_REASON);
    expect(TCS_DISABLED_REASON).toMatch(/xsrf/i);
  });

  it("parses a search/jobs response captured from the live page", async () => {
    const http = fakeHttp([{ match: /\/api\/en-IN\/search\/jobs$/, file: "tcs/search-jobs-page1.json" }]);
    const jobs = await collect(tcs, { http, limit: 3 });
    expect(jobs).toHaveLength(3);
    expect(invalidJobs(jobs)).toEqual([]);
    expect(JSON.parse(http.calls[0]!.body)).toMatchObject({ page: 1, includeWalkIn: true, recentSortOrder: "desc" });
  });

  it("maps experience, apply-by date, domain and skills", () => {
    const page = fixtureJson<TcsSearchResponse>("tcs/search-jobs-page1.json");
    const job = mapTcsJob(page.payload!.content[0]!);
    expect(job).toMatchObject({
      sourceJobId: "376658J",
      sourceUrl: "https://ibegin.tcsapps.com/candidate/next/en-IN/jobs/376658J",
      title: "Subject Matter Expert",
      company: "Tata Consultancy Services",
      locations: ["Mumbai, India"],
      validThrough: "2026-11-30T18:29:59.000Z",
      department: "Technology",
      experienceMin: 10,
      experienceMax: 20,
      experienceRaw: "10-20 years",
      skills: ["Accessibility Assessment and Evaluation Techniques", "TCS Assessment Framework"],
    });
    expect(job.postedAt).toBeNull();
  });

  it("tags walk-in drives and builds the request body", () => {
    expect(mapTcsJob({ id: "1", title: "Walk-in drive: Java", walkIn: true }).tags).toEqual(["walk-in"]);
    expect(tcsSearchBody(3, 50)).toMatchObject({ page: 3, resultsPerPage: 50, includeRegularJob: true });
    expect(tcsJobUrl("A B")).toBe("https://ibegin.tcsapps.com/candidate/next/en-IN/jobs/A%20B");
  });
});
