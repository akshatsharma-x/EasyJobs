import { describe, expect, it } from "vitest";
import { SOURCE_KINDS, validateJobInput, validateRawJob, type RawJob } from "@easyjobs/contract";
import {
  canonicalJobKey,
  canonicalUrl,
  classifyLevel,
  fallbackNormalize,
  htmlToText,
  parseYears,
  summarize,
} from "../src/fallback-normalize";
import { demoJob } from "../src/demo-scraper";
import { mulberry32 } from "../src/util";
import { company, rawJob } from "./helpers";

const NOW = new Date("2026-11-26T00:00:00Z");

const CASES: [string, RawJob][] = [
  ["greenhouse-style ATS job", rawJob(1, { source: "greenhouse", sourceUrl: "https://job-boards.greenhouse.io/acme/jobs/4012345", applyUrl: "https://job-boards.greenhouse.io/acme/jobs/4012345", target: "acme" })],
  [
    "internship with stipend hint",
    rawJob(2, { title: "Software Engineering Intern (Summer 2026)", employmentTypeRaw: "Internship", salary: { min: 25000, max: 25000, currency: "INR", period: "month", raw: "₹25,000 /month" } }),
  ],
  [
    "CourseJoiner-style blog post linking to the official page",
    rawJob(3, { source: "coursejoiner", sourceKind: "job_board", sourceUrl: "https://coursejoiner.com/jobs/acme-get-2026", applyUrl: "https://careers.acme.com/job/12345?utm_source=coursejoiner", title: "Acme Off Campus Drive 2026 | Graduate Engineer Trainee", experienceRaw: "Freshers", descriptionHtml: "<p>2025 & 2026 batch, B.E/B.Tech</p>" }),
  ],
  ["job board without apply url", rawJob(4, { source: "linkedin", sourceKind: "job_board", sourceUrl: "https://www.linkedin.com/jobs/view/3900000001", applyUrl: null, descriptionHtml: null, postedAt: null })],
  ["remote, no locations, no description", rawJob(5, { locations: [], descriptionHtml: null, descriptionText: "Fully remote role. 3-5 years.", title: "Backend Engineer (Remote)" })],
  ["escaped HTML (Greenhouse content)", rawJob(6, { descriptionHtml: "&lt;p&gt;Hello &amp;amp; welcome&lt;/p&gt;&lt;script&gt;alert(1)&lt;/script&gt;" })],
  ["non-latin company", rawJob(7, { company: "टाटा", title: "डेटा विश्लेषक" })],
  ["hint-heavy record", rawJob(8, { jobType: "contract", experienceLevel: "senior", workMode: "hybrid", isRemote: false, skills: ["Go", "go", " Kafka "], batches: [2024, 1999], degrees: ["B.Tech"], tags: ["Urgent Hiring", "WFH"] })],
  ["weird but valid dates", rawJob(9, { postedAt: "2099-01-01T00:00:00Z", validThrough: "not a date" })],
  ["workday URL", rawJob(10, { sourceUrl: "https://nvidia.wd5.myworkdayjobs.com/en-US/NVIDIAExternalCareerSite/job/India-Bengaluru/Research-Scientist_JR2028483", applyUrl: null })],
  ["demo job", demoJob(2_992_742)],
];

describe("fallback normalizer", () => {
  it.each(CASES)("%s → output passes validateJobInput", (_name, raw) => {
    expect(validateRawJob(raw)).toEqual([]);
    const job = fallbackNormalize(raw, { sourceName: "Test Source", now: NOW });
    expect(validateJobInput(job)).toEqual([]);
    expect(job.extra.normalizedBy).toBe("worker-fallback");
    expect(job.summary === null || job.summary.length <= 280).toBe(true);
    expect(job.skills.length).toBeLessThanOrEqual(12);
  });

  it("detects level and type naively, following §0.4 precedence", () => {
    const intern = fallbackNormalize(CASES[1]![1], { now: NOW });
    expect(intern.jobType).toBe("internship");
    expect(intern.experienceLevel).toBe("intern");
    expect(intern.salaryInrYearlyMin).toBe(300_000);
    const fresher = fallbackNormalize(CASES[2]![1], { now: NOW });
    expect(fresher.experienceLevel).toBe("fresher");
    expect(fresher.batches).toEqual([2025, 2026]);
    expect(fresher.tags).toContain("off-campus");
    expect(fallbackNormalize(rawJob(11, { title: "Senior Software Engineer" }), { now: NOW }).experienceLevel).toBe("senior");
    expect(fallbackNormalize(rawJob(12, { title: "Engineer", experienceRaw: "5-8 years" }), { now: NOW }).experienceLevel).toBe("senior");
    expect(fallbackNormalize(rawJob(13, { title: "Director of Engineering" }), { now: NOW }).experienceLevel).toBe("executive");
    expect(fallbackNormalize(rawJob(14, { title: "SDE II" }), { now: NOW }).experienceLevel).toBe("mid");
    expect(fallbackNormalize(rawJob(15, { title: "Associate Consultant" }), { now: NOW }).experienceLevel).toBe("entry");
    // explicit years beat the structured hint (§0.4)
    expect(fallbackNormalize(rawJob(16, { experienceLevel: "senior", experienceRaw: "0-1 years" }), { now: NOW }).experienceLevel).toBe("fresher");
    expect(classifyLevel({ jobType: "full_time", years: { min: 9, max: null }, title: "x", description: "" })).toBe("lead");
    expect(parseYears("minimum 3 years of experience")).toEqual({ min: 3, max: null });
    expect(parseYears("1 to 3 yrs")).toEqual({ min: 1, max: 3 });
  });

  it("fingerprints official links by canonical job key (rule 1) and the rest by company|title|city|type (rule 2)", () => {
    const viaBoard = fallbackNormalize(rawJob("a", { applyUrl: "https://job-boards.greenhouse.io/acme/jobs/4012345" }), { now: NOW });
    const viaSite = fallbackNormalize(rawJob("b", { applyUrl: "https://www.acme.com/careers/job?gh_jid=4012345&utm_source=x", title: "Different title" }), { now: NOW });
    expect(viaBoard.fingerprint).toMatch(/^k:[0-9a-f]{40}$/);
    expect(viaSite.fingerprint).toBe(viaBoard.fingerprint);

    const lk1 = fallbackNormalize(rawJob("c", { source: "linkedin", sourceKind: "job_board", applyUrl: null, sourceUrl: "https://www.linkedin.com/jobs/view/1" }), { now: NOW });
    const lk2 = fallbackNormalize(rawJob("c", { source: "naukri", sourceKind: "job_board", applyUrl: null, sourceUrl: "https://www.naukri.com/job-listings-2" }), { now: NOW });
    expect(lk1.fingerprint).toMatch(/^t:/);
    expect(lk2.fingerprint).toBe(lk1.fingerprint);

    // a generic careers landing page must not merge unrelated jobs
    const g1 = fallbackNormalize(rawJob("d", { applyUrl: "https://acme.com/careers", title: "Data Analyst" }), { now: NOW });
    const g2 = fallbackNormalize(rawJob("e", { applyUrl: "https://acme.com/careers", title: "Product Designer" }), { now: NOW });
    expect(g1.fingerprint).toMatch(/^t:/);
    expect(g1.fingerprint).not.toBe(g2.fingerprint);
  });

  it("canonicalizes URLs and ATS keys", () => {
    expect(canonicalUrl("https://WWW.Example.com/a/b/?utm_medium=x&b=2&a=1#frag")).toBe("example.com/a/b?a=1&b=2");
    expect(canonicalJobKey("https://jobs.lever.co/paytm/552ABB0B-E76D-4902-AEDB-CA2290536744/apply")).toBe("lever:552abb0b-e76d-4902-aedb-ca2290536744");
    expect(canonicalJobKey("https://jobs.ashbyhq.com/sarvam/c0406fe0-c8c0-44aa-aa3e-b879f2bf1049")).toBe("ashby:c0406fe0-c8c0-44aa-aa3e-b879f2bf1049");
    expect(canonicalJobKey("https://mastercard.wd1.myworkdayjobs.com/CorporateCareers/job/Pune-India/Director--Accounting_R-292124-1")).toBe("workday:mastercard:R-292124-1");
  });

  it("uses the registry company, never invents salaries, and sanitizes by construction", () => {
    const acme = company("acme");
    const job = fallbackNormalize(rawJob(20, { company: "ACME Technologies Pvt Ltd", salaryRaw: "Competitive" }), { company: acme, now: NOW });
    expect(job.company).toBe("Acme");
    expect(job.companySlug).toBe("acme");
    expect(job.companyTags).toEqual(["startup"]);
    expect(job.salary).toBeNull();
    expect(job.salaryInrYearlyMax).toBeNull();
    const escaped = fallbackNormalize(CASES[5]![1], { now: NOW });
    expect(escaped.descriptionText).toBe("Hello & welcome");
    expect(escaped.descriptionHtml).not.toMatch(/<script/i);
    expect(htmlToText("<ul><li>A</li><li>B</li></ul>")).toBe("• A\n• B");
    expect(summarize("x".repeat(500))!.length).toBeLessThanOrEqual(280);
  });

  it("never throws and always produces a valid JobInput for 1,000 random valid RawJobs (fuzz)", () => {
    const rand = mulberry32(20261126);
    const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)] as T;
    const junk = ["", " ", "🚀🚀", "<b>", "&amp;", "null", "Bengaluru / Remote", "Pan India", "Remote - India", "N/A", "ภาษาไทย", "a".repeat(400)];
    const maybe = <T>(v: T): T | undefined => (rand() < 0.5 ? v : undefined);
    for (let i = 0; i < 1000; i++) {
      const url = pick(["https://x.test/j/" + i, "http://jobs.lever.co/a/" + i, "https://www.linkedin.com/jobs/view/" + i, "https://acme.com/careers"]);
      const raw: RawJob = {
        source: pick(["s", "coursejoiner", "greenhouse"]),
        sourceKind: pick(SOURCE_KINDS),
        sourceJobId: `id-${i}`,
        sourceUrl: url,
        target: rand() < 0.5 ? null : "t",
        applyUrl: rand() < 0.5 ? null : pick([url, "https://careers.acme.com/job/" + i]),
        title: `${pick(junk)} ${pick(["Intern", "Senior SDE", "GET", "Analyst", "Staff Engineer"])} ${pick(junk)}`,
        company: `${pick(junk)}${pick(["Acme", "टाटा", "&&&", "Inc."])}`,
        locations: Array.from({ length: Math.floor(rand() * 4) }, () => pick(junk)),
        descriptionHtml: rand() < 0.3 ? null : `${pick(junk)}<p>${pick(junk)}</p><script>x</script>${pick(junk)}`,
        postedAt: rand() < 0.3 ? null : pick(["2026-01-01", "2026-11-25T10:00:00Z", "1970-01-01T00:00:00Z"]),
      };
      const extra: Partial<RawJob> = {
        experienceRaw: maybe(pick(["0-2 yrs", "5+ years", "Freshers", "lots", "99-100 years"])),
        experienceMin: maybe(pick([0, 3, Number.NaN])),
        salary: maybe(pick([null, { min: 1, max: 2, currency: "usd", period: "hour", raw: "$" }, { min: -5, max: null, currency: "INR", period: "year", raw: null }])) as RawJob["salary"],
        skills: maybe([pick(junk), pick(junk)]),
        batches: maybe([2025, 3000, 2026.5]),
        tags: maybe([pick(junk)]),
        extra: maybe({ any: i }),
      };
      Object.assign(raw, Object.fromEntries(Object.entries(extra).filter(([, v]) => v !== undefined)));
      if (validateRawJob(raw).length > 0) continue;
      const job = fallbackNormalize(raw, { sourceName: rand() < 0.5 ? "Fuzz" : undefined, now: NOW });
      expect(validateJobInput(job), JSON.stringify(raw)).toEqual([]);
    }
  });
});
