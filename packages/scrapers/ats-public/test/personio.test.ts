import { UnexpectedResponseError } from "../src/core/errors";
import { describe, expect, it } from "vitest";
import { parsePersonioXml, personioFeedUrl, personioJobType, personioOrigin } from "../src/adapters/personio";
import { personioScraper } from "../src/index";
import { byId, collect, ctx, expectAllValid, fakeHttp, fixtureText, manifest, notFound, target, xml } from "./helpers";

const m = manifest.personio!;
const t = (slug: string, token: string) => target({ slug, ats: "personio", token });

describe("personio adapter", () => {
  it("maps structured hints, years buckets and drops recruiter contact sections", async () => {
    const origin = personioOrigin("360t");
    const http = fakeHttp({ [personioFeedUrl(origin, "en")]: xml(fixtureText("personio/360t.xml")) });
    const jobs = await collect(personioScraper.scrape(ctx(http, [t("360t", "360t")])));
    expectAllValid(jobs);
    const job = byId(jobs, m.contactSection!);
    expect(job).toMatchObject({
      source: "personio",
      title: "(JUNIOR) PEOPLE OPERATIONS & TALENT ACQUISITION MANAGER (f/m/d)",
      jobType: "full_time",
      experienceLevel: "entry",
      experienceMin: 1,
      experienceMax: 2,
      experienceRaw: "1-2 years",
      locations: ["Frankfurt am Main"],
      department: "People Operations",
      postedAt: "2023-10-16T14:54:33.000Z",
      sourceUrl: "https://360t.jobs.personio.de/job/1289877",
    });
    expect(job.descriptionHtml).toContain("<h3>Your Role</h3>");
    expect(job.descriptionHtml).not.toMatch(/<h3>Contact/);
    expect(JSON.stringify(jobs)).not.toContain("Recruiter Name"); // the (redacted) recruiter contact never leaks
    // every position had English text → no second request
    expect(http.calls).toHaveLength(1);
    const student = jobs.find((j) => j.sourceJobId !== m.contactSection)!;
    expect(student).toMatchObject({ jobType: "part_time", experienceLevel: "intern", experienceMin: 0, experienceMax: 1 });
    expect(student.extra?.subcompany).toBe("360T Asia Pacific Pte. Ltd.");
  });

  it("fills descriptions missing from the English feed from the default-language feed", async () => {
    const origin = personioOrigin("1komma5grad");
    const http = fakeHttp({
      [personioFeedUrl(origin, "en")]: xml(fixtureText("personio/1komma5grad-en.xml")),
      [personioFeedUrl(origin, "default")]: xml(fixtureText("personio/1komma5grad-default.xml")),
    });
    const jobs = await collect(personioScraper.scrape(ctx(http, [t("1komma5", "1komma5grad")])));
    expectAllValid(jobs);
    expect(http.urls()).toEqual(["https://1komma5grad.jobs.personio.de/xml?language=en", "https://1komma5grad.jobs.personio.de/xml"]);
    const german = byId(jobs, m.germanOnly!);
    expect(german.descriptionHtml).toContain("<h3>Deine Position</h3>");
    expect(german.extra?.descriptionLanguage).toBe("default");
    expect(german.locations).toEqual(["Berlin", "Berlin (Remote)"]); // additionalOffices
    expect(byId(jobs, m.workingStudent!)).toMatchObject({ jobType: "part_time", experienceLevel: "intern" });
    expect(byId(jobs, m.trainee!)).toMatchObject({ jobType: "apprenticeship", experienceMin: 0, experienceMax: 1 });
    expect(http.calls.every((c) => c.init.robots === true)).toBe(true);
  });

  it("handles empty feeds, dead boards and non-feed XML", async () => {
    expect(parsePersonioXml('<?xml version="1.0"?><workzag-jobs></workzag-jobs>')).toEqual([]);
    expect(() => parsePersonioXml("<html><body>hi</body></html>")).toThrow(UnexpectedResponseError);
    const http = fakeHttp({ [personioFeedUrl(personioOrigin("gone"), "en")]: notFound() });
    const c = ctx(http, [t("gone", "gone")]);
    expect(await collect(personioScraper.scrape(c))).toEqual([]);
    expect(c.log.lines.some((l) => /board not found/.test(l.msg))).toBe(true);
  });

  it("maps employment types with the schedule", () => {
    expect(personioJobType({ employmentType: "permanent", schedule: "part-time" })).toBe("part_time");
    expect(personioJobType({ employmentType: "permanent", schedule: "full-or-part-time" })).toBe("full_time");
    expect(personioJobType({ employmentType: "intern", schedule: "full-time" })).toBe("internship");
    expect(personioJobType({ employmentType: "freelance" })).toBe("freelance");
    expect(personioJobType({ employmentType: "mystery" })).toBeUndefined();
  });

  it("accepts .com hosts and URLs as tokens", () => {
    expect(personioOrigin("acme")).toBe("https://acme.jobs.personio.de");
    expect(personioOrigin("acme.jobs.personio.com")).toBe("https://acme.jobs.personio.com");
    expect(personioOrigin("https://acme.jobs.personio.de/job/1")).toBe("https://acme.jobs.personio.de");
  });
});
