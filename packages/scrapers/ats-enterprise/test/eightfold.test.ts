import { beforeEach, describe, expect, it } from "vitest";
import { HttpError } from "@easyjobs/contract/node";
import { validateRawJob } from "@easyjobs/contract";
import { resetSharedLimiters } from "../src/lib/limiter";
import { fromPcsx, fromV2, parseEightfoldToken, positionUrl, toRawJob } from "../src/eightfold/parse";
import { EfPcsxPosition, EfV2Position } from "../src/eightfold/schema";
import { apiHint, eightfoldScraper } from "../src/eightfold/scraper";
import { collect, ctxFor, fixtureJson, json, mockHttp, NOW, target } from "./helpers";

const v2List = fixtureJson<{ count: number; positions: unknown[] }>("eightfold/netflix-v2-list.json");
const v2Detail = fixtureJson<unknown>("eightfold/netflix-v2-detail.json");
const pcsxSearch = fixtureJson<{ data: { count: number; positions: unknown[] } }>("eightfold/paypal-pcsx-search.json");
const pcsxDetail = fixtureJson<{ data: unknown }>("eightfold/paypal-pcsx-detail.json");

beforeEach(() => resetSharedLimiters());

describe("eightfold token and urls", () => {
  it("parses https://{host}|{domain}", () => {
    expect(parseEightfoldToken("https://explore.jobs.netflix.net|netflix.com", null)).toEqual({ origin: "https://explore.jobs.netflix.net", domain: "netflix.com" });
    expect(parseEightfoldToken("https://paypal.eightfold.ai", "paypal.com").domain).toBe("paypal.com");
    expect(() => parseEightfoldToken("https://x.eightfold.ai", null)).toThrow();
  });
  it("keeps a stable job URL (drops microsite, keeps domain)", () => {
    const site = { origin: "https://explore.jobs.netflix.net", domain: "netflix.com" };
    expect(positionUrl(site, "1", "https://explore.jobs.netflix.net/careers/job/1?microsite=netflix.com")).toBe("https://explore.jobs.netflix.net/careers/job/1");
    expect(positionUrl(site, "1", "/careers/job/1?domain=netflix.com")).toBe("https://explore.jobs.netflix.net/careers/job/1?domain=netflix.com");
    expect(positionUrl(site, "9", null)).toBe("https://explore.jobs.netflix.net/careers/job/9");
  });
  it("reads the API generation from 403 bodies", () => {
    expect(apiHint(new HttpError(403, "u", '{"message": "Not authorized for PCSX"}'))).toBe("pcsx");
    expect(apiHint(new HttpError(403, "u", '{"message": "PCSX is not enabled for this user."}'))).toBe("v2");
    expect(apiHint(new HttpError(403, "u", "forbidden"))).toBeNull();
    expect(apiHint(new HttpError(429, "u", "Not authorized for PCSX"))).toBeNull();
  });
});

describe("eightfold mapping (live fixtures)", () => {
  const netflix = { origin: "https://explore.jobs.netflix.net", domain: "netflix.com" };
  const paypal = { origin: "https://paypal.eightfold.ai", domain: "paypal.com" };
  const tN = target({ slug: "netflix", ats: "eightfold", token: "https://explore.jobs.netflix.net|netflix.com", name: "Netflix" });
  const tP = target({ slug: "paypal", ats: "eightfold", token: "https://paypal.eightfold.ai|paypal.com", name: "PayPal" });

  it("v2 list + detail (Netflix)", () => {
    const list = fromV2(netflix, EfV2Position.parse(v2List.positions[0]));
    const det = fromV2(netflix, EfV2Position.parse(v2Detail));
    const job = toRawJob(netflix, tN, list, det, NOW);
    expect(validateRawJob(job)).toEqual([]);
    expect(job).toMatchObject({
      source: "eightfold",
      sourceJobId: "netflix.com:790319450010",
      title: "Workplace Specialist, Eyeline Hyderabad",
      locations: ["Hyderabad, India"],
      postedAt: "2026-11-11T00:00:00.000Z",
      department: "Enterprise Operations",
      workMode: "onsite", // the v2 detail nulls work_location_option; the list value is kept
    });
    expect(job.sourceUrl).toBe("https://explore.jobs.netflix.net/careers/job/790319450010");
    expect(job.descriptionHtml).toContain("Netflix");
    expect(job.extra?.eightfold).toMatchObject({ api: "v2", atsJobId: "JR43565", businessUnit: "Streaming", detail: true });
  });

  it("pcsx search + position_details (PayPal India)", () => {
    // India search result: standardizedLocations are preferred ("Bengaluru, KA, IN").
    const list = fromPcsx(paypal, EfPcsxPosition.parse(pcsxSearch.data.positions[0]));
    expect(list.locations[0]).toMatch(/, IN$/);
    // The captured position_details record (Singapore) paired with its own list view.
    const det = fromPcsx(paypal, EfPcsxPosition.parse(pcsxDetail.data));
    const job = toRawJob(paypal, tP, det, det, NOW);
    expect(validateRawJob(job)).toEqual([]);
    expect(job).toMatchObject({ title: "Sr Staff Data Scientist", locations: ["Singapore, SG"], jobType: "full_time", workMode: "onsite", postedAt: "2026-11-25T00:00:00.000Z" });
    expect(job.descriptionHtml).toContain("PayPal");
    expect(job.extra?.eightfold).toMatchObject({ api: "pcsx", detail: true });
    const light = toRawJob(paypal, tP, det, null, NOW);
    expect(light.descriptionHtml).toBeNull();
    expect(light.sourceUrl).toBe(job.sourceUrl);
  });
});

describe("eightfold scraper (mocked API)", () => {
  const positions = (n: number) => Array.from({ length: n }, (_, i) => ({ id: 500 + i, name: `Engineer ${i}`, locations: ["Bengaluru, KA, IN"], postedTs: 1795564800, workLocationOption: "hybrid" }));

  it("switches to PCSX when v2 says 'Not authorized for PCSX', then pages by 10", async () => {
    const all = positions(14);
    const http = mockHttp((url) => {
      if (url.pathname === "/api/apply/v2/jobs") return json({ message: "Not authorized for PCSX" }, 403);
      if (url.pathname === "/api/pcsx/search") {
        const start = Number(url.searchParams.get("start"));
        return json({ status: 200, data: { count: all.length, positions: all.slice(start, start + 10) } });
      }
      if (url.pathname === "/api/pcsx/position_details") {
        const id = Number(url.searchParams.get("position_id"));
        return json({ status: 200, data: { ...all[id - 500], jobDescription: `<p>JD ${id}</p>`, efcustomTextTimeType: ["Full time"] } });
      }
      return undefined;
    });
    const t = target({ slug: "acme", ats: "eightfold", token: "https://acme.eightfold.ai|acme.com", extra: { country: "IN" } });
    const { jobs, error } = await collect(eightfoldScraper.scrape(ctxFor(http, [t])));
    expect(error).toBeNull();
    expect(jobs).toHaveLength(14);
    expect(jobs[0]).toMatchObject({ jobType: "full_time", workMode: "hybrid", descriptionHtml: "<p>JD 500</p>" });
    const searches = http.calls.filter((c) => c.url.includes("/api/pcsx/search"));
    expect(searches.map((c) => new URL(c.url).searchParams.get("start"))).toEqual(["0", "10"]);
    expect(new URL(searches[0]!.url).searchParams.get("location")).toBe("India");
  });

  it("v2 tenants work directly and known jobs skip the detail call", async () => {
    const http = mockHttp((url) => {
      if (url.pathname === "/api/apply/v2/jobs") return json({ count: 2, positions: [{ id: 1, name: "A", locations: ["Pune,India"], t_create: 1794355200 }, { id: 2, name: "B", t_create: 1794355200 }] });
      if (url.pathname.startsWith("/api/apply/v2/jobs/")) return json({ id: 2, name: "B", job_description: "<p>B</p>" });
      return undefined;
    });
    const t = target({ slug: "acme2", ats: "eightfold", token: "https://jobs.acme2.test|acme2.com" });
    const { jobs } = await collect(eightfoldScraper.scrape(ctxFor(http, [t], { isKnown: (id) => id === "acme2.com:1" })));
    expect(jobs.map((j) => [j.sourceJobId, j.descriptionHtml])).toEqual([
      ["acme2.com:1", null],
      ["acme2.com:2", "<p>B</p>"],
    ]);
    expect(jobs[0]?.locations).toEqual(["Pune, India"]);
    expect(http.calls.filter((c) => c.url.includes("/api/apply/v2/jobs/"))).toHaveLength(1);
  });
});
