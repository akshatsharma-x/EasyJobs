import { describe, expect, it } from "vitest";
import { parseRssItems } from "../src/lib";
import {
  ltimindtree, mapSfItem, rippleJobUrl, rippleLocations, rippleSkills, sfLocation, stripTitleLocation,
} from "../src/sites/ltimindtree";
import { collect, fakeHttp, fixture, invalidJobs } from "./helpers";

const pageOf = (body: string): number => JSON.parse(new URLSearchParams(body).get("careerSiteUrlParams") ?? "{}").page;
const routes = [
  { match: /careers\.ltm\.com\/sitemap\.xml$/, file: "ltimindtree/sf-feed.xml", contentType: "application/rss+xml" },
  { match: (url: string, body: string) => url.endsWith("/candidatejobsearch") && pageOf(body) === 0, file: "ltimindtree/search-0.json" },
  { match: (url: string, body: string) => url.endsWith("/candidatejobsearch") && pageOf(body) === 1, file: "ltimindtree/search-1.json" },
  { match: /candidatejobdetail\?.*jobSeq=909995/, file: "ltimindtree/detail-909995.json" },
  { match: /candidatejobdetail\?.*jobSeq=907206/, file: "ltimindtree/detail-907206.json" },
  { match: /candidatejobdetail\?.*jobSeq=755378/, file: "ltimindtree/detail-755378.json" },
];
const env = { BIGTECH_PAGE_SIZE: "3" };

describe("ltimindtree", () => {
  it("lists the SuccessFactors India items, then pages RippleHire (geo=India)", async () => {
    const http = fakeHttp(routes);
    const jobs = await collect(ltimindtree, { http, env });
    expect(invalidJobs(jobs)).toEqual([]);
    // 909166 and 548636 have no detail fixture (404) → retried next run, not emitted bare.
    expect(jobs.map((j) => j.sourceJobId)).toEqual(["sf-870365101", "sf-679605001", "909995", "907206", "755378"]);
    const searches = http.calls.filter((c) => c.url.endsWith("/candidatejobsearch"));
    expect(searches.map((c) => JSON.parse(new URLSearchParams(c.body).get("careerSiteUrlParams")!))).toEqual([
      { page: 0, search: "*:*", token: "xviyQvbnyYZdGtozXoNm", source: "CAREERSITE", pagesize: 3, geo: "India" },
      { page: 1, search: "*:*", token: "xviyQvbnyYZdGtozXoNm", source: "CAREERSITE", pagesize: 3, geo: "India" },
    ]);
    expect(ltimindtree.lastRun).toMatchObject({ listed: 7, emitted: 5, detailErrors: 2, siteTotal: 7 });
  });

  it("maps RippleHire jobs (publish time, experience in years, skills, unique apply URL)", async () => {
    const jobs = await collect(ltimindtree, { http: fakeHttp(routes), env });
    const job = jobs.find((j) => j.sourceJobId === "909995")!;
    expect(job).toMatchObject({
      source: "ltimindtree",
      sourceKind: "career_site",
      company: "LTIMindtree",
      title: "Senior Specialist - Business Analysis",
      locations: ["Bengaluru, India"],
      postedAt: "2026-11-25T09:15:53.000Z",
      employmentTypeRaw: "Permanent",
      jobType: "full_time",
      experienceRaw: "6 - 11 Years",
      experienceMin: 6,
      experienceMax: 11,
      applyUrl: rippleJobUrl("909995"),
    });
    expect(job.applyUrl).toContain("&jobSeq=909995#detail/job/909995");
    expect(job.skills?.slice(0, 2)).toEqual(["Angular", "SAP Spartacus"]);
    expect(job.descriptionHtml).toContain("<h3>Skills</h3>");
    expect(job.extra).toMatchObject({ jobCode: "1508234", requisitionDate: "2026-11-24T00:00:00.000Z", board: "ripplehire" });
  });

  it("maps SuccessFactors feed items", () => {
    const items = parseRssItems(fixture("ltimindtree/sf-feed.xml"));
    expect(items.map((i) => sfLocation(i))).toEqual(["Ciudad de Mexico, MEX, MX", "Chennai, Tamil Nadu, India", "Bengaluru, Karnataka, India", "Ciudad de Mexico, MEX, MX"]);
    const job = mapSfItem(items[1]!)!;
    expect(job).toMatchObject({
      sourceJobId: "sf-870365101",
      title: "Specialist - Software Engineering",
      locations: ["Chennai, Tamil Nadu, India"],
      validThrough: "2026-12-25T00:00:00.000Z",
      department: "Interactive (CSU)",
      applyUrl: "https://careers.ltm.com/job/Chennai-Specialist-Software-Engineering-TN/870365101/",
    });
    expect(job.descriptionHtml).toContain("<p>");
    expect(job.descriptionHtml).not.toContain("&lt;");
  });

  it("emits light records for known ids (placeholder location → India)", async () => {
    const http = fakeHttp(routes);
    const jobs = await collect(ltimindtree, { http, env, isKnown: (id) => id === "909166" });
    expect(jobs.find((j) => j.sourceJobId === "909166")).toMatchObject({ locations: ["India"], descriptionHtml: null, experienceMin: 15 });
    expect(http.calls.some((c) => c.url.includes("jobSeq=909166"))).toBe(false);
  });

  it("normalises RippleHire locations and skills", () => {
    expect(rippleLocations("Mumbai/Pune/Chennai, Kolkata, Bangalore")).toEqual(["Mumbai, India", "Pune, India", "Chennai, India", "Kolkata, India", "Bangalore, India"]);
    expect(rippleLocations("Chennai - Tamilnadu")).toEqual(["Chennai, India"]);
    expect(rippleLocations("Select Location")).toEqual(["India"]);
    expect(rippleSkills("<p><strong>Mandatory Skills : </strong>MDG Functional<br><strong>Good to Have Skills : </strong>SAP IP-Tools, SAP Signavio</p>")).toEqual([
      "MDG Functional",
      "SAP IP-Tools",
      "SAP Signavio",
    ]);
    expect(stripTitleLocation("Azure AI Architect (Associate Principal - Architecture) (Tokyo, JP)")).toBe("Azure AI Architect (Associate Principal - Architecture)");
  });
});
