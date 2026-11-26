import { describe, expect, it } from "vitest";
import {
  apple, appleFirstPostingDate, appleJobUrl, appleLocationLabel, appleSearchUrl, cleanAppleTitle, mapAppleJob,
  parseAppleDetailPage, parseAppleHydration, parseAppleSearchPage,
} from "../src/sites/apple";
import { collect, fakeHttp, fixture, invalidJobs } from "./helpers";

const routes = [
  { match: /\/en-in\/search\?location=india-INDC&sort=newest&page=1$/, file: "apple/search-page1.html" },
  { match: /\/en-in\/search\?location=india-INDC&sort=newest&page=2$/, file: "apple/search-page2.html" },
  { match: /\/en-in\/details\/200313970\//, file: "apple/detail-200313970.html" },
  { match: /\/en-in\/details\/200690650\//, file: "apple/detail-200690650.html" },
];

describe("apple", () => {
  it("decodes the JSON.parse(\"…\") hydration script and an object-literal fallback", () => {
    const data = parseAppleHydration(fixture("apple/search-page1.html"));
    expect(Object.keys((data?.loaderData as object) ?? {})).toContain("search");
    const literal = parseAppleHydration('<script>window.__staticRouterHydrationData = {"loaderData":{"x":1}};</script>');
    expect(literal).toEqual({ loaderData: { x: 1 } });
    expect(parseAppleHydration("<html>no data</html>")).toBeNull();
    expect(() => parseAppleSearchPage("<html></html>")).toThrow(/hydration data not found/);
  });

  it("builds India search and job URLs", () => {
    expect(appleSearchUrl(3)).toBe("https://jobs.apple.com/en-in/search?location=india-INDC&sort=newest&page=3");
    expect(appleJobUrl({ positionId: "200313970", transformedPostingTitle: "in-business-expert" })).toBe(
      "https://jobs.apple.com/en-in/details/200313970/in-business-expert",
    );
  });

  it("parses search pages", () => {
    const { results, total, page } = parseAppleSearchPage(fixture("apple/search-page1.html"));
    expect(total).toBe(6);
    expect(page).toBe(1);
    expect(results.map((r) => r.positionId)).toEqual(["200313970", "200696475", "200637488", "200690650"]);
  });

  it("paginates, merges multi-location positions across pages and fetches details only for unknown ids", async () => {
    const http = fakeHttp(routes);
    const known = new Set(["200696475", "200637488", "200696473"]);
    const jobs = await collect(apple, { http, env: { BIGTECH_PAGE_SIZE: "4" }, isKnown: (id) => known.has(id) });
    expect(invalidJobs(jobs)).toEqual([]);
    expect(jobs.map((j) => j.sourceJobId)).toEqual(["200313970", "200696475", "200637488", "200690650", "200696473"]);
    const urls = http.calls.map((c) => c.url);
    expect(urls.filter((u) => u.includes("/search?"))).toHaveLength(2);
    expect(urls.filter((u) => u.includes("/details/")).map((u) => u.split("/")[5])).toEqual(["200313970", "200690650"]);
    const multi = jobs.find((j) => j.sourceJobId === "200690650")!;
    expect(multi.locations).toEqual(["Bengaluru, India", "Hyderabad, India"]);
    expect(multi.descriptionHtml).toContain("<h3>Minimum Qualifications</h3>");
    expect(multi).toMatchObject({ experienceMin: 4, experienceMax: 8, department: "Software and Services", postedAt: "2026-10-21T09:14:53.138Z" });
    const light = jobs.find((j) => j.sourceJobId === "200696475")!;
    expect(light.descriptionHtml).toContain("Find My");
    expect(light.descriptionHtml).not.toContain("Minimum Qualifications");
    expect(light.postedAt).toBe("2026-11-24T07:20:19.547Z");
    expect(apple.lastRun).toMatchObject({ listed: 5, emitted: 5, details: 2, siteTotal: 6 });
  });

  it("maps a managed pipeline retail role with its original posting date", () => {
    const [r] = parseAppleSearchPage(fixture("apple/search-page1.html")).results;
    const d = parseAppleDetailPage(fixture("apple/detail-200313970.html"));
    const job = mapAppleJob(r!, d);
    expect(job).toMatchObject({
      source: "apple",
      sourceKind: "career_site",
      sourceJobId: "200313970",
      title: "Business Expert",
      company: "Apple",
      locations: ["India"],
      postedAt: "2026-06-02T10:58:43.130Z",
      department: "Apple Retail / Sales and Business Development",
      employmentTypeRaw: "40 hours/week",
      jobType: "full_time",
      applyUrl: "https://jobs.apple.com/en-in/details/200313970/in-business-expert",
    });
    expect(job.extra).toMatchObject({ postingType: "PIPE", managedPipelineRole: true, appleJobType: "RETAIL", postingTitle: "IN-Business Expert" });
    // Without the detail, a managed pipeline role has no trustworthy date (the list one is refreshed constantly).
    expect(mapAppleJob(r!, null).postedAt).toBeNull();
  });

  it("maps internships, remote roles and labels", () => {
    const [r] = parseAppleSearchPage(fixture("apple/search-page1.html")).results;
    const intern = mapAppleJob({ ...r!, managedPipelineRole: false, postingTitle: "Software Engineering Intern", team: { teamName: "Students: Internships" }, homeOffice: true }, null);
    expect(intern).toMatchObject({ jobType: "internship", experienceLevel: "intern", workMode: "remote", isRemote: true });
    expect(appleLocationLabel({ name: "Hyderabad", stateProvince: "Telangana", countryName: "India", level: 5 })).toBe("Hyderabad, India");
    expect(appleLocationLabel({ name: "India", countryName: "India", level: 1 })).toBe("India");
    expect(cleanAppleTitle("IN-Business Expert")).toBe("Business Expert");
    expect(appleFirstPostingDate({ postingPostLocationData: { a: { x: { postingDate: "2026-05-01T00:00:00Z" } }, b: { y: { postingDate: "2026-04-01T00:00:00Z" } } } })).toBe(
      "2026-04-01T00:00:00.000Z",
    );
  });
});
