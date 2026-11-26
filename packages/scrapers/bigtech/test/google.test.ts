import { describe, expect, it } from "vitest";
import {
  categoryLabel, google, GOOGLE_FEED_URL, googleJobType, googleJobUrl, googleMinYears, isGoogleIndiaJob, mapGoogleJob,
  parseGoogleFeed, xmlText,
} from "../src/sites/google";
import { collect, fakeHttp, fixture, invalidJobs } from "./helpers";

const feed = () => parseGoogleFeed(fixture("google/feed.xml"));
const byId = (id: string) => feed().jobs.find((j) => j.jobid === id)!;

describe("google", () => {
  it("parses the jobs feed", () => {
    const { updated, jobs } = feed();
    expect(updated).toMatch(/^2026-11-25T/);
    expect(jobs).toHaveLength(10);
    const intern = byId("109375266236572358");
    expect(intern).toMatchObject({ jobtype: "INTERN", employer: "Google", categories: expect.any(Array), isRemote: false, isHybrid: false });
    expect(intern.descriptionHtml).toContain("<h3>Minimum qualifications:</h3>");
    expect(intern.locations[0]).toEqual({ city: "Bengaluru", state: "Karnataka", country: "India" });
    expect(() => parseGoogleFeed("<html></html>")).toThrow(/root not found/);
    expect(xmlText("<a><state/><b><![CDATA[x & y]]></b></a>", "state")).toBeNull();
    expect(xmlText("<a><b><![CDATA[x & y]]></b></a>", "b")).toBe("x & y");
  });

  it("keeps only jobs with an India location and emits valid RawJobs from one request", async () => {
    const http = fakeHttp([{ match: (u) => u === GOOGLE_FEED_URL, file: "google/feed.xml", contentType: "text/xml" }]);
    const jobs = await collect(google, { http });
    expect(http.calls).toHaveLength(1);
    expect(invalidJobs(jobs)).toEqual([]);
    expect(jobs).toHaveLength(7);
    expect(jobs.every((j) => j.locations.some((l) => l.endsWith("India")))).toBe(true);
    expect(jobs.map((j) => j.sourceJobId)).not.toContain("133119160782594758"); // USA only
    expect(jobs.map((j) => j.sourceJobId)).not.toContain("76410318229512902"); // remote USA/France
    expect(jobs.map((j) => j.sourceJobId)).not.toContain("110885490286043846"); // no location
    expect(google.lastRun).toMatchObject({ listed: 7, emitted: 7, siteTotal: 7 });
  });

  it("maps an internship, a remote role and Google's level markers", () => {
    const intern = mapGoogleJob(byId("109375266236572358"));
    expect(intern).toMatchObject({
      source: "google",
      sourceKind: "career_site",
      company: "Google",
      title: "Silicon Engineering Intern, PhD, Summer 2027",
      jobType: "internship",
      experienceLevel: "intern",
      workMode: "onsite",
      isRemote: false,
      employmentTypeRaw: "INTERN",
      applyUrl: expect.stringMatching(/^https:\/\/www\.google\.com\/about\/careers\/applications\/jobs\/results\/109375266236572358-/),
    });
    expect(intern.postedAt).toMatch(/^20\d\d-\d\d-\d\dT/);
    expect(intern.descriptionText).toContain("Minimum qualifications:");
    const remote = mapGoogleJob(byId("125423735539671750"));
    expect(remote).toMatchObject({ workMode: "remote", isRemote: true, jobType: "internship" });
    expect(mapGoogleJob(byId("111711283144729286")).experienceLevel).toBe("entry"); // "…, Early Career"
    const youtube = mapGoogleJob(byId("85187811895845574"));
    expect(youtube.extra).toMatchObject({ employer: "YouTube" });
    const multi = mapGoogleJob(byId("115242053855519430"));
    expect(multi.locations.length).toBeGreaterThan(1);
    expect(isGoogleIndiaJob(byId("115242053855519430"))).toBe(true);
  });

  it("treats explicit fixed-term titles as contracts and extracts years", () => {
    expect(googleJobType(byId("129129141264884422"))).toBe("contract");
    expect(googleJobType({ jobtype: "FULL_TIME", title: "Contract Manager, Legal" })).toBe("full_time");
    expect(googleMinYears("<h3>Minimum qualifications:</h3><ul><li>Bachelor's degree.</li><li>5 years of experience with C++.</li><li>2 years of experience in ML.</li></ul><h3>Preferred qualifications:</h3><ul><li>10 years of experience</li></ul>")).toMatchObject({ min: 5 });
    expect(googleMinYears("<p>no quals</p>")).toBeNull();
  });

  it("canonicalises legacy careers.google.com URLs and category codes", () => {
    expect(googleJobUrl({ jobid: "1", url: "https://careers.google.com/jobs/results/96880477301809862-research-scientist/" })).toBe(
      "https://www.google.com/about/careers/applications/jobs/results/96880477301809862-research-scientist",
    );
    expect(googleJobUrl({ jobid: "42", url: null })).toBe("https://www.google.com/about/careers/applications/jobs/results/42");
    expect(categoryLabel("SOFTWARE_ENGINEERING")).toBe("Software Engineering");
    expect(categoryLabel("INFORMATION_TECHNOLOGY")).toBe("Information Technology");
  });
});
