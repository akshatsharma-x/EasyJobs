import { describe, expect, it } from "vitest";
import {
  capgemini, capgeminiJobUrl, capgeminiLocations, capgeminiSearchUrl, mapCapgeminiJob, type CapgeminiSearchResponse,
} from "../src/sites/capgemini";
import { collect, fakeHttp, fixtureJson, invalidJobs } from "./helpers";

const routes = [
  { match: /job-search\?page=1&/, file: "capgemini/search-p1.json" },
  { match: /job-search\?page=2&/, file: "capgemini/search-p2.json" },
];
const all = () => [
  ...fixtureJson<CapgeminiSearchResponse>("capgemini/search-p1.json").data!,
  ...fixtureJson<CapgeminiSearchResponse>("capgemini/search-p2.json").data!,
];

describe("capgemini", () => {
  it("builds the India search URL", () => {
    const u = new URL(capgeminiSearchUrl(2, 50));
    expect(u.host).toBe("cg-jobstream-api.azurewebsites.net");
    expect(Object.fromEntries(u.searchParams)).toEqual({ page: "2", size: "50", country_code: "in-en" });
  });

  it("pages until total and emits valid RawJobs", async () => {
    const http = fakeHttp(routes);
    const jobs = await collect(capgemini, { http, env: { BIGTECH_PAGE_SIZE: "6" } });
    expect(jobs).toHaveLength(8);
    expect(invalidJobs(jobs)).toEqual([]);
    expect(http.calls.map((c) => new URL(c.url).searchParams.get("page"))).toEqual(["1", "2"]);
    expect(capgemini.lastRun?.siteTotal).toBe(8);
    for (const j of jobs) {
      expect(j.applyUrl).toMatch(/^https:\/\/www\.capgemini\.com\/in-en\/jobs\/\d+-en_(US|GB)\+sap_btp$/);
      expect(j.locations.every((l) => l.endsWith(", India"))).toBe(true);
    }
  });

  it("maps fields, posting date and apply flow", () => {
    const job = mapCapgeminiJob(all()[2]!)!;
    expect(job).toMatchObject({
      sourceJobId: "514086-en_GB_SAPBTP",
      sourceUrl: "https://www.capgemini.com/in-en/jobs/514086-en_GB+sap_btp",
      title: "Webmethods Developer",
      company: "Capgemini",
      locations: ["Chennai, India", "Hyderabad, India", "Pune, India", "Bangalore, India"],
      postedAt: "2026-11-20T17:10:25.000Z",
      department: "Software Engineering",
      employmentTypeRaw: "Permanent",
      jobType: "full_time",
    });
    expect(job.experienceLevel).toBeUndefined(); // "Experienced Professionals" is vague
    expect(job.descriptionHtml).toContain("<p>");
    expect(job.extra?.applyFlowUrl).toMatch(/^https:\/\/careers\.capgemini\.com\/job\//);
  });

  it("gives no level hint for the 'Executives' grade (a Pyspark Developer is not a director) and keeps sub-brands in extra", () => {
    const exec = mapCapgeminiJob(all().find((j) => j.experience_level === "Executives")!)!;
    expect(exec.title).toBe("Pyspark Developer");
    expect(exec.experienceLevel).toBeUndefined();
    const eng = mapCapgeminiJob(all().find((j) => j.brand === "Capgemini Engineering")!)!;
    expect(eng.company).toBe("Capgemini");
    expect(eng.extra?.brand).toBe("Capgemini Engineering");
  });

  it("cleans city names and builds job URLs", () => {
    expect(capgeminiLocations("Chennai (ex Madras), Mumbai (ex Bombay), , Pune")).toEqual(["Chennai, India", "Mumbai, India", "Pune, India"]);
    expect(capgeminiJobUrl({ id: "1-en_US_SAPBTP", title: "x" })).toBe("https://www.capgemini.com/in-en/jobs/1-en_US+sap_btp");
    expect(mapCapgeminiJob({ id: "2-en_GB_SAPBTP", ref: "2-en_GB", title: "x", deleted_at: "2026-11-01" })).toBeNull();
  });
});
