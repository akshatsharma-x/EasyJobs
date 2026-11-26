import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { validateJobInput, type CompanyTarget, type JobInput, type RawJob } from "@easyjobs/contract";
import { normalizeJob, sha1 } from "../src/index";

const here = dirname(fileURLToPath(import.meta.url));
const now = new Date("2026-11-26T00:00:00Z");
const fixtures: RawJob[] = readFileSync(join(here, "fixtures", "raw-jobs.jsonl"), "utf8")
  .split("\n")
  .filter(Boolean)
  .map((l) => JSON.parse(l) as RawJob);
const byId = (id: string): RawJob => {
  const f = fixtures.find((r) => r.sourceJobId === id);
  if (!f) throw new Error(`fixture ${id} missing`);
  return f;
};
const norm = (id: string, opts: Parameters<typeof normalizeJob>[1] = {}): JobInput => normalizeJob(byId(id), { now, ...opts });

describe("normalizeJob — every fixture yields a valid JobInput", () => {
  it.each(fixtures.map((f) => [f.source, f.sourceJobId, f] as const))("%s %s", (_s, _id, raw) => {
    const job = normalizeJob(raw, { now });
    expect(validateJobInput(job)).toEqual([]);
    expect(job.skills.length).toBeLessThanOrEqual(12);
    expect((job.summary ?? "").length).toBeLessThanOrEqual(280);
    expect(job.qualityScore).toBeGreaterThanOrEqual(0);
    expect(job.qualityScore).toBeLessThanOrEqual(100);
  });
});

describe("normalizeJob — fixture expectations", () => {
  it("Greenhouse (escaped HTML, official ATS)", () => {
    const j = norm("razorpay:4012345");
    expect(j).toMatchObject({
      sourceName: "Greenhouse",
      title: "Software Development Engineer - 1 (Backend)",
      company: "Razorpay",
      companySlug: "razorpay",
      companyDomain: "razorpay.com",
      jobType: "full_time",
      experienceLevel: "entry",
      experienceMin: 0,
      experienceMax: 2,
      degrees: ["B.E/B.Tech"],
      category: "software_engineering",
      department: "Engineering",
      fingerprint: `k:${sha1("greenhouse:4012345")}`,
      postedAt: "2026-11-24T06:30:00.000Z",
    });
    expect(j.locations).toEqual([{ raw: "Bengaluru, Karnataka, India", city: "Bengaluru", state: "Karnataka", country: "IN" }]);
    expect(j.skills.slice(0, 3)).toEqual(["Go", "Java", "AWS"]);
    expect(j.descriptionHtml).toContain("<h3>About the role</h3>");
    expect(j.descriptionHtml).not.toContain("&lt;");
    expect(j.summary?.startsWith("As an SDE-1 on the Payments team")).toBe(true);
    expect(j.companyLogoUrl).toMatch(/razorpay\.com/);
  });

  it("CourseJoiner post linking to the official posting merges with the ATS record (§0.4 rule 1)", () => {
    const blog = norm("98765#1");
    const ats = norm("razorpay:4012345");
    expect(blog.fingerprint).toBe(ats.fingerprint);
    expect(blog).toMatchObject({
      title: "SDE 1",
      company: "Razorpay",
      sourceKind: "aggregator",
      experienceLevel: "fresher",
      experienceMin: 0,
      experienceMax: 0,
      batches: [2025, 2026],
      salaryInrYearlyMin: 1_200_000,
      salaryInrYearlyMax: 1_800_000,
    });
    expect(blog.applyUrl).toBe("https://boards.greenhouse.io/razorpaysoftwareprivatelimited/jobs/4012345?gh_src=coursejoiner");
    expect(blog.tags).toContain("off-campus");
  });

  it("CourseJoiner TCS drive with a generic campus link falls back to rule 2 and parses the post", () => {
    const j = norm("98766#1");
    expect(j.fingerprint.startsWith("t:")).toBe(true);
    expect(j).toMatchObject({
      title: "Assistant System Engineer",
      company: "TCS",
      experienceLevel: "fresher",
      batches: [2024, 2025, 2026],
      degrees: ["B.E/B.Tech", "M.E/M.Tech", "MCA", "M.Sc"],
      salary: { min: 336000, max: 336000, currency: "INR", period: "year" },
      postedAt: "2026-11-20T00:00:00.000Z",
    });
    expect(j.locations).toEqual([{ raw: "Across India", city: null, state: null, country: "IN" }]);
    expect(j.tags).toContain("off-campus");
    expect(j.tags).not.toContain("suspicious");
  });

  it("Lever: workMode hint wins over 'Remote - India'; 5+ years → senior", () => {
    const j = norm("postman:5d2b4f1e-1234-4abc-9def-0123456789ab");
    expect(j).toMatchObject({ workMode: "hybrid", isRemote: false, experienceLevel: "senior", experienceMin: 5, experienceMax: null });
    expect(j.skills).not.toContain("Postman");
    expect(j.fingerprint).toBe(`k:${sha1("lever:5d2b4f1e-1234-4abc-9def-0123456789ab")}`);
  });

  it("Ashby: salary hint is trusted and converted to INR", () => {
    const j = norm("openai:0b7c6e1a-2f3d-4e5f-8a9b-1c2d3e4f5a6b");
    expect(j.salary).toEqual({ min: 310000, max: 460000, currency: "USD", period: "year", raw: "$310K – $460K" });
    expect(j.salaryInrYearlyMin).toBe(Math.round(310000 * 88.5));
    expect(j).toMatchObject({ workMode: "onsite", category: "data_ai" });
    expect(j.locations[0]).toMatchObject({ city: "San Francisco", country: "US" });
  });

  it("Workday: applyUrl falls back to sourceUrl; '30+ Days Ago'; MS/PhD", () => {
    const j = norm("nvidia:JR1993026");
    expect(j.applyUrl).toBe(j.sourceUrl);
    expect(j.fingerprint).toBe(`k:${sha1("workday:nvidia:JR1993026")}`);
    expect(j.postedAt).toBe(new Date(now.getTime() - 30 * 86_400_000).toISOString());
    expect(j.degrees).toEqual(["M.Sc", "PhD"]);
    expect(j.locations.map((l) => l.city)).toEqual(["Bengaluru", "Pune"]);
    expect(j.skills).toContain("CUDA");
  });

  it("amazon.jobs: company alias, 'IN, KA, Bangalore', text-only description → HTML", () => {
    const j = norm("2712345");
    expect(j).toMatchObject({ company: "Amazon", companySlug: "amazon", companyDomain: "amazon.com", experienceLevel: "entry", degrees: ["Bachelor's"] });
    expect(j.locations[0]).toMatchObject({ city: "Bengaluru", state: "Karnataka", country: "IN" });
    expect(j.descriptionHtml).toContain("<ul><li>");
    expect(j.fingerprint).toBe(`k:${sha1("amazon:2712345")}`);
  });

  it("Internshala: hints win (jobType, skills); stipend; WFH; relative date", () => {
    const j = norm("1730716428");
    expect(j).toMatchObject({ jobType: "internship", experienceLevel: "intern", experienceMin: 0, workMode: "remote", isRemote: true });
    expect(j.skills).toEqual(["React", "Node.js", "MongoDB", "HTML", "CSS", "JavaScript", "English Proficiency"]);
    expect(j.salary).toMatchObject({ min: 15000, max: 15000, currency: "INR", period: "month" });
    expect(j.salaryInrYearlyMax).toBe(180000);
    expect(j.postedAt).toBe("2026-11-24T00:00:00.000Z");
    expect(j.tags).toContain("wfh");
  });

  it("LinkedIn: offsite company apply link is official → rule 1; level hint beats description years", () => {
    const j = norm("3712345678");
    expect(j.fingerprint.startsWith("k:")).toBe(true);
    expect(j).toMatchObject({ experienceLevel: "entry", experienceMin: 1, experienceMax: 3, workMode: "hybrid", companyDomain: "meesho.com" });
    expect(j.applyUrl).toBe("https://www.meesho.io/jobs/data-analyst-4321?source=linkedin");
  });

  it("Naukri: experienceRaw/salaryRaw, Secunderabad merged into Hyderabad, 'Just now'", () => {
    const j = norm("151124012345");
    expect(j).toMatchObject({ experienceMin: 0, experienceMax: 2, salaryInrYearlyMin: 400000, salaryInrYearlyMax: 600000, postedAt: now.toISOString() });
    expect(j.locations.map((l) => l.city)).toEqual(["Hyderabad", "Pune", "Bengaluru"]);
    expect(j.fingerprint.startsWith("t:")).toBe(true);
  });

  it("Unstop: batches + degrees from the description; Pan India", () => {
    const j = norm("1234567");
    expect(j).toMatchObject({ batches: [2026, 2027], experienceLevel: "fresher", degrees: ["B.E/B.Tech", "M.E/M.Tech"] });
    expect(j.locations[0]).toMatchObject({ country: "IN", city: null });
  });

  it("RemoteOK: 'Worldwide' + remote tag → remote; salary hint with null raw", () => {
    const j = norm("1129001");
    expect(j).toMatchObject({ workMode: "remote", isRemote: true, experienceLevel: "senior" });
    expect(j.salary).toMatchObject({ currency: "USD", min: 120000, max: 160000, raw: null });
    expect(j.tags).toEqual(expect.arrayContaining(["golang", "backend", "wfh"]));
  });

  it("scam post is tagged suspicious and scores near zero", () => {
    const j = norm("99001#1");
    expect(j.tags).toEqual(expect.arrayContaining(["suspicious", "urgent", "wfh"]));
    expect(j.qualityScore).toBeLessThan(10);
    expect(j.fingerprint.startsWith("t:")).toBe(true);
  });

  it("walk-in drive: location recovered from the title, monthly salary, walk-in/women/urgent tags", () => {
    const j = norm("99002#1");
    expect(j).toMatchObject({ title: "Customer Service Executive", company: "HDFC Bank", experienceLevel: "fresher", degrees: ["Any graduate"] });
    expect(j.locations[0]).toMatchObject({ city: "Chennai", country: "IN" });
    expect(j.tags).toEqual(expect.arrayContaining(["walk-in", "women", "urgent"]));
    expect(j.postedAt).toBe("2026-11-23T04:30:00.000Z");
  });

  it("garbage record still produces a valid JobInput with warnings", () => {
    const raw = fixtures[fixtures.length - 1] as RawJob;
    const j = normalizeJob(raw, { now });
    expect(validateJobInput(j)).toEqual([]);
    expect(j).toMatchObject({ title: "Untitled role", company: "Unknown company", companySlug: "unknown-company", sourceKind: "aggregator", target: null });
    expect(j.sourceUrl.startsWith("https://unknown.invalid/")).toBe(true);
    expect((j.extra.normalize as { warnings: string[] }).warnings.length).toBeGreaterThan(0);
  });
});

describe("normalizeJob — options and invariants", () => {
  const registry: CompanyTarget = {
    slug: "razorpay",
    name: "Razorpay",
    domain: "razorpay.com",
    ats: "greenhouse",
    token: "razorpaysoftwareprivatelimited",
    careersUrl: "https://razorpay.com/jobs/",
    tags: ["unicorn", "fintech", "startup"],
    hq: "Bengaluru",
    indiaPresence: true,
    priority: 1,
  };

  it("registry company provides canonical name, slug, domain and companyTags", () => {
    const j = normalizeJob({ ...byId("razorpay:4012345"), company: "Razorpay Software Pvt Ltd", companySlug: "rzp" }, { now, company: registry });
    expect(j).toMatchObject({ company: "Razorpay", companySlug: "razorpay", companyDomain: "razorpay.com", companyTags: ["unicorn", "fintech", "startup"] });
  });
  it("sourceName option wins over the prettified source id", () => {
    expect(norm("98765#1").sourceName).toBe("CourseJoiner");
    expect(norm("98765#1", { sourceName: "CJ Blog" }).sourceName).toBe("CJ Blog");
  });
  it("is deterministic given now", () => {
    for (const f of fixtures) expect(JSON.stringify(normalizeJob(f, { now }))).toBe(JSON.stringify(normalizeJob(f, { now })));
  });
  it("records normalization metadata in extra.normalize and keeps scraper extra", () => {
    const j = normalizeJob({ ...byId("1129001"), extra: { boardToken: "x" } } as RawJob, { now });
    expect(j.extra.boardToken).toBe("x");
    expect(j.extra.normalize).toMatchObject({ version: "1.0.0", fingerprintRule: expect.any(String), confidence: { level: expect.any(String), category: expect.any(String) } });
  });
  it("hints win: jobType / experienceLevel / workMode / batches / skills / salary are trusted after validation", () => {
    const j = normalizeJob(
      {
        ...byId("razorpay:4012345"),
        jobType: "contract",
        experienceLevel: "lead",
        workMode: "remote",
        batches: [2025, 2025, 1900],
        skills: ["reactjs", "Go"],
        experienceMin: 9,
        experienceMax: 12,
        salary: { min: 30, max: 40, currency: "inr", period: "year", raw: "30-40 LPA" },
      },
      { now },
    );
    expect(j).toMatchObject({ jobType: "contract", experienceLevel: "lead", workMode: "remote", isRemote: true, batches: [2025], skills: ["React", "Go"], experienceMin: 9, experienceMax: 12 });
    // An implausible structured salary (₹30/year) is rejected, never invented.
    expect(j.salary).toBeNull();
  });
  it("invalid hints are ignored rather than trusted", () => {
    const j = normalizeJob({ ...byId("razorpay:4012345"), jobType: "gig" as never, experienceLevel: "guru" as never, workMode: "moon" as never }, { now });
    expect(j).toMatchObject({ jobType: "full_time", experienceLevel: "entry", workMode: null });
  });
  it("resolves relative apply links against sourceUrl and strips utm params", () => {
    const j = normalizeJob({ ...byId("razorpay:4012345"), applyUrl: "/jobs/4012345/apply?utm_source=x" }, { now });
    expect(j.applyUrl).toBe("https://boards.greenhouse.io/jobs/4012345/apply");
  });
  it("description text hint is used when HTML is missing", () => {
    const j = normalizeJob({ ...byId("razorpay:4012345"), descriptionHtml: null, descriptionText: "Line one.\n\nLine two." }, { now });
    expect(j.descriptionHtml).toBe("<p>Line one.</p><p>Line two.</p>");
    expect(j.descriptionText).toBe("Line one.\n\nLine two.");
  });
  it("month-only figures in titles are durations, not experience", () => {
    expect(normalizeJob({ ...byId("nvidia:JR1993026"), title: "Azure Cloud Engineer (6 months Contract)", descriptionHtml: null }, { now }).experienceMin).toBeNull();
    expect(normalizeJob({ ...byId("nvidia:JR1993026"), title: "Java Developer (2-4 yrs)", descriptionHtml: null }, { now })).toMatchObject({ experienceMin: 2, experienceMax: 4 });
  });
  it("marks light records (no description / extra.light) and lists defaulted fields for the API merge", () => {
    const light = normalizeJob({ ...byId("razorpay:4012345"), descriptionHtml: null, title: "Team Member", department: null, extra: { light: true } }, { now });
    expect(light.extra.light).toBe(true);
    expect((light.extra.normalize as { defaulted: string[] }).defaulted).toEqual(expect.arrayContaining(["experienceLevel", "category"]));
    const full = norm("razorpay:4012345");
    expect(full.extra.light).toBeUndefined();
    expect((full.extra.normalize as { defaulted?: string[] }).defaulted).toBeUndefined();
    expect(normalizeJob({ ...byId("razorpay:4012345"), descriptionHtml: null }, { now }).extra.light).toBe(true);
  });
  it("honours the scraper's extra.applyUrlSpecific verdict for fingerprint rule 1", () => {
    const base = { ...byId("98766#1"), applyUrl: "https://careers.acme.com/jobs/senior-backend-engineer" };
    expect(normalizeJob(base, { now }).fingerprint.startsWith("k:")).toBe(true);
    expect(normalizeJob({ ...base, extra: { applyUrlSpecific: false } }, { now }).fingerprint.startsWith("t:")).toBe(true);
    expect(normalizeJob({ ...base, applyUrl: "https://careers.acme.com/", extra: { applyUrlSpecific: true } }, { now }).fingerprint.startsWith("k:")).toBe(true);
  });
  it("validThrough is parsed without falling back to now", () => {
    expect(normalizeJob({ ...byId("razorpay:4012345"), validThrough: "31 Dec 2026" }, { now }).validThrough).toBe("2026-12-31T00:00:00.000Z");
    expect(normalizeJob({ ...byId("razorpay:4012345"), validThrough: "soon" }, { now }).validThrough).toBeNull();
  });
});
