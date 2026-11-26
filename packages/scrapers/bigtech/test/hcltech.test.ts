import { beforeEach, describe, expect, it } from "vitest";
import { parseRmkJobPage, parseRmkSitemap, slugWords } from "../src/sites/_successfactors";
import { hclPlace, hclSkills, hclSkipped, hcltech, isHclIndia, splitHclLocations } from "../src/sites/hcltech";
import { collect, fakeHttp, fixture, invalidJobs } from "./helpers";

const routes = [
  { match: /careers\.hcltech\.com\/sitemap\.xml$/, file: "hcltech/sitemap.xml", contentType: "text/xml" },
  { match: /\/1376184355\/$/, file: "hcltech/job-1376184355.html" },
  { match: /\/1371642955\/$/, file: "hcltech/job-1371642955.html" },
  { match: /\/1364125055\/$/, file: "hcltech/job-1364125055.html" },
  { match: /\/1341671955\/$/, file: "hcltech/job-1341671955.html" },
];

describe("hcltech", () => {
  beforeEach(() => hclSkipped.clear());

  it("splits concatenated multi-locations", () => {
    expect(splitHclLocations("| Chennai, Tamil NaduBengaluru, Karnataka")).toEqual(["Chennai, Tamil Nadu", "Bengaluru, Karnataka"]);
    expect(splitHclLocations("| Noida, Uttar PradeshLucknow, Uttar PradeshHyderabad, Telangana")).toHaveLength(3);
    expect(splitHclLocations("Gurugram, Haryana")).toEqual(["Gurugram, Haryana"]);
    expect(splitHclLocations("Others, Karnataka")).toEqual(["Karnataka"]);
    expect(splitHclLocations("Gautam Buddha Nagar, Uttar Pradesh")).toEqual(["Noida, Uttar Pradesh"]);
  });

  it("turns RMK slugs into titles", () => {
    expect(slugWords("Sr-Tower-Lead-(Support-&-Operations)")).toBe("Sr Tower Lead (Support & Operations)");
    expect(slugWords("Senior-Developer-Spring-Boot,-React_js,-Java")).toBe("Senior Developer Spring Boot, React.js, Java");
    expect(slugWords("Sr_-Customer-Care")).toBe("Sr. Customer Care");
  });

  it("reads country, places and skill lists from job pages", () => {
    const multi = parseRmkJobPage(fixture("hcltech/job-1371642955.html"));
    expect(hclPlace(multi)).toEqual({ country: "India", places: ["Chennai, Tamil Nadu", "Bengaluru, Karnataka"] });
    const abroad = hclPlace(parseRmkJobPage(fixture("hcltech/job-1341671955.html")));
    expect(abroad.country).toBe("France");
    expect(isHclIndia(abroad)).toBe(false);
    expect(hclSkills(parseRmkJobPage(fixture("hcltech/job-1364125055.html")).descriptions[0] ?? null)).toEqual(["AWS", "Linux", "RHEL", "DEVOPS Python"]);
    expect(hclSkills("<h2>Skill Requirements</h2><p>Strong communication and a passion for building reliable systems at scale.</p>")).toEqual([]);
  });

  it("emits India postings, drops (and memoises) the rest", async () => {
    const http = fakeHttp(routes);
    const jobs = await collect(hcltech, { http });
    expect(invalidJobs(jobs)).toEqual([]);
    // Sitemap order is newest id first; 1377018355 has no fixture page (detail error → retried next run).
    expect(jobs.map((j) => j.sourceJobId)).toEqual(["1376184355", "1371642955", "1364125055"]);
    expect(hcltech.lastRun).toMatchObject({ listed: 5, emitted: 3, details: 5, detailErrors: 1, siteTotal: 5 });
    expect(hclSkipped.has("1341671955")).toBe(true);
    const again = fakeHttp(routes);
    await collect(hcltech, { http: again });
    expect(again.calls.some((c) => c.url.includes("/1341671955/"))).toBe(false);
  });

  it("maps fields", async () => {
    const jobs = await collect(hcltech, { http: fakeHttp(routes) });
    const multi = jobs.find((j) => j.sourceJobId === "1371642955")!;
    expect(multi).toMatchObject({
      source: "hcltech",
      sourceKind: "career_site",
      company: "HCLTech",
      title: "Sr Tower Lead (Support & Operations)",
      locations: ["Chennai, Tamil Nadu, India", "Bengaluru, Karnataka, India"],
      postedAt: null,
      applyUrl: "https://careers.hcltech.com/job/Sr-Tower-Lead-%28Support-&-Operations%29/1371642955/",
    });
    expect(multi.extra).toMatchObject({ country: "India", pageTitle: "Sr Tower Lead (Support & Operations)" });
    expect(multi.descriptionText).toContain("Job Summary");
    expect(multi.descriptionText).not.toMatch(/cookies/i);
    expect(jobs.find((j) => j.sourceJobId === "1364125055")!.skills).toEqual(["AWS", "Linux", "RHEL", "DEVOPS Python"]);
  });

  it("emits light records for known ids without fetching pages", async () => {
    const http = fakeHttp(routes);
    const jobs = await collect(hcltech, { http, isKnown: (id) => id === "1377018355" });
    expect(jobs.find((j) => j.sourceJobId === "1377018355")).toMatchObject({
      title: "Administrator EMC PowerMax, PowerStore",
      locations: [],
      descriptionHtml: null,
    });
    expect(http.calls.some((c) => c.url.includes("/1377018355/"))).toBe(false);
  });

  it("orders sitemap entries newest first", () => {
    expect(parseRmkSitemap(fixture("hcltech/sitemap.xml")).map((e) => e.id)).toEqual(["1377018355", "1376184355", "1371642955", "1364125055", "1341671955"]);
  });
});
