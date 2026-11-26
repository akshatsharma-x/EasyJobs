import { describe, expect, it } from "vitest";
import { buildJob } from "../src/core/job";
import { toIso } from "../src/lib/dates";
import { decodeEntities, htmlSection, htmlToPlain, isBlankHtml, isEscapedHtml, joinHtml, unescapeHtml } from "../src/lib/html";
import { jobTypeFromLabel, levelFromLabel, stripOptionPrefix, workModeFromLabel, yearsFromBucket } from "../src/lib/hints";
import { countryCode, countryName, joinLocation, mentionsCountry, pruneLocations, tidyLocation, withCountry } from "../src/lib/location";
import { isPersonalField, looksPersonal } from "../src/lib/privacy";
import { makeSalary, parseSalaryText, periodFromInterval, periodFromMagnitude, periodFromText } from "../src/lib/salary";
import { target } from "./helpers";

describe("jobTypeFromLabel", () => {
  it.each([
    ["Full-time", "full_time"],
    ["FullTime", "full_time"],
    ["fulltime_permanent", "full_time"],
    ["Permanent", "full_time"],
    ["On-roll", "full_time"],
    ["Full Time Employee", "full_time"],
    ["A - Full Time", "full_time"],
    ["Regular", "full_time"],
    ["Part-time", "part_time"],
    ["Part-time Employee", "part_time"],
    ["Intern", "internship"],
    ["Campus Intern", "internship"],
    ["Internship", "internship"],
    ["Contract", "contract"],
    ["Contractual", "contract"],
    ["Contractor / Full-Time", "contract"],
    ["Fixed-term", "contract"],
    ["Direct Consultant", "contract"],
    ["Temporary", "temporary"],
    ["Short Term", "temporary"],
    ["Seasonal  Contract", "temporary"],
    ["Casual Contract", "temporary"],
    ["Freelance", "freelance"],
    ["Apprenticeship", "apprenticeship"],
    ["Ausbildung", "apprenticeship"],
  ] as const)("%s → %s", (label, expected) => expect(jobTypeFromLabel(label)).toBe(expected));

  it.each(["Full Time/Part Time", "Part time/Fulltime", "Active", "P - PRN", "Standard", "Pipeline", "", null])("%s → undefined", (label) =>
    expect(jobTypeFromLabel(label)).toBeUndefined(),
  );

  it("does not read 'Internal' as an internship", () => expect(jobTypeFromLabel("Internal transfer")).toBeUndefined());
});

describe("workModeFromLabel", () => {
  it.each([
    ["Remote", "remote"],
    ["Fully Remote", "remote"],
    ["3CF-Customer Facing Remote", "remote"],
    ["Hybrid", "hybrid"],
    ["2-Flexible", "hybrid"],
    ["OnSite", "onsite"],
    ["On-site", "onsite"],
    ["1-In Office", "onsite"],
    ["unspecified", undefined],
    ["Not remote", undefined],
  ] as const)("%s → %s", (label, expected) => expect(workModeFromLabel(label)).toBe(expected));

  it("picks the most flexible option of a multi-select", () => {
    expect(workModeFromLabel(["1-In Office", "2-Flexible", "3-Fully Remote"])).toBe("remote");
    expect(workModeFromLabel(["1-In Office", "2-Flexible"])).toBe("hybrid");
  });
});

describe("levelFromLabel", () => {
  it.each([
    ["Internship", "Data Intern", "intern"],
    ["Student (College)", null, "intern"],
    ["Working Student", null, "intern"],
    ["New Grad", null, "fresher"],
    ["Entry level", null, "entry"],
    ["entry_level", null, "entry"],
    ["Associate", null, "entry"],
    ["Junior", null, "entry"],
    ["Mid-level", null, "mid"],
    ["mid_level", null, "mid"],
    ["Senior", null, "senior"],
    ["Manager/Supervisor", null, "lead"],
    ["Senior Manager/Supervisor", null, "lead"],
    ["People Manager", null, "lead"],
    ["Staff", null, "lead"],
    ["Director", null, "executive"],
    ["Associate Director", null, "executive"],
    ["Senior Vice President", null, "executive"],
    ["Executive", null, "executive"],
    ["Mid-Senior level", "Software Engineer", "mid"],
    ["Mid-Senior level", "Senior Software Engineer", undefined],
    ["Experienced", "Accountant", "mid"],
    ["Experienced", "Branch Manager", undefined],
    ["IC - Professional", "Engineer", undefined],
    ["Not Applicable", null, undefined],
    ["not_applicable", null, undefined],
  ] as const)("%s (title %s) → %s", (label, title, expected) => expect(levelFromLabel(label, title)).toBe(expected));
});

describe("small parsers", () => {
  it("strips select-option prefixes but keeps ranges", () => {
    expect(stripOptionPrefix("1-In Office")).toBe("In Office");
    expect(stripOptionPrefix("3CF-Customer Facing Remote")).toBe("Customer Facing Remote");
    expect(stripOptionPrefix("0-2 years")).toBe("0-2 years");
  });

  it("reads Personio experience buckets", () => {
    expect(yearsFromBucket("lt-1")).toEqual({ min: 0, max: 1, label: "less than 1 year" });
    expect(yearsFromBucket("2-5")).toEqual({ min: 2, max: 5, label: "2-5 years" });
    expect(yearsFromBucket("ht-15")).toEqual({ min: 15, max: null, label: "15+ years" });
    expect(yearsFromBucket("lots")).toBeNull();
  });

  it.each([
    [1791377927596, "2026-10-07T12:58:47.596Z"],
    [1791377927, "2026-10-07T12:58:47.000Z"],
    ["1791377927596", "2026-10-07T12:58:47.596Z"],
    ["2026-09-14T03:49:28-04:00", "2026-09-14T07:49:28.000Z"],
    ["2026-11-16 14:54:20 UTC", "2026-11-16T14:54:20.000Z"],
    ["2026-05-29", "2026-05-29T00:00:00.000Z"],
    ["Wed, 25 Nov 2026 13:26:00 +0100", "2026-11-25T12:26:00.000Z"],
    ["2023-10-16T14:54:33+00:00", "2023-10-16T14:54:33.000Z"],
    ["not a date", null],
    ["", null],
    [null, null],
    [0, null],
  ] as const)("toIso(%s) → %s", (input, expected) => expect(toIso(input)).toBe(expected));
});

describe("locations", () => {
  it("maps country codes and names", () => {
    expect(countryName("in")).toBe("India");
    expect(countryName("USA")).toBe("USA");
    expect(countryCode("United States")).toBe("US");
    expect(countryCode("UK")).toBe("GB");
    expect(countryCode("xx")).toBeNull();
  });

  it("detects countries already named in text (codes case-sensitively)", () => {
    expect(mentionsCountry("Remote (US)", "United States")).toBe(true);
    expect(mentionsCountry("Bengaluru-VTP, India", "IN")).toBe(true);
    expect(mentionsCountry("Remote in Australia", "US")).toBe(false);
    expect(mentionsCountry("Noida, Uttar Pradesh", "India")).toBe(false);
  });

  it("appends a missing country, but never to multi-region text", () => {
    expect(withCountry("Noida, Uttar Pradesh", "IN")).toBe("Noida, Uttar Pradesh, India");
    expect(withCountry("Singapore, Singapore", "SG")).toBe("Singapore, Singapore");
    expect(withCountry("Remote - EMEA", "ES")).toBe("Remote - EMEA");
    expect(withCountry("Worldwide", "Worldwide")).toBe("Worldwide");
    expect(withCountry(null, "in")).toBe("India");
    expect(withCountry("Pune", null)).toBe("Pune");
  });

  it("joins, tidies and prunes", () => {
    expect(joinLocation(["Delhi", "Delhi", "India"])).toBe("Delhi, India");
    expect(joinLocation([null, "", undefined])).toBeNull();
    expect(tidyLocation("Chennai, , India")).toBe("Chennai, India");
    expect(pruneLocations(["Philippines", "Makati City, NCR, Philippines", "Remote"])).toEqual(["Makati City, NCR, Philippines", "Remote"]);
    expect(pruneLocations(["India", "Berlin, Germany"])).toEqual(["India", "Berlin, Germany"]);
  });
});

describe("html", () => {
  it("decodes escaped HTML once and leaves real HTML alone", () => {
    expect(isEscapedHtml("&lt;p&gt;Hi &amp;amp; bye&lt;/p&gt;")).toBe(true);
    expect(unescapeHtml("&lt;p&gt;Hi &amp;amp; bye&lt;/p&gt;")).toBe("<p>Hi &amp; bye</p>");
    expect(unescapeHtml("<p>5 &lt; 6</p>")).toBe("<p>5 &lt; 6</p>");
    expect(decodeEntities("caf&eacute;")).toBe("café");
  });

  it("assembles sections and skips blank ones", () => {
    expect(isBlankHtml("<p>&nbsp;</p><div> </div>")).toBe(true);
    expect(htmlSection("Perks", "<p></p>")).toBeNull();
    expect(htmlSection("Perks & more", "<ul><li>Food</li></ul>")).toBe("<h3>Perks &amp; more</h3>\n<ul><li>Food</li></ul>");
    expect(joinHtml(["<p>a</p>", null, "<p> </p>", "<p>b</p>"])).toBe("<p>a</p>\n<p>b</p>");
    expect(htmlToPlain("<ul><li>One</li><li>Two</li></ul>")).toBe("• One\n• Two");
  });
});

describe("salary", () => {
  it.each([
    ["per-year-salary", "year"],
    ["per-month-salary", "month"],
    ["per-hour-wage", "hour"],
    ["1 YEAR", "year"],
    ["1 MONTH", "month"],
    ["1 HOUR", "hour"],
    ["YEARLY", "year"],
    ["MONTHLY", "month"],
    ["year", "year"],
    ["per-week-salary", null],
    ["1 WEEK", null],
    ["one-time", null],
    ["NONE", null],
  ] as const)("periodFromInterval(%s) → %s", (input, expected) => expect(periodFromInterval(input)).toBe(expected));

  it("reads periods from text without false positives", () => {
    expect(periodFromText("Germany Annual Pay Range")).toBe("year");
    expect(periodFromText("Brazil Monthly Pay Range")).toBe("month");
    expect(periodFromText("$14 / hour")).toBe("hour");
    expect(periodFromText("€55k p.a.")).toBe("year");
    expect(periodFromText("Pay Range")).toBeNull();
    expect(periodFromText("Zone 1 Pay Range")).toBeNull();
  });

  it("classifies unlabelled magnitudes only when unambiguous", () => {
    expect(periodFromMagnitude(40, 55, "USD")).toBe("hour");
    expect(periodFromMagnitude(1_960_000, 2_800_000, "INR")).toBe("year");
    expect(periodFromMagnitude(25_000, 25_000, "INR")).toBeNull();
    expect(periodFromMagnitude(3_000, 4_000, "EUR")).toBeNull();
    expect(periodFromMagnitude(100, 200, "XYZ")).toBeNull();
  });

  it("validates salaries", () => {
    expect(makeSalary({ min: 0, max: 0, currency: "INR", period: "year" })).toBeNull();
    expect(makeSalary({ min: 0.01, max: 0.01, currency: "USD", period: "year" })).toBeNull();
    expect(makeSalary({ min: 100, max: 50, currency: "usd", period: "hour" })).toEqual({ min: 50, max: 100, currency: "USD", period: "hour", raw: "USD 50–100 per hour" });
    expect(makeSalary({ min: "4000", max: "5700", currency: "EUR", period: "month" })).toMatchObject({ min: 4000, max: 5700 });
    expect(makeSalary({ min: 10, currency: "PER", period: "hour" })).toBeNull();
    expect(makeSalary({ min: 10, currency: "USD", period: null })).toBeNull();
    // implausible for the period → no salary (the raw text is kept by the adapters)
    expect(makeSalary({ min: 120_000, max: 150_000, currency: "USD", period: "hour" })).toBeNull();
    expect(makeSalary({ min: 15, max: 20, currency: "USD", period: "year" })).toBeNull();
    expect(makeSalary({ min: 5_000, max: 5_000, currency: "INR", period: "month" })).toMatchObject({ period: "month" });
    expect(makeSalary({ min: 120_000, max: 150_000, currency: "XAF", period: "hour" })).not.toBeNull(); // unknown FX → unchecked
  });

  it.each([
    ["$75,000 – $80,000 / year", "CA", { min: 75_000, max: 80_000, currency: "CAD", period: "year" }],
    ["$75,000 – $80,000 / year", "US", { min: 75_000, max: 80_000, currency: "USD", period: "year" }],
    ["$14 / hour", "US", { min: 14, max: 14, currency: "USD", period: "hour" }],
    ["$15+ / hour", "US", { min: 15, max: null, currency: "USD", period: "hour" }],
    ["€60k per year", null, { min: 60_000, max: 60_000, currency: "EUR", period: "year" }],
    ["INR 25,000 - 30,000 / month", null, { min: 25_000, max: 30_000, currency: "INR", period: "month" }],
    ["₹4,00,000 - ₹6,00,000 per annum", null, { min: 400_000, max: 600_000, currency: "INR", period: "year" }],
    ["14 PER HOUR", null, null],
    ["$70,000 and up, Depending on experience.", "US", null],
    ["Competitive", null, null],
    ["$50,000", null, null],
  ] as const)("parseSalaryText(%s, %s)", (text, country, expected) => {
    const s = parseSalaryText(text, country);
    if (expected === null) expect(s).toBeNull();
    else expect(s).toMatchObject(expected);
  });
});

describe("privacy", () => {
  it("flags emails, phone numbers and person fields", () => {
    expect(looksPersonal("rashmi.chouhan@inmobi.com")).toBe(true);
    expect(looksPersonal("+91 98765 43210")).toBe(true);
    expect(looksPersonal("0-2 years")).toBe(false);
    expect(isPersonalField("Hiring Manager", "Jane")).toBe(true);
    expect(isPersonalField("Recruiting Team", "Professional")).toBe(false);
  });
});

describe("buildJob", () => {
  const t = target({ slug: "acme", ats: "greenhouse", token: "acme", name: "Acme", domain: "acme.com", extra: { logoUrl: "https://cdn.acme.com/logo.png" } });

  it("fills shared fields from the target and drops undefined keys", () => {
    const job = buildJob("greenhouse", t, { sourceJobId: 12, title: "  Engineer ", url: "https://boards.greenhouse.io/acme/jobs/12", locations: ["Pune", "pune", ""] });
    expect(job).toEqual({
      source: "greenhouse",
      sourceKind: "ats",
      sourceJobId: "12",
      sourceUrl: "https://boards.greenhouse.io/acme/jobs/12",
      target: "acme",
      applyUrl: "https://boards.greenhouse.io/acme/jobs/12",
      title: "Engineer",
      company: "Acme",
      locations: ["Pune"],
      descriptionHtml: null,
      postedAt: null,
      companySlug: "acme",
      companyDomain: "acme.com",
      companyLogoUrl: "https://cdn.acme.com/logo.png",
    });
  });

  it("rejects drafts without id, title or a valid URL", () => {
    expect(buildJob("x", t, { sourceJobId: null, title: "A", url: "https://a.example" })).toBeNull();
    expect(buildJob("x", t, { sourceJobId: 1, title: " ", url: "https://a.example" })).toBeNull();
    expect(buildJob("x", t, { sourceJobId: 1, title: "A", url: "/relative" })).toBeNull();
  });

  it("derives isRemote from workMode when not given", () => {
    const base = { sourceJobId: 1, title: "A", url: "https://a.example" };
    expect(buildJob("x", t, { ...base, workMode: "remote" })?.isRemote).toBe(true);
    expect(buildJob("x", t, { ...base, workMode: "hybrid" })?.isRemote).toBe(false);
    expect(buildJob("x", t, base)?.isRemote).toBeUndefined();
  });
});
