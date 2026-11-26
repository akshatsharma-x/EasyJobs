import { describe, expect, it } from "vitest";
import { ATS_TYPES, COMPANY_TAGS } from "@easyjobs/contract";
import { aliases, companies, findCompany, getCompany, matchCompany, targetsByAts, validateCompanyTarget, validateRegistry } from "../src/index";
import { isValidToken } from "../src/ats";

const apiVerified = companies.filter((c) => c.extra?.["verifiedBy"] === "ats-api");

describe("companies.json", () => {
  it("loads a large registry", () => {
    expect(companies.length).toBeGreaterThanOrEqual(500);
  });

  it("has ≥ 500 entries verified against a live ATS job API", () => {
    expect(apiVerified.length).toBeGreaterThanOrEqual(500);
    for (const c of apiVerified) {
      expect(c.verifiedAt, c.slug).toBeTruthy();
      expect(Number.isNaN(Date.parse(c.verifiedAt!)), c.slug).toBe(false);
      expect(typeof c.openJobs, c.slug).toBe("number");
    }
  });

  it("every entry is valid (kebab-case slug, token format per ATS, https URLs, known tags)", () => {
    const problems = companies.flatMap((c) => validateCompanyTarget(c).map((p) => `${c.slug}: ${p}`));
    expect(problems).toEqual([]);
  });

  it("slugs are unique and sorted", () => {
    expect(validateRegistry(companies)).toEqual([]);
    expect(new Set(companies.map((c) => c.slug)).size).toBe(companies.length);
  });

  it("tokens match §0.6 for every ATS", () => {
    for (const c of companies) expect(isValidToken(c.ats, c.token), `${c.slug} ${c.ats} ${c.token}`).toBe(true);
    for (const c of targetsByAts("workday")) expect(c.token).toMatch(/^https:\/\/[a-z0-9-]+\.wd\d+\.myworkdayjobs\.com\/[A-Za-z0-9_.-]+$/);
    for (const c of targetsByAts("eightfold")) expect(c.token).toMatch(/^https:\/\/[^|]+\|[a-z0-9.-]+$/);
    for (const c of targetsByAts("lever")) expect(c.token).toMatch(/^(eu:)?[a-z0-9][a-z0-9._-]*$/);
  });

  it("all URLs are https", () => {
    for (const c of companies) {
      expect(c.careersUrl.startsWith("https://"), c.slug).toBe(true);
      if (/^https?:/.test(c.token)) expect(c.token.startsWith("https://"), c.slug).toBe(true);
    }
  });

  it("uses only contract enums", () => {
    for (const c of companies) {
      expect(ATS_TYPES).toContain(c.ats);
      for (const t of c.tags) expect(COMPANY_TAGS).toContain(t);
      expect([1, 2, 3]).toContain(c.priority);
    }
  });

  it("covers the India-first list", () => {
    const mustHave = ["tcs", "infosys", "wipro", "hcltech", "accenture", "flipkart", "swiggy", "razorpay", "cred", "phonepe", "groww", "meesho", "freshworks", "zoho", "postman", "browserstack", "google", "microsoft", "amazon", "nvidia", "goldman-sachs", "jpmorgan-chase", "walmart"];
    const missing = mustHave.filter((s) => !getCompany(s));
    expect(missing).toEqual([]);
  });

  it("has priority 1 for Big Tech, Indian IT and India unicorns", () => {
    for (const c of companies.filter((x) => x.tags.includes("indian_it") || x.tags.includes("big_tech"))) {
      if ((c.openJobs ?? 1) > 0) expect(c.priority, c.slug).toBe(1);
    }
  });
});

describe("lookups", () => {
  it("getCompany", () => {
    const first = companies[0]!;
    expect(getCompany(first.slug)).toBe(first);
    expect(getCompany(first.slug.toUpperCase())).toBe(first);
    expect(getCompany("definitely-not-a-company-slug")).toBeNull();
  });

  it("targetsByAts filters by one or many types", () => {
    const gh = targetsByAts("greenhouse");
    expect(gh.length).toBeGreaterThan(50);
    expect(gh.every((c) => c.ats === "greenhouse")).toBe(true);
    const both = targetsByAts(["greenhouse", "lever"]);
    expect(both.length).toBe(gh.length + targetsByAts("lever").length);
    expect(targetsByAts([])).toEqual([]);
  });

  it("aliases only reference registry slugs", () => {
    for (const slug of Object.keys(aliases)) expect(getCompany(slug), slug).not.toBeNull();
    expect(aliases["tcs"]).toContain("Tata Consultancy Services");
  });

  it("entries are frozen", () => {
    expect(Object.isFrozen(companies)).toBe(true);
    expect(Object.isFrozen(companies[0])).toBe(true);
  });
});

describe("findCompany on the real registry", () => {
  it.each([
    ["TCS", "tcs"],
    ["Tata Consultancy Services", "tcs"],
    ["Tata Consultancy Services Ltd.", "tcs"],
    ["Infosys Limited", "infosys"],
    ["HCL Technologies", "hcltech"],
    ["LTI Mindtree", "ltimindtree"],
    ["Larsen & Toubro Infotech", "ltimindtree"],
    ["Cognizant Technology Solutions India Pvt Ltd", "cognizant"],
    ["Ernst & Young", "ey"],
    ["PricewaterhouseCoopers", "pwc"],
    ["J.P. Morgan", "jpmorgan-chase"],
    ["JPMorgan Chase & Co.", "jpmorgan-chase"],
    ["Goldman Sachs Services Private Limited", "goldman-sachs"],
    ["Amex", "american-express"],
    ["Amazon Development Centre (India) Pvt. Ltd.", "amazon"],
    ["AWS", "amazon"],
    ["Google India Pvt Ltd", "google"],
    ["Facebook", "meta"],
    ["Walmart Global Tech India", "walmart"],
    ["Dreamplug Technologies", "cred"],
    ["Bundl Technologies", "swiggy"],
    ["One97 Communications", "paytm"],
    ["Zomato Limited", "zomato"],
    ["UrbanClap", "urban-company"],
    ["razorpay.com", "razorpay"],
    ["https://www.flipkartcareers.com/#!/joblist", "flipkart"],
    ["Razorpy", "razorpay"],
  ])("%s → %s", (q, slug) => {
    expect(findCompany(q)?.slug).toBe(slug);
  });

  it("resolves ATS job URLs to the board's company", () => {
    for (const c of [...targetsByAts("greenhouse").slice(0, 3), ...targetsByAts("lever").slice(0, 3)]) {
      const url = c.ats === "greenhouse" ? `https://job-boards.greenhouse.io/${c.token}/jobs/123` : `https://jobs.lever.co/${c.token}/abc`;
      expect(matchCompany(url)?.company.slug, url).toBe(c.slug);
    }
  });

  it("does not invent matches", () => {
    for (const q of ["Some Random Consultancy Pvt Ltd", "Private Limited", "India", "", "Strike"]) expect(findCompany(q), q).toBeNull();
  });
});
