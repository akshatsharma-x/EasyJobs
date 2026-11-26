import { describe, expect, it } from "vitest";
import { breezyLocationText, breezyOrigin, breezyPositionsUrl, breezyWorkMode } from "../src/adapters/breezy";
import { breezyScraper } from "../src/index";
import { byId, collect, ctx, expectAllValid, fakeHttp, fixtureJson, json, manifest, notFound, target } from "./helpers";

const m = manifest.breezy!;
const t = (slug: string) => target({ slug, ats: "breezy", token: slug });

async function scrape(company: string) {
  const http = fakeHttp({ [breezyPositionsUrl(breezyOrigin(company))]: json(fixtureJson(`breezy/${company}.json`)) });
  const jobs = await collect(breezyScraper.scrape(ctx(http, [t(company)])));
  expectAllValid(jobs);
  return { jobs, http };
}

describe("breezy adapter", () => {
  it("reads salary text with the job's own dollar (CAD in Toronto) and remote details", async () => {
    const { jobs, http } = await scrape("021-strategic");
    expect(http.urls()).toEqual(["https://021-strategic.breezy.hr/json?verbose=true"]);
    expect(http.calls[0]!.init.robots).toBe(true);
    const job = byId(jobs, m.remoteCad!);
    expect(job).toMatchObject({
      source: "breezy",
      title: "Bilingual Grants Specialist",
      salary: { min: 75_000, max: 80_000, currency: "CAD", period: "year", raw: "$75,000 – $80,000 / year" },
      workMode: "remote",
      isRemote: true,
      jobType: "full_time",
      locations: ["Toronto, ON, Canada"],
      postedAt: "2026-10-29T18:51:10.281Z",
      sourceUrl: "https://021-strategic.breezy.hr/p/6edb824628c1-bilingual-grants-specialist",
    });
    expect(job.descriptionHtml).toBeTruthy();
  });

  it("parses hourly and open-ended hourly pay; no salary text → no salary", async () => {
    const { jobs } = await scrape("2ulaundry");
    expect(byId(jobs, m.hourly!)).toMatchObject({
      salary: { min: 14, max: 14, currency: "USD", period: "hour" },
      jobType: "part_time",
      locations: ["Charlotte, NC, United States"],
      isRemote: false,
    });
    expect(byId(jobs, m.openEndedHourly!).salary).toMatchObject({ min: 15, max: null, period: "hour" });
    const none = byId(jobs, m.noSalary!);
    expect(none.salary).toBeUndefined();
    expect(none.salaryRaw).toBeUndefined();
  });

  it("keeps 'Worldwide' remote locations and the company logo", async () => {
    const { jobs } = await scrape("20four7va");
    const job = byId(jobs, m.worldwideRemote!);
    expect(job).toMatchObject({ locations: ["Worldwide"], workMode: "remote" });
    expect(job.companyLogoUrl).toMatch(/^https:\/\/gallery-cdn\.breezy\.hr\/.+%20/);
  });

  it("logs dead portals once", async () => {
    const http = fakeHttp({ [breezyPositionsUrl(breezyOrigin("gone"))]: notFound("<html>Not here</html>") });
    const c = ctx(http, [t("gone")]);
    expect(await collect(breezyScraper.scrape(c))).toEqual([]);
    expect(c.log.lines.filter((l) => /board not found/.test(l.msg))).toHaveLength(1);
  });

  it("maps remote_details and composes locations", () => {
    expect(breezyWorkMode({ remote_details: { value: "remote-location" } })).toBe("remote");
    expect(breezyWorkMode({ remote_details: { value: "hybrid" } })).toBe("hybrid");
    expect(breezyWorkMode({ is_remote: false })).toBeUndefined();
    expect(breezyLocationText({ city: "Pune", state: { name: "Maharashtra" }, country: { name: "India", id: "IN" } })).toBe("Pune, Maharashtra, India");
    expect(breezyLocationText({ is_remote: true })).toBe("Remote");
  });
});
