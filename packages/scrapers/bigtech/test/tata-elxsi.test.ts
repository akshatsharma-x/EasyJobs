import { describe, expect, it } from "vitest";
import { elxsiListUrl, innerDiv, parseElxsiJob, parseElxsiList, tataElxsi } from "../src/sites/tata-elxsi";
import { collect, fakeHttp, fixture, invalidJobs, type Route } from "./helpers";

const routes: Route[] = [
  { match: /job-openings\?page=1$/, file: "tata-elxsi/search-1.html" },
  { match: /job-openings\?page=2$/, file: "tata-elxsi/search-2.html" },
  { match: /job-openings\/wifi-mesh-developer$/, file: "tata-elxsi/job-wifi-mesh-developer.html" },
];

describe("tata-elxsi", () => {
  it("parses list rows and the last page", () => {
    const { rows, lastPage } = parseElxsiList(fixture("tata-elxsi/search-1.html"));
    expect(lastPage).toBe(2);
    expect(rows).toHaveLength(8);
    const pm = rows.find((r) => r.slug === "project-manager-2")!;
    expect(pm).toMatchObject({
      title: "Project Manager",
      reqId: "RFH/08002",
      cities: ["Bangalore", "Pune", "Trivandrum", "Chennai", "Hyderabad", "Kozhikode"],
      experienceRaw: "11 - 14 years",
      degrees: ["B.E", "B.Tech", "MCA", "M.E", "M.Tech"],
      date: "25 Nov 2026",
    });
    expect(rows.find((r) => r.slug === "technical-lead-1")?.reqId).toBeNull();
    expect(elxsiListUrl(3)).toBe("https://www.tataelxsi.com/careers/job-openings?page=3");
  });

  it("extracts the description with balanced divs", () => {
    expect(innerDiv(`<div class="a"><div>x</div><p>y</p></div><div>z</div>`, "a")).toBe("<div>x</div><p>y</p>");
    const d = parseElxsiJob(fixture("tata-elxsi/job-wifi-mesh-developer.html"));
    expect(d.descriptionHtml).toContain("Key Responsibilities");
    expect(d.descriptionHtml).toContain("Wi-Fi EasyMesh");
  });

  it("paginates to the last page, keeps India roles and maps fields", async () => {
    const http = fakeHttp(routes);
    const jobs = await collect(tataElxsi, { http });
    expect(invalidJobs(jobs)).toEqual([]);
    expect(http.calls.filter((c) => c.url.includes("?page=")).length).toBe(2);
    // UK/US rows (Coventry / Gaydon, San Diego, …) are dropped
    expect(jobs.some((j) => j.locations.some((l) => /Coventry|San Diego/.test(l)))).toBe(false);
    const wifi = jobs.find((j) => j.sourceJobId === "wifi-mesh-developer")!;
    expect(wifi).toMatchObject({
      source: "tata-elxsi",
      company: "Tata Elxsi",
      title: "WiFi Mesh Developer",
      locations: ["Bangalore, India"],
      postedAt: "2026-11-25T00:00:00.000Z",
      experienceMin: 4,
      experienceMax: 7,
      sourceUrl: "https://www.tataelxsi.com/careers/job-openings/wifi-mesh-developer",
      extra: { requisitionId: "RFH/07664" },
    });
    expect(wifi.descriptionHtml).toContain("Mesh WiFi");
  });

  it("skips detail pages for known jobs", async () => {
    const http = fakeHttp(routes);
    const jobs = await collect(tataElxsi, { http, isKnown: () => true });
    expect(jobs.length).toBeGreaterThan(5);
    expect(http.calls.some((c) => /job-openings\/[a-z]/.test(c.url))).toBe(false);
  });
});
