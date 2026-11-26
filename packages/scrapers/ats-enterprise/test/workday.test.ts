import { beforeEach, describe, expect, it } from "vitest";
import { validateRawJob } from "@easyjobs/contract";
import { resetSharedLimiters } from "../src/lib/limiter";
import { newStats, type TargetContext } from "../src/lib/run";
import { countryNames } from "../src/lib/mapping";
import {
  WORKDAY_RESULT_CAP,
  estimateTotal,
  flattenFacets,
  orderHintValues,
  pickHintFacet,
  pickPartitionFacet,
  selectCountryFacet,
  type AppliedFacets,
} from "../src/workday/facets";
import { fullJob, lightJob, locationFromPath, postingKey, reqIdFromList, workdayJobId } from "../src/workday/parse";
import { WorkdayDetail, WorkdayPosting } from "../src/workday/schema";
import { listSegment, workdayScraper, type WorkdayPage } from "../src/workday/scraper";
import { parseWorkdayToken } from "../src/workday/token";
import { collect, ctxFor, fixtureJson, html, json, memoryLogger, mockHttp, NOW, target } from "./helpers";

type ListJson = { total: number; jobPostings: unknown[]; facets: unknown[] };
const nvidia = fixtureJson<ListJson>("workday/nvidia-list.json");
const detail = fixtureJson<unknown>("workday/nvidia-detail.json");

beforeEach(() => resetSharedLimiters());

describe("workday token", () => {
  it.each([
    ["https://nvidia.wd5.myworkdayjobs.com/NVIDIAExternalCareerSite", "nvidia", "NVIDIAExternalCareerSite", null],
    ["https://intel.wd1.myworkdayjobs.com/en-US/External/details/x", "intel", "External", "en-US"],
    ["https://wd3.myworkdaysite.com/en-US/recruiting/acme/Careers", "acme", "Careers", "en-US"],
  ])("%s", (token, tenant, site, locale) => {
    const s = parseWorkdayToken(token);
    expect([s.tenant, s.site, s.locale]).toEqual([tenant, site, locale]);
    expect(s.apiBase).toBe(`https://${new URL(token).host}/wday/cxs/${tenant}/${site}`);
  });
  it("rejects non-Workday URLs and missing site paths", () => {
    expect(() => parseWorkdayToken("https://example.com/jobs")).toThrow();
    expect(() => parseWorkdayToken("https://nvidia.wd5.myworkdayjobs.com/")).toThrow();
  });
});

describe("workday ids and list fields", () => {
  it("posting keys come from the externalPath suffix", () => {
    expect(postingKey("/job/US-CA-Santa-Clara/Product-Data-Operations-Engineering-Systems-Analyst_JR2013016")).toBe("JR2013016");
    expect(postingKey("/job/US-CA-Santa-Clara/Senior-Solutions-Architect--Enterprise-AI-Factories_JR2027958-1")).toBe("JR2027958-1");
    expect(postingKey("/job/USA-CA-Pleasanton/Sr-Solution-Architect_JR-0111082")).toBe("JR-0111082");
    expect(workdayJobId("nvidia", "/job/X/Y_JR1")).toBe("nvidia:JR1");
  });
  it("finds the req id even when bulletFields[0] is a badge (Intel)", () => {
    const p = WorkdayPosting.parse({ title: "Staff Thin Films Engineer", externalPath: "/job/US-Oregon-Hillsboro/Staff-Thin-Films-Engineer_JR0289475", bulletFields: ["Spotlight Job", "JR0289475"] });
    expect(reqIdFromList(p)).toBe("JR0289475");
    expect(reqIdFromList(WorkdayPosting.parse({ title: "x", externalPath: "/job/A/B_R266686" }))).toBe("R266686");
  });
  it("derives a location from the path only as a fallback", () => {
    expect(locationFromPath("/job/US-CA-Santa-Clara/Title_JR1")).toBe("US CA Santa Clara");
    expect(locationFromPath("/job/India-Bengaluru/Title_JR1")).toBe("India Bengaluru");
  });
});

describe("workday facets (live fixtures)", () => {
  const facets = flattenFacets(nvidia.facets);

  it("flattens nested location groups", () => {
    expect(facets.map((f) => f.param)).toEqual(["jobFamilyGroup", "workerSubType", "timeType", "locationHierarchy2", "locationHierarchy1", "locations"]);
    expect(facets.find((f) => f.param === "locationHierarchy1")?.group).toBe("locationMainGroup");
  });

  it("uses the complete worker-type facet as a hint partition, early-career first", () => {
    const sum = facets.find((f) => f.param === "workerSubType")!.values.reduce((a, v) => a + v.count, 0);
    const hint = pickHintFacet(facets, sum, {});
    expect(hint?.param).toBe("workerSubType");
    expect(pickHintFacet(facets, sum + 1, {})).toBeNull(); // incomplete facet → no partition
    const ordered = orderHintValues(hint!.values).map((v) => v.descriptor);
    expect(ordered.slice(0, 2).sort()).toEqual(["Intern (Fixed Term)", "New College Graduate"]);
  });

  it("detects the 2000 cap and splits by a single-valued facet", () => {
    expect(nvidia.total).toBe(WORKDAY_RESULT_CAP);
    const est = estimateTotal(facets, nvidia.total);
    expect(est).toBeGreaterThan(WORKDAY_RESULT_CAP);
    const part = pickPartitionFacet(facets, {}, est);
    expect(part?.param).toBe("jobFamilyGroup");
    expect(Math.max(...part!.values.map((v) => v.count))).toBeLessThan(WORKDAY_RESULT_CAP);
  });

  it.each([
    ["nvidia", "workday/nvidia-list.json", "locationHierarchy1", ["India"]],
    ["salesforce", "workday/salesforce-list.json", "CF_-_REC_-_LRV_-_Job_Posting_Anchor_-_Country_from_Job_Posting_Location_Extended", ["India"]],
    ["analog devices", "workday/analogdevices-list.json", "locationCountry", ["India"]],
  ])("country facet for %s", (_name, file, param, labels) => {
    const sel = selectCountryFacet(flattenFacets(fixtureJson<ListJson>(file).facets), countryNames("IN"));
    expect(sel?.param).toBe(param);
    expect(sel?.labels).toEqual(labels);
  });

  it.each([
    ["intel", "workday/intel-list.json"],
    ["micron", "workday/micron-list.json"],
  ])("tenants without a country facet fall back to India site values (%s)", (_name, file) => {
    const sel = selectCountryFacet(flattenFacets(fixtureJson<ListJson>(file).facets), countryNames("India"));
    expect(sel?.param).toBe("locations");
    expect(sel!.labels.length).toBeGreaterThan(0);
    expect(sel!.labels.every((l) => /india/i.test(l))).toBe(true);
  });
});

describe("workday pagination quirks", () => {
  const posting = (i: number) => ({ title: `Job ${i}`, externalPath: `/job/US-CA-Santa-Clara/Job-${i}_JR${100000 + i}`, locationsText: "US, CA, Santa Clara", postedOn: "Posted Today", bulletFields: [`JR${100000 + i}`] });
  const pageOf = (from: number, n: number, total: number, facets: unknown[] = []): WorkdayPage => ({
    total,
    postings: Array.from({ length: n }, (_, k) => WorkdayPosting.parse(posting(from + k))),
    facets: flattenFacets(facets),
  });
  const drain = async (gen: AsyncGenerator<{ posting: { externalPath: string } }[]>) => {
    const out: string[] = [];
    for await (const batch of gen) for (const x of batch) out.push(x.posting.externalPath);
    return out;
  };

  it("total only on the first page (0 afterwards) still paginates to the end", async () => {
    const calls: number[] = [];
    const fetchPage = async (_a: AppliedFacets, offset: number) => (calls.push(offset), pageOf(offset, offset < 40 ? 20 : 5, offset === 0 ? 45 : 0));
    const paths = await drain(listSegment(fetchPage, {}, {}, memoryLogger()));
    expect(paths).toHaveLength(45);
    expect(calls).toEqual([0, 20, 40]);
  });

  it("stops when offsets wrap around to page 1 (capped tenant without a usable facet)", async () => {
    const fetchPage = async (_a: AppliedFacets, offset: number) => pageOf(offset >= 60 ? 0 : offset, 20, offset === 0 ? 2000 : 0);
    const paths = await drain(listSegment(fetchPage, {}, {}, memoryLogger()));
    expect(paths).toHaveLength(60);
  });

  it("splits a capped segment by facet values and annotates each job", async () => {
    const facets = [{ facetParameter: "jobFamilyGroup", descriptor: "Job Category", values: [{ descriptor: "Engineering", id: "eng", count: 1500 }, { descriptor: "Sales", id: "sales", count: 900 }] }];
    const seen: AppliedFacets[] = [];
    const fetchPage = async (applied: AppliedFacets, offset: number): Promise<WorkdayPage> => {
      seen.push(applied);
      if (!applied.jobFamilyGroup) return pageOf(0, 20, 2000, facets);
      const base = applied.jobFamilyGroup[0] === "eng" ? 0 : 5000;
      return pageOf(base + offset, offset === 0 ? 20 : 0, offset === 0 ? 20 : 0);
    };
    const out: { path: string; dept?: string }[] = [];
    for await (const batch of listSegment(fetchPage, {}, {}, memoryLogger())) for (const x of batch) out.push({ path: x.posting.externalPath, dept: x.annotations.facets?.["Job Category"] });
    expect(seen.map((a) => a.jobFamilyGroup?.[0] ?? "-")).toEqual(["-", "eng", "sales"]);
    expect(out).toHaveLength(40);
    expect(out[0]?.dept).toBe("Engineering");
    expect(out[39]?.dept).toBe("Sales");
  });
});

describe("workday mapping (live fixture)", () => {
  const site = parseWorkdayToken("https://nvidia.wd5.myworkdayjobs.com/NVIDIAExternalCareerSite");
  const t = target({ slug: "nvidia", ats: "workday", token: site.publicBase, name: "NVIDIA", domain: "nvidia.com" });
  const posting = WorkdayPosting.parse(nvidia.jobPostings[0]);

  it("full record from jobPostingInfo", () => {
    const job = fullJob(site, t, { posting, annotations: { workerSubType: "Regular Employee" } }, WorkdayDetail.parse(detail), NOW);
    expect(validateRawJob(job)).toEqual([]);
    expect(job).toMatchObject({
      source: "workday",
      sourceKind: "ats",
      sourceJobId: "nvidia:JR2013016",
      title: "Product Data Operations Engineering Systems Analyst",
      company: "NVIDIA",
      companySlug: "nvidia",
      target: "nvidia",
      locations: ["US, CA, Santa Clara"],
      postedAt: "2026-11-25T12:00:00.000Z",
      jobType: "full_time",
      employmentTypeRaw: "Regular Employee, Full time",
    });
    expect(job.applyUrl).toBe("https://nvidia.wd5.myworkdayjobs.com/NVIDIAExternalCareerSite/job/US-CA-Santa-Clara/Product-Data-Operations-Engineering-Systems-Analyst_JR2013016");
    expect(job.descriptionHtml).toContain("<p>");
    expect(job.extra?.workday).toMatchObject({ tenant: "nvidia", reqId: "JR2013016", country: "US", detail: true });
  });

  it("intern worker types become structured hints", () => {
    const job = lightJob(site, t, { posting, annotations: { workerSubType: "Intern (Fixed Term)" } }, NOW, true);
    expect(job).toMatchObject({ jobType: "internship", experienceLevel: "intern", descriptionHtml: null });
  });

  it("light records never invent places for known jobs", () => {
    const multi = WorkdayPosting.parse({ ...posting, locationsText: "3 Locations" });
    expect(lightJob(site, t, { posting: multi, annotations: {} }, NOW, false).locations).toEqual([]);
    expect(lightJob(site, t, { posting: multi, annotations: {} }, NOW, true).locations).toEqual(["US CA Santa Clara"]);
  });
});

describe("workday scraper (mocked API)", () => {
  const token = "https://acme.wd5.myworkdayjobs.com/Careers";
  const t = target({ slug: "acme", ats: "workday", token });
  const postings = Array.from({ length: 5 }, (_, i) => ({
    title: `Engineer ${i}`,
    externalPath: `/job/India-Bengaluru/Engineer-${i}_JR${i}`,
    locationsText: "India, Bengaluru",
    postedOn: "Posted 3 Days Ago",
    bulletFields: [`JR${i}`],
  }));
  const facets = [
    { facetParameter: "locationMainGroup", values: [{ facetParameter: "locationCountry", descriptor: "Country", values: [{ descriptor: "India", id: "in", count: 5 }, { descriptor: "Germany", id: "de", count: 7 }] }] },
  ];
  const detailFor = (path: string) => ({
    jobPostingInfo: { title: path.split("/")[3]?.replace(/_.*/, "").replace(/-/g, " "), jobDescription: "<p>Build things</p>", location: "India, Bengaluru", startDate: "2026-11-22", timeType: "Full time", jobReqId: path.slice(-3), jobRequisitionLocation: { country: { descriptor: "India", alpha2Code: "IN" } } },
  });
  const api = (opts: { countryCheck?: boolean } = {}) =>
    mockHttp((url, call) => {
      if (url.pathname.endsWith("/jobs") && call.method === "POST") {
        const body = call.body as { offset: number; appliedFacets: AppliedFacets };
        if (opts.countryCheck && !body.appliedFacets.locationCountry) return json({ total: 12, jobPostings: postings.slice(0, 2), facets });
        return json({ total: postings.length, jobPostings: body.offset === 0 ? postings : [], facets });
      }
      if (url.pathname.includes("/job/")) return json(detailFor(url.pathname));
      return undefined;
    });

  it("emits full records, light records for known jobs, and respects the detail budget", async () => {
    const http = api();
    const ctx = ctxFor(http, [t], { isKnown: (id) => id === "acme:JR0", env: { ATS_ENTERPRISE_STATE_DIR: "off", WORKDAY_MAX_DETAILS: "2" } });
    const { jobs, error } = await collect(workdayScraper.scrape(ctx));
    expect(error).toBeNull();
    // JR0 known → light; JR1, JR2 detailed; JR3, JR4 deferred (budget 2)
    expect(jobs.map((j) => [j.sourceJobId, j.descriptionHtml !== null])).toEqual([
      ["acme:JR0", false],
      ["acme:JR1", true],
      ["acme:JR2", true],
    ]);
    expect(jobs.every((j) => validateRawJob(j).length === 0)).toBe(true);
    expect(http.calls.filter((c) => c.url.includes("/job/"))).toHaveLength(2);
    expect(http.calls[0]?.body).toEqual({ appliedFacets: {}, limit: 20, offset: 0, searchText: "" });
  });

  it("WORKDAY_OVERFLOW=light emits list data instead of deferring", async () => {
    const ctx = ctxFor(api(), [t], { env: { ATS_ENTERPRISE_STATE_DIR: "off", WORKDAY_MAX_DETAILS: "1", WORKDAY_OVERFLOW: "light" } });
    const { jobs } = await collect(workdayScraper.scrape(ctx));
    expect(jobs).toHaveLength(5);
    expect(jobs.filter((j) => j.descriptionHtml)).toHaveLength(1);
  });

  it("India-only mode applies the tenant's country facet", async () => {
    const http = api({ countryCheck: true });
    const ctx = ctxFor(http, [{ ...t, extra: { workdayCountry: "IN" } }]);
    const { jobs } = await collect(workdayScraper.scrape(ctx));
    expect(jobs).toHaveLength(5);
    const listCalls = http.calls.filter((c) => c.method === "POST").map((c) => (c.body as { appliedFacets: AppliedFacets }).appliedFacets);
    expect(listCalls.slice(1).every((a) => a.locationCountry?.[0] === "in")).toBe(true);
  });

  it("a missing career site (404/422) finishes quietly with 0 jobs", async () => {
    const ctx = ctxFor(mockHttp(() => json({ errorCode: "HTTP_422" }, 422)), [t]);
    const { jobs, error } = await collect(workdayScraper.scrape(ctx));
    expect(jobs).toEqual([]);
    expect(error).toBeNull();
  });

  it("an anti-bot challenge mid-listing yields what it has, then fails the run (no sweep)", async () => {
    let n = 0;
    const http = mockHttp((url, call) => {
      if (call.method === "POST") {
        if (n++ === 0) return json({ total: 40, jobPostings: postings, facets: [] });
        return html("Security Check Enable JavaScript and cookies to continue", 429, { "cf-mitigated": "challenge" });
      }
      return json(detailFor(url.pathname));
    });
    const { jobs, error } = await collect(workdayScraper.scrape(ctxFor(http, [t])));
    expect(jobs).toHaveLength(5);
    expect(String(error)).toMatch(/incomplete.*anti-bot challenge/);
  });

  it("a limited run stops paging once its detail budget is spent (test postings consumed it)", async () => {
    const tests = Array.from({ length: 20 }, (_, i) => ({ title: `DO NOT APPLY - TEST REQ ${i}`, externalPath: `/job/X/Test_JR9${i}`, postedOn: "Posted Today" }));
    const http = mockHttp((url, call) => {
      if (call.method === "POST") return json({ total: 400, jobPostings: (call.body as { offset: number }).offset === 0 ? tests : postings, facets: [] });
      return url.pathname.includes("/job/") ? json({ jobPostingInfo: { title: "DO NOT APPLY - TEST REQ", jobDescription: "<p>x</p>" } }) : undefined;
    });
    const { jobs } = await collect(workdayScraper.scrape(ctxFor(http, [t], { limit: 2 })));
    expect(jobs).toEqual([]);
    expect(http.calls.filter((c) => c.method === "POST")).toHaveLength(1);
  });

  it("limit is shared across targets so every fixture target is sampled", async () => {
    const other = target({ slug: "other", ats: "workday", token: "https://other.wd1.myworkdayjobs.com/Jobs" });
    const ctx = ctxFor(api(), [t, other], { limit: 4 });
    const { jobs } = await collect(workdayScraper.scrape(ctx));
    expect(jobs.map((j) => j.target)).toEqual(["acme", "acme", "other", "other"]);
  });
});

describe("workday stats helper", () => {
  it("newStats starts at zero", () => {
    const s = newStats();
    expect(Object.values(s).every((v) => v === 0)).toBe(true);
    const ctx: Partial<TargetContext> = { stats: s };
    expect(ctx.stats?.listed).toBe(0);
  });
});
