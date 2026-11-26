import { describe, expect, it } from "vitest";
import {
  infosys, infosysJobUrl, infosysListUrl, infosysLocations, infosysSkills, istToIso, mapInfosysJob, type InfosysJob,
} from "../src/sites/infosys";
import { collect, fakeHttp, fixtureJson, invalidJobs } from "./helpers";

const routes = [
  { match: /getCareerSearchJobs\?sourceId=1,21&searchText=ALL$/, file: "infosys/jobs-1-21.json" },
  { match: /getCareerSearchJobs\?sourceId=41&searchText=ALL$/, file: "infosys/jobs-41.json" },
];
const lateral = () => fixtureJson<InfosysJob[]>("infosys/jobs-1-21.json");

describe("infosys", () => {
  it("lists Infosys Ltd and Infosys BPM sources and emits valid RawJobs", async () => {
    const http = fakeHttp(routes);
    const jobs = await collect(infosys, { http });
    expect(jobs).toHaveLength(8);
    expect(invalidJobs(jobs)).toEqual([]);
    expect(http.calls.map((c) => c.url)).toEqual([infosysListUrl("1,21"), infosysListUrl("41")]);
    expect(http.calls.every((c) => new URL(c.url).host === "intapgateway.infosysapps.com")).toBe(true);
    expect(jobs.filter((j) => j.company === "Infosys BPM")).toHaveLength(2);
    expect(infosys.lastRun?.siteTotal).toBe(8);
  });

  it("maps structured experience, dates, skills and the public job page", () => {
    const job = mapInfosysJob(lateral()[0]!);
    expect(job).toMatchObject({
      sourceJobId: "INFSYS-EXTERNAL-256886",
      sourceUrl: "https://career.infosys.com/jobdesc?jobReferenceCode=INFSYS-EXTERNAL-256886&sourceId=1",
      title: "Global Deal Manager- TRANCOE",
      company: "Infosys",
      locations: ["Pune, India"],
      postedAt: "2026-11-25T03:50:20.183Z",
      validThrough: "2026-11-29T18:30:00.000Z",
      department: "Global Markets/Sales",
      experienceMin: 9,
      experienceMax: 20,
      experienceRaw: "9-20 years",
      skills: ["Service Transition", "After Sales & Service"],
      degrees: ["Bachelor of Engineering"],
    });
    expect(job.descriptionHtml).toContain("<h3>Roles and responsibilities</h3>");
    expect(job.extra).toMatchObject({ hiringType: "lateral", legalEntity: "Infosys Limited" });
  });

  it("flags hot jobs, cleans locations and extracts taxonomy leaves", () => {
    const hot = mapInfosysJob(lateral().find((j) => j.hotjob === "Y")!);
    expect(hot.extra?.hotJob).toBe(true);
    expect(infosysLocations({ referenceCode: "x", postingTitle: "x", location: "Kolkata(WB)   ", country: "India" })).toEqual(["Kolkata, India"]);
    expect(infosysLocations({ referenceCode: "x", postingTitle: "x", location: "Noida" })).toEqual(["Noida, India"]);
    const withGeneric = lateral().find((j) => (j.genericSkills ?? "").includes("->"))!;
    expect(infosysSkills(withGeneric)).toContain("TOSCA");
    expect(infosysSkills(withGeneric).every((s) => !s.includes("->"))).toBe(true);
  });

  it("treats naive timestamps as IST and builds fresher/BPM job URLs", () => {
    expect(istToIso("2026-11-25T09:20:20.183246")).toBe("2026-11-25T03:50:20.183Z");
    expect(istToIso("2026-11-30T00:00:00")).toBe("2026-11-29T18:30:00.000Z");
    expect(istToIso("2026-11-25T09:20:20Z")).toBe("2026-11-25T09:20:20.000Z");
    expect(infosysJobUrl({ referenceCode: "PROGEN-EXTERNAL-1", postingTitle: "x", sourceId: 41 })).toBe(
      "https://career.infosys.com/jobdesc?jobReferenceCode=PROGEN-EXTERNAL-1&sourceId=41",
    );
    const fresher = mapInfosysJob({ referenceCode: "INFSYS-CAMPUS-1", postingTitle: "Systems Engineer", sourceId: 21, minExperienceLevel: 0, maxExperienceLevel: 0 });
    expect(fresher).toMatchObject({ experienceLevel: "fresher", experienceRaw: "0-0 years" });
  });

  it("fails the run on an unexpected payload", async () => {
    const http = fakeHttp([{ match: /getCareerSearchJobs/, body: { error: "maintenance" } }]);
    await expect(collect(infosys, { http })).rejects.toThrow("infosys: unexpected response for sourceId=1,21");
  });
});
