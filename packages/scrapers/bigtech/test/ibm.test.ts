import { describe, expect, it } from "vitest";
import { ibm, ibmLocation, ibmSearchBody, ibmTextToHtml, mapIbmHit, splitIbmBody, type IbmSearchResponse } from "../src/sites/ibm";
import { collect, fakeHttp, fixtureJson, invalidJobs } from "./helpers";

const page1 = fixtureJson<IbmSearchResponse>("ibm/search-page1.json");
const page2 = fixtureJson<IbmSearchResponse>("ibm/search-page2.json");
const hits = [...page1.hits!.hits!, ...page2.hits!.hits!];
const hit = (jobId: string) => hits.find((h) => h._source.url.endsWith(`jobId=${jobId}`))!;

const routes = [
  { match: (url: string, body: string) => url.endsWith("/search/api/v2") && JSON.parse(body).from === 0, file: "ibm/search-page1.json" },
  { match: (url: string, body: string) => url.endsWith("/search/api/v2") && JSON.parse(body).from === 5, file: "ibm/search-page2.json" },
];

describe("ibm", () => {
  it("posts the India-filtered, date-sorted search body", () => {
    const body = ibmSearchBody(100, 50);
    expect(body).toMatchObject({
      appId: "careers",
      scopes: ["careers2"],
      post_filter: { term: { field_keyword_05: "India" } },
      from: 100,
      size: 50,
      sort: [{ dcdate: "desc" }, { _id: "asc" }],
    });
    expect(body._source).toContain("body");
  });

  it("paginates with from/size until the total and emits valid jobs", async () => {
    const http = fakeHttp(routes);
    const jobs = await collect(ibm, { http, env: { BIGTECH_PAGE_SIZE: "5" } });
    expect(http.calls.map((c) => JSON.parse(c.body).from)).toEqual([0, 5]);
    expect(http.calls.every((c) => c.method === "POST")).toBe(true);
    expect(jobs).toHaveLength(9);
    expect(invalidJobs(jobs)).toEqual([]);
    expect(ibm.lastRun?.siteTotal).toBe(9);
  });

  it("maps a job and strips the facet tail from the description", () => {
    const job = mapIbmHit(hit("145408"))!;
    expect(job).toMatchObject({
      source: "ibm",
      sourceJobId: "145408",
      sourceUrl: "https://careers.ibm.com/careers/JobDetail?jobId=145408",
      applyUrl: "https://careers.ibm.com/careers/JobDetail?jobId=145408",
      title: "Data Engineer-Data Platforms-Google",
      locations: ["Gurgaon, India"],
      postedAt: "2026-11-24T00:00:00.000Z",
      department: "Data & Analytics",
      workMode: "hybrid",
      isRemote: false,
    });
    expect(job.extra).toMatchObject({ office: "GURGAON (0063)", legalEntity: "IBM India Private Limited" });
    expect(String(job.extra?.skillKeywords)).toMatch(/^Data Migration .*Cloud Storage$/);
    expect(job.descriptionHtml).toMatch(/^<p>A career in IBM Consulting/);
    expect(job.descriptionHtml).toContain("<li>Design Data Pipelines:");
    expect(job.descriptionText).not.toContain("IBM India Private Limited");
  });

  it("maps work modes, levels and multi-city locations from IBM's own facets", () => {
    expect(mapIbmHit(hit("138999"))).toMatchObject({ workMode: "remote", isRemote: true });
    expect(mapIbmHit(hit("144837"))!.workMode).toBeUndefined();
    expect(mapIbmHit(hit("143256"))!.locations).toEqual(["India"]);
    expect(mapIbmHit(hit("144812"))).toMatchObject({ experienceLevel: "entry" });
    expect(mapIbmHit(hit("137471"))).toMatchObject({ jobType: "internship", experienceLevel: "intern" });
    expect(mapIbmHit(hit("145408"))!.experienceLevel).toBeUndefined(); // "Professional" is vague
  });

  it("handles a missing work-mode facet in the tail", () => {
    const parts = splitIbmBody(hit("144837")._source);
    expect(parts.legalEntity).toBe("IBM India Private Limited");
    expect(parts.text.endsWith("Professional")).toBe(false);
  });

  it("formats helpers", () => {
    expect(ibmLocation("PUNE, IN", "India")).toBe("Pune, India");
    expect(ibmLocation("Kochi, IN", "India")).toBe("Kochi, India");
    expect(ibmLocation("Multiple Cities", "India")).toBe("India");
    expect(ibmTextToHtml("Intro text: • One • Two")).toBe("<p>Intro text:</p>\n<ul><li>One</li><li>Two</li></ul>");
  });
});
