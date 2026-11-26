import { beforeEach, describe, expect, it } from "vitest";
import { validateRawJob } from "@easyjobs/contract";
import { resetSharedLimiters } from "../src/lib/limiter";
import { composeDescription, flexMap, fullJob, lightJob, locations, oracleJobId, salaryFromFlex } from "../src/oracle/parse";
import { OracleDetail, OracleRequisition } from "../src/oracle/schema";
import { detailUrl, listUrl, oracleScraper } from "../src/oracle/scraper";
import { parseOracleToken, siteFromCanonical, siteFromPage } from "../src/oracle/token";
import { collect, ctxFor, fixture, fixtureJson, html, json, mockHttp, NOW, target } from "./helpers";

type ListJson = { items: { TotalJobsCount: number; requisitionList: unknown[]; locationsFacet: unknown[] }[] };
const list = fixtureJson<ListJson>("oracle/oracle-list.json");
const detail = OracleDetail.parse(fixtureJson<{ items: unknown[] }>("oracle/oracle-detail.json").items[0]);
const jpmc = OracleDetail.parse(fixtureJson<{ items: unknown[] }>("oracle/jpmc-detail.json").items[0]);

beforeEach(() => resetSharedLimiters());

describe("oracle token", () => {
  it("canonical CandidateExperience URLs need no lookup", () => {
    const parts = parseOracleToken("https://eeho.fa.us2.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX_45001");
    expect(parts.canonical).toBe(true);
    expect(siteFromCanonical(parts)).toEqual({
      apiBase: "https://eeho.fa.us2.oraclecloud.com",
      siteNumber: "CX_45001",
      lang: "en",
      publicBase: "https://eeho.fa.us2.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX_45001",
      pod: "eeho",
    });
  });

  it("vanity domains resolve REST host + site number from the page (Texas Instruments)", () => {
    const parts = parseOracleToken("https://careers.ti.com/en/sites/CX");
    expect(parts.canonical).toBe(false);
    expect(siteFromPage(fixture("oracle/ti-site.html"), "https://careers.ti.com/en/sites/CX", parts)).toEqual({
      apiBase: "https://edbz.fa.us2.oraclecloud.com",
      siteNumber: "CX",
      lang: "en",
      publicBase: "https://careers.ti.com/en/sites/CX",
      pod: "edbz",
    });
  });

  it("vanity site code may differ from the real site number (Honeywell → CX_1)", () => {
    const parts = parseOracleToken("https://careers.honeywell.com/en/sites/Honeywell");
    const site = siteFromPage(fixture("oracle/honeywell-site.html"), "https://careers.honeywell.com/en/sites/Honeywell", parts);
    expect(site?.siteNumber).toBe("CX_1");
    expect(site?.apiBase).toBe("https://ibqbjb.fa.ocs.oraclecloud.com");
    expect(site?.publicBase).toBe("https://careers.honeywell.com/en/sites/Honeywell");
    expect(siteFromPage("<html>no cx</html>", "https://x.test/en/sites/A", parts)).toBeNull();
  });

  it("builds the documented finder URLs", () => {
    const site = siteFromCanonical(parseOracleToken("https://eeho.fa.us2.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX_45001"));
    expect(listUrl(site, 50)).toBe(
      "https://eeho.fa.us2.oraclecloud.com/hcmRestApi/resources/latest/recruitingCEJobRequisitions?onlyData=true&expand=requisitionList.secondaryLocations&finder=findReqs;siteNumber=CX_45001,limit=25,offset=50,sortBy=POSTING_DATES_DESC",
    );
    expect(listUrl(site, 0, "300000000289738")).toContain(",selectedLocationsFacet=300000000289738");
    expect(detailUrl(site, "348884")).toBe(
      'https://eeho.fa.us2.oraclecloud.com/hcmRestApi/resources/latest/recruitingCEJobRequisitionDetails?expand=all&onlyData=true&finder=ById;Id="348884",siteNumber=CX_45001',
    );
  });
});

describe("oracle mapping (live fixtures)", () => {
  const site = siteFromCanonical(parseOracleToken("https://eeho.fa.us2.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX_45001"));
  const t = target({ slug: "oracle", ats: "oracle", token: site.publicBase, name: "Oracle", domain: "oracle.com" });
  const req = OracleRequisition.parse(list.items[0]?.requisitionList[0]);

  it("light record from the list", () => {
    const job = lightJob(site, t, req, NOW);
    expect(validateRawJob(job)).toEqual([]);
    expect(job).toMatchObject({ source: "oracle", sourceJobId: "eeho:348884", title: "Senior Core Infrastructure Engineer", descriptionHtml: null });
    expect(job.sourceUrl).toBe("https://eeho.fa.us2.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX_45001/job/348884");
    expect(job.postedAt).toBe("2026-11-25T12:00:00.000Z");
  });

  it("full record: precise posting time, flex-field experience, skills, sectioned description", () => {
    const job = fullJob(site, t, req, detail, NOW);
    expect(validateRawJob(job)).toEqual([]);
    expect(job.postedAt).toBe("2026-11-25T21:09:16.000Z");
    expect(job.experienceRaw).toBe("3 to 5+ years");
    expect(job.skills).toEqual(["Data Analysis", "Objective C Programming"]);
    expect(job.jobType).toBe("full_time");
    expect(job.department).toBe("Product and Research");
    expect(job.descriptionHtml).toContain("<h3>Responsibilities</h3>");
    expect(job.descriptionHtml).toContain("<h3>Qualifications</h3>");
    expect(job.extra?.oracle).toMatchObject({ pod: "eeho", jobFunction: "Software Engineering", detail: true });
  });

  it("pay disclosed in a flex field becomes salaryRaw (JPMorgan Chase)", () => {
    expect(salaryFromFlex(flexMap(jpmc))).toBe("New York,NY $26.49-$33.17");
    expect(salaryFromFlex({ "Base Range Info": "Base pay is one part of our total compensation package" })).toBeUndefined();
    const site2 = siteFromCanonical(parseOracleToken("https://jpmc.fa.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX_1001"));
    const r = OracleRequisition.parse({ Id: "210675973", Title: "Corporate - Dining Waitstaff", PrimaryLocation: "New York, NY, United States", PostedDate: "2026-11-25" });
    const job = fullJob(site2, t, r, jpmc, NOW);
    expect(job.salaryRaw).toBe("New York,NY $26.49-$33.17");
    // workLocation "New York, NY, US" is the same city as the primary location → kept once.
    expect(job.locations).toEqual(["New York, NY, United States"]);
  });

  it("location de-duplication keeps country-only secondary locations", () => {
    expect(locations("Seattle, WA, United States", [{ Name: "United States" }], ["Seattle, WA, US"])).toEqual(["Seattle, WA, United States", "United States"]);
  });

  it("composeDescription skips empty and duplicate sections", () => {
    const d = OracleDetail.parse({ Id: "1", Title: "T", ExternalDescriptionStr: "<p>Same text</p>", ExternalResponsibilitiesStr: "<p>Same text</p>", ExternalQualificationsStr: "<p>&nbsp;</p>" });
    expect(composeDescription(d)).toBe("<p>Same text</p>");
  });
});

describe("oracle scraper (mocked API)", () => {
  const reqs = Array.from({ length: 30 }, (_, i) => ({ Id: String(1000 + i), Title: `Analyst ${i}`, PostedDate: "2026-11-24", PrimaryLocation: "Pune, Maharashtra, India", secondaryLocations: [] }));
  const page = (offset: number) => ({ items: [{ TotalJobsCount: reqs.length, requisitionList: reqs.slice(offset, offset + 25), locationsFacet: [{ Id: 77, Name: "India", TotalCount: 30 }] }] });
  const detailOf = (id: string) => ({ items: [{ Id: id, Title: `Analyst ${Number(id) - 1000}`, ExternalPostedStartDate: "2026-11-24T08:00:00+00:00", ExternalDescriptionStr: "<p>Desc</p>", PrimaryLocation: "Pune, Maharashtra, India" }] });

  const api = () =>
    mockHttp((url) => {
      if (url.hostname === "careers.acme.test") return html('<div data-apibaseurl="https://zzzz.fa.us2.oraclecloud.com:443" data-sitenumber="CX_9" data-vanitybaseurl="https://careers.acme.test/"></div>');
      if (url.pathname.endsWith("/recruitingCEJobRequisitions")) {
        const offset = Number(/offset=(\d+)/.exec(decodeURIComponent(url.search))?.[1] ?? 0);
        return json(page(offset));
      }
      if (url.pathname.endsWith("/recruitingCEJobRequisitionDetails")) return json(detailOf(/Id="?(\d+)/.exec(decodeURIComponent(url.search))?.[1] ?? "0"));
      return undefined;
    });

  it("resolves a vanity token, paginates by TotalJobsCount and fetches details for unknown jobs", async () => {
    const http = api();
    const t = target({ slug: "acme", ats: "oracle", token: "https://careers.acme.test/en/sites/Acme" });
    const ctx = ctxFor(http, [t], { isKnown: (id) => id === "zzzz:1000", env: { ATS_ENTERPRISE_STATE_DIR: "off", ORACLE_MAX_DETAILS: "100" } });
    const { jobs, error } = await collect(oracleScraper.scrape(ctx));
    expect(error).toBeNull();
    expect(jobs).toHaveLength(30);
    expect(jobs[0]).toMatchObject({ sourceJobId: "zzzz:1000", descriptionHtml: null });
    expect(jobs[1]?.descriptionHtml).toBe("<p>Desc</p>");
    expect(jobs[1]?.sourceUrl).toBe("https://careers.acme.test/en/sites/Acme/job/1001");
    expect(jobs.every((j) => validateRawJob(j).length === 0)).toBe(true);
    const lists = http.calls.filter((c) => c.url.includes("recruitingCEJobRequisitions?"));
    expect(lists.map((c) => /offset=(\d+)/.exec(c.url)?.[1])).toEqual(["0", "25"]);
    expect(lists.every((c) => c.url.startsWith("https://zzzz.fa.us2.oraclecloud.com/"))).toBe(true);
  });

  it("country mode uses the site's location facet", async () => {
    const http = api();
    const t = target({ slug: "acme", ats: "oracle", token: "https://zzzz.fa.us2.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX_9", extra: { country: "IN" } });
    await collect(oracleScraper.scrape(ctxFor(http, [t], { limit: 3 })));
    const lists = http.calls.filter((c) => c.url.includes("recruitingCEJobRequisitions?"));
    expect(lists[0]?.url).not.toContain("selectedLocationsFacet");
    expect(lists[1]?.url).toContain("selectedLocationsFacet=77");
  });

  it("schema drift: bad requisitions are skipped and counted, the rest still flow", async () => {
    const http = mockHttp((url) =>
      url.pathname.endsWith("/recruitingCEJobRequisitions")
        ? json({ items: [{ TotalJobsCount: 3, requisitionList: [{ Id: "1", Title: "Good" }, { Title: "no id" }, { Id: "3", Title: "" }] }] })
        : json({ items: [{ Id: "1", Title: "Good", ExternalDescriptionStr: "<p>x</p>" }] }),
    );
    const t = target({ slug: "acme", ats: "oracle", token: "https://zzzz.fa.us2.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX_9" });
    const ctx = ctxFor(http, [t]);
    const { jobs } = await collect(oracleScraper.scrape(ctx));
    expect(jobs.map((j) => j.title)).toEqual(["Good"]);
    expect(ctx.log.lines.some((l) => /schema drift/.test(l.msg))).toBe(true);
    expect(oracleJobId({ apiBase: "", siteNumber: "", lang: "en", publicBase: "", pod: "zzzz" }, "1")).toBe("zzzz:1");
  });
});
