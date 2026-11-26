import { validateRawJob } from "@easyjobs/contract";
import { describe, expect, it } from "vitest";
import { mapLinkedInJob } from "../src/linkedin/map";
import { offsiteApplyUrl, parseLinkedInDetail } from "../src/linkedin/parse-detail";
import { companyPageUrl, parseLinkedInListing, postedAtFrom } from "../src/linkedin/parse-listing";
import { linkedInConfigFromEnv, linkedInSearchUrl, type LinkedInQuery } from "../src/linkedin/plan";
import { fixture, NOW } from "./helpers";

const QUERY_E2: LinkedInQuery = { keywords: "software engineer", experience: "2", workTypes: [], key: "software engineer|E2" };
const QUERY_E1_REMOTE: LinkedInQuery = { keywords: "data analyst", experience: "1", workTypes: ["2"], key: "data analyst|E1|WT2" };

describe("parseLinkedInListing (guest search fragment)", () => {
  const cards = parseLinkedInListing(fixture("linkedin/search-page.html"), NOW);

  it("matches the snapshot", () => {
    expect(cards).toMatchSnapshot();
  });

  it("reads urn ids, de-duplicates repeated cards and handles the <a class=base-card> variant", () => {
    expect(cards.map((c) => c.id)).toEqual(["4290000001", "4290000002", "4290000003", "4290000004"]);
  });

  it("extracts title, company, location, time and canonical link", () => {
    const [first] = cards;
    expect(first).toMatchObject({
      title: "Software Engineer I",
      company: "Acme Analytics",
      companyUrl: "https://www.linkedin.com/company/acme-analytics",
      location: "Bengaluru, Karnataka, India",
      listedDate: "2026-11-26",
      listedText: "2 hours ago",
      postedAt: "2026-11-26T04:00:00.000Z",
      isNew: true,
      benefits: ["Actively Hiring"],
      url: "https://www.linkedin.com/jobs/view/4290000001",
    });
    expect(first?.companyLogoUrl).toMatch(/^https:\/\/media\.licdn\.com\/dms\/image\//);
  });

  it("drops ghost logos, keeps salary text and decodes entities", () => {
    expect(cards[1]).toMatchObject({ companyLogoUrl: null, companyUrl: null, salaryText: "₹15,000.00/mo - ₹25,000.00/mo", postedAt: "2026-11-25T00:00:00.000Z" });
    expect(cards[3]?.title).toBe("Associate Product Manager & Analyst");
  });

  it("returns [] for the empty fragment LinkedIn sends past the last page", () => {
    expect(parseLinkedInListing("", NOW)).toEqual([]);
    expect(parseLinkedInListing("<!-- no results -->\n", NOW)).toEqual([]);
  });
});

describe("parseLinkedInDetail (guest job-posting fragment)", () => {
  it("off-site apply job: description, criteria, salary and decoded apply URL", () => {
    const d = parseLinkedInDetail(fixture("linkedin/job-posting-offsite.html"), NOW);
    expect(d).toMatchSnapshot();
    expect(d.criteria).toEqual({
      seniority: "Entry level",
      employmentType: "Full-time",
      jobFunction: "Engineering and Information Technology",
      industries: "Software Development",
    });
    expect(d.offsiteApplyUrl).toBe("https://jobs.lever.co/acme-analytics/1b2c3d4e-0000-4000-8000-000000000001/apply?lever-source=LinkedIn");
    expect(d.salaryText).toBe("₹8,00,000.00/yr - ₹12,00,000.00/yr");
    expect(d.descriptionHtml).toContain("<li>Build services in Java and Spring Boot</li>");
    expect(d.closed).toBe(false);
  });

  it("never collects the hiring-team / poster section (personal data)", () => {
    const d = parseLinkedInDetail(fixture("linkedin/job-posting-offsite.html"), NOW);
    expect(JSON.stringify(d)).not.toMatch(/Example Recruiter|\/in\/example-recruiter|Talent Partner/);
  });

  it("Easy Apply job: no off-site URL; internship criteria", () => {
    const d = parseLinkedInDetail(fixture("linkedin/job-posting-easy-apply.html"), NOW);
    expect(d).toMatchSnapshot();
    expect(d.offsiteApplyUrl).toBeNull();
    expect(d.criteria.seniority).toBe("Internship");
  });

  it("closed job is flagged", () => {
    expect(parseLinkedInDetail(fixture("linkedin/job-posting-closed.html"), NOW).closed).toBe(true);
  });

  it("offsiteApplyUrl ignores links that stay on LinkedIn", () => {
    expect(offsiteApplyUrl(`<!--"https://www.linkedin.com/jobs/view/externalApply/1?url=https%3A%2F%2Fin.linkedin.com%2Fjobs"-->`)).toBeNull();
    expect(offsiteApplyUrl(`<!--"https://careers.example.com/job/1"-->`)).toBe("https://careers.example.com/job/1");
    expect(offsiteApplyUrl("")).toBeNull();
    expect(offsiteApplyUrl(`<!--"javascript:alert(1)"-->`)).toBeNull();
  });
});

describe("mapLinkedInJob", () => {
  const cards = parseLinkedInListing(fixture("linkedin/search-page.html"), NOW);
  const offsite = parseLinkedInDetail(fixture("linkedin/job-posting-offsite.html"), NOW);
  const easy = parseLinkedInDetail(fixture("linkedin/job-posting-easy-apply.html"), NOW);

  it("card + detail → RawJob with hints (snapshot) and passes validateRawJob", () => {
    const job = mapLinkedInJob(cards[0]!, offsite, QUERY_E2);
    expect(job).toMatchSnapshot();
    expect(validateRawJob(job)).toEqual([]);
    expect(job).toMatchObject({
      source: "linkedin",
      sourceKind: "job_board",
      sourceJobId: "4290000001",
      sourceUrl: "https://www.linkedin.com/jobs/view/4290000001",
      applyUrl: "https://jobs.lever.co/acme-analytics/1b2c3d4e-0000-4000-8000-000000000001/apply?lever-source=LinkedIn",
      target: null,
      jobType: "full_time",
      experienceLevel: "entry",
      department: "Engineering and Information Technology",
      salaryRaw: "₹8,00,000.00/yr - ₹12,00,000.00/yr",
    });
  });

  it("Easy Apply → applyUrl is the LinkedIn view URL; internship employment type forces level intern", () => {
    const job = mapLinkedInJob(cards[1]!, easy, QUERY_E1_REMOTE);
    expect(job.applyUrl).toBe("https://www.linkedin.com/jobs/view/4290000002");
    expect(job.jobType).toBe("internship");
    expect(job.experienceLevel).toBe("intern");
    expect(job.workMode).toBe("remote");
    expect(job.isRemote).toBe(true);
    expect(validateRawJob(job)).toEqual([]);
  });

  it("light record (no detail): level hint from the single f_E code, no description", () => {
    const job = mapLinkedInJob(cards[2]!, null, QUERY_E2);
    expect(job.descriptionHtml).toBeNull();
    expect(job.experienceLevel).toBe("entry");
    expect(job.jobType).toBeUndefined();
    expect(job.applyUrl).toBe(job.sourceUrl);
    expect(validateRawJob(job)).toEqual([]);
  });

  it("no hint for ambiguous seniority (Mid-Senior / Associate) or without an f_E filter", () => {
    const mid = { ...offsite, criteria: { ...offsite.criteria, seniority: "Mid-Senior level", employmentType: null } };
    expect(mapLinkedInJob(cards[0]!, mid, QUERY_E2).experienceLevel).toBeUndefined();
    expect(mapLinkedInJob(cards[0]!, null, { ...QUERY_E2, experience: null }).experienceLevel).toBeUndefined();
    expect(mapLinkedInJob(cards[0]!, null, { ...QUERY_E2, experience: "4" }).experienceLevel).toBeUndefined();
  });
});

describe("helpers", () => {
  it("postedAtFrom prefers sub-day labels, else the datetime date, and never returns the future", () => {
    expect(postedAtFrom("2026-11-26", "35 minutes ago", NOW)).toBe("2026-11-26T05:25:00.000Z");
    expect(postedAtFrom("2026-11-24", "2 days ago", NOW)).toBe("2026-11-24T00:00:00.000Z");
    expect(postedAtFrom(null, "2 days ago", NOW)).toBe("2026-11-24T06:00:00.000Z");
    expect(postedAtFrom("2026-11-27", "1 day ago", NOW)).toBe(NOW.toISOString());
    expect(postedAtFrom(null, null, NOW)).toBeNull();
  });

  it("companyPageUrl canonicalises LinkedIn company links only", () => {
    expect(companyPageUrl("https://in.linkedin.com/company/acme?trk=x")).toBe("https://www.linkedin.com/company/acme");
    expect(companyPageUrl("https://example.com/company/acme")).toBeNull();
    expect(companyPageUrl(undefined)).toBeNull();
  });

  it("search URLs carry the documented guest-API parameters", () => {
    const cfg = linkedInConfigFromEnv({});
    const url = new URL(linkedInSearchUrl(QUERY_E1_REMOTE, cfg, 25));
    expect(url.origin + url.pathname).toBe("https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      keywords: "data analyst",
      location: "India",
      f_TPR: "r86400",
      f_E: "1",
      f_WT: "2",
      sortBy: "DD",
      start: "25",
    });
  });

  it("default plan = 13 keywords × f_E {1,2}; env overrides and 'any' drops the filter", () => {
    expect(linkedInConfigFromEnv({}).plan).toHaveLength(26);
    const cfg = linkedInConfigFromEnv({ LINKEDIN_KEYWORDS: "sde, qa ;devops", LINKEDIN_EXPERIENCE: "any", LINKEDIN_WORK_TYPES: "2,3,9" });
    expect(cfg.plan.map((q) => q.key)).toEqual(["sde|WT23", "qa|WT23", "devops|WT23"]);
    expect(linkedInConfigFromEnv({ LINKEDIN_MAX_REQ_PER_RUN: "999" }).maxRequests).toBe(60);
    expect(linkedInConfigFromEnv({ LINKEDIN_TIME_POSTED: "bogus" }).timePosted).toBe("r86400");
  });
});

