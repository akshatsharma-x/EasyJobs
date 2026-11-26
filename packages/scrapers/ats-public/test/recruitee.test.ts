import { describe, expect, it } from "vitest";
import { mapRecruiteeOffer, recruiteeLevel, recruiteeOffersUrl, recruiteeOrigin, recruiteeWorkMode } from "../src/adapters/recruitee";
import { recruiteeScraper } from "../src/index";
import { byId, collect, ctx, expectAllValid, fakeHttp, fixtureJson, json, notFound, manifest, target } from "./helpers";

const m = manifest.recruitee!;
const t = (slug: string, token = slug) => target({ slug, ats: "recruitee", token });

async function scrape(company: string) {
  const http = fakeHttp({ [recruiteeOffersUrl(recruiteeOrigin(company))]: json(fixtureJson(`recruitee/${company}.json`)) });
  const jobs = await collect(recruiteeScraper.scrape(ctx(http, [t(company)])));
  expectAllValid(jobs);
  return jobs;
}

describe("recruitee adapter", () => {
  it("maps a yearly salary, on-site work and the 'experienced' level", async () => {
    const job = byId(await scrape("advancy"), m.salaryYear!);
    expect(job).toMatchObject({
      source: "recruitee",
      sourceKind: "ats",
      salary: { min: 70_000, max: 100_000, currency: "GBP", period: "year", raw: "GBP 70,000–100,000 per year" },
      workMode: "onsite",
      isRemote: false,
      jobType: "full_time",
      experienceLevel: "mid",
      experienceRaw: "Experienced",
      locations: ["London, England, United Kingdom"],
      postedAt: "2026-11-16T14:54:20.000Z", // "2026-11-16 14:54:20 UTC"
      sourceUrl: "https://advancy.recruitee.com/o/london-strategy-consultant-3-years-experience-required",
    });
  });

  it("maps internships for college students", async () => {
    expect(byId(await scrape("advancy"), m.internship!)).toMatchObject({ jobType: "internship", experienceLevel: "intern", locations: ["Paris, Île-de-France, France"] });
  });

  it("emits no salary when every salary field is null", async () => {
    const job = byId(await scrape("advancy"), m.noSalary!);
    expect(job.salary).toBeUndefined();
    expect(job).toMatchObject({ experienceLevel: "entry", jobType: "full_time" });
  });

  it("maps hybrid offers on a custom career domain", async () => {
    const job = byId(await scrape("acturis"), m.hybridCustomDomain!);
    expect(job).toMatchObject({ workMode: "hybrid", isRemote: false, experienceLevel: "mid" });
    expect(job.sourceUrl).toMatch(/^https:\/\/careers\.acturis\.com\/o\//);
  });

  it("maps remote-only offers (and ignores a salary with no amounts)", async () => {
    const job = byId(await scrape("addepto"), m.remoteOnly!);
    expect(job).toMatchObject({ workMode: "remote", isRemote: true, locations: ["Warszawa, Mazowieckie, Poland"] });
    expect(job.salary).toBeUndefined();
  });

  it("maps monthly salaries", async () => {
    expect(byId(await scrape("channable"), m.salaryMonth!).salary).toMatchObject({ min: 4000, max: 5700, currency: "EUR", period: "month" });
  });

  it("skips unpublished offers and logs dead career sites", async () => {
    const offers = fixtureJson("recruitee/advancy.json");
    offers.offers[0].status = "closed";
    const http = fakeHttp({
      [recruiteeOffersUrl("https://advancy.recruitee.com")]: json(offers),
      [recruiteeOffersUrl("https://gone.recruitee.com")]: notFound("<html>404</html>"),
    });
    const c = ctx(http, [t("advancy"), t("gone")]);
    const jobs = await collect(recruiteeScraper.scrape(c));
    expect(jobs).toHaveLength(offers.offers.length - 1);
    expect(c.log.lines.some((l) => l.scope.endsWith(":gone") && /board not found/.test(l.msg))).toBe(true);
  });

  it("maps close_at to validThrough and fixed-term contracts", () => {
    const job = mapRecruiteeOffer(
      { id: 7, title: "Analyst", careers_url: "https://acme.recruitee.com/o/analyst", close_at: "2026-12-31 23:59:00 UTC", employment_type_code: "fulltime_fixed_term" },
      t("acme"),
      "https://acme.recruitee.com",
    );
    expect(job).toMatchObject({ validThrough: "2026-12-31T23:59:00.000Z", jobType: "contract" });
  });

  it("maps experience codes and work-mode flags", () => {
    expect(recruiteeLevel("student_college", "full_time", "Graduate Engineer")).toBe("fresher");
    expect(recruiteeLevel("student_college", "internship", "Intern")).toBe("intern");
    expect(recruiteeLevel("manager", undefined, "Team Lead")).toBe("lead");
    expect(recruiteeLevel("experienced", undefined, "Senior Engineer")).toBeUndefined();
    expect(recruiteeWorkMode({ id: 1, remote: true, on_site: true })).toBe("hybrid");
    expect(recruiteeWorkMode({ id: 1 })).toBeUndefined();
  });

  it("accepts custom career domains as tokens", () => {
    expect(recruiteeOrigin("bunq")).toBe("https://bunq.recruitee.com");
    expect(recruiteeOrigin("https://careers.acturis.com/")).toBe("https://careers.acturis.com");
  });
});
