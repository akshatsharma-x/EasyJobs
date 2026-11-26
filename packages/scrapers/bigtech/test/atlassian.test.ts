import { describe, expect, it } from "vitest";
import {
  atlassian, atlassianOpenToIndia, cleanAtlassianLocation, mapAtlassianJob, parseAtlassianDate, type AtlassianListing,
} from "../src/sites/atlassian";
import { collect, fakeHttp, fixtureJson, invalidJobs } from "./helpers";

const listings = fixtureJson<AtlassianListing[]>("atlassian/listings.json");
const byId = (id: number) => listings.find((j) => j.id === id)!;

describe("atlassian", () => {
  it("emits only India / APAC-remote jobs from the single listings call", async () => {
    const http = fakeHttp([{ match: /\/endpoint\/careers\/listings$/, file: "atlassian/listings.json" }]);
    const jobs = await collect(atlassian, { http });
    expect(http.calls).toHaveLength(1);
    expect(jobs.map((j) => j.sourceJobId).sort()).toEqual(["25611", "27181", "27280", "27339", "27391"]);
    expect(invalidJobs(jobs)).toEqual([]);
    expect(atlassian.lastRun).toMatchObject({ listed: 8, emitted: 5, skipped: 3, siteTotal: 8 });
  });

  it("does not treat the generic 'Remote - Remote' tag as open to India", () => {
    expect(atlassianOpenToIndia(byId(27257))).toBe(false); // Sydney + Remote - Remote
    expect(atlassianOpenToIndia(byId(27339))).toBe(true); // Manila + Remote - APAC
    expect(atlassianOpenToIndia({ id: 1, title: "x", locations: ["Remote - Remote"] })).toBe(false);
  });

  it("cleans iCIMS location strings", () => {
    expect(cleanAtlassianLocation("Bengaluru - India -   Bengaluru,  560071 India")).toBe("Bengaluru, India");
    expect(cleanAtlassianLocation("Remote - India - Remote")).toBe("Remote - India");
    expect(cleanAtlassianLocation("Remote - Remote")).toBe("Remote");
    expect(cleanAtlassianLocation("Canada -     Canada")).toBe("Canada");
    expect(cleanAtlassianLocation("Mountain View - United States or Remote -   Mountain View, California 94041 United States")).toBe(
      "Mountain View, United States",
    );
  });

  it("maps a Bengaluru engineering role", () => {
    const job = mapAtlassianJob(byId(27181));
    expect(job).toMatchObject({
      source: "atlassian",
      sourceKind: "career_site",
      sourceJobId: "27181",
      sourceUrl: "https://www.atlassian.com/company/careers/details/27181",
      applyUrl: "https://www.atlassian.com/company/careers/details/27181",
      company: "Atlassian",
      locations: ["Bengaluru, India", "Remote"],
      department: "Engineering",
    });
    expect(job.postedAt).toMatch(/^2026-\d{2}-\d{2}T\d{2}:\d{2}:00\.000Z$/);
    expect(job.descriptionHtml).toContain("<h3>Responsibilities</h3>");
    expect(job.descriptionHtml).toContain("<h3>Qualifications</h3>");
    expect(String(job.extra?.icimsUrl)).toMatch(/icims\.com\/jobs\/27181\//);
  });

  it("maps remote-only India roles and site categories to hints", () => {
    expect(mapAtlassianJob(byId(25611))).toMatchObject({ workMode: "remote", isRemote: true, locations: ["Remote - India", "Remote"] });
    expect(mapAtlassianJob(byId(26275))).toMatchObject({ jobType: "internship", experienceLevel: "intern" });
    expect(mapAtlassianJob(byId(26070))).toMatchObject({ experienceLevel: "fresher" });
  });

  it("parses iCIMS updated dates", () => {
    expect(parseAtlassianDate("2026-11-09 12:21 PM")).toBe("2026-11-09T12:21:00.000Z");
    expect(parseAtlassianDate("2026-11-09 12:05 AM")).toBe("2026-11-09T00:05:00.000Z");
    expect(parseAtlassianDate("2026-11-09 03:02 PM")).toBe("2026-11-09T15:02:00.000Z");
    expect(parseAtlassianDate(null)).toBeNull();
  });
});
