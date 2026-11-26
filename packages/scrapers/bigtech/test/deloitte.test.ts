import { describe, expect, it } from "vitest";
import {
  deloitte, deloitteLevelCode, deloitteSearchUrl, locationsFromDescription, mapDeloitteJob, parseDeloitteDetail, parseDeloitteSearch,
} from "../src/sites/deloitte";
import { collect, fakeHttp, fixture, invalidJobs } from "./helpers";

const routes = [
  { match: /SearchJobs\/\?jobRecordsPerPage=10&jobOffset=0$/, file: "deloitte/search-0.html" },
  { match: /SearchJobs\/\?jobRecordsPerPage=10&jobOffset=10$/, file: "deloitte/search-10.html" },
  { match: /\/JobDetail\/.*\/376469$/, file: "deloitte/detail-376469.html" },
  { match: /\/JobDetail\/.*\/362250$/, file: "deloitte/detail-362250.html" },
];
const withDetail = new Set(["376469", "362250", "362247"]);

describe("deloitte", () => {
  it("parses SearchJobs tiles (title, link, entity, location, total)", () => {
    const { tiles, total } = parseDeloitteSearch(fixture("deloitte/search-0.html"));
    expect(total).toBe(12);
    expect(tiles).toHaveLength(10);
    expect(tiles[2]).toEqual({
      id: "376469",
      url: "https://usijobs.deloitte.com/en_US/careersUSI/JobDetail/USI-EH27-Talent-Services-LDS-VXD-Associate-Talent-Development-Bengaluru/376469",
      title: "Associate - Talent Development - LDS (VXD) - Bengaluru",
      brand: "Deloitte US – India Offices",
      legalEntity: "Deloitte Consulting India Private Limited",
      location: "Hyderabad, Telangana, India",
    });
    const multi = parseDeloitteSearch(fixture("deloitte/search-10.html")).tiles.find((t) => t.id === "362250");
    expect(multi).toMatchObject({ location: "Multiple Locations", legalEntity: "Deloitte Tax Services India Private Limited" });
  });

  it("paginates by jobOffset and fetches details only for unknown ids", async () => {
    const http = fakeHttp(routes);
    const jobs = await collect(deloitte, { http, isKnown: (id) => !withDetail.has(id) });
    expect(invalidJobs(jobs)).toEqual([]);
    expect(http.calls.filter((c) => c.url.includes("SearchJobs")).map((c) => c.url)).toEqual([deloitteSearchUrl(0), deloitteSearchUrl(10)]);
    // 362247 is unknown and its detail page 404s → retried next run, not emitted bare.
    expect(jobs).toHaveLength(11);
    expect(http.calls.filter((c) => c.url.includes("/JobDetail/")).map((c) => c.url.split("/").pop())).toEqual(["376469", "362250", "362247"]);
    expect(deloitte.lastRun).toMatchObject({ listed: 12, emitted: 11, details: 3, detailErrors: 1, siteTotal: 12 });
    const light = jobs.find((j) => j.sourceJobId === "376504")!;
    expect(light).toMatchObject({ descriptionHtml: null, locations: ["Hyderabad, Telangana, India"], postedAt: null });
  });

  it("maps JSON-LD details", async () => {
    const jobs = await collect(deloitte, { http: fakeHttp(routes), isKnown: (id) => !withDetail.has(id) });
    const job = jobs.find((j) => j.sourceJobId === "376469")!;
    expect(job).toMatchObject({
      source: "deloitte",
      sourceKind: "career_site",
      company: "Deloitte",
      title: "Associate - Talent Development - LDS (VXD) - Bengaluru",
      locations: ["Hyderabad, Telangana, India"],
      postedAt: "2026-11-24T00:00:00.000Z",
      degrees: ["Bachelor's Degree"],
    });
    expect(job.descriptionHtml).toMatch(/^<div><p>Does visualizing/);
    expect(job.extra).toMatchObject({ legalEntity: "Deloitte Consulting India Private Limited", requisitionTitle: expect.stringMatching(/^USI - EH27/) });
    const multi = jobs.find((j) => j.sourceJobId === "362250")!;
    expect(multi.locations).toEqual(["Mumbai, India", "Hyderabad, India", "Gurugram, India", "Bengaluru, India", "Chennai, India", "Kolkata, India", "Pune, India"]);
    expect(multi.extra).toMatchObject({ levelCode: "L55", multipleLocations: true });
  });

  it("keeps light records consistent with full ones", () => {
    const tile = parseDeloitteSearch(fixture("deloitte/search-10.html")).tiles.find((t) => t.id === "362250")!;
    // A multi-location light record contributes no locations (the union keeps the full record's cities).
    expect(mapDeloitteJob(tile, null).locations).toEqual([]);
    const detail = parseDeloitteDetail(fixture("deloitte/detail-362250.html"));
    expect(detail?.datePosted).toBe("2026-08-10");
    expect(deloitteLevelCode(detail?.requisitionTitle ?? null)).toBe("L55");
  });

  it("extracts 'Location:' lines", () => {
    expect(locationsFromDescription("<p><strong>Location:</strong> Bengaluru / Hyderabad and Pune</p><p>Shift: 2 PM</p>")).toEqual([
      "Bengaluru, India",
      "Hyderabad, India",
      "Pune, India",
    ]);
    expect(locationsFromDescription("<p>No location line</p>")).toEqual([]);
    expect(locationsFromDescription("<p>11 AM to 8 PM IST</p><p>Location – Hyderabad/Bengaluru/Mumbai</p><p>#CAB-LJ</p>")).toEqual([
      "Hyderabad, India",
      "Bengaluru, India",
      "Mumbai, India",
    ]);
    expect(locationsFromDescription("<p><strong>Locations</strong></p><ul><li>Hyderabad, Bengaluru, Pune</li></ul><p>#CSReferral</p>")).toEqual([
      "Hyderabad, India",
      "Bengaluru, India",
      "Pune, India",
    ]);
    expect(locationsFromDescription("<p>Located in our Hyderabad offices</p>")).toEqual([]);
  });

  it("falls back to India for multi-location jobs without a location line", () => {
    const tile = { id: "1", url: "https://usijobs.deloitte.com/en_US/careersUSI/JobDetail/x/1", title: "Manager", brand: null, legalEntity: null, location: "Multiple Locations" };
    const detail = { datePosted: "2026-11-20", descriptionHtml: "<p>Great role</p>", requisitionTitle: null, education: null, validThrough: null };
    expect(mapDeloitteJob(tile, detail).locations).toEqual(["India"]);
    expect(mapDeloitteJob(tile, null).locations).toEqual([]);
  });
});
