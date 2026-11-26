import { describe, expect, it } from "vitest";
import { ATS_TYPES, type AtsType } from "@easyjobs/contract";
import { detectAts, detectAtsFromUrl, isValidToken, TOKEN_RULES } from "../src/ats";

const best = (html: string, url = "https://example.com/careers", domainHint?: string): { ats: AtsType; token: string } | null => {
  const d = detectAts({ url, html, domainHint })[0];
  return d ? { ats: d.ats, token: d.token } : null;
};

describe("detectAtsFromUrl", () => {
  it.each<[string, AtsType, string]>([
    ["https://boards.greenhouse.io/stripe/jobs/6123456", "greenhouse", "stripe"],
    ["https://job-boards.greenhouse.io/razorpaysoftwareprivatelimited", "greenhouse", "razorpaysoftwareprivatelimited"],
    ["https://boards.greenhouse.io/embed/job_app?for=Airbnb&token=123", "greenhouse", "airbnb"],
    ["https://boards-api.greenhouse.io/v1/boards/figma/jobs?content=true", "greenhouse", "figma"],
    ["https://jobs.lever.co/cred/7f1c-uuid", "lever", "cred"],
    ["https://jobs.eu.lever.co/mistral", "lever", "eu:mistral"],
    ["https://api.lever.co/v0/postings/palantir?mode=json", "lever", "palantir"],
    ["https://jobs.ashbyhq.com/notion/1234-uuid", "ashby", "notion"],
    ["https://api.ashbyhq.com/posting-api/job-board/openai", "ashby", "openai"],
    ["https://jobs.smartrecruiters.com/Freshworks/744000-senior-pm", "smartrecruiters", "Freshworks"],
    ["https://jobs.smartrecruiters.com/oneclick-ui/company/BoschGroup/publication/abc", "smartrecruiters", "BoschGroup"],
    ["https://apply.workable.com/huggingface/j/ABCDEF/", "workable", "huggingface"],
    ["https://bunq.recruitee.com/o/backend-engineer", "recruitee", "bunq"],
    ["https://zapier.bamboohr.com/careers/12", "bamboohr", "zapier"],
    ["https://personio.jobs.personio.de/job/123", "personio", "personio"],
    ["https://acme.breezy.hr/p/abc-engineer", "breezy", "acme"],
    ["https://acme.teamtailor.com/jobs/123-engineer", "teamtailor", "acme"],
    ["https://nvidia.wd5.myworkdayjobs.com/en-US/NVIDIAExternalCareerSite/job/US-CA/Engineer_JR123", "workday", "https://nvidia.wd5.myworkdayjobs.com/NVIDIAExternalCareerSite"],
    ["https://wd3.myworkdaysite.com/recruiting/stmicroelectronics/ST_Careers", "workday", "https://stmicroelectronics.wd3.myworkdayjobs.com/ST_Careers"],
    ["https://intel.wd1.myworkdayjobs.com/wday/cxs/intel/External/jobs", "workday", "https://intel.wd1.myworkdayjobs.com/External"],
    ["https://jpmc.fa.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX_1001/job/210000", "oracle", "https://jpmc.fa.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX_1001"],
    ["https://career10.successfactors.com/career?company=AcmeP&career_ns=job_listing", "successfactors", "https://career10.successfactors.com/career?company=AcmeP"],
    ["https://careers-acme.icims.com/jobs/1234/engineer/job", "icims", "https://careers-acme.icims.com/jobs"],
    ["https://acme.avature.net/careers/JobDetail/123", "avature", "https://acme.avature.net/careers"],
    ["https://acme.taleo.net/careersection/2/jobdetail.ftl?job=123", "taleo", "https://acme.taleo.net/careersection/2/jobsearch.ftl"],
    ["https://acme.zohorecruit.com/jobs/Careers/123", "zoho_recruit", "acme"],
    ["https://acme.zohorecruit.in/jobs/Careers", "zoho_recruit", "https://acme.zohorecruit.in/jobs/Careers"],
    ["https://acme.keka.com/careers/jobdetails/123", "keka", "acme"],
    ["https://airtel.darwinbox.in/ms/candidate/careers", "darwinbox", "airtel"],
    ["https://acme.freshteam.com/jobs/abc123/engineer", "freshteam", "acme"],
    ["https://aexp.eightfold.ai/careers?domain=aexp.com", "eightfold", "https://aexp.eightfold.ai|aexp.com"],
  ])("%s → %s:%s", (url, ats, token) => {
    expect(detectAtsFromUrl(url)).toMatchObject({ ats, token });
  });

  it("returns null for company sites and vendor home pages", () => {
    expect(detectAtsFromUrl("https://careers.google.com/jobs/results/")).toBeNull();
    expect(detectAtsFromUrl("https://www.greenhouse.io/")).toBeNull();
    expect(detectAtsFromUrl("https://boards.greenhouse.io/embed/job_board")).toBeNull();
    expect(detectAtsFromUrl("https://www.workable.com/pricing")).toBeNull();
    expect(detectAtsFromUrl("not a url at all")).toBeNull();
  });
});

describe("detectAts on HTML", () => {
  it("finds an embedded Greenhouse board", () => {
    expect(best(`<div id="grnhse_app"></div><script src="https://boards.greenhouse.io/embed/job_board/js?for=databricks"></script>`)).toEqual({ ats: "greenhouse", token: "databricks" });
  });
  it("unescapes JSON-encoded URLs", () => {
    expect(best(`<script>window.__DATA__={"url":"https:\\/\\/jobs.lever.co\\/meesho"}</script>`)).toEqual({ ats: "lever", token: "meesho" });
  });
  it("decodes percent-encoded redirect targets", () => {
    expect(best(`<a href="/out?u=https%3A%2F%2Fjobs.ashbyhq.com%2Flinear">Jobs</a>`)).toEqual({ ats: "ashby", token: "linear" });
  });
  it("prefers the redirect chain over page links", () => {
    const d = detectAts({
      url: "https://jobs.lever.co/acme",
      urls: ["https://acme.com/careers"],
      html: `<a href="https://boards.greenhouse.io/other">old board</a>`,
    });
    expect(d[0]).toMatchObject({ ats: "lever", token: "acme" });
  });
  it("ranks repeated evidence above a single stray link", () => {
    const html = `${'<a href="https://jobs.lever.co/acme/1">a</a>'.repeat(4)}<a href="https://boards.greenhouse.io/partner">partner</a>`;
    expect(best(html)).toEqual({ ats: "lever", token: "acme" });
  });
  it("detects Phenom sites by their app markers and keeps the locale base", () => {
    expect(best(`<script>var phApp = phApp || {"widgetApiEndpoint":"x"}</script>`, "https://careers.acme.com/us/en/search-results")).toEqual({
      ats: "phenom",
      token: "https://careers.acme.com/us/en",
    });
  });
  it("detects Eightfold career sites and reads the domain parameter", () => {
    expect(best(`<script>fetch("/api/apply/v2/jobs?domain=acme.com&start=0")</script>`, "https://careers.acme.com/careers")).toEqual({
      ats: "eightfold",
      token: "https://careers.acme.com|acme.com",
    });
  });
  it("falls back to the company domain hint for Eightfold-hosted pages", () => {
    expect(best(`<link href="https://acme.eightfold.ai/careers">`, "https://acme.com/jobs", "acme.com")).toEqual({
      ats: "eightfold",
      token: "https://acme.eightfold.ai|acme.com",
    });
  });
  it("detects SuccessFactors RMK sites", () => {
    expect(best(`<link rel="stylesheet" href="https://rmkcdn.successfactors.com/abc/main.css">`, "https://jobs.acme.com/")).toEqual({
      ats: "successfactors",
      token: "https://jobs.acme.com/",
    });
  });
  it("detects custom-domain Zoho Recruit portals", () => {
    expect(best(`<iframe src="/recruit/x?servicename=ZohoRecruit&amp;_hn=true"></iframe>`, "https://careers.acme.com/portal")).toEqual({
      ats: "zoho_recruit",
      token: "https://careers.acme.com/",
    });
  });
  it("uses JSON-LD JobPosting as a last resort", () => {
    expect(best(`<script type="application/ld+json">{"@type": "JobPosting","title":"x"}</script>`, "https://acme.com/jobs/1")).toEqual({
      ats: "jsonld",
      token: "https://acme.com/jobs/1",
    });
  });
  it("ignores vendor marketing links and reserved paths", () => {
    expect(best(`<a href="https://www.greenhouse.io/">Powered by Greenhouse</a><a href="https://boards.greenhouse.io/embed/job_board">x</a>`)).toBeNull();
  });
});

describe("token formats (§0.6)", () => {
  it("has a rule for every ATS type", () => {
    for (const ats of ATS_TYPES) expect(TOKEN_RULES[ats]).toBeDefined();
  });
  it.each<[AtsType, string, boolean]>([
    ["greenhouse", "stripe", true],
    ["greenhouse", "Stripe", false],
    ["greenhouse", "https://boards.greenhouse.io/stripe", false],
    ["lever", "palantir", true],
    ["lever", "eu:mistral", true],
    ["lever", "us:mistral", false],
    ["ashby", "openai", true],
    ["smartrecruiters", "Visa", true],
    ["workable", "huggingface", true],
    ["recruitee", "bunq", true],
    ["recruitee", "Bad_Sub", false],
    ["teamtailor", "https://careers.acme.com", true],
    ["workday", "https://nvidia.wd5.myworkdayjobs.com/NVIDIAExternalCareerSite", true],
    ["workday", "https://nvidia.wd5.myworkdayjobs.com/en-US/NVIDIAExternalCareerSite", false],
    ["workday", "nvidia", false],
    ["oracle", "https://eeho.fa.us2.oraclecloud.com/hcmUI/CandidateExperience/en/sites/jobsearch", true],
    ["oracle", "https://eeho.fa.us2.oraclecloud.com/careers", false],
    ["eightfold", "https://explore.jobs.netflix.net|netflix.com", true],
    ["eightfold", "https://explore.jobs.netflix.net", false],
    ["phenom", "https://careers.adobe.com/us/en", true],
    ["custom", "http://insecure.example.com", false],
    ["custom", "https://www.amazon.jobs/en/", true],
    ["greenhouse", "", false],
    ["greenhouse", "has space", false],
  ])("%s %s → %s", (ats, token, ok) => {
    expect(isValidToken(ats, token)).toBe(ok);
  });
});
