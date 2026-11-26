import { describe, expect, it } from "vitest";
import { bambooDetailUrl, bambooListUrl, bambooLocation, bambooOrigin } from "../src/adapters/bamboohr";
import { bamboohrScraper } from "../src/index";
import { byId, collect, ctx, expectAllValid, fakeHttp, fixtureJson, json, manifest, target, type RouteHandler } from "./helpers";

const m = manifest.bamboohr!;
const t = (slug: string) => target({ slug, ats: "bamboohr", token: slug });

function routes(company: string): Record<string, RouteHandler> {
  const origin = bambooOrigin(company);
  const list = fixtureJson(`bamboohr/${company}-list.json`);
  const r: Record<string, RouteHandler> = { [bambooListUrl(origin)]: json(list) };
  for (const j of list.result) r[bambooDetailUrl(origin, j.id)] = json(fixtureJson(`bamboohr/${company}-detail-${j.id}.json`));
  return r;
}

async function scrape(company: string, extra: Parameters<typeof ctx>[2] = {}) {
  const http = fakeHttp(routes(company));
  const jobs = await collect(bamboohrScraper.scrape(ctx(http, [t(company)], extra)));
  expectAllValid(jobs);
  return { jobs, http };
}

describe("bamboohr adapter", () => {
  it("maps locationType 0/1/2 to on-site/remote/hybrid and reads details", async () => {
    const { jobs } = await scrape("acino");
    expect(byId(jobs, m.onsite!)).toMatchObject({
      source: "bamboohr",
      title: "Quality Control Senior Specialist - Finished Products",
      workMode: "onsite",
      isRemote: false,
      locations: ["Egypt"],
      experienceLevel: "mid",
      experienceRaw: "Mid-level",
      department: "Quality Control",
      postedAt: "2025-12-22T00:00:00.000Z",
      sourceUrl: "https://acino.bamboohr.com/careers/803",
    });
    expect(byId(jobs, m.remote!)).toMatchObject({ workMode: "remote", isRemote: true, jobType: "contract", locations: ["Baghdad, Iraq"] });
    const hybrid = byId(jobs, m.hybrid!);
    expect(hybrid).toMatchObject({ workMode: "hybrid", locations: ["Aesch, Baselland, Switzerland"] });
    // "Experienced" + "Senior …" title → level left to the normalizer
    expect(hybrid.experienceLevel).toBeUndefined();
    // "Active" is not an employment type
    expect(byId(jobs, m.onsite!).jobType).toBeUndefined();
    for (const job of jobs) expect(job.descriptionHtml).toBeTruthy();
  });

  it("keeps free-text compensation as salaryRaw without inventing a range", async () => {
    const { jobs } = await scrape("accuratetemps");
    const job = byId(jobs, m.compensationText!);
    expect(job.salaryRaw).toBe("$70,000 and up, Depending on experience.");
    expect(job.salary).toBeUndefined();
    expect(job).toMatchObject({ jobType: "full_time", locations: ["Kenosha, Wisconsin, United States"] });
  });

  it("respects robots.txt and does not follow redirects", async () => {
    const { http } = await scrape("acino");
    expect(http.calls.every((c) => c.init.robots === true && c.init.redirect === "manual")).toBe(true);
  });

  it("emits light records for known postings without detail calls", async () => {
    const { jobs, http } = await scrape("acino", { isKnown: () => true });
    expect(http.calls).toHaveLength(1);
    expect(jobs).toHaveLength(3);
    expect(jobs.every((j) => j.descriptionHtml === null && j.postedAt === null)).toBe(true);
    expect(byId(jobs, m.remote!)).toMatchObject({ workMode: "remote", locations: ["Baghdad, Iraq"] });
  });

  it("treats the redirect for an unknown subdomain as a dead board", async () => {
    const http = fakeHttp({ [bambooListUrl(bambooOrigin("nope"))]: { status: 302, headers: { location: "https://www.bamboohr.com/" } } });
    const c = ctx(http, [t("nope")]);
    expect(await collect(bamboohrScraper.scrape(c))).toEqual([]);
    expect(c.log.lines.some((l) => /board not found \(HTTP 302\)/.test(l.msg))).toBe(true);
  });

  it("composes locations from atsLocation first, then location", () => {
    expect(bambooLocation({ atsLocation: { city: "Pune", state: "MH", country: "India" }, location: { city: "Mumbai" } })).toBe("Pune, MH, India");
    expect(bambooLocation({ location: { city: "Kenosha", state: "Wisconsin", addressCountry: "United States" } })).toBe("Kenosha, Wisconsin, United States");
    expect(bambooLocation({})).toBeNull();
  });
});
