import { HttpError } from "@easyjobs/contract/node";
import { describe, expect, it } from "vitest";
import {
  greenhouse,
  greenhouseBoardUrl,
  greenhouseMetadataHints,
  greenhouseSalary,
  greenhouseToken,
  mapGreenhouseJob,
} from "../src/adapters/greenhouse";
import { greenhouseScraper } from "../src/index";
import { byId, collect, ctx, expectAllValid, fakeHttp, fixtureJson, json, manifest, target } from "./helpers";

const m = manifest.greenhouse!;
const t = (slug: string, token = slug) =>
  target({ slug, ats: "greenhouse", token, ...(slug === "groww" ? { name: "Groww", domain: "groww.in" } : {}) });

async function scrape(slug: string): Promise<Awaited<ReturnType<typeof collect>>> {
  const http = fakeHttp({ [greenhouseBoardUrl(slug)]: json(fixtureJson(`greenhouse/${slug}.json`)) });
  const jobs = await collect(greenhouseScraper.scrape(ctx(http, [t(slug)])));
  expectAllValid(jobs);
  return jobs;
}

describe("greenhouse adapter", () => {
  it("maps an Indian board job end to end", async () => {
    const jobs = await scrape("groww");
    const job = byId(jobs, m.india!);
    expect(job).toMatchObject({
      source: "greenhouse",
      sourceKind: "ats",
      sourceJobId: "4970739101",
      target: "groww",
      companySlug: "groww",
      companyDomain: "groww.in",
      company: "Groww",
      title: "Assistant Manager - Internal Audit",
      sourceUrl: "https://job-boards.eu.greenhouse.io/groww/jobs/4970739101",
      applyUrl: "https://job-boards.eu.greenhouse.io/groww/jobs/4970739101",
      locations: ["Bengaluru-VTP, India"],
      department: "Internal Controls",
      // first_published "2026-09-14T03:49:28-04:00" → UTC
      postedAt: "2026-09-14T07:49:28.000Z",
    });
  });

  it("decodes the entity-escaped content into HTML", async () => {
    const [job] = await scrape("groww");
    expect(job!.descriptionHtml).toMatch(/^<div><strong>About Groww:<\/strong><\/div>/);
    expect(job!.descriptionHtml).not.toContain("&lt;");
  });

  it("reads employment type, level and workplace from custom metadata", async () => {
    const jobs = await scrape("mongodb");
    expect(byId(jobs, m.metadataIntern!)).toMatchObject({ jobType: "internship", experienceLevel: "intern", workMode: "onsite", employmentTypeRaw: "Intern" });
    // ["2-Flexible", "3-Fully Remote"] → the most flexible option
    expect(byId(jobs, m.metadataRemote!)).toMatchObject({ jobType: "contract", workMode: "remote", isRemote: true });
    expect(byId(jobs, m.metadataContract!)).toMatchObject({ jobType: "contract", workMode: "hybrid", isRemote: false });
    // "IC - Professional" is not a level we can map
    expect(byId(jobs, m.metadataRemote!).experienceLevel).toBeUndefined();
  });

  it("never keeps internal metadata (budgets, unrelated custom fields)", async () => {
    const jobs = await scrape("mongodb");
    for (const job of jobs) {
      const meta = (job.extra?.metadata ?? {}) as Record<string, string>;
      expect(Object.keys(meta).some((k) => /budget|salary|range|position id|department id/i.test(k))).toBe(false);
    }
  });

  it("drops placeholder pay ranges (USD 0.01) instead of inventing a salary", async () => {
    const job = byId(await scrape("mongodb"), m.placeholderPay!);
    expect(job.salary).toBeUndefined();
    expect(job.salaryRaw).toBeUndefined();
  });

  it("maps pay_input_ranges: INR annual, monthly, multi-zone and absent", async () => {
    const jobs = await scrape("airbnb");
    expect(byId(jobs, m.inrPay!).salary).toEqual({
      min: 2_590_000,
      max: 3_700_000,
      currency: "INR",
      period: "year",
      raw: "INR 2,590,000–3,700,000 per year (India Annual Pay Range)",
    });
    expect(byId(jobs, m.monthlyPay!).salary).toMatchObject({ min: 147_000, max: 183_000, currency: "MXN", period: "month" });
    expect(byId(jobs, m.multiZonePay!).salary).toMatchObject({ min: 212_000, max: 265_000, currency: "USD", period: "year" });
    expect(byId(jobs, m.noPay!).salary).toBeUndefined();
  });

  it("keeps the public location text; offices go to extra", async () => {
    const jobs = await scrape("rubrik");
    const job = byId(jobs, m.multiOffice!);
    expect(job.locations).toEqual(["Remote Western US"]);
    expect(job.extra?.offices).toEqual(["USA - Arizona", "USA - California", "USA - Colorado", "USA - Utah"]);
    expect(byId(jobs, m.indiaRubrik!).locations).toEqual(["India"]);
  });

  it("passes multi-location strings through for the normalizer to split, and trims titles", async () => {
    const jobs = await scrape("databricks");
    expect(byId(jobs, m.semicolonLocations!).locations).toEqual(["Mountain View, California; San Francisco, California"]);
    const india = byId(jobs, m.indiaNoPay!);
    expect(india).toMatchObject({ title: "Account Executive", locations: ["Bengaluru, India; Mumbai, India"] });
    expect(india.salary).toBeUndefined();
  });

  it("falls back to the offices when the location is generic", () => {
    const job = mapGreenhouseJob(
      {
        id: 1,
        title: "Engineer",
        location: { name: "Multiple Locations" },
        offices: [{ name: "Bangalore", location: "Bengaluru, Karnataka, India" }, { name: "Pune", location: null }],
        absolute_url: "https://boards.greenhouse.io/acme/jobs/1",
      },
      t("acme"),
      "acme",
    );
    expect(job?.locations).toEqual(["Bengaluru, Karnataka, India", "Pune"]);
  });

  it("falls back to the canonical board URL when absolute_url is missing", () => {
    const job = mapGreenhouseJob({ id: 42, title: "Engineer" }, t("acme"), "acme");
    expect(job?.sourceUrl).toBe("https://job-boards.greenhouse.io/acme/jobs/42");
    expect(mapGreenhouseJob({ id: 43, title: null }, t("acme"), "acme")).toBeNull();
  });

  it("logs a dead board once and finishes cleanly", async () => {
    const http = fakeHttp({ [greenhouseBoardUrl("gone")]: { status: 404, body: { status: 404, error: "Job not found" } } });
    const c = ctx(http, [t("gone")]);
    expect(await collect(greenhouseScraper.scrape(c))).toEqual([]);
    expect(c.log.lines.filter((l) => l.level === "warn" && /board not found/.test(l.msg))).toHaveLength(1);
    expect(http.calls).toHaveLength(1);
  });

  it("rethrows server errors so the worker backs off (and never sweeps)", async () => {
    const http = fakeHttp({ [greenhouseBoardUrl("acme")]: { status: 503, body: "busy" } });
    await expect(collect(greenhouseScraper.scrape(ctx(http, [t("acme")])))).rejects.toBeInstanceOf(HttpError);
  });

  it("requests the documented endpoint with robots:false", async () => {
    const http = fakeHttp({ [greenhouseBoardUrl("groww")]: json(fixtureJson("greenhouse/groww.json")) });
    await collect(greenhouseScraper.scrape(ctx(http, [t("groww")])));
    expect(http.urls()).toEqual(["https://boards-api.greenhouse.io/v1/boards/groww/jobs?content=true&pay_transparency=true"]);
    expect(http.calls[0]!.init.robots).toBe(false);
  });

  it("parses board tokens from URLs", () => {
    expect(greenhouseToken("stripe")).toBe("stripe");
    expect(greenhouseToken("https://boards.greenhouse.io/stripe")).toBe("stripe");
    expect(greenhouseToken("https://job-boards.eu.greenhouse.io/groww/jobs/4970739101")).toBe("groww");
    expect(greenhouseToken("https://boards.greenhouse.io/embed/job_board?for=airbnb")).toBe("airbnb");
    expect(greenhouseToken("https://boards-api.greenhouse.io/v1/boards/okta/jobs")).toBe("okta");
    expect(greenhouse.ats).toBe("greenhouse");
  });
});

describe("greenhouseSalary", () => {
  const r = (min: number, max: number, currency = "USD", title = "Pay Range") => ({ min_cents: min * 100, max_cents: max * 100, currency_type: currency, title });

  it("infers the period from the range title, else from an unambiguous magnitude", () => {
    expect(greenhouseSalary([r(40, 55, "USD", "Hourly Pay Range")]).salary?.period).toBe("hour");
    expect(greenhouseSalary([r(48, 60)]).salary?.period).toBe("hour");
    expect(greenhouseSalary([r(90_000, 120_000)]).salary?.period).toBe("year");
    // ₹25,000 could be a monthly stipend or nonsense yearly pay → no period → no salary, raw text kept
    const ambiguous = greenhouseSalary([r(25_000, 25_000, "INR")]);
    expect(ambiguous.salary).toBeNull();
    expect(ambiguous.raw).toBe("INR 25,000 (Pay Range)");
  });

  it("does not trust a period label that the amounts contradict", () => {
    // Databricks: "SF Bay Area Hourly Rate" on a USD 222,500–305,900 range
    const s = greenhouseSalary([r(222_500, 305_900, "USD", "SF Bay Area Hourly Rate")]);
    expect(s.salary).toMatchObject({ min: 222_500, max: 305_900, period: "year" });
    expect(greenhouseSalary([r(54, 60, "USD", "SF Bay Area Hourly Rate")]).salary?.period).toBe("hour");
  });

  it("prefers an INR range and merges zones of one currency", () => {
    const s = greenhouseSalary([r(150_000, 180_000, "USD", "US Annual"), r(3_000_000, 4_000_000, "INR", "India Annual"), r(2_500_000, 3_500_000, "INR", "India Annual")]);
    expect(s.salary).toMatchObject({ currency: "INR", min: 2_500_000, max: 4_000_000, period: "year" });
  });

  it("ignores placeholder and malformed ranges", () => {
    expect(greenhouseSalary([{ min_cents: 1, max_cents: 1, currency_type: "USD" }]).salary).toBeNull();
    expect(greenhouseSalary([{ min_cents: 5_000_000, max_cents: 6_000_000, currency_type: null }]).salary).toBeNull();
    expect(greenhouseSalary(null).salary).toBeNull();
  });
});

describe("greenhouseMetadataHints", () => {
  it("ignores personal data and unrelated fields", () => {
    const hints = greenhouseMetadataHints(
      [
        { name: "Backfill ID", value: "someone@acme.com", value_type: "short_text" },
        { name: "Employment Type", value: "Full Time Employee", value_type: "single_select" },
        { name: "Hiring Manager", value: "Jane Doe", value_type: "short_text" },
        { name: "Baseline Budgeted Salary", value: { unit: "USD", min_value: "1", max_value: "2" }, value_type: "currency_range" },
      ],
      "Engineer",
    );
    expect(hints.jobType).toBe("full_time");
    expect(hints.fields).toEqual({ "Employment Type": "Full Time Employee" });
  });

  it("maps seniority-style level fields and years of experience", () => {
    const hints = greenhouseMetadataHints(
      [
        { name: "Seniority", value: "Entry Level", value_type: "single_select" },
        { name: "Years of Experience", value: "0-2 years", value_type: "short_text" },
      ],
      "Software Engineer",
    );
    expect(hints).toMatchObject({ experienceLevel: "entry", experienceRaw: "0-2 years" });
  });
});
