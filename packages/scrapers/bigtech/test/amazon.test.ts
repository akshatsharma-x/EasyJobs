import { describe, expect, it } from "vitest";
import { amazon, amazonMinYears, amazonSearchUrl, mapAmazonJob, parseAmazonLocations, type AmazonSearchResponse } from "../src/sites/amazon";
import { collect, fakeHttp, fixtureJson, invalidJobs } from "./helpers";

const routes = [
  { match: /search\.json\?offset=0&/, file: "amazon/search-page1.json" },
  { match: /search\.json\?offset=8&/, file: "amazon/search-page2.json" },
];

describe("amazon", () => {
  it("builds the India search URL", () => {
    const url = new URL(amazonSearchUrl(100, 50));
    expect(url.pathname).toBe("/en/search.json");
    expect(url.searchParams.get("offset")).toBe("100");
    expect(url.searchParams.get("result_limit")).toBe("50");
    expect(url.searchParams.getAll("normalized_country_code[]")).toEqual(["IND"]);
  });

  it("paginates by offset and emits valid RawJobs", async () => {
    const http = fakeHttp(routes);
    const jobs = await collect(amazon, { http, env: { BIGTECH_PAGE_SIZE: "8" } });
    expect(jobs).toHaveLength(10);
    expect(invalidJobs(jobs)).toEqual([]);
    expect(http.calls.map((c) => new URL(c.url).searchParams.get("offset"))).toEqual(["0", "8"]);
    expect(new Set(jobs.map((j) => j.sourceJobId)).size).toBe(10);
    for (const j of jobs) {
      expect(j.source).toBe("amazon");
      expect(j.sourceKind).toBe("career_site");
      expect(j.target).toBe("amazon");
      expect(j.applyUrl).toMatch(/^https:\/\/www\.amazon\.jobs\/en\/jobs\/\d+\//);
      expect(j.postedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(j.descriptionHtml).toBeTruthy();
    }
  });

  it("maps fields, qualifications and hints", () => {
    const page = fixtureJson<AmazonSearchResponse>("amazon/search-page1.json");
    const job = mapAmazonJob(page.jobs[0]!);
    expect(job).toMatchObject({
      sourceJobId: "10614073",
      company: "Amazon",
      companyDomain: "amazon.com",
      locations: ["Bengaluru, Karnataka, India"],
      postedAt: "2026-11-25T00:00:00.000Z",
      employmentTypeRaw: "full-time",
      jobType: "full_time",
      workMode: "onsite",
      isRemote: false,
      experienceMin: 3,
    });
    expect(job.descriptionHtml).toContain("<h3>Basic qualifications</h3>");
    expect(job.descriptionHtml).toContain("<h3>Preferred qualifications</h3>");
    expect(job.extra).toMatchObject({ legalEntity: "ADCI - Karnataka", applyFlowUrl: "https://account.amazon.jobs/jobs/10614073/apply" });
  });

  it("treats VIRTUAL locations as remote and student programs as intern/fresher", () => {
    const all = [...fixtureJson<AmazonSearchResponse>("amazon/search-page1.json").jobs, ...fixtureJson<AmazonSearchResponse>("amazon/search-page2.json").jobs];
    const virtual = all.find((j) => j.id_icims === "10612553")!;
    expect(parseAmazonLocations(virtual)).toEqual({ locations: ["Remote (Virtual) - Bengaluru, Karnataka, India"], workMode: "remote" });
    expect(mapAmazonJob(virtual).isRemote).toBe(true);
    const intern = mapAmazonJob(all.find((j) => j.id_icims === "10498382")!);
    expect(intern).toMatchObject({ jobType: "internship", experienceLevel: "intern" });
    const multi = mapAmazonJob(all.find((j) => j.id_icims === "10611128")!);
    expect(multi.locations.length).toBeGreaterThan(1);
  });

  it("honours ctx.limit", async () => {
    const jobs = await collect(amazon, { http: fakeHttp(routes), env: { BIGTECH_PAGE_SIZE: "8" }, limit: 3 });
    expect(jobs).toHaveLength(3);
  });

  it("extracts the strictest years requirement", () => {
    expect(amazonMinYears("- 2+ years of X<br/>- 5+ years of Y<br/>- Bachelor's degree")).toMatchObject({ min: 5 });
    expect(amazonMinYears("- Bachelor's degree")).toBeNull();
  });
});
