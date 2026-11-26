import { beforeEach, describe, expect, it } from "vitest";
import { RobotsDisallowedError } from "@easyjobs/contract/node";
import { validateRawJob } from "@easyjobs/contract";
import { resetSharedLimiters } from "../src/lib/limiter";
import { avatureBase, avatureToRawJob, parseAvatureDetail, parseAvatureList, avatureScraper } from "../src/avature/scraper";
import { icimsDescription, icimsScraper, parseIcimsSearch } from "../src/icims/scraper";
import { parsePhenomDetail, parsePhenomSearch, phenomBaseFrom, phenomScraper, phenomToRawJob } from "../src/phenom/scraper";
import { parseRmkSearch, rmkSearchUrl, successFactorsScraper } from "../src/successfactors/scraper";
import { findPortalNumber, parseTaleoToken, rowFromRequisition, taleoDescription, taleoScraper } from "../src/taleo/scraper";
import { newStats } from "../src/lib/run";
import { collect, ctxFor, fixture, html, json, mockHttp, NOW, target } from "./helpers";

beforeEach(() => resetSharedLimiters());
const drift = { stats: newStats(), drift: () => undefined };

describe("successfactors (RMK)", () => {
  it("parses real EY search rows and the result total", () => {
    const { rows, total } = parseRmkSearch(fixture("successfactors/ey-search.html"), "https://careers.ey.com");
    expect(total).toBe(9713);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({ title: "AI & Machine Learning Engineering Consultant - Databricks - Senior - Consulting - Location OPEN", location: "New York, NY, US, 10001-8604" });
    expect(rows[0]?.url).toMatch(/^https:\/\/careers\.ey\.com\/ey\/job\/.+\/1451882433\/$/);
  });

  it("lists via search pages, details via microdata, and drops q= when robots.txt forbids it", async () => {
    const searchPage = fixture("successfactors/ey-search.html");
    const job = fixture("successfactors/ey-job.html");
    const http = mockHttp((url) => {
      if (url.pathname === "/search/") {
        if (url.search.includes("q=")) throw new RobotsDisallowedError(url.toString());
        return html(url.searchParams.get("startrow") === "0" ? searchPage.replace("<b>9713</b>", "<b>3</b>") : "<html></html>");
      }
      if (url.pathname.includes("/job/")) return html(job);
      return undefined;
    });
    const t = target({ slug: "ey", ats: "successfactors", token: "https://careers.ey.com/" });
    const { jobs, error } = await collect(successFactorsScraper.scrape(ctxFor(http, [t], { isKnown: (id) => id.endsWith(":1451882433") })));
    expect(error).toBeNull();
    expect(jobs).toHaveLength(3);
    expect(jobs[0]).toMatchObject({ source: "successfactors", descriptionHtml: null, locations: ["New York, NY, US, 10001-8604"] });
    expect(jobs[1]?.descriptionHtml).toContain("Privacy assessments");
    expect(jobs.every((j) => validateRawJob(j).length === 0)).toBe(true);
    expect(http.calls.filter((c) => c.url.includes("/search/")).every((c) => !c.url.includes("q=") || c.url === rmkSearchUrl("https://careers.ey.com", 0, true))).toBe(true);
  });
});

describe("phenom", () => {
  it("finds the locale base", () => {
    expect(phenomBaseFrom("https://careers.adobe.com/us/en/search-results")).toBe("https://careers.adobe.com/us/en");
    expect(phenomBaseFrom("https://jobs.thermofisher.com/global/en")).toBe("https://jobs.thermofisher.com/global/en");
    expect(phenomBaseFrom("https://careers.adobe.com/")).toBeNull();
  });

  it("parses the real Adobe search blob and job detail; apply URL is the underlying ATS posting", () => {
    const search = parsePhenomSearch(fixture("phenom/adobe-search.html"), drift)!;
    expect(search.total).toBe(260);
    expect(search.jobs).toHaveLength(3);
    const list = search.jobs[0]!;
    const site = { base: "https://careers.adobe.com/us/en", host: "careers.adobe.com" };
    const t = target({ slug: "adobe", ats: "phenom", token: site.base, name: "Adobe" });
    const light = phenomToRawJob(site, t, list, null, null, NOW);
    expect(validateRawJob(light)).toEqual([]);
    expect(light).toMatchObject({ sourceJobId: "careers.adobe.com:R173423", jobType: "full_time", descriptionHtml: null });
    expect(light.sourceUrl).toBe("https://careers.adobe.com/us/en/job/R173423/Engineering-Manager-Site-Reliability-Developer-Experience");
    expect(light.applyUrl).toMatch(/^https:\/\/adobe\.wd5\.myworkdayjobs\.com\//);
    expect(light.skills?.length).toBeGreaterThan(3);

    const detail = parsePhenomDetail(fixture("phenom/adobe-job.html"))!;
    expect(detail.title).toBe("Sr. Compensation Business Partner");
    const full = phenomToRawJob(site, t, detail, detail, null, NOW);
    expect(full.descriptionHtml).toContain("The Opportunity");
    // Phenom job data carries recruiter names/emails — never copied into RawJob.
    expect(JSON.stringify(full)).not.toMatch(/talentCoordinator|hiringLastName|emailWork|@adobe\.com/i);
  });

  it("falls back to the sitemap crawl when the search blob is missing", async () => {
    const http = mockHttp((url) => {
      if (url.pathname.endsWith("/search-results")) return html("<html>no data</html>");
      if (url.pathname === "/robots.txt") return html("");
      if (url.pathname.endsWith("sitemap.xml")) return html('<urlset><url><loc>https://jobs.x.test/global/en/job/R1/Analyst</loc></url></urlset>');
      if (url.pathname.includes("/job/R1")) return html(fixture("jsonld/adobe-job.html"));
      return html("", 404);
    });
    const t = target({ slug: "x", ats: "phenom", token: "https://jobs.x.test/global/en" });
    const { jobs, error } = await collect(phenomScraper.scrape(ctxFor(http, [t])));
    expect(error).toBeNull();
    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.source).toBe("phenom");
  });
});

describe("avature", () => {
  it("parses real Bloomberg cards and detail fields", () => {
    expect(avatureBase("https://bloomberg.avature.net/careers/SearchJobs?x=1")).toBe("https://bloomberg.avature.net/careers");
    const { cards, total } = parseAvatureList(fixture("avature/bloomberg-list.html"), "https://bloomberg.avature.net/careers");
    expect(total).toBe(315);
    expect(cards[0]).toEqual({ url: "https://bloomberg.avature.net/careers/JobDetail/Freelance-Podcast-Producer-Contract/46342", title: "Freelance Podcast Producer, Contract", location: "London, United Kingdom" });
    const d = parseAvatureDetail(fixture("avature/bloomberg-job.html"));
    expect(d.fields).toMatchObject({ Location: "London", "Business Area": "News and Media", "Ref #": "10055231" });
    expect(d.descriptionHtml).toContain("Bloomberg Media seeks");
    const job = avatureToRawJob(target({ slug: "bloomberg", ats: "avature", token: "https://bloomberg.avature.net/careers" }), cards[0]!, d, NOW);
    expect(validateRawJob(job)).toEqual([]);
    expect(job).toMatchObject({ sourceJobId: "bloomberg.avature.net:46342", department: "News and Media", locations: ["London"] });
    expect(job.jobType).toBeUndefined(); // no structured employment field — title keywords are the normalizer's job
  });

  it("Deloitte-style card: employer spans skipped, 'Multiple Locations' treated as unknown", () => {
    const card = `<article class="article--result "><div class="article__header__text"><h3><a href="https://apply.deloitte.com/en_US/careers/JobDetail/Tax-Consultant/376641" class="link"> Tax Consultant </a></h3><div class="article__header__text__subtitle"> <span> Deloitte US </span> | <span> Deloitte Tax LLP </span> | <span>Multiple Locations</span> </div></div></article>
    <article class="article--result "><div class="article__header__text"><h3><a href="https://apply.deloitte.com/en_US/careers/JobDetail/Analyst/376700" class="link"> Analyst </a></h3><div class="article__header__text__subtitle"><span> Deloitte US </span> | <span>Hyderabad, India</span></div></div></article>`;
    const { cards } = parseAvatureList(card, "https://apply.deloitte.com/careers");
    expect(cards.map((c) => c.location)).toEqual([null, "Hyderabad, India"]);
  });

  it("pages with jobOffset and stops when a page repeats", async () => {
    const list = fixture("avature/bloomberg-list.html");
    const http = mockHttp((url) => {
      if (url.pathname.endsWith("/SearchJobs/")) return html(list);
      if (url.pathname.includes("/JobDetail/")) return html(fixture("avature/bloomberg-job.html"));
      return undefined;
    });
    const t = target({ slug: "bloomberg", ats: "avature", token: "https://bloomberg.avature.net/careers" });
    const { jobs, error } = await collect(avatureScraper.scrape(ctxFor(http, [t])));
    expect(error).toBeNull();
    expect(jobs).toHaveLength(3);
    expect(http.calls.filter((c) => c.url.includes("SearchJobs"))).toHaveLength(2);
  });
});

describe("icims (synthetic, layout-based)", () => {
  const search = `<div class="iCIMS_JobsTable"><div class="row"><a class="iCIMS_Anchor" href="https://careers-acme.icims.com/jobs/1234/software-engineer/job?in_iframe=1"><span class="sr-only">Title</span><h3>Software Engineer</h3></a>
    <div class="header"><span>Job Locations</span></div><span>IN-KA-Bengaluru</span></div>
    <div class="row"><a href="https://careers-acme.icims.com/jobs/1300/data-analyst-intern/job?in_iframe=1"><h3>Data Analyst Intern</h3></a></div></div>`;
  it("parses job rows", () => {
    const rows = parseIcimsSearch(search, "https://careers-acme.icims.com");
    expect(rows.map((r) => [r.id, r.title, r.location])).toEqual([
      ["1234", "Software Engineer", "IN-KA-Bengaluru"],
      ["1300", "Data Analyst Intern", null],
    ]);
    expect(rows[0]?.url).toBe("https://careers-acme.icims.com/jobs/1234/software-engineer/job");
  });
  it("uses JSON-LD on job pages, else the iCIMS content block", async () => {
    expect(icimsDescription('<div class="iCIMS_JobContent"><div><p>Build</p></div></div>')).toBe("<div><p>Build</p></div>");
    const http = mockHttp((url) => {
      if (url.pathname === "/jobs/search") return html(url.searchParams.get("pr") === "0" ? search : "<html></html>");
      if (url.pathname.startsWith("/jobs/1234")) return html(`<script type="application/ld+json">{"@type":"JobPosting","title":"Software Engineer","datePosted":"2026-11-20","description":"<p>LD</p>"}</script>`);
      if (url.pathname.startsWith("/jobs/1300")) return html('<div class="iCIMS_JobContent"><p>Intern role</p></div>');
      return undefined;
    });
    const t = target({ slug: "acme", ats: "icims", token: "https://careers-acme.icims.com/jobs" });
    const { jobs, error } = await collect(icimsScraper.scrape(ctxFor(http, [t])));
    expect(error).toBeNull();
    expect(jobs.map((j) => [j.sourceJobId, j.descriptionHtml])).toEqual([
      ["careers-acme.icims.com:1234", "<p>LD</p>"],
      ["careers-acme.icims.com:1300", "<p>Intern role</p>"],
    ]);
  });
});

describe("taleo (synthetic, REST layout)", () => {
  it("parses tokens, portal numbers, requisition columns and initialHistory", () => {
    expect(parseTaleoToken("https://acme.taleo.net/careersection/ext/jobsearch.ftl?lang=en")).toEqual({ origin: "https://acme.taleo.net", section: "ext", lang: "en" });
    expect(findPortalNumber("…/careersection/rest/jobboard/searchjobs?lang=en&portal=101430233…")).toBe("101430233");
    expect(rowFromRequisition({ jobId: "77", contestNo: "REQ-9", column: ["Software Engineer", '["Pune, India"]', "Nov 20, 2026"] })).toEqual({ id: "77", contestNo: "REQ-9", title: "Software Engineer", location: "Pune, India", date: "Nov 20, 2026" });
    const value = ["x", encodeURIComponent("<p>Build &amp; ship</p><ul><li>Go</li></ul>"), "y"].join("!|!");
    expect(taleoDescription(`<input type="hidden" id="initialHistory" value="${value}">`)).toBe("<p>Build &amp; ship</p><ul><li>Go</li></ul>");
  });

  it("lists through the jobboard REST search and pages by totalCount", async () => {
    const reqs = (from: number, n: number) => Array.from({ length: n }, (_, i) => ({ jobId: String(from + i), contestNo: `R${from + i}`, column: [`Role ${from + i}`, "Pune, India", "Nov 20, 2026"] }));
    const http = mockHttp((url, call) => {
      if (url.pathname.endsWith("jobsearch.ftl")) return html("<script>var url='/careersection/rest/jobboard/searchjobs?lang=en&portal=555555';</script>");
      if (url.pathname.endsWith("/searchjobs")) {
        const pageNo = (call.body as { pageNo: number }).pageNo;
        return json({ requisitionList: pageNo === 1 ? reqs(1, 25) : reqs(26, 5), pagingData: { totalCount: 30, pageSize: 25 } });
      }
      if (url.pathname.endsWith("jobdetail.ftl")) return html(`<input id="initialHistory" value="${encodeURIComponent("<p>Details</p>")}">`);
      return undefined;
    });
    const t = target({ slug: "acme", ats: "taleo", token: "https://acme.taleo.net/careersection/ext/jobsearch.ftl" });
    const { jobs, error } = await collect(taleoScraper.scrape(ctxFor(http, [t], { env: { ATS_ENTERPRISE_STATE_DIR: "off", TALEO_MAX_DETAILS: "2" } })));
    expect(error).toBeNull();
    expect(jobs).toHaveLength(2); // budget 2, the rest deferred
    expect(jobs[0]).toMatchObject({ sourceJobId: "acme.taleo.net:R1", descriptionHtml: "<p>Details</p>", locations: ["Pune, India"] });
    expect(http.calls.filter((c) => c.url.includes("/searchjobs")).map((c) => (c.body as { pageNo: number }).pageNo)).toEqual([1, 2]);
  });
});
