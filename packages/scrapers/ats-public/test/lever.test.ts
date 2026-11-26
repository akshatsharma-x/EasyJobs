import { describe, expect, it } from "vitest";
import { leverPageUrl, mapLeverPosting, parseLeverToken, type LeverPosting } from "../src/adapters/lever";
import { leverScraper } from "../src/index";
import { byId, collect, ctx, expectAllValid, fakeHttp, fixtureJson, json, manifest, target } from "./helpers";

const m = manifest.lever!;
const t = (slug: string, token = slug) => target({ slug, ats: "lever", token });

async function scrape(file: string, token: string) {
  const site = parseLeverToken(token);
  const http = fakeHttp({ [leverPageUrl(site, 0)]: json(fixtureJson(`lever/${file}.json`)) });
  const jobs = await collect(leverScraper.scrape(ctx(http, [t(file, token)])));
  expectAllValid(jobs);
  return { jobs, http };
}

describe("lever adapter", () => {
  it("maps an internship with several Indian locations", async () => {
    const { jobs } = await scrape("paytm", "paytm");
    const job = byId(jobs, m.intern!);
    expect(job).toMatchObject({
      source: "lever",
      sourceKind: "ats",
      title: "Intern - Talent Acquisition",
      jobType: "internship",
      employmentTypeRaw: "Intern",
      workMode: "onsite",
      isRemote: false,
      locations: ["Gurugram, Haryana", "Noida, Uttar Pradesh"],
      department: "HR",
      sourceUrl: "https://jobs.lever.co/paytm/426a6834-1397-4e65-94af-69874c790805",
      applyUrl: "https://jobs.lever.co/paytm/426a6834-1397-4e65-94af-69874c790805",
      postedAt: new Date(1791377927596).toISOString(),
    });
    expect(job.extra?.applyFormUrl).toBe("https://jobs.lever.co/paytm/426a6834-1397-4e65-94af-69874c790805/apply");
  });

  it("uses allLocations for multi-location postings and appends the country to a single one", async () => {
    const { jobs } = await scrape("paytm", "paytm");
    expect(byId(jobs, m.multiLocation!).locations).toEqual(["Coimbatore, Tamil Nadu", "Madurai, Tamil Nadu"]);
    expect(byId(jobs, m.zeroSalary!).locations).toEqual(["Noida, Uttar Pradesh, India"]);
  });

  it("treats a 0–0 salaryRange as absent and Indian 'On-roll' as full-time", async () => {
    const { jobs } = await scrape("paytm", "paytm");
    const job = byId(jobs, m.zeroSalary!);
    expect(job.salary).toBeUndefined();
    expect(job.salaryRaw).toBeUndefined();
    expect(byId(jobs, m.onRoll!).jobType).toBe("full_time");
  });

  it("maps salaryRange, hybrid and remote workplace types", async () => {
    const { jobs } = await scrape("spotify", "spotify");
    const paid = byId(jobs, m.salary!);
    expect(paid.salary).toEqual({ min: 75645, max: 94556, currency: "USD", period: "year", raw: "USD 75,645–94,556 per year" });
    expect(paid).toMatchObject({ workMode: "hybrid", isRemote: false, locations: ["New York, NY, United States"] });
    expect(byId(jobs, m.remote!)).toMatchObject({ workMode: "remote", isRemote: true, jobType: "full_time", locations: ["New York, NY", "San Francisco, CA"] });
  });

  it("assembles description HTML from the body, the lists and the closing text", async () => {
    const { jobs } = await scrape("spotify", "spotify");
    const job = byId(jobs, m.salary!);
    expect(job.descriptionHtml).toMatch(/<h3>What You'll do<\/h3>\n<ul>/);
    expect(job.descriptionText).toContain("What You'll do");
  });

  it("calls the EU API for eu: tokens", async () => {
    const { jobs, http } = await scrape("creatio-eu", "eu:creatio");
    expect(http.urls()[0]).toBe("https://api.eu.lever.co/v0/postings/creatio?mode=json&limit=100&skip=0");
    expect(byId(jobs, m.eu!)).toMatchObject({ workMode: "remote", locations: ["Ukraine"] });
    expect(byId(jobs, m.eu!).sourceUrl).toMatch(/^https:\/\/jobs\.eu\.lever\.co\/creatio\//);
  });

  it("parses tokens", () => {
    expect(parseLeverToken("palantir")).toEqual({ site: "palantir", region: "global" });
    expect(parseLeverToken("eu:creatio")).toEqual({ site: "creatio", region: "eu" });
    expect(parseLeverToken("https://jobs.eu.lever.co/creatio/abc")).toEqual({ site: "creatio", region: "eu" });
    expect(parseLeverToken("https://jobs.lever.co/paytm")).toEqual({ site: "paytm", region: "global" });
    expect(parseLeverToken("https://api.lever.co/v0/postings/meesho?mode=json")).toEqual({ site: "meesho", region: "global" });
  });

  it("leaves unknown workplace types and missing commitments unset", () => {
    const job = mapLeverPosting({ id: "x1", text: "Engineer", workplaceType: "unspecified", categories: {} }, t("acme"), { site: "acme", region: "global" });
    expect(job?.workMode).toBeUndefined();
    expect(job?.jobType).toBeUndefined();
    expect(job?.sourceUrl).toBe("https://jobs.lever.co/acme/x1");
  });
});

describe("lever pagination", () => {
  const posting = (i: number): LeverPosting => ({
    id: `p-${i}`,
    text: `Role ${i}`,
    hostedUrl: `https://jobs.lever.co/acme/p-${i}`,
    categories: { location: "Pune", commitment: "Full-time" },
    createdAt: 1_790_000_000_000 + i,
  });
  const pages = (n: number) => Array.from({ length: n }, (_, i) => posting(i));

  function server(all: LeverPosting[]) {
    return fakeHttp({
      "https://api.lever.co/v0/postings/acme": (url) => {
        const skip = Number(url.searchParams.get("skip"));
        const limit = Number(url.searchParams.get("limit"));
        return json(all.slice(skip, skip + limit));
      },
    });
  }

  it("walks skip/limit pages until a short page", async () => {
    const http = server(pages(205));
    const jobs = await collect(leverScraper.scrape(ctx(http, [t("acme")])));
    expect(jobs).toHaveLength(205);
    expect(http.urls().map((u) => new URL(u).searchParams.get("skip"))).toEqual(["0", "100", "200"]);
  });

  it("stops after an exactly-full last page with one empty request", async () => {
    const http = server(pages(200));
    expect(await collect(leverScraper.scrape(ctx(http, [t("acme")])))).toHaveLength(200);
    expect(http.calls).toHaveLength(3);
  });

  it("fetches lazily: a limit inside the first page costs one request", async () => {
    const http = server(pages(250));
    const jobs = await collect(leverScraper.scrape(ctx(http, [t("acme")], { limit: 30 })));
    expect(jobs).toHaveLength(30);
    expect(http.calls).toHaveLength(1);
  });

  it("drops postings repeated across pages (board changed while paging)", async () => {
    const all = pages(150);
    const http = fakeHttp({
      "https://api.lever.co/v0/postings/acme": (url) => {
        const skip = Number(url.searchParams.get("skip"));
        // second page starts 10 items early: a posting was removed meanwhile
        return json(skip === 0 ? all.slice(0, 100) : all.slice(90, 150));
      },
    });
    const jobs = await collect(leverScraper.scrape(ctx(http, [t("acme")])));
    expect(jobs).toHaveLength(150);
    expect(new Set(jobs.map((j) => j.sourceJobId)).size).toBe(150);
  });

  it("does not loop forever when the API ignores skip", async () => {
    const http = fakeHttp({ "https://api.lever.co/v0/postings/acme": json(pages(100)) });
    expect(await collect(leverScraper.scrape(ctx(http, [t("acme")])))).toHaveLength(100);
    expect(http.calls).toHaveLength(2);
  });
});
