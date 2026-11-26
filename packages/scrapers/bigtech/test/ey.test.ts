import { describe, expect, it } from "vitest";
import { ey, eySearchUrl, mapEyJob, parseEyJob, parseEySearch } from "../src/sites/ey";
import { collect, fakeHttp, fixture, invalidJobs } from "./helpers";

const routes = [
  { match: /\/ey\/search\/.*startrow=0$/, file: "ey/search-0.html" },
  { match: /\/ey\/search\/.*startrow=6$/, file: "ey/search-6.html" },
  { match: /\/ey\/job\/.*\/1434851933\/$/, file: "ey/job-1434851933.html" },
];

describe("ey", () => {
  it("parses RMK search rows and the total", () => {
    const { rows, total } = parseEySearch(fixture("ey/search-0.html"));
    expect(total).toBe(10);
    expect(rows).toHaveLength(6);
    const mumbai = rows.find((r) => r.id === "1451924533")!;
    expect(mumbai).toMatchObject({
      title: "Senior Manager - Markets - FS - CBS - C&I - BD & CE Leadership - Mumbai",
      country: "IN",
      location: "Mumbai, MH, IN, 400028",
    });
    expect(mumbai.url).toBe("https://careers.ey.com/ey/job/Mumbai-Senior-Manager-Markets-FS-CBS-C&I-BD-&-CE-Leadership-Mumbai-MH-400028/1451924533/");
    expect(parseEySearch(fixture("ey/search-6.html")).rows.find((r) => r.id === "1434851933")?.moreLocations).toBe(2);
  });

  it("parses job microdata", () => {
    const d = parseEyJob(fixture("ey/job-1434851933.html"));
    expect(d).toMatchObject({
      title: "GMS-Staff-IDAM-SailPoint IIQ",
      datePosted: "Wed Nov 25 02:00:00 UTC 2026",
      validThrough: "Thu Dec 31 18:30:00 UTC 2026",
      workArrangement: "Anywhere in Country",
      requisitionId: "1733949",
      locations: ["Kochi, Kerala, India", "Bengaluru, Karnataka, India", "Kolkata, West Bengal, India"],
    });
    expect(d.descriptionHtml).toContain("At EY");
  });

  it("paginates by received rows, fetches details for unknown ids and survives detail errors", async () => {
    const http = fakeHttp(routes);
    const jobs = await collect(ey, { http });
    expect(jobs).toHaveLength(10);
    expect(invalidJobs(jobs)).toEqual([]);
    const searchCalls = http.calls.filter((c) => c.url.includes("/ey/search/")).map((c) => new URL(c.url).searchParams.get("startrow"));
    expect(searchCalls).toEqual(["0", "6"]);
    const idam = jobs.find((j) => j.sourceJobId === "1434851933")!;
    expect(idam).toMatchObject({
      source: "ey",
      company: "EY",
      postedAt: "2026-11-25T02:00:00.000Z",
      validThrough: "2026-12-31T18:30:00.000Z",
      locations: ["Kochi, Kerala, India", "Bengaluru, Karnataka, India", "Kolkata, West Bengal, India"],
      extra: { requisitionId: "1733949", workArrangement: "Anywhere in Country", additionalLocations: 2 },
    });
    expect(idam.workMode).toBeUndefined();
    expect(idam.descriptionHtml).toContain("At EY");
    // jobs whose detail page 404s in the fixture set are still emitted from list data
    const mumbai = jobs.find((j) => j.sourceJobId === "1451924533")!;
    expect(mumbai.locations).toEqual(["Mumbai, Maharashtra, India"]);
    expect(mumbai.descriptionHtml).toBeNull();
  });

  it("skips detail pages for known jobs", async () => {
    const http = fakeHttp(routes);
    const jobs = await collect(ey, { http, isKnown: () => true });
    expect(jobs).toHaveLength(10);
    expect(http.calls.some((c) => c.url.includes("/ey/job/"))).toBe(false);
  });

  it("drops non-India rows from the text location search", () => {
    expect(ey).toBeTruthy();
    const row = { id: "1", title: "X", url: "https://careers.ey.com/ey/job/x/1/", location: "Indianapolis, IN, US, 46204", country: "US", moreLocations: 0 };
    expect(mapEyJob(row, null).locations).toEqual(["Indianapolis, IN, US"]);
    expect(eySearchUrl(50)).toContain("locationsearch=India");
    expect(eySearchUrl(50)).toMatch(/startrow=50$/);
  });
});
