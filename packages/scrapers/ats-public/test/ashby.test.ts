import { describe, expect, it } from "vitest";
import { ashbyBoardUrl, ashbyIsRemote, ashbySalary, ashbyToken, mapAshbyJob, type AshbyJob } from "../src/adapters/ashby";
import { ashbyScraper } from "../src/index";
import { byId, collect, ctx, expectAllValid, fakeHttp, fixtureJson, json, manifest, notFound, target } from "./helpers";

const m = manifest.ashby!;
const t = (slug: string) => target({ slug, ats: "ashby", token: slug });

async function scrape(slug: string, body: unknown = fixtureJson(`ashby/${slug}.json`)) {
  const http = fakeHttp({ [ashbyBoardUrl(slug)]: json(body) });
  const jobs = await collect(ashbyScraper.scrape(ctx(http, [t(slug)])));
  expectAllValid(jobs);
  return jobs;
}

describe("ashby adapter", () => {
  it("maps an on-site Indian job and appends the country to the location", async () => {
    const job = byId(await scrape("sarvam"), m.indiaOnsite!);
    expect(job).toMatchObject({
      source: "ashby",
      sourceKind: "ats",
      title: "Engagement Manager, Chanakya",
      locations: ["Delhi, India"],
      workMode: "onsite",
      isRemote: false,
      jobType: "full_time",
      department: "Business Development",
      postedAt: "2026-04-17T11:46:39.214Z",
      sourceUrl: "https://jobs.ashbyhq.com/sarvam/c0406fe0-c8c0-44aa-aa3e-b879f2bf1049",
    });
    expect(job.descriptionHtml).toMatch(/^<p/);
    expect(job.descriptionText).toMatch(/^About Sarvam/);
  });

  it("maps Intern employment to internships", async () => {
    expect(byId(await scrape("sarvam"), m.intern!)).toMatchObject({ jobType: "internship", locations: ["Bengaluru, India"] });
  });

  it("hides compensation the company does not display", async () => {
    const job = byId(await scrape("sarvam"), m.indiaOnsite!);
    expect(job.salary).toBeUndefined();
    expect(job.salaryRaw).toBeUndefined();
  });

  it("takes only the Salary component of a package (not equity) and keeps secondary locations", async () => {
    const job = byId(await scrape("ramp"), m.hybridWithRemoteSecondary!);
    expect(job.title).toBe("Software Engineer, Security, Cloud"); // leading space trimmed
    expect(job.salary).toEqual({ min: 211_400, max: 290_600, currency: "USD", period: "year", raw: "$211.4K - $290.6K" });
    expect(job.locations).toEqual(["New York, NY (HQ), USA", "Remote (Canada)", "Remote (US)", "Miami, FL, USA"]);
    // Hybrid, but some locations are remote → can be done remotely
    expect(job).toMatchObject({ workMode: "hybrid", isRemote: true });
  });

  it("does not trust Ashby's isRemote for hybrid jobs without a remote location", async () => {
    const job = byId(await scrape("ramp"), m.monthlyInternPay!);
    expect(job).toMatchObject({ workMode: "hybrid", isRemote: false, jobType: "internship" });
    expect(job.salary).toMatchObject({ min: 12_500, max: 12_500, currency: "USD", period: "month", raw: "$12.5K per month" });
  });

  it("maps remote-only jobs", async () => {
    expect(byId(await scrape("ramp"), m.remoteOnly!)).toMatchObject({ workMode: "remote", isRemote: true });
  });

  it("treats a $0 lower bound as unknown (hourly contract work)", async () => {
    const job = byId(await scrape("harvey"), m.hourlyZeroMin!);
    expect(job.salary).toEqual({ min: null, max: 125, currency: "USD", period: "hour", raw: "$0 – $125 per hour" });
    expect(job).toMatchObject({ jobType: "contract", locations: ["Remote, United States"], workMode: "remote" });
  });

  it("skips unlisted jobs", async () => {
    const board = fixtureJson("ashby/sarvam.json");
    board.jobs[0].isListed = false;
    const jobs = await scrape("sarvam", board);
    expect(jobs.map((j) => j.sourceJobId)).not.toContain(board.jobs[0].id);
    expect(jobs).toHaveLength(board.jobs.length - 1);
  });

  it("logs a dead board (plain-text 404) and finishes", async () => {
    const http = fakeHttp({ [ashbyBoardUrl("gone")]: notFound() });
    const c = ctx(http, [t("gone")]);
    expect(await collect(ashbyScraper.scrape(c))).toEqual([]);
    expect(c.log.lines.some((l) => l.level === "warn" && /board not found/.test(l.msg))).toBe(true);
  });

  it("parses tokens", () => {
    expect(ashbyToken("openai")).toBe("openai");
    expect(ashbyToken("https://jobs.ashbyhq.com/openai")).toBe("openai");
    expect(ashbyToken("https://jobs.ashbyhq.com/sarvam/c0406fe0-c8c0-44aa-aa3e-b879f2bf1049")).toBe("sarvam");
    expect(ashbyToken("https://api.ashbyhq.com/posting-api/job-board/notion?includeCompensation=true")).toBe("notion");
  });
});

describe("ashby helpers", () => {
  const base: AshbyJob = { id: "a1", title: "Engineer", jobUrl: "https://jobs.ashbyhq.com/acme/a1" };

  it("derives isRemote from the workplace type and the location texts", () => {
    expect(ashbyIsRemote({ ...base, isRemote: true }, "hybrid")).toBe(false);
    expect(ashbyIsRemote({ ...base, location: "Remote - India" }, undefined)).toBe(true);
    expect(ashbyIsRemote(base, "onsite")).toBe(false);
    expect(ashbyIsRemote(base, undefined)).toBeUndefined();
  });

  it("merges salary tiers of one currency/interval and ignores other components", () => {
    const salary = ashbySalary({
      ...base,
      compensation: {
        summaryComponents: [],
        compensationTiers: [
          { components: [{ compensationType: "Salary", interval: "1 YEAR", currencyCode: "INR", minValue: 1_800_000, maxValue: 2_400_000 }] },
          { components: [{ compensationType: "Salary", interval: "1 YEAR", currencyCode: "INR", minValue: 2_200_000, maxValue: 3_000_000 }] },
          { components: [{ compensationType: "EquityCashValue", interval: "1 YEAR", currencyCode: "INR", minValue: 9, maxValue: 9 }] },
        ],
      },
    });
    expect(salary).toMatchObject({ min: 1_800_000, max: 3_000_000, currency: "INR", period: "year" });
  });

  it("maps a job without location data to no locations", () => {
    expect(mapAshbyJob(base, t("acme"), "acme")?.locations).toEqual([]);
  });
});
