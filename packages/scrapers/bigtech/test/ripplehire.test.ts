import { describe, expect, it } from "vitest";
import {
  cleanRippleHireHtml, mapRippleHireJob, rippleHireJobUrl, rippleHireLocations, rippleHireSearchBody,
  type RippleHireDetailResponse, type RippleHireSearchResponse,
} from "../src/sites/_ripplehire";
import { AXIS_BANK_SITE, axisBank } from "../src/sites/axis-bank";
import { HDFC_BANK_SITE, hdfcBank } from "../src/sites/hdfc-bank";
import { collect, fakeHttp, fixtureJson, invalidJobs, type Route } from "./helpers";

const page = (n: number) => (url: string, body: string) =>
  url.endsWith("/candidate/candidatejobsearch") && JSON.parse(decodeURIComponent(new URLSearchParams(body).get("careerSiteUrlParams") ?? "{}")).page === n;

const axisRoutes: Route[] = [
  { match: page(0), file: "axis-bank/search-page0.json" },
  { match: page(1), file: "axis-bank/search-page1.json" },
  { match: /candidatejobdetail\?.*jobSeq=789487&/, file: "axis-bank/job-789487.json" },
];

describe("ripplehire (shared)", () => {
  it("builds the search form body and unique job URLs", () => {
    const body = new URLSearchParams(rippleHireSearchBody(AXIS_BANK_SITE, 2, 50));
    expect(JSON.parse(body.get("careerSiteUrlParams") ?? "")).toEqual({
      page: 2, search: "*:*", token: "WIXhCuz0XRZ7H0GZCwjJ", source: "CAREERSITE", pagesize: 50,
    });
    expect(body.get("lang")).toBe("en");
    const url = new URL(rippleHireJobUrl(AXIS_BANK_SITE, "789487"));
    expect(url.searchParams.get("jobSeq")).toBe("789487");
    expect(url.hash).toBe("#detail/job/789487");
  });

  it("splits locations and unwraps DOCX-exported HTML", () => {
    expect(rippleHireLocations("Dabhoi, Vadodara, Halol")).toEqual(["Dabhoi, India", "Vadodara, India", "Halol, India"]);
    const html = cleanRippleHireHtml(`<!DOCTYPE html><html><head><style>.x{}</style></head><body><div class="docx"><p style="a">Hi</p><p>&nbsp;</p></div></body></html>`);
    expect(html).toBe(`<div><p>Hi</p></div>`);
    expect(cleanRippleHireHtml("<p> </p>")).toBeNull();
  });
});

describe("axis-bank", () => {
  it("paginates, fetches details for unknown ids and maps fields", async () => {
    const http = fakeHttp(axisRoutes);
    const jobs = await collect(axisBank, { http, env: { BIGTECH_PAGE_SIZE: "3" } });
    expect(jobs).toHaveLength(5);
    expect(invalidJobs(jobs)).toEqual([]);
    expect(http.calls.filter((c) => c.url.endsWith("candidatejobsearch"))).toHaveLength(2);
    const j = jobs.find((x) => x.sourceJobId === "789487")!;
    expect(j).toMatchObject({
      source: "axis-bank",
      company: "Axis Bank",
      title: "RB-LS: Business Development Associate",
      locations: ["Jaipur, India"],
      postedAt: "2026-11-25T21:28:05.000Z",
      experienceMin: 1,
      experienceMax: 3,
      experienceRaw: "1 - 3 Years",
      jobType: "full_time",
      workMode: "onsite",
      isRemote: false,
    });
    expect(j.applyUrl).toBe("https://axisbank.ripplehire.com/candidate/?token=WIXhCuz0XRZ7H0GZCwjJ&source=CAREERSITE&jobSeq=789487#detail/job/789487");
    expect(j.descriptionHtml).toContain("Liability Sales");
    expect(j.descriptionHtml).not.toContain("Refer to the Job Description");
    // detail 404s in the fixture set for the other ids → still emitted from list data
    const other = jobs.find((x) => x.sourceJobId === "789486")!;
    expect(other.descriptionHtml).toBeNull();
    expect(other.locations).toEqual(["Tonk, India"]);
  });

  it("skips detail calls for known jobs", async () => {
    const http = fakeHttp(axisRoutes);
    const jobs = await collect(axisBank, { http, env: { BIGTECH_PAGE_SIZE: "3" }, isKnown: () => true });
    expect(jobs).toHaveLength(5);
    expect(http.calls.some((c) => c.url.includes("candidatejobdetail"))).toBe(false);
  });
});

describe("hdfc-bank", () => {
  it("maps employment type from jobTypeCustom3 and multi-city postings", async () => {
    const http = fakeHttp([
      { match: page(0), file: "hdfc-bank/search-page0.json" },
      { match: /candidatejobdetail\?.*jobSeq=96365&/, file: "hdfc-bank/job-96365.json" },
    ]);
    const jobs = await collect(hdfcBank, { http });
    expect(jobs).toHaveLength(3);
    expect(invalidJobs(jobs)).toEqual([]);
    const j = jobs.find((x) => x.sourceJobId === "96365")!;
    expect(j).toMatchObject({
      company: "HDFC Bank",
      title: "RTFX-Trade Sales Manager",
      locations: ["Indore, India"],
      employmentTypeRaw: "Permanent",
      jobType: "full_time",
      department: "Retail Trade and Forex",
      experienceMin: 1,
      experienceMax: 15,
      postedAt: "2026-11-25T09:22:08.000Z",
    });
    expect(j.workMode).toBeUndefined();
    expect(j.descriptionHtml).toContain("Trade &amp; Forex Sales Manager");
    expect(j.descriptionHtml).not.toMatch(/<style|<body|DOCTYPE/i);
    expect(j.descriptionHtml).not.toContain("<h3>Skills</h3>"); // jobSkills duplicates the description here
    const multi = jobs.find((x) => x.sourceJobId === "95702")!;
    expect(multi.locations).toEqual(["Dabhoi, India", "Vadodara, India", "Halol, India", "Bharuch, India"]);
  });

  it("keeps a distinct skills section and falls back to the posting date", () => {
    const list = fixtureJson<RippleHireSearchResponse>("hdfc-bank/search-page0.json").jobVoList![0]!;
    const detail = fixtureJson<RippleHireDetailResponse>("hdfc-bank/job-96365.json").jobVO!;
    const job = mapRippleHireJob(HDFC_BANK_SITE, list, {
      ...detail,
      jobSkills: "<ul><li>Trade finance products, forex dealing, customer relationship management and cross-selling</li></ul>",
      publishDetails: null,
    });
    expect(job.descriptionHtml).toContain("<h3>Skills</h3>");
    expect(job.postedAt).toBe("2026-11-25T00:00:00.000Z");
  });
});
