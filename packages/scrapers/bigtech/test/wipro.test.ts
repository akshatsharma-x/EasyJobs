import { beforeEach, describe, expect, it } from "vitest";
import { parseRmkJobPage, parseRmkSitemap } from "../src/sites/_successfactors";
import { isWiproIndia, mapWiproJob, parseWiproSlug, wipro, wiproSkillsAndExperience, wiproSkipped } from "../src/sites/wipro";
import { collect, fakeHttp, fixture, invalidJobs } from "./helpers";

const routes = [
  { match: /careers\.wipro\.com\/sitemap\.xml$/, file: "wipro/sitemap.xml", contentType: "text/xml" },
  { match: /\/1375742855\/$/, file: "wipro/job-1375742855.html" },
  { match: /\/1374081755\/$/, file: "wipro/job-1374081755.html" },
  { match: /\/1363531455\/$/, file: "wipro/job-1363531455.html" },
];

describe("wipro", () => {
  beforeEach(() => wiproSkipped.clear());

  it("parses RMK slugs (city, title, country, postal)", () => {
    expect(parseWiproSlug("Bengaluru-DEVELOPER-L3-IND-560035")).toEqual({ city: "Bengaluru", title: "DEVELOPER L3", country: "IND", postal: "560035" });
    expect(parseWiproSlug("Greater-Noida-ADMINISTRATOR-L1-IND-201306")).toMatchObject({ city: "Greater Noida", title: "ADMINISTRATOR L1" });
    expect(parseWiproSlug("Kochi-Technical-Lead-L1-IND")).toMatchObject({ city: "Kochi", country: "IND", postal: null });
    expect(parseWiproSlug("Yokohama-SERVICE-DESK-ANALYST-JPN-220-8126")).toMatchObject({ country: "JPN", postal: "220-8126" });
    // A trailing acronym is a title word, not a country.
    expect(parseWiproSlug("Pune-JAVA-SAP")).toMatchObject({ city: "Pune", title: "JAVA SAP", country: null });
    expect(parseWiproSlug("Pune-SOLUTION-ARCHITECT-L1(CONTRACT)-IND-411005").title).toBe("SOLUTION ARCHITECT L1(CONTRACT)");
  });

  it("selects India from the sitemap and sorts newest ids first", () => {
    const entries = parseRmkSitemap(fixture("wipro/sitemap.xml"));
    expect(entries.map((e) => e.id)).toEqual(["1378539755", "1375742855", "1374081755", "1368846755", "1363531455", "1348738655", "1139995355"]);
    expect(entries.filter(isWiproIndia).map((e) => e.id)).toEqual(["1375742855", "1374081755", "1368846755", "1363531455"]);
    expect(entries[1]!.slug).toBe("Hyderabad-PRINCIPAL-CONSULTANT-TECH-&-IMPL-L1-IND-500032");
  });

  it("emits India jobs with details, skips closed postings and failed details", async () => {
    const http = fakeHttp(routes);
    const jobs = await collect(wipro, { http });
    expect(invalidJobs(jobs)).toEqual([]);
    expect(jobs.map((j) => j.sourceJobId)).toEqual(["1375742855", "1374081755"]);
    expect(wipro.lastRun).toMatchObject({ listed: 4, emitted: 2, details: 4, detailErrors: 1, siteTotal: 4 });
    expect(wiproSkipped.has("1363531455")).toBe(true);
    // The closed posting is not fetched again on the next run.
    const again = fakeHttp(routes);
    await collect(wipro, { http: again });
    expect(again.calls.some((c) => c.url.includes("/1363531455/"))).toBe(false);
  });

  it("maps a job page (date, skills, experience, slug-derived title/location)", async () => {
    const jobs = await collect(wipro, { http: fakeHttp(routes), limit: 1 });
    expect(jobs[0]).toMatchObject({
      source: "wipro",
      sourceKind: "career_site",
      target: "wipro",
      company: "Wipro",
      sourceJobId: "1375742855",
      title: "PRINCIPAL CONSULTANT TECH & IMPL L1",
      locations: ["Hyderabad, India"],
      postedAt: "2026-11-09T00:00:00.000Z",
      experienceRaw: "8-10 Years",
      experienceMin: 8,
      experienceMax: 10,
      skills: ["Test Management"],
      applyUrl: "https://careers.wipro.com/job/Hyderabad-PRINCIPAL-CONSULTANT-TECH-&-IMPL-L1-IND-500032/1375742855/",
    });
    expect(jobs[0]!.extra).toMatchObject({ pageTitle: "PRINCIPAL CONSULTANT - TECH & IMPL L1", state: "Telangana", band: "L1" });
    expect(jobs[0]!.descriptionText).toContain("Mandatory Skills: Test Management");
    expect(jobs[0]!.descriptionText).not.toMatch(/Reinvent your world|NYSE: WIT/);
  });

  it("emits light records for known ids without fetching their pages", async () => {
    const http = fakeHttp(routes);
    const jobs = await collect(wipro, { http, isKnown: (id) => id === "1368846755" || id === "1374081755" });
    const light = jobs.find((j) => j.sourceJobId === "1368846755");
    expect(light).toMatchObject({ title: "TECHNO FUNCTIONAL CONSULTANT L1", locations: ["Pune, India"], descriptionHtml: null, postedAt: null });
    expect(http.calls.some((c) => c.url.includes("/1374081755/") || c.url.includes("/1368846755/"))).toBe(false);
    // Light and full records agree on title/locations, so merges don't flip them.
    const full = jobs.find((j) => j.sourceJobId === "1375742855")!;
    const fullAsLight = mapWiproJob(parseRmkSitemap(fixture("wipro/sitemap.xml"))[1]!, null);
    expect([fullAsLight.title, fullAsLight.locations]).toEqual([full.title, full.locations]);
  });

  it("parses closed pages and the skills/experience footer", () => {
    expect(parseRmkJobPage(fixture("wipro/job-1363531455.html")).closed).toBe(true);
    expect(wiproSkillsAndExperience("… Mandatory Skills: Python Application Programming . Experience: 5-8 Years .")).toEqual({
      skills: ["Python Application Programming"],
      experienceRaw: "5-8 Years",
    });
    expect(wiproSkillsAndExperience("no footer")).toEqual({ skills: [], experienceRaw: null });
  });
});
