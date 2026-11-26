import { describe, expect, it } from "vitest";
import { SourceBlockedError } from "../src/lib/http";
import { mapMuseJob, museUrl, themuseScraper, type MuseResponse } from "../src/sources/themuse";
import { collect, expectValidJobs, fakeHttp, fixture, fixtureJson, testCtx } from "./helpers";

const results = fixtureJson<MuseResponse>("themuse.json").results ?? [];

describe("themuse · mapping (synthetic fixture in the documented v2 format)", () => {
  it("keeps India roles and maps level → experienceLevel", () => {
    expect(mapMuseJob(results[0]!)).toMatchObject({
      source: "themuse",
      sourceJobId: "15123456",
      title: "Software Engineer I",
      company: "ExampleCorp",
      locations: ["Bengaluru, India"],
      experienceLevel: "entry",
      department: "Software Engineering",
      isRemote: false,
      applyUrl: "https://www.themuse.com/jobs/examplecorp/software-engineer-i-abc123",
    });
  });

  it("drops a US-only remote role, keeps an explicit work-from-anywhere one", () => {
    expect(mapMuseJob(results[1]!)).toBeNull();
    expect(mapMuseJob(results[2]!)).toMatchObject({ locations: ["Remote (Anywhere)"], workMode: "remote", tags: ["remote"], experienceLevel: "entry" });
  });

  it("internship level → internship + intern; India + remote locations", () => {
    expect(mapMuseJob(results[3]!)).toMatchObject({ jobType: "internship", experienceLevel: "intern", locations: ["Remote (India)", "Pune, India"] });
  });

  it("asks for the four requested levels and India/remote locations", () => {
    const url = new URL(museUrl(0, ["Internship", "Entry Level", "Mid Level", "Senior Level"], ["Flexible / Remote", "Pune, India"]));
    expect(url.searchParams.getAll("level")).toEqual(["Internship", "Entry Level", "Mid Level", "Senior Level"]);
    expect(url.searchParams.getAll("location")).toEqual(["Flexible / Remote", "Pune, India"]);
    expect(url.searchParams.get("page")).toBe("0");
  });
});

describe("themuse · scrape", () => {
  it("emits valid jobs from one page", async () => {
    const http = fakeHttp([{ match: "themuse.com/api/public/jobs", body: fixture("themuse.json") }]);
    const out = await collect(themuseScraper, testCtx(http));
    expect(out).toHaveLength(3);
    expectValidJobs(out, themuseScraper);
  });

  it("surfaces a Cloudflare challenge as SourceBlockedError (no bypass attempts)", async () => {
    const http = fakeHttp([
      { match: "themuse.com", status: 403, body: "<html><title>Just a moment...</title></html>", headers: { "cf-mitigated": "challenge" } },
    ]);
    await expect(collect(themuseScraper, testCtx(http))).rejects.toBeInstanceOf(SourceBlockedError);
    expect(http.calls).toHaveLength(1);
  });
});
