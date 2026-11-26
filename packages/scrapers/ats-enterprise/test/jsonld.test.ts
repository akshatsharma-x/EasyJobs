import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { validateRawJob } from "@easyjobs/contract";
import { canonicalPageUrl, isLikelyJobUrl, jobIdFromUrl } from "../src/lib/joburl";
import { collectTypedNodes, findJobPostings, isJobPosting, jobPostingToFields, parseBaseSalary, parseJsonLenient, type JsonObject } from "../src/lib/jsonld";
import { resetSharedLimiters } from "../src/lib/limiter";
import { extractMicrodataJobPosting } from "../src/lib/microdata";
import { parseSitemap, sitemapsFromRobots } from "../src/lib/sitemap";
import { orderChildSitemaps } from "../src/jsonld/discover";
import { orderByLastmod } from "../src/jsonld/engine";
import { pageToRawJob, parseJobPage } from "../src/jsonld/page";
import { jsonldScraper } from "../src/jsonld/scraper";
import { collect, ctxFor, fixture, html, mockHttp, NOW, target } from "./helpers";

const t = target({ slug: "acme", ats: "jsonld", token: "https://jobs.acme.test/", name: "Acme" });
const page = (blocks: string[], body = ""): string => `<html><head>${blocks.map((b) => `<script type="application/ld+json">${b}</script>`).join("\n")}</head><body>${body}</body></html>`;
const fieldsOf = (node: unknown) => jobPostingToFields(node as JsonObject, "https://jobs.acme.test/job/1", NOW);

beforeEach(() => resetSharedLimiters());

describe("real career-site pages", () => {
  it("Boeing (Radancy): placeholder baseSalary ignored, 'Regular Full-Time' mapped", () => {
    const url = "https://jobs.boeing.com/job/wichita/spirit-defense-assembly-mechanic-underwing/185/95642229872";
    const parsed = parseJobPage(fixture("jsonld/boeing-job.html"), url, NOW)!;
    expect(parsed.via).toBe("jsonld");
    const job = pageToRawJob("jsonld", target({ slug: "boeing", ats: "jsonld", token: "https://jobs.boeing.com/" }), url, parsed);
    expect(validateRawJob(job)).toEqual([]);
    expect(job).toMatchObject({
      sourceJobId: "jobs.boeing.com:95642229872",
      title: "Spirit Defense - Assembly Mechanic - Underwing",
      locations: ["Wichita, Kansas, United States"],
      postedAt: "2026-11-25T12:00:00.000Z",
      jobType: "full_time",
      employmentTypeRaw: "Regular Full-Time",
      companyLogoUrl: "https://tbcdn.talentbrew.com/company/185/v2_1/img/Boeing_112x112.png",
    });
    expect(job.salary).toBeUndefined();
    expect(job.extra?.jsonld).toMatchObject({ identifier: "2026-16777", hiringOrganization: "Boeing" });
  });

  it("Citi: numeric region codes dropped, alpha-2 country expanded, education → degrees", () => {
    const url = "https://jobs.citi.com/job/ciudad-de-mexico/interoperability-engineering-and-adoption-tech-lead/287/103787646720";
    const f = parseJobPage(fixture("jsonld/citi-job.html"), url, NOW)!.fields;
    expect(f.locations).toEqual(["Ciudad De Mexico, Mexico"]);
    expect(f.degrees).toEqual(["Bachelor’s/University degree, Master’s degree preferred"]);
  });

  it("Adobe (Phenom): entity-escaped description decoded, occupationalCategory → department", () => {
    const url = "https://careers.adobe.com/us/en/job/R172284/Sr-Compensation-Business-Partner";
    const f = parseJobPage(fixture("jsonld/adobe-job.html"), url, NOW)!.fields;
    expect(f.descriptionHtml?.startsWith("<h1><b>The Opportunity</b></h1>")).toBe(true);
    expect(f.department).toBe("Employee Experience");
    expect(f.jobType).toBe("full_time");
    expect(f.locations).toEqual(["San Jose, California, United States of America"]);
    expect(f.identifier).toBe("R172284");
  });

  it("EY (SuccessFactors RMK): schema.org microdata → same fields", () => {
    const node = extractMicrodataJobPosting(fixture("successfactors/ey-job.html"))!;
    expect(node.title).toBe("Assistant Director - Data Privacy - EY GDS");
    const f = fieldsOf(node);
    expect(f.postedAt).toBe("2026-11-12T02:00:00.000Z");
    expect(f.locations).toEqual(["CABA, Argentina"]);
    expect(f.hiringOrganization).toBe("EY");
    expect(f.descriptionHtml).toContain("<li>Privacy assessments</li>");
  });
});

describe("JSON-LD edge cases", () => {
  const posting = { "@type": "JobPosting", title: "Data Analyst", datePosted: "2026-11-20", jobLocation: { "@type": "Place", address: { addressLocality: "Pune", addressRegion: "MH", addressCountry: "IN" } } };

  it("finds postings inside @graph, arrays and nested mainEntity", () => {
    const graph = JSON.stringify({ "@context": "https://schema.org", "@graph": [{ "@type": "WebSite" }, posting] });
    const arr = JSON.stringify([{ "@type": "Organization" }, posting]);
    const nested = JSON.stringify({ "@type": "WebPage", mainEntity: posting });
    for (const block of [graph, arr, nested]) expect(findJobPostings(page([block])).postings).toHaveLength(1);
    expect(isJobPosting({ "@type": ["Thing", "http://schema.org/JobPosting"] })).toBe(true);
    expect(isJobPosting({ "@type": "schema:JobPosting" })).toBe(true);
    expect(collectTypedNodes([[{ "@type": "A" }], { x: { "@type": "B" } }]).map((n) => n["@type"])).toEqual(["A", "B"]);
  });

  it.each([
    ["trailing commas", '{"@type":"JobPosting","title":"A",}'],
    ["raw newline in a string", '{"@type":"JobPosting","title":"A","description":"line1\nline2"}'],
    ["invalid \\' escape", '{"@type":"JobPosting","title":"Engineer\\\'s role"}'],
    ["HTML comment wrapper", '<!-- {"@type":"JobPosting","title":"A"} -->'],
    ["CDATA wrapper", '//<![CDATA[\n{"@type":"JobPosting","title":"A"}\n//]]>'],
    ["trailing semicolon", '{"@type":"JobPosting","title":"A"};'],
    ["two concatenated objects", '{"@type":"Organization","name":"X"}{"@type":"JobPosting","title":"A"}'],
  ])("lenient parsing: %s", (_name, raw) => {
    const scan = findJobPostings(page([raw]));
    expect(scan.postings).toHaveLength(1);
    expect(scan.malformed).toBe(0);
  });

  it("counts blocks that cannot be salvaged", () => {
    expect(parseJsonLenient("{not json at all")).toBeUndefined();
    const scan = findJobPostings(page(["{not json", JSON.stringify(posting)]));
    expect(scan).toMatchObject({ blocks: 2, malformed: 1 });
    expect(scan.postings).toHaveLength(1);
  });

  it("double-escaped descriptions are decoded", () => {
    expect(fieldsOf({ ...posting, description: "&amp;lt;p&amp;gt;Hello &amp;amp; welcome&amp;lt;/p&amp;gt;" }).descriptionHtml).toBe("<p>Hello & welcome</p>");
  });

  it("TELECOMMUTE with applicantLocationRequirements → remote locations", () => {
    const f = fieldsOf({ "@type": "JobPosting", title: "Remote SRE", jobLocationType: "TELECOMMUTE", applicantLocationRequirements: [{ "@type": "Country", name: "India" }] });
    expect(f).toMatchObject({ isRemote: true, workMode: "remote", locations: ["Remote - India"] });
    expect(fieldsOf({ "@type": "JobPosting", title: "R", jobLocationType: ["TELECOMMUTE"] }).locations).toEqual(["Remote"]);
  });

  it.each([
    ["min/max yearly", { currency: "INR", value: { minValue: 1200000, maxValue: 1800000, unitText: "YEAR" } }, { min: 1200000, max: 1800000, currency: "INR", period: "year" }],
    ["single monthly value as string", { currency: "inr", value: { value: "25,000", unitText: "MONTH" } }, { min: 25000, max: 25000, currency: "INR", period: "month" }],
    ["hourly", { currency: "USD", value: { minValue: 26.49, maxValue: 33.17, unitText: "HOUR" } }, { min: 26.49, max: 33.17, period: "hour" }],
    ["weekly → yearly", { currency: "GBP", value: { value: 500, unitText: "WEEK" } }, { min: 26000, max: 26000, period: "year" }],
    ["swapped bounds", { currency: "EUR", value: { minValue: 90000, maxValue: 60000, unitText: "YEAR" } }, { min: 60000, max: 90000 }],
  ])("baseSalary: %s", (_name, baseSalary, expected) => {
    expect(parseBaseSalary(baseSalary).salary).toMatchObject(expected);
  });

  it("baseSalary placeholders and unit-less values never become a salary", () => {
    expect(parseBaseSalary({ "@type": "MonetaryAmount", currency: "", value: { "@type": "QuantitativeValue", unitText: "" } })).toEqual({ salary: null, raw: null });
    expect(parseBaseSalary({ currency: "USD", value: { minValue: 0, maxValue: 0 } }).salary).toBeNull();
    const noUnit = parseBaseSalary({ currency: "USD", value: { minValue: 100000, maxValue: 150000 } });
    expect(noUnit.salary).toBeNull();
    expect(noUnit.raw).toBe("USD 100000–150000");
  });

  it("experience months, credentials, identifiers, skills, logo", () => {
    const f = fieldsOf({
      ...posting,
      experienceRequirements: { "@type": "OccupationalExperienceRequirements", monthsOfExperience: 18 },
      educationRequirements: { "@type": "EducationalOccupationalCredential", credentialCategory: "bachelor degree" },
      identifier: { "@type": "PropertyValue", name: "Acme", value: 42 },
      skills: "Python, SQL; Tableau",
      hiringOrganization: { "@type": "Organization", name: "Acme Corp", logo: { "@type": "ImageObject", url: "/logo.png" } },
      validThrough: "2026-12-31T23:59:59Z",
      employmentType: ["FULL_TIME", "INTERN"],
    });
    expect(f).toMatchObject({
      experienceRaw: "18 months",
      experienceMin: 1.5,
      degrees: ["bachelor degree"],
      identifier: "42",
      skills: ["Python", "SQL", "Tableau"],
      hiringOrganization: "Acme Corp",
      companyLogoUrl: "https://jobs.acme.test/logo.png",
      validThrough: "2026-12-31T23:59:59.000Z",
      jobType: "internship",
      locations: ["Pune, MH, India"],
    });
  });

  it("picks the posting that matches the page when several are embedded", () => {
    const a = { ...posting, title: "Other", url: "https://jobs.acme.test/job/2" };
    const b = { ...posting, title: "This one", url: "https://jobs.acme.test/job/1/" };
    expect(parseJobPage(page([JSON.stringify([a, b])]), "https://jobs.acme.test/job/1", NOW)?.fields.title).toBe("This one");
  });

  it("future datePosted is clamped to now", () => {
    expect(fieldsOf({ ...posting, datePosted: "2027-01-05T10:00:00Z" }).postedAt).toBe(NOW.toISOString());
  });
});

describe("sitemaps and job URLs", () => {
  it("parses urlsets (Radancy), RMK entities, indexes and text sitemaps", () => {
    const boeing = parseSitemap(fixture("jsonld/boeing-sitemap.xml"));
    expect(boeing.kind).toBe("urlset");
    expect(boeing.entries.filter((e) => isLikelyJobUrl(e.loc))).toHaveLength(4);
    const ey = parseSitemap(fixture("successfactors/ey-sitemap.xml"));
    expect(ey.entries[1]?.loc).toContain("/ey/job/CABA-Policy-&-Standards-Enablement-Lead");
    const idx = parseSitemap('<sitemapindex><sitemap><loc><![CDATA[https://x.test/jobs-1.xml]]></loc><lastmod>2026-11-01</lastmod></sitemap></sitemapindex>');
    expect(idx).toEqual({ kind: "index", entries: [{ loc: "https://x.test/jobs-1.xml", lastmod: "2026-11-01" }] });
    expect(parseSitemap("https://x.test/job/1\nhttps://x.test/job/2\n").kind).toBe("text");
    expect(sitemapsFromRobots("User-agent: *\nSitemap: https://x.test/s.xml\nsitemap:https://x.test/t.xml")).toEqual(["https://x.test/s.xml", "https://x.test/t.xml"]);
  });

  it("orders child sitemaps job-first and urls newest-first", () => {
    const kids = orderChildSitemaps([{ loc: "https://x.test/blog-sitemap.xml", lastmod: null }, { loc: "https://x.test/pages.xml", lastmod: null }, { loc: "https://x.test/jobs-sitemap.xml", lastmod: null }]);
    expect(kids.map((k) => k.loc)).toEqual(["https://x.test/jobs-sitemap.xml", "https://x.test/pages.xml"]);
    const urls = orderByLastmod([{ loc: "a", lastmod: null }, { loc: "b", lastmod: "2026-11-01" }, { loc: "c", lastmod: "2026-11-20" }]);
    expect(urls.map((u) => u.loc)).toEqual(["c", "b", "a"]);
  });

  it.each([
    ["https://jobs.boeing.com/job/wichita/spirit-defense-assembly-mechanic-underwing/185/95642229872", true],
    ["https://careers.ey.com/ey/job/CABA-Assistant-Director/1447631533/", true],
    ["https://careers.adobe.com/us/en/job/R172284/Sr-Compensation-Business-Partner", true],
    ["https://bloomberg.avature.net/careers/JobDetail/Senior-Software-Engineer/46334", true],
    ["https://careers.acme.test/careers/jobdetails?jobId=12345", true],
    ["https://careers.acme.test/apply?jobId=12345", false], // application form, not the posting
    ["https://jobs.sap.com/en/jobs/", false],
    ["https://jobs.boeing.com/category/engineering-jobs/185/11125/1", false],
    ["https://careers.adobe.com/us/en/c/research-jobs", false],
    ["https://jobs.acme.test/jobs/search?q=java", false],
    ["https://jobs.acme.test/job/locations/pune", false],
  ])("isLikelyJobUrl(%s) → %s", (url, expected) => {
    expect(isLikelyJobUrl(url)).toBe(expected);
  });

  it("stable ids from URLs", () => {
    expect(jobIdFromUrl("https://jobs.boeing.com/job/wichita/x/185/95642229872")).toBe("jobs.boeing.com:95642229872");
    expect(jobIdFromUrl("https://careers.adobe.com/us/en/job/R172284/Sr-Compensation-Business-Partner")).toBe("careers.adobe.com:R172284");
    expect(jobIdFromUrl("https://www.acme.test/careers/apply?jobId=JR-7")).toBe("acme.test:JR-7");
    expect(jobIdFromUrl("https://acme.test/careers/software-engineer/")).toBe("acme.test:/careers/software-engineer");
    expect(canonicalPageUrl("https://X.test/job/1/#apply")).toBe("https://x.test/job/1");
  });
});

describe("jsonld scraper (mocked site)", () => {
  const stateDir = mkdtempSync(join(tmpdir(), "p08-state-"));
  afterAll(() => rmSync(stateDir, { recursive: true, force: true }));
  const jobPage = (id: number) => page([JSON.stringify({ "@type": "JobPosting", title: `Role ${id}`, datePosted: "2026-11-2" + (id % 10), description: `<p>Role ${id}</p>`, jobLocation: { address: { addressLocality: "Pune", addressCountry: "IN" } } })]);
  const site = (opts: { robotsSitemap?: boolean; failJob?: number } = {}) =>
    mockHttp((url) => {
      if (url.pathname === "/robots.txt") return html(opts.robotsSitemap ? "User-agent: *\nSitemap: https://jobs.acme.test/sitemap_index.xml" : "User-agent: *");
      if (url.pathname === "/sitemap_index.xml") return html('<sitemapindex><sitemap><loc>https://jobs.acme.test/sitemap-jobs.xml</loc></sitemap><sitemap><loc>https://jobs.acme.test/sitemap-blog.xml</loc></sitemap></sitemapindex>');
      if (url.pathname === "/sitemap-jobs.xml" || url.pathname === "/sitemap.xml")
        return html(`<urlset>${[1, 2, 3].map((i) => `<url><loc>https://jobs.acme.test/job/pune/role-${i}/${1000 + i}</loc><lastmod>2026-11-2${i}</lastmod></url>`).join("")}<url><loc>https://jobs.acme.test/category/eng/1</loc></url></urlset>`);
      const m = /\/job\/pune\/role-(\d)\/(\d+)/.exec(url.pathname);
      if (m) return Number(m[1]) === opts.failJob ? html("down", 500) : html(jobPage(Number(m[1])));
      return html("not found", 404);
    });

  it("discovers job URLs via robots.txt sitemap index, newest first, skipping blog sitemaps", async () => {
    const http = site({ robotsSitemap: true });
    const { jobs, error } = await collect(jsonldScraper.scrape(ctxFor(http, [t])));
    expect(error).toBeNull();
    expect(jobs.map((j) => j.title)).toEqual(["Role 3", "Role 2", "Role 1"]);
    expect(jobs.every((j) => validateRawJob(j).length === 0)).toBe(true);
    expect(http.calls.some((c) => c.url.includes("sitemap-blog"))).toBe(false);
  });

  it("known jobs are emitted from the page index without refetching", async () => {
    const env = { ATS_ENTERPRISE_STATE_DIR: stateDir };
    await collect(jsonldScraper.scrape(ctxFor(site(), [t], { env })));
    const http = site();
    const known = new Set(["jobs.acme.test:1001", "jobs.acme.test:1002", "jobs.acme.test:1003"]);
    const { jobs, error } = await collect(jsonldScraper.scrape(ctxFor(http, [t], { env, isKnown: (id) => known.has(id) })));
    expect(error).toBeNull();
    expect(jobs).toHaveLength(3);
    expect(jobs.every((j) => j.descriptionHtml === null && j.title.startsWith("Role"))).toBe(true);
    expect(http.calls.filter((c) => c.url.includes("/job/"))).toHaveLength(0);
  });

  it("a known job that can be neither fetched nor recalled makes the run incomplete (no sweep)", async () => {
    const known = new Set(["jobs.acme.test:1002"]);
    const { jobs, error } = await collect(jsonldScraper.scrape(ctxFor(site({ failJob: 2 }), [t], { isKnown: (id) => known.has(id) })));
    expect(jobs.map((j) => j.title)).toEqual(["Role 3", "Role 1"]);
    expect(String(error)).toMatch(/incomplete/);
  });

  it("zero discovered job URLs is treated as a failure, never as 'all jobs closed'", async () => {
    const http = mockHttp((url) => (url.pathname === "/robots.txt" ? html("") : html("<html><a href='/about'>About</a></html>", url.pathname === "/" ? 200 : 404)));
    const { jobs, error } = await collect(jsonldScraper.scrape(ctxFor(http, [t])));
    expect(jobs).toEqual([]);
    expect(String(error)).toMatch(/no job URLs/);
  });
});
