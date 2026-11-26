import { describe, expect, it } from "vitest";
import { jobicyScraper, jobicyUrl, mapJobicyJob, type JobicyResponse } from "../src/sources/jobicy";
import { collect, expectValidJobs, fakeHttp, fixture, fixtureJson, testCtx } from "./helpers";

const anywhere = fixtureJson<JobicyResponse>("jobicy-anywhere.json").jobs ?? [];
const apac = fixtureJson<JobicyResponse>("jobicy-apac.json").jobs ?? [];

describe("jobicy · mapping (live capture of /api/jobs?geo=anywhere|apac)", () => {
  it("Anywhere role → remote/anywhere, Jobicy URL as apply link", () => {
    const row = anywhere[0]!;
    const job = mapJobicyJob(row);
    expect(job).toMatchObject({
      source: "jobicy",
      sourceJobId: String(row.id),
      locations: ["Remote (Anywhere)"],
      isRemote: true,
      tags: ["remote"],
      applyUrl: row.url,
      sourceUrl: row.url,
    });
    expect(job?.extra?.terms).toMatchObject({ applyUrlUnchanged: true });
  });

  it("keeps APAC roles, drops Philippines/China/Australia-only ones", () => {
    for (const row of apac) {
      const job = mapJobicyJob(row);
      const geo = String(row.jobGeo);
      if (/APAC/.test(geo)) expect(job?.locations, geo).toEqual(["Remote (APAC)"]);
      if (/^(Philippines|China|Australia|Japan|Singapore|Hong Kong|Vietnam)/.test(geo)) expect(job, geo).toBeNull();
    }
  });

  it("drops an 'Anywhere' role whose description says it is based in EMEA", () => {
    const row = anywhere.find((r) => r.jobTitle?.includes("Secure Container Images"));
    if (row) expect(mapJobicyJob(row)).toBeNull();
  });

  it("maps level, type and salary", () => {
    const withSalary = apac.find((r) => r.salaryMin);
    expect(withSalary).toBeDefined();
    const job = mapJobicyJob(withSalary!);
    expect(job?.salary).toMatchObject({ min: withSalary!.salaryMin, currency: withSalary!.salaryCurrency });
    expect(mapJobicyJob({ id: 1, url: "https://jobicy.com/jobs/1", jobTitle: "Dev &amp; Ops", companyName: "X", jobGeo: "Anywhere", jobLevel: "Entry-Level, Junior", jobType: ["Full-Time"] })).toMatchObject({
      title: "Dev & Ops",
      experienceLevel: "entry",
      jobType: "full_time",
    });
  });
});

describe("jobicy · scrape", () => {
  it("walks geo=anywhere then geo=apac with cursor paging and dedupes by id", async () => {
    const http = fakeHttp([
      { match: "geo=anywhere", body: fixture("jobicy-anywhere.json") },
      { match: "geo=apac", body: fixture("jobicy-apac.json") },
    ]);
    const out = await collect(jobicyScraper, testCtx(http));
    expectValidJobs(out, jobicyScraper);
    expect(http.calls.map((c) => c.url)).toEqual([jobicyUrl("anywhere", 100), jobicyUrl("apac", 100)]);
    expect(out.length).toBeGreaterThanOrEqual(12);
  });

  it("follows nextCursor", async () => {
    const page = fixtureJson<JobicyResponse>("jobicy-anywhere.json");
    const http = fakeHttp([
      { match: "cursor=abc", body: JSON.stringify({ ...page, nextCursor: null }) },
      { match: "geo=anywhere", body: JSON.stringify({ ...page, nextCursor: "abc" }) },
      { match: "geo=apac", body: JSON.stringify({ jobs: [], nextCursor: null }) },
    ]);
    await collect(jobicyScraper, testCtx(http));
    expect(http.calls.map((c) => c.url)).toContain(jobicyUrl("anywhere", 100, "abc"));
  });
});
