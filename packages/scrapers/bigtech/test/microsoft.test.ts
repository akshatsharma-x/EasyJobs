import { describe, expect, it } from "vitest";
import {
  mapMicrosoftPosition, microsoft, microsoftDetailUrl, microsoftLocation, microsoftSearchUrl, microsoftWorkMode,
  type MicrosoftDetailResponse, type MicrosoftSearchResponse,
} from "../src/sites/microsoft";
import { collect, fakeHttp, fixtureJson, invalidJobs, type Route } from "./helpers";

const HYBRID = "1970393557050153";
const REMOTE = "1970393557079352";
const page1 = fixtureJson<MicrosoftSearchResponse>("microsoft/search-page1.json");
const page2 = fixtureJson<MicrosoftSearchResponse>("microsoft/search-page2.json");
const allIds = [...page1.data!.positions!, ...page2.data!.positions!].map((p) => String(p.id));

const baseRoutes: Route[] = [
  { match: /\/api\/pcsx\/search\?.*start=0&/, file: "microsoft/search-page1.json" },
  { match: /\/api\/pcsx\/search\?.*start=10&/, file: "microsoft/search-page2.json" },
  { match: new RegExp(`position_details\\?position_id=${HYBRID}&`), file: `microsoft/detail-${HYBRID}.json` },
  { match: new RegExp(`position_details\\?position_id=${REMOTE}&`), file: `microsoft/detail-${REMOTE}.json` },
];
const env = { MICROSOFT_429_BACKOFF_MS: "1" };

describe("microsoft", () => {
  it("builds PCSX URLs (India, newest first) and the public job URL", () => {
    const u = new URL(microsoftSearchUrl(20));
    expect(Object.fromEntries(u.searchParams)).toEqual({ domain: "microsoft.com", query: "", location: "India", start: "20", sort_by: "timestamp" });
    expect(microsoftDetailUrl(HYBRID)).toBe(`https://apply.careers.microsoft.com/api/pcsx/position_details?position_id=${HYBRID}&domain=microsoft.com&hl=en`);
  });

  it("pages by start=10 and fetches details only for unknown ids", async () => {
    const http = fakeHttp(baseRoutes);
    const known = new Set(allIds.filter((id) => id !== HYBRID && id !== REMOTE));
    const jobs = await collect(microsoft, { http, env, isKnown: (id) => known.has(id) });
    expect(jobs).toHaveLength(11);
    expect(invalidJobs(jobs)).toEqual([]);
    const searches = http.calls.filter((c) => c.url.includes("/pcsx/search"));
    expect(searches.map((c) => new URL(c.url).searchParams.get("start"))).toEqual(["0", "10"]);
    const details = http.calls.filter((c) => c.url.includes("position_details")).map((c) => new URL(c.url).searchParams.get("position_id"));
    expect(details.sort()).toEqual([HYBRID, REMOTE].sort());
    const light = jobs.find((j) => known.has(j.sourceJobId))!;
    expect(light.descriptionHtml).toBeNull();
    expect(microsoft.lastRun).toMatchObject({ listed: 11, emitted: 11, details: 2, siteTotal: 11 });
  });

  it("defers new jobs whose detail call fails instead of storing them without a description", async () => {
    const http = fakeHttp(baseRoutes); // other position_details → 404
    const jobs = await collect(microsoft, { http, env });
    expect(jobs.map((j) => j.sourceJobId).sort()).toEqual([HYBRID, REMOTE].sort());
    expect(microsoft.lastRun).toMatchObject({ listed: 11, emitted: 2, detailErrors: 9, skipped: 9 });
  });

  it("backs off on 429 for list pages", async () => {
    let first = true;
    const throttleOnce: Route = {
      match: (url) => {
        if (first && url.includes("/pcsx/search") && url.includes("start=0&")) {
          first = false;
          return true;
        }
        return false;
      },
      status: 429,
      body: "Please try again later",
      contentType: "text/html",
    };
    const http = fakeHttp([throttleOnce, ...baseRoutes]);
    const jobs = await collect(microsoft, { http, env, isKnown: () => true });
    expect(jobs).toHaveLength(11);
    expect(http.calls.filter((c) => c.url.includes("start=0&"))).toHaveLength(2);
  });

  it("stops calling details for the rest of the run once still rate-limited", async () => {
    const http = fakeHttp([
      { match: /position_details/, status: 429, body: "Please try again later", contentType: "text/html" },
      ...baseRoutes,
    ]);
    const jobs = await collect(microsoft, { http, env });
    expect(jobs).toHaveLength(0);
    expect(http.calls.filter((c) => c.url.includes("position_details"))).toHaveLength(2); // first job: 2 attempts, then throttled
  });

  it("maps details: description, work site, employment type and locations", () => {
    const pos1 = page1.data!.positions!.find((p) => String(p.id) === HYBRID)!;
    const d1 = fixtureJson<MicrosoftDetailResponse>(`microsoft/detail-${HYBRID}.json`).data!;
    const job = mapMicrosoftPosition(pos1, d1);
    expect(job).toMatchObject({
      source: "microsoft",
      sourceJobId: HYBRID,
      sourceUrl: `https://apply.careers.microsoft.com/careers/job/${HYBRID}`,
      applyUrl: `https://apply.careers.microsoft.com/careers/job/${HYBRID}`,
      title: "Technical Support Engineering Dev Dev",
      locations: ["India"],
      employmentTypeRaw: "Full-Time",
      jobType: "full_time",
      workMode: "hybrid",
      isRemote: false,
      department: "Technical Support Engineering",
    });
    expect(job.postedAt).toBe(new Date(1795075462 * 1000).toISOString());
    expect(job.descriptionHtml).toContain("<b>Overview</b>");
    expect(job.extra).toMatchObject({ jobNumber: "200064448", workSite: "3 days / week in-office", roleType: "Individual Contributor" });

    const pos2 = page2.data!.positions![0]!;
    const d2 = fixtureJson<MicrosoftDetailResponse>(`microsoft/detail-${REMOTE}.json`).data!;
    expect(mapMicrosoftPosition(pos2, d2)).toMatchObject({ workMode: "remote", isRemote: true, locations: ["Bangalore, Karnataka, India"] });
  });

  it("emits light records for known jobs from list data only", () => {
    const pos = page1.data!.positions![1]!;
    const job = mapMicrosoftPosition(pos, null);
    expect(job.descriptionHtml).toBeNull();
    expect(job.workMode).toBeUndefined();
    expect(job.locations.length).toBeGreaterThan(0);
    expect(job.applyUrl).toBe(`https://apply.careers.microsoft.com/careers/job/${pos.id}`);
  });

  it("maps Microsoft work-site labels and locations", () => {
    expect(microsoftWorkMode("3 days / week in-office")).toBe("hybrid");
    expect(microsoftWorkMode("0 days / week in-office – remote")).toBe("remote");
    expect(microsoftWorkMode("fully on-site")).toBe("onsite");
    expect(microsoftWorkMode("Up to 50% work from home")).toBe("hybrid");
    expect(microsoftWorkMode(null)).toBeUndefined();
    expect(microsoftLocation("India, Telangana, Hyderabad")).toBe("Hyderabad, Telangana, India");
    expect(microsoftLocation("India, Multiple Locations, Multiple Locations")).toBe("India");
  });
});
