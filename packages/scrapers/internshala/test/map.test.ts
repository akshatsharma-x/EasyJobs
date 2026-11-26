import { describe, expect, it } from "vitest";
import { validateRawJob, type RawJob } from "@easyjobs/contract";
import { parseJobExperience, REMOTE_INDIA, snippetText, splitCompanyName, toRawJob } from "../src/map";
import { parseDetailPage } from "../src/parse/detail";
import { parseListingPage } from "../src/parse/listing";
import type { ListingCard } from "../src/types";
import { FIXED_NOW, fixture } from "./helpers";

const card = (listing: string, id: string): ListingCard => {
  const c = parseListingPage(fixture(listing)).cards.find((x) => x.id === id);
  if (!c) throw new Error(`card ${id} missing from ${listing}`);
  return c;
};

const PAIRS = {
  internship: { listing: "listing-internships", id: "3334805", detail: "detail-internship", source: "internshala-internships" },
  wfhUnpaid: { listing: "listing-internships-wfh", id: "3340945", detail: "detail-internship-wfh-unpaid", source: "internshala-internships" },
  lumpSum: { listing: "listing-internships-wfh", id: "3340935", detail: "detail-internship-lumpsum", source: "internshala-internships" },
  weekly: { listing: "listing-internships-wfh", id: "3331809", detail: "detail-internship-weekly", source: "internshala-internships" },
  performance: { listing: "listing-internships-wfh", id: "3341013", detail: "detail-internship-performance", source: "internshala-internships" },
  jobCtc: { listing: "listing-jobs", id: "3341218", detail: "detail-job-ctc", source: "internshala-jobs" },
  jobHybridFresher: { listing: "listing-jobs", id: "3341143", detail: "detail-job-hybrid-fresher", source: "internshala-jobs" },
  jobNoJsonLd: { listing: "listing-jobs", id: "3340461", detail: "detail-job-no-jsonld", source: "internshala-jobs" },
} as const;
type PairName = keyof typeof PAIRS;

const full = (name: PairName, feedTags: string[] = []): RawJob => {
  const p = PAIRS[name];
  return toRawJob(card(p.listing, p.id), parseDetailPage(fixture(p.detail)), { source: p.source, now: FIXED_NOW, feed: "main", feedTags });
};
const light = (name: PairName, known = true): RawJob => {
  const p = PAIRS[name];
  return toRawJob(card(p.listing, p.id), null, { source: p.source, now: FIXED_NOW, feed: "main", known });
};

describe("toRawJob — every fixture pair is a valid RawJob", () => {
  it.each(Object.keys(PAIRS) as PairName[])("%s (full and light)", (name) => {
    expect(validateRawJob(full(name))).toEqual([]);
    expect(validateRawJob(light(name))).toEqual([]);
  });
});

describe("toRawJob — hints", () => {
  it("in-office internship: intern level, monthly stipend, IST validThrough, domain, URL-based postedAt", () => {
    const j = full("internship");
    expect(j).toMatchObject({
      source: "internshala-internships",
      sourceKind: "job_board",
      sourceJobId: "3334805",
      target: null,
      title: "Business Development (Sales)",
      company: "Loadit Supply Services Pvt Ltd",
      locations: ["Delhi"],
      jobType: "internship",
      experienceLevel: "intern",
      workMode: "onsite",
      isRemote: false,
      salary: { min: 10_000, max: 12_000, currency: "INR", period: "month", raw: "₹ 10,000 - 12,000 /month" },
      salaryRaw: "₹ 10,000 - 12,000 /month",
      companyDomain: "loadit.in",
      validThrough: "2026-12-16T18:29:59.000Z",
      postedAt: "2026-11-16T05:27:07.000Z", // from the URL's Unix time 1794806827
      department: "Business Development (Sales)",
      tags: ["women"], // "Women wanting to start/restart their career can also apply."
    });
    // applications happen on Internshala: apply link = detail page
    expect(j.applyUrl).toBe(j.sourceUrl);
    expect(j.sourceUrl).toMatch(/^https:\/\/internshala\.com\/internship\/detail\//);
    expect(j.extra).toMatchObject({ internshalaId: "3334805", openings: 2, applicants: 56, startDate: "Immediately", perks: ["Certificate"] });
  });

  it("WFH + unpaid + part-time → remote, India, salary 0, tags", () => {
    const j = full("wfhUnpaid");
    expect(j).toMatchObject({
      locations: [REMOTE_INDIA],
      workMode: "remote",
      isRemote: true,
      jobType: "internship",
      salary: { min: 0, max: 0, period: "month", raw: "Unpaid" },
    });
    expect(j.tags).toEqual(expect.arrayContaining(["wfh", "women", "part-time", "unpaid"]));
    expect(j.locations).not.toContain("Delhi"); // JSON-LD jobLocation is the employer's office, not the job
  });

  it("lump sum over 1 month → monthly; weekly → monthly", () => {
    expect(full("lumpSum").salary).toMatchObject({ min: 1_500, max: 15_000, period: "month", raw: "₹ 1,500 - 15,000 lump sum" });
    expect(full("lumpSum").extra).toMatchObject({ payKind: "lump_sum", payPeriod: "lump_sum" });
    expect(full("weekly").salary).toMatchObject({ min: 1_300, max: 1_300, period: "month", raw: "₹ 300 /week" });
  });

  it("performance based → no salary, raw text kept", () => {
    const j = full("performance");
    expect(j.salary).toBeNull();
    expect(j.salaryRaw).toBe("Performance Based");
    expect(j.extra).toMatchObject({ payKind: "performance" });
  });

  it("job with CTC → yearly salary, entry level, min experience, no social 'domain'", () => {
    const j = full("jobCtc");
    expect(j).toMatchObject({
      jobType: "full_time",
      experienceLevel: "entry",
      experienceMin: 1,
      experienceMax: null,
      experienceRaw: "1 year(s)",
      salary: { min: 400_000, max: 450_000, currency: "INR", period: "year", raw: "₹ 4,00,000 - 4,50,000 /year" },
      validThrough: "2026-12-25T18:29:59.000Z",
    });
    expect(j.companyDomain).toBeUndefined(); // the "website" is an Instagram page
    expect(j.extra).toMatchObject({ ctc: "₹ 4,00,000 - 4,50,000 /year" });
  });

  it("hybrid fresher job → fresher level, hybrid work mode, CTC breakup", () => {
    const j = full("jobHybridFresher");
    expect(j).toMatchObject({ experienceLevel: "fresher", experienceMin: 0, workMode: "hybrid", isRemote: false, locations: ["Mumbai"] });
    expect(j.extra).toMatchObject({ hybridNote: "1 day(s) in-office in a week" });
    expect((j.extra?.ctcBreakup as { label: string }[]).map((b) => b.label)).toEqual(["Fixed pay", "Variable pay"]);
  });

  it("job without JSON-LD → still complete from the HTML", () => {
    const j = full("jobNoJsonLd");
    expect(j).toMatchObject({ experienceLevel: "fresher", validThrough: "2026-12-25T18:29:59.000Z", locations: ["Mumbai", "Mira Bhayandar", "Vasai-Virar"] });
    expect(j.descriptionHtml).toContain("<h3>Salary</h3>");
    expect(j.descriptionHtml).toContain("Probation: 6 months");
    expect(j.extra).toMatchObject({ probation: { duration: "6 months" } });
  });

  it("the women feed tags its jobs", () => {
    expect(full("jobCtc", ["women"]).tags).toContain("women");
    expect(full("jobCtc").tags).not.toContain("women");
  });
});

describe("toRawJob — description HTML", () => {
  it("uses the page's own sections with clean markup, then a Details list", () => {
    const html = full("internship").descriptionHtml ?? "";
    expect(html.startsWith("<h3>About the internship</h3>")).toBe(true);
    for (const h of ["Skill(s) required", "Who can apply", "Perks", "Number of openings", "About Loadit Supply Services Pvt Ltd", "Details"]) {
      expect(html).toContain(`<h3>${h}</h3>`);
    }
    expect(html).not.toMatch(/style=|class=|<script|<div|<span|<img|trainings\.internshala/);
    expect(html).toContain("<li><strong>Apply by:</strong> 16 Dec' 26</li>");
  });
});

describe("toRawJob — light records", () => {
  it("known jobs: no description, same light fields as the full record", () => {
    const l = light("internship");
    const f = full("internship");
    expect(l.descriptionHtml).toBeNull();
    expect(l.descriptionText).toBeUndefined();
    for (const k of ["sourceJobId", "sourceUrl", "title", "company", "locations", "postedAt", "salary", "jobType", "experienceLevel", "workMode"] as const) {
      expect(l[k]).toEqual(f[k]);
    }
    expect(l.validThrough).toBeUndefined();
    expect(l.companyDomain).toBeUndefined();
    expect(l.extra?.detail).toBeUndefined();
    expect(l.extra?.internshalaId).toBe("3334805");
  });

  it("unknown jobs without a detail page get the card preview as descriptionText", () => {
    expect(light("internship", false).descriptionText).toMatch(/^1\.Roles & Responsibilities Assist the KAM team.*…$/);
  });
});

describe("snapshots", () => {
  it.each(Object.keys(PAIRS) as PairName[])("%s", (name) => {
    expect(full(name)).toMatchSnapshot();
  });
});

describe("helpers", () => {
  it.each([
    ["No experience required", null, false, { min: 0, max: null, level: "fresher" }],
    ["1 year(s)", null, false, { min: 1, max: null, level: "entry" }],
    ["2 year(s)", null, false, { min: 2, max: null, level: "mid" }],
    ["5 year(s)", null, false, { min: 5, max: null, level: "senior" }],
    ["10 year(s)", null, false, { min: 10, max: null, level: "lead" }],
    ["0-2 years", null, false, { min: 0, max: 2, level: "fresher" }],
    [null, 24, false, { min: 2, max: null, level: "mid" }],
    [null, null, true, { min: 0, max: null, level: "fresher" }],
    [null, null, false, { min: null, max: null, level: undefined }],
  ])("parseJobExperience(%j, %j, %j)", (text, months, fresher, expected) => {
    expect(parseJobExperience(text, months, fresher)).toEqual(expected);
  });

  it("splitCompanyName only strips a trailing '(City, Country)' on international postings", () => {
    expect(splitCompanyName("Peroptyx (Castlebar, Ireland)", true)).toEqual({ company: "Peroptyx", companyLocation: "Castlebar, Ireland" });
    expect(splitCompanyName("Peroptyx (Castlebar, Ireland)", false)).toEqual({ company: "Peroptyx (Castlebar, Ireland)", companyLocation: null });
    expect(splitCompanyName("Tantrabodh AI (OPC) Private Limited", true).company).toBe("Tantrabodh AI (OPC) Private Limited");
  });

  it("snippetText trims the card's mid-word cut", () => {
    expect(snippetText("We are seeking a skilled IoT network engineer with B tech background to join our team. The ide")).toBe(
      "We are seeking a skilled IoT network engineer with B tech background to join our team. The…",
    );
    expect(snippetText("short")).toBeNull();
  });
});
