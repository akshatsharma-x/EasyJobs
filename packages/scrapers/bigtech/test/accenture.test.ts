import { describe, expect, it } from "vitest";
import {
  accenture, accentureBands, accentureForm, accentureJobUrl, accenturePartitions, accentureYears, mapAccentureJob,
  type AccentureAggregation, type AccentureSearchResponse,
} from "../src/sites/accenture";
import { collect, fakeHttp, fixtureJson, invalidJobs, type Route } from "./helpers";

/** fakeHttp serialises FormData as [["startIndex","0"],["maxResultSize","1"],…]. */
const form = (body: string): Record<string, string> => Object.fromEntries(JSON.parse(body) as [string, string][]);

const routes: Route[] = [
  { match: (_u, b) => form(b).maxResultSize === "1", file: "accenture/findjobs-probe.json" },
  { match: (_u, b) => form(b).startIndex === "0", file: "accenture/findjobs-p1.json" },
  { match: (_u, b) => form(b).startIndex === "4", file: "accenture/findjobs-p2.json" },
];

describe("accenture", () => {
  it("sends the careers-page form: India, newest first, filters as JSON", () => {
    const f = Object.fromEntries(
      [...accentureForm(100, 50, [{ fieldName: "yearsOfExperience.keyword", items: ["Experience: 0-2 years"], multiSelect: false }]).entries()].map(([k, v]) => [k, String(v)]),
    );
    expect(f).toMatchObject({ startIndex: "100", maxResultSize: "50", jobCountry: "India", countrySite: "in-en", sortBy: "1" });
    expect(JSON.parse(f.jobFilters!)).toEqual([{ fieldName: "yearsOfExperience.keyword", items: ["Experience: 0-2 years"], multiSelect: false }]);
  });

  it("probes totals, then pages the default 0-2 years band", async () => {
    const http = fakeHttp(routes);
    const jobs = await collect(accenture, { http, env: { BIGTECH_PAGE_SIZE: "4" } });
    expect(jobs).toHaveLength(6);
    expect(invalidJobs(jobs)).toEqual([]);
    const bodies = http.calls.map((c) => form(c.body));
    expect(bodies.map((b) => [b.startIndex, b.maxResultSize])).toEqual([["0", "1"], ["0", "4"], ["4", "4"]]);
    expect(JSON.parse(bodies[1]!.jobFilters!)).toEqual([{ fieldName: "yearsOfExperience.keyword", items: ["Experience: 0-2 years"], multiSelect: false }]);
    expect(accenture.lastRun?.siteTotal).toBe(25290);
  });

  it("maps a New Associate posting", () => {
    const job = mapAccentureJob(fixtureJson<AccentureSearchResponse>("accenture/findjobs-p1.json").data![0]!)!;
    expect(job).toMatchObject({
      sourceJobId: "AIOC-S01665967",
      sourceUrl: "https://www.accenture.com/in-en/careers/jobdetails?id=AIOC-S01665967_en",
      applyUrl: "https://www.accenture.com/in-en/careers/jobdetails?id=AIOC-S01665967_en",
      title: "Health Operations New Associate",
      company: "Accenture",
      locations: ["Navi Mumbai, India"],
      postedAt: "2026-11-25T16:45:03.067Z",
      department: "Business Process Delivery",
      employmentTypeRaw: "Full-time",
      jobType: "full_time",
      experienceLevel: "fresher",
      experienceMin: 0,
      experienceMax: 1,
      degrees: ["Bachelor Degree", "Graduate Degree/PhD"],
    });
    expect(job.skills).toContain("Order Management");
    expect(job.descriptionHtml).toContain("<b>Designation:</b>");
    expect(job.descriptionHtml).not.toMatch(/\n/);
    expect(job.extra).toMatchObject({ careerLevel: "New Associate", careerStage: "Early Career", experienceBand: "Experience: 0-2 years" });
  });

  it("maps career levels and multi-city postings", () => {
    const p2 = fixtureJson<AccentureSearchResponse>("accenture/findjobs-p2.json").data!;
    const p1 = fixtureJson<AccentureSearchResponse>("accenture/findjobs-p1.json").data!;
    expect(mapAccentureJob(p1[3]!)?.experienceLevel).toBe("entry"); // Associate
    const multi = mapAccentureJob(p2.find((j) => (j.location?.length ?? 0) > 1)!)!;
    expect(multi.locations).toEqual(["Hyderabad, India", "Pune, India"]);
    expect(multi.experienceLevel).toBe("mid"); // Senior Analyst, "Experience: 2-5 years"
  });

  it("prefers the description's years over the facet band", () => {
    expect(accentureYears({ title: "x", jobDescription: "<b>Years of Experience:</b>3 to 5 years <br>", yearsOfExperience: "Experience: 2-5 years" })).toMatchObject({ min: 3, max: 5 });
    expect(accentureYears({ title: "x", yearsOfExperience: "Experience: 2-5 years" })).toMatchObject({ min: 2, max: 5 });
    expect(accentureJobUrl({ title: "x", jobDetailUrl: "https://www.accenture.com/{0}/careers/jobdetails?id=X_en&title=T" })).toBe(
      "https://www.accenture.com/in-en/careers/jobdetails?id=X_en&title=T",
    );
  });

  it("reads ACCENTURE_EXPERIENCE and splits bands at the 10k window by city", () => {
    expect(accentureBands({})).toEqual(["0-2"]);
    expect(accentureBands({ ACCENTURE_EXPERIENCE: "0-2, 2-5 years" })).toEqual(["0-2", "2-5"]);
    expect(accentureBands({ ACCENTURE_EXPERIENCE: "all" })).toBe("all");
    const aggs: AccentureAggregation[] = [
      { fieldName: "yearsOfExperience.keyword", items: [{ term: "Experience: 0-2 years", count: 2721 }, { term: "Experience: 5-10 years", count: 11088 }] },
      { fieldName: "location.keyword", items: [{ term: "Pune", count: 2462 }, { term: "Bengaluru", count: 10518 }] },
    ];
    const parts = accenturePartitions("all", aggs);
    expect(parts).toHaveLength(3);
    expect(parts[0]).toEqual([{ fieldName: "yearsOfExperience.keyword", items: ["Experience: 0-2 years"], multiSelect: false }]);
    expect(parts[2]).toEqual([
      { fieldName: "yearsOfExperience.keyword", items: ["Experience: 5-10 years"], multiSelect: false },
      { fieldName: "location.keyword", items: ["Bengaluru"], multiSelect: false },
    ]);
  });

  it("propagates an API failure message", async () => {
    const http = fakeHttp([{ match: /findjobs/, body: { data: null, message: "Failure" } }]);
    await expect(collect(accenture, { http })).rejects.toThrow("accenture: findjobs: Failure");
  });
});
