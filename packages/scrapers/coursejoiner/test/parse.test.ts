import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { validateRawJob } from "@easyjobs/contract";
import { parsePost } from "../src/parse/post";
import { EXPECTED, loadFixture, loadFixtures, parseContextFor } from "./helpers";

const fixtures = loadFixtures();

describe("fixtures", () => {
  it("has 20+ real post fixtures across sites", () => {
    expect(fixtures.length).toBeGreaterThanOrEqual(20);
    expect(new Set(fixtures.map((f) => f.fixture.site)).size).toBeGreaterThanOrEqual(4);
  });
});

describe("parsePost snapshots (expected RawJobs per fixture)", () => {
  for (const f of fixtures) {
    it(`${f.name} [${f.fixture.shape ?? ""}]`, async () => {
      const res = parsePost(f.post, parseContextFor(f.fixture.site));
      for (const job of res.jobs) expect(validateRawJob(job)).toEqual([]);
      const snapshot = { status: res.status, reason: res.reason ?? null, confidence: res.confidence, jobs: res.jobs };
      await expect(JSON.stringify(snapshot, null, 2) + "\n").toMatchFileSnapshot(join(EXPECTED, `${f.name}.json`));
    });
  }
});

describe("parsePost shapes", () => {
  const parse = (name: string, resolve?: Record<string, string>) => {
    const f = loadFixture(name);
    return parsePost(f.post, parseContextFor(f.fixture.site, resolve));
  };

  it("single role from a Key-Highlights table, ignoring a wrong-company link (EA)", () => {
    const res = parse("coursejoiner/40193");
    expect(res.status).toBe("jobs");
    expect(res.jobs).toHaveLength(1);
    const j = res.jobs[0]!;
    expect(j).toMatchObject({
      source: "coursejoiner",
      sourceKind: "aggregator",
      sourceJobId: "40193#1",
      target: null,
      company: "Electronic Arts",
      title: "Software Engineering Intern",
      applyUrl: "https://jobs.ea.com/en_US/careers/JobDetail/Software-Engineering-Intern/216554",
      jobType: "internship",
      experienceLevel: "intern",
      workMode: "hybrid",
      batches: [2027],
      postedAt: "2026-11-25T11:51:31.000Z",
    });
    expect(j.sourceUrl).toBe("https://coursejoiner.com/internship/ea-internship-2027-software/");
    expect(j.descriptionHtml).not.toMatch(/Submitted Reference Link|Read More|Table of Contents|rank-math|Meesho Internship/);
  });

  it("fresher job with Naukri as the only apply route (job-board link kept, tracking stripped)", () => {
    const j = parse("coursejoiner/40106").jobs[0]!;
    expect(j.company).toBe("NoBroker");
    expect(j.title).toBe("Sales Executive -NP");
    expect(j.applyUrl).toMatch(/^https:\/\/www\.naukri\.com\/job-listings-sales-executive-np-nobroker-[\w-]+-071026048936$/);
    expect(j.salaryRaw).toBe("₹3 Lacs P.A.");
    expect(j.experienceLevel).toBe("fresher");
    expect(j.locations).toEqual(["Noida", "Hyderabad", "Bengaluru"]);
  });

  it("internship with an internal 'Key Details' list (2026-02 layout)", () => {
    const j = parse("coursejoiner/28593").jobs[0]!;
    expect(j).toMatchObject({ company: "FirstCry", title: "Digital Marketing Intern", locations: ["Pune"], jobType: "internship" });
    expect(j.validThrough).toBe("2026-03-14T18:29:59.000Z");
  });

  it("multi-role post with one ATS link per role (Rubrik → 3 jobs, <postId>#<n>)", () => {
    const res = parse("freshershunt/29447");
    expect(res.jobs.map((j) => j.sourceJobId)).toEqual(["29447#1", "29447#2", "29447#3"]);
    expect(res.jobs.map((j) => j.title)).toEqual(["Software Engineer – Winter Intern", "Software Engineer (CPD) – Winter Intern", "ENG Project/Program – Intern"]);
    expect(new Set(res.jobs.map((j) => j.applyUrl)).size).toBe(3);
    for (const j of res.jobs) expect(j.applyUrl).toMatch(/gh_jid=\d+$/);
  });

  it("multi-role walk-in drive from a role table, rows matched to links by requisition id (Wipro)", () => {
    const res = parse("freshershunt/54001");
    expect(res.jobs).toHaveLength(3);
    expect(res.jobs[1]!.applyUrl).toBe("https://careers.wipro.com/job/-/219833-en_US");
    expect(res.jobs[2]!.applyUrl).toBe("https://careers.wipro.com/job/-/220088-en_US");
    expect(res.jobs.map((j) => j.locations[0])).toEqual(["Hyderabad", "Pune", "Hyderabad"]);
    for (const j of res.jobs) expect(j.tags).toContain("walk-in");
  });

  it("one role, several city-specific apply links (Infosys Pune ×2 + Mysore)", () => {
    const res = parse("fresheroffcampus/1985");
    expect(res.jobs.map((j) => j.locations)).toEqual([["Pune"], ["Pune"], ["Mysore"]]);
    expect(res.jobs.every((j) => j.title === "Process Executive" && (j.applyUrl ?? "").startsWith("https://career.infosys.com/jobdesc?jobReferenceCode=PROGEN-EXTERNAL-"))).toBe(true);
  });

  it("walk-in interview with a shortened apply link (resolved via the redirect map)", () => {
    const short = "https://tinyurl.com/v9r7mtwd";
    const target = "https://www.naukri.com/job-listings-gcp-data-engineer-hcltech-noida-5-to-10-years-220926017640";
    const raw = parse("coursejoiner/38511").jobs[0]!;
    expect(raw.applyUrl).toBe(short);
    const j = parse("coursejoiner/38511", { [short]: target }).jobs[0]!;
    expect(j.applyUrl).toBe(target);
    expect(j.tags).toContain("walk-in");
    expect(j.title).toBe("GCP Data Engineer");
  });

  it("apprenticeship, work-from-home and off-campus hints", () => {
    expect(parse("coursejoiner/40102").jobs[0]).toMatchObject({ jobType: "apprenticeship", experienceLevel: "fresher" });
    expect(parse("kickcharm/43579").jobs[0]).toMatchObject({ workMode: "remote", isRemote: true, tags: ["wfh"] });
    expect(parse("fresheroffcampus/1022").jobs[0]).toMatchObject({ title: "Analyst Trainee", tags: ["off-campus"], experienceLevel: "fresher" });
  });

  it("skips non-job posts (course, educational offer, scholarship, hackathon, news, program perks)", () => {
    for (const name of ["coursejoiner/40176", "coursejoiner/40160", "coursejoiner/39892", "coursejoiner/39829", "coursejoiner/39850", "kickcharm/42549"]) {
      const res = parse(name);
      expect(res.status, name).toBe("skipped");
      expect(res.jobs).toEqual([]);
    }
  });

  it("skips posts without an external apply link (job-board search page only)", () => {
    expect(parse("kickcharm/27254")).toMatchObject({ status: "skipped", reason: "no external apply link" });
  });
});
