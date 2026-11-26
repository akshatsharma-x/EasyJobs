import { describe, expect, it } from "vitest";
import {
  smartRecruitersToken,
  srDetailUrl,
  srLevel,
  srListUrl,
  srLocationText,
  srWorkMode,
  type SrPosting,
} from "../src/adapters/smartrecruiters";
import { smartrecruitersScraper } from "../src/index";
import { byId, collect, ctx, expectAllValid, fakeHttp, fixtureJson, json, manifest, target, type RouteHandler } from "./helpers";

const m = manifest.smartrecruiters!;
const t = (slug: string, token: string, extra?: Record<string, unknown>) => target({ slug, ats: "smartrecruiters", token, extra });

/** Routes for a fixture company: its list page plus one detail route per posting. */
function routes(company: string, file: string): Record<string, RouteHandler> {
  const list = fixtureJson(`smartrecruiters/${file}-list.json`);
  const r: Record<string, RouteHandler> = { [srListUrl(company, 0)]: json(list) };
  for (const p of list.content) r[srDetailUrl(company, p.id)] = json(fixtureJson(`smartrecruiters/${file}-detail-${p.id}.json`));
  return r;
}

async function scrape(company: string, file: string, extra: Parameters<typeof ctx>[2] = {}) {
  const http = fakeHttp(routes(company, file));
  const c = ctx(http, [t(file, company)], extra);
  const jobs = await collect(smartrecruitersScraper.scrape(c));
  expectAllValid(jobs);
  return { jobs, http, c };
}

describe("smartrecruiters adapter", () => {
  it("fetches details for unknown postings and maps them", async () => {
    const { jobs } = await scrape("Freshworks", "freshworks");
    const job = byId(jobs, m.indiaHybrid!);
    expect(job).toMatchObject({
      source: "smartrecruiters",
      sourceKind: "ats",
      title: "Senior Staff Product Manager",
      locations: ["Chennai, India"],
      workMode: "hybrid",
      isRemote: false,
      jobType: "full_time",
      employmentTypeRaw: "Full-time",
      experienceRaw: "Mid-Senior Level",
      postedAt: "2026-11-25T05:38:36.601Z",
      sourceUrl: "https://jobs.smartrecruiters.com/Freshworks/744000163610179-senior-staff-product-manager",
    });
    // "Mid-Senior" + a senior title → leave the level to the normalizer
    expect(job.experienceLevel).toBeUndefined();
    // compensation 0–0 is a placeholder; function "Other" is not a department
    expect(job.salary).toBeUndefined();
    expect(job.department).toBeUndefined();
    expect(job.descriptionHtml).toMatch(/^<h3>Company Description<\/h3>/);
    expect(job.descriptionHtml).toContain("<h3>Job Description</h3>");
    expect(job.descriptionHtml).toContain("<h3>Qualifications</h3>");
    expect(job.extra?.detail).toBe("full");
  });

  it("maps remote contract roles", async () => {
    const { jobs } = await scrape("Freshworks", "freshworks");
    expect(byId(jobs, m.remoteContract!)).toMatchObject({ workMode: "remote", isRemote: true, jobType: "contract", locations: ["Guarulhos, Brazil"] });
  });

  it("maps experienceLevel ids: internship, director, entry_level", async () => {
    const { jobs } = await scrape("NielsenIQ", "nielseniq");
    expect(byId(jobs, m.internship!)).toMatchObject({ jobType: "internship", experienceLevel: "intern", department: "General Business" });
    expect(byId(jobs, m.director!)).toMatchObject({ experienceLevel: "executive", locations: ["Chennai/Pune, Maharashtra/Tamil Naidu, India"] });
    expect(byId(jobs, m.entryLevel!)).toMatchObject({ experienceLevel: "entry", workMode: "onsite", isRemote: false });
  });

  it("skips detail calls for known postings and emits light records", async () => {
    const { jobs, http } = await scrape("Freshworks", "freshworks", { isKnown: () => true });
    expect(http.urls()).toEqual([srListUrl("Freshworks", 0)]);
    expect(jobs).toHaveLength(2);
    const light = byId(jobs, m.indiaHybrid!);
    expect(light.descriptionHtml).toBeNull();
    expect(light.sourceUrl).toBe("https://jobs.smartrecruiters.com/Freshworks/744000163610179");
    expect(light).toMatchObject({ jobType: "full_time", workMode: "hybrid", postedAt: "2026-11-25T05:38:36.601Z" });
    expect(light.extra?.detail).toBe("light");
  });

  it("passes the target slug to isKnown", async () => {
    const asked: [string, string | null | undefined][] = [];
    await scrape("Freshworks", "freshworks", { isKnown: (id, tgt) => (asked.push([id, tgt]), false) });
    expect(asked.every(([, tgt]) => tgt === "freshworks")).toBe(true);
  });

  it("caps detail requests per run and defers the rest (not emitted, so no sweep can close them)", async () => {
    const { jobs, http, c } = await scrape("NielsenIQ", "nielseniq", { env: { ATS_MAX_DETAILS: "1" } });
    expect(jobs).toHaveLength(1);
    expect(http.urls().filter((u) => /postings\/\d+$/.test(u))).toHaveLength(1);
    expect(c.log.lines.some((l) => /deferred 2 unknown posting/.test(l.msg))).toBe(true);
  });

  it("stops detail requests after a 429 and keeps known postings flowing", async () => {
    const r = routes("NielsenIQ", "nielseniq");
    const ids: string[] = fixtureJson("smartrecruiters/nielseniq-list.json").content.map((p: SrPosting) => p.id);
    r[srDetailUrl("NielsenIQ", ids[0]!)] = { status: 429, body: "slow down" };
    const http = fakeHttp(r);
    const c = ctx(http, [t("nielseniq", "NielsenIQ")], { isKnown: (id) => id === ids[2] });
    const jobs = await collect(smartrecruitersScraper.scrape(c));
    // posting 0 → 429 (deferred), posting 1 → not requested (deferred), posting 2 → known (light)
    expect(jobs.map((j) => j.sourceJobId)).toEqual([ids[2]]);
    expect(http.urls().filter((u) => /postings\/\d+$/.test(u))).toEqual([srDetailUrl("NielsenIQ", ids[0]!)]);
    expect(c.log.lines.some((l) => l.level === "warn" && /throttled/.test(l.msg))).toBe(true);
  });

  it("skips postings that vanished between list and detail", async () => {
    const r = routes("Freshworks", "freshworks");
    r[srDetailUrl("Freshworks", m.remoteContract!)] = { status: 404, body: "" };
    const jobs = await collect(smartrecruitersScraper.scrape(ctx(fakeHttp(r), [t("freshworks", "Freshworks")])));
    expect(jobs.map((j) => j.sourceJobId)).toEqual([m.indiaHybrid]);
  });

  it("never emits the posting creator (personal data)", async () => {
    const r = routes("Freshworks", "freshworks");
    const list = fixtureJson("smartrecruiters/freshworks-list.json");
    list.content = list.content.map((p: SrPosting) => ({ ...p, creator: { name: "Recruiter Person" } }));
    r[srListUrl("Freshworks", 0)] = json(list);
    const jobs = await collect(smartrecruitersScraper.scrape(ctx(fakeHttp(r), [t("freshworks", "Freshworks")], { isKnown: () => true })));
    expect(JSON.stringify(jobs)).not.toContain("Recruiter Person");
  });

  it("paginates by offset until totalFound, honouring an optional country filter", async () => {
    const all: SrPosting[] = Array.from({ length: 230 }, (_, i) => ({
      id: String(9_000_000 + i),
      name: `Analyst ${i}`,
      releasedDate: "2026-11-01T00:00:00.000Z",
      location: { city: "Pune", country: "in", remote: false, hybrid: false },
    }));
    const http = fakeHttp({
      "https://api.smartrecruiters.com/v1/companies/BoschGroup/postings": (url) => {
        const offset = Number(url.searchParams.get("offset"));
        return json({ offset, limit: 100, totalFound: all.length, content: all.slice(offset, offset + 100) });
      },
    });
    const jobs = await collect(smartrecruitersScraper.scrape(ctx(http, [t("bosch", "BoschGroup", { country: "IN" })], { isKnown: () => true })));
    expect(jobs).toHaveLength(230);
    expect(http.urls()).toEqual([0, 100, 200].map((o) => srListUrl("BoschGroup", o, "in")));
    expect(http.urls()[0]).toContain("&country=in");
  });

  it("notes that an empty board may be an unknown company id", async () => {
    const http = fakeHttp({ [srListUrl("Nope", 0)]: json({ offset: 0, limit: 100, totalFound: 0, content: [] }) });
    const c = ctx(http, [t("nope", "Nope")]);
    expect(await collect(smartrecruitersScraper.scrape(c))).toEqual([]);
    expect(c.log.lines.some((l) => /unknown company id/.test(l.msg))).toBe(true);
  });
});

describe("smartrecruiters helpers", () => {
  it("maps experience levels conservatively", () => {
    expect(srLevel({ id: "internship" }, "Intern")).toBe("intern");
    expect(srLevel({ id: "associate" }, "Analyst")).toBe("entry");
    expect(srLevel({ id: "executive" }, "CFO")).toBe("executive");
    expect(srLevel({ id: "mid_senior_level" }, "Software Engineer")).toBe("mid");
    expect(srLevel({ id: "mid_senior_level" }, "Principal Engineer")).toBeUndefined();
    expect(srLevel({ id: "not_applicable" }, "Engineer")).toBeUndefined();
    expect(srLevel(null, "Engineer")).toBeUndefined();
  });

  it("composes locations and work modes", () => {
    expect(srLocationText({ city: "Chennai", country: "in", fullLocation: "Chennai, , India" })).toBe("Chennai, India");
    expect(srLocationText({ city: "Pune", region: "MH", country: "in" })).toBe("Pune, MH, India");
    expect(srWorkMode({ remote: true, hybrid: false })).toBe("remote");
    expect(srWorkMode({ remote: false, hybrid: false })).toBe("onsite");
    expect(srWorkMode({ city: "Pune" })).toBeUndefined();
  });

  it("parses tokens", () => {
    expect(smartRecruitersToken("Visa")).toBe("Visa");
    expect(smartRecruitersToken("https://jobs.smartrecruiters.com/BoschGroup")).toBe("BoschGroup");
    expect(smartRecruitersToken("https://careers.smartrecruiters.com/ServiceNow/jobs")).toBe("ServiceNow");
    expect(smartRecruitersToken("https://api.smartrecruiters.com/v1/companies/Freshworks/postings")).toBe("Freshworks");
  });
});
