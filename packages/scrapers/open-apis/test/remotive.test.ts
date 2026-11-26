import { describe, expect, it } from "vitest";
import { mapRemotiveJob, remotiveScraper, type RemotiveResponse } from "../src/sources/remotive";
import { collect, expectValidJobs, fakeHttp, fixture, fixtureJson, testCtx } from "./helpers";

const feed = fixtureJson<RemotiveResponse>("remotive.json").jobs ?? [];
const byTitle = (t: string) => {
  const j = feed.find((x) => x.title === t);
  if (!j) throw new Error(`fixture "${t}" missing`);
  return j;
};

describe("remotive · mapping (live capture 2026-11-26)", () => {
  it("keeps Worldwide roles, tagged remote, linking back to Remotive", () => {
    const job = mapRemotiveJob(byTitle("Freelance Writer"));
    expect(job).toMatchObject({
      source: "remotive",
      sourceKind: "job_board",
      company: "IAPWE",
      locations: ["Remote (Anywhere)"],
      isRemote: true,
      workMode: "remote",
      tags: ["remote"],
      jobType: "freelance",
      salaryRaw: "$50-$75 /hour",
      target: "remotive",
    });
    expect(job?.applyUrl).toBe(job?.sourceUrl);
    expect(job?.applyUrl).toMatch(/^https:\/\/remotive\.com\/remote-jobs\//);
    expect(job?.postedAt).toMatch(/Z$/);
    expect(job?.extra?.terms).toMatchObject({ linkBackRequired: true, noJobPostingSchema: true });
  });

  it("keeps APAC-inclusive regions, drops USA/Americas-only ones", () => {
    expect(mapRemotiveJob(byTitle("Senior Data Engineer"))?.locations).toEqual(["Remote (APAC)"]);
    expect(mapRemotiveJob(byTitle("WordPress Theme & Plugin Developer"))).toBeNull();
    expect(mapRemotiveJob(byTitle("Customer Service Representative"))).toBeNull();
  });

  it("maps tags to skills and category to department", () => {
    const job = mapRemotiveJob(byTitle("Full-Stack Developer"));
    expect(job?.department).toBe("Software Development");
    expect(job?.skills?.length).toBeGreaterThan(0);
  });
});

describe("remotive · scrape", () => {
  it("one request for the whole feed (robots:false documented API), 8 of 16 eligible", async () => {
    const http = fakeHttp([{ match: "remotive.com/api/remote-jobs", body: fixture("remotive.json") }]);
    const out = await collect(remotiveScraper, testCtx(http));
    expect(out).toHaveLength(8);
    expectValidJobs(out, remotiveScraper);
    expect(http.calls).toHaveLength(1);
    expect(http.calls[0]?.init?.robots).toBe(false);
  });

  it("respects the documented request budget (≤ 4/day)", () => {
    expect(remotiveScraper.intervalMinutes).toBeGreaterThanOrEqual(360);
    expect(remotiveScraper.attribution).toMatch(/Remotive/);
  });
});
