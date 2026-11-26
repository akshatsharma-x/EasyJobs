import { describe, expect, it } from "vitest";
import { extractPhenomDdo, isJunkTitle, mapNttJob, nttData, nttJobUrl, parseNttJob, parseNttSearch } from "../src/sites/ntt-data";
import { collect, fakeHttp, fixture, invalidJobs, type Route } from "./helpers";

const routes: Route[] = [
  { match: /search-results\?qcountry=India&from=0$/, file: "ntt-data/search-0.html" },
  { match: /search-results\?qcountry=India&from=3$/, file: "ntt-data/search-3.html" },
  { match: /\/job\/P-100130\//, file: "ntt-data/job-P-100130.html" },
  { match: /\/job\/1149639\//, file: "ntt-data/job-1149639.html" },
];

describe("ntt-data", () => {
  it("extracts phApp.ddo safely (braces inside strings)", () => {
    expect(extractPhenomDdo(`x; phApp.ddo = {"a":"}{","b":{"c":1}}; phApp.y = 2;`)).toEqual({ a: "}{", b: { c: 1 } });
    expect(extractPhenomDdo("<html></html>")).toBeNull();
  });

  it("parses search pages", () => {
    const { jobs, total } = parseNttSearch(fixture("ntt-data/search-0.html"));
    expect(total).toBe(6);
    expect(jobs.map((j) => j.jobId)).toEqual(["P-100130", "P-100071", "1149639"]);
    expect(nttJobUrl(jobs[0]!)).toBe("https://careers.nttdata.com/global/en/job/P-100130/platform-support-engineer-l2");
  });

  it("paginates by received rows, drops junk titles and maps details", async () => {
    const http = fakeHttp(routes);
    const jobs = await collect(nttData, { http });
    expect(invalidJobs(jobs)).toEqual([]);
    expect(jobs.map((j) => j.sourceJobId)).toEqual(["P-100130", "P-100071", "1149639", "P-100174", "c3236caa29d1700"]);
    expect(http.calls.filter((c) => c.url.includes("search-results")).map((c) => new URL(c.url).searchParams.get("from"))).toEqual(["0", "3"]);
    const native = jobs.find((j) => j.sourceJobId === "P-100130")!;
    expect(native).toMatchObject({
      source: "ntt-data",
      company: "NTT DATA",
      title: "Platform Support Engineer L2",
      locations: ["Bengaluru, Karnataka, India", "Noida, Uttar Pradesh, India", "Mumbai, Maharashtra, India"],
      postedAt: "2025-08-05T00:00:00.000Z",
      department: "Information Security",
      jobType: "full_time",
      sourceUrl: "https://careers.nttdata.com/global/en/job/P-100130/platform-support-engineer-l2",
      applyUrl: "https://careers.nttdata.com/global/en/job/P-100130/platform-support-engineer-l2",
    });
    expect(native.descriptionHtml).toContain("SIEM/MDR Platform Support Engineer");
    const sub = jobs.find((j) => j.sourceJobId === "1149639")!;
    expect(sub.company).toBe("Niveus");
    expect(sub.applyUrl).toMatch(/^https:\/\/career\.niveussolutions\.com\/niveussolutions\/jobview\//);
    expect(sub.applyUrl).not.toContain("utm_");
    expect(sub.extra).toMatchObject({ sourceAts: "BRIGHTDATA", externalApply: true, subsidiary: "Niveus" });
    // no detail fixture → list data only
    expect(jobs.find((j) => j.sourceJobId === "P-100174")?.descriptionHtml).toBeNull();
  });

  it("skips detail pages for known ids", async () => {
    const http = fakeHttp(routes);
    const jobs = await collect(nttData, { http, isKnown: () => true });
    expect(jobs).toHaveLength(5);
    expect(http.calls.some((c) => c.url.includes("/job/"))).toBe(false);
  });

  it("recognizes junk titles and falls back to list fields", () => {
    expect(isJunkTitle("Job Description:")).toBe(true);
    expect(isJunkTitle("SAP BASIS")).toBe(false);
    const detail = parseNttJob(fixture("ntt-data/job-P-100130.html"))!;
    const { jobs } = parseNttSearch(fixture("ntt-data/search-0.html"));
    const mapped = mapNttJob(jobs[0]!, { ...detail, title: "Job Description:" });
    expect(mapped.title).toBe("Platform Support Engineer L2");
  });
});
