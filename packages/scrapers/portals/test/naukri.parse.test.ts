import { validateRawJob } from "@easyjobs/contract";
import { describe, expect, it } from "vitest";
import { mapNaukriJob, naukriJobType } from "../src/naukri/map";
import { descriptionWithFacts, parseNaukriDetail } from "../src/naukri/parse-detail";
import { isNaukriSearchPayload, naukriJobUrl, parseNaukriSearch, parseSalaryDetail, parseYearsRange, splitLocations } from "../src/naukri/parse-search";
import { naukriConfigFromEnv, naukriSearchUrl, naukriSlug, type NaukriQuery } from "../src/naukri/plan";
import { fixtureJson, NOW } from "./helpers";

const Q: NaukriQuery = { keywords: "software engineer", experience: "0", key: "software engineer|X0" };

describe("parseNaukriSearch (search API payload)", () => {
  const result = parseNaukriSearch(fixtureJson("naukri/search-v3.json"), NOW);

  it("matches the snapshot", () => {
    expect(result).toMatchSnapshot();
  });

  it("keeps valid jobs only, de-duplicated by jobId", () => {
    expect(result.total).toBe(18342);
    expect(result.listings.map((l) => l.jobId)).toEqual(["251125900001", "251125900002", "251125900003"]);
  });

  it("maps placeholders, skills, dates, logo and canonical job URL", () => {
    expect(result.listings[0]).toMatchObject({
      title: "Software Engineer - Fresher",
      companyName: "Acme Analytics Pvt Ltd",
      jdUrl: "https://www.naukri.com/job-listings-software-engineer-fresher-acme-analytics-pvt-ltd-bengaluru-hyderabad-0-to-1-years-251125900001",
      logoUrl: "https://img.naukimg.com/logo_images/groups/v2/900001.gif",
      experienceLabel: "0-1 Yrs",
      experienceMin: 0,
      experienceMax: 1,
      salaryLabel: "3-5 Lacs PA",
      salary: { min: 300000, max: 500000, currency: "INR", hidden: false },
      locations: ["Bengaluru", "Hyderabad"],
      skills: ["Java", "Spring Boot", "SQL", "Data Structures", "Algorithms"],
      postedLabel: "1 Day Ago",
      createdAt: "2026-11-25T06:15:00.000Z",
      postedAt: "2026-11-25T06:15:00.000Z",
    });
  });

  it("hidden salary → null structured salary; relative label → postedAt; numeric jobId → string; walk-in flag", () => {
    const [, trainee, walkin] = result.listings;
    expect(trainee?.salary).toBeNull();
    expect(trainee?.salaryLabel).toBe("Not disclosed");
    expect(trainee?.postedAt).toBe("2026-11-26T03:00:00.000Z");
    expect(walkin?.jobId).toBe("251125900003");
    expect(walkin?.walkIn).toBe(true);
  });

  it("tolerates garbage payloads", () => {
    for (const junk of [null, undefined, 42, "x", [], {}, { jobDetails: "nope" }, { jobDetails: [null, 1, "a", {}] }]) {
      expect(parseNaukriSearch(junk, NOW).listings).toEqual([]);
    }
    expect(isNaukriSearchPayload({ noOfJobs: 0, jobDetails: [] })).toBe(true);
    expect(isNaukriSearchPayload({ message: "Access Denied" })).toBe(false);
  });
});

describe("parseNaukriDetail (job API payload)", () => {
  const detail = parseNaukriDetail(fixtureJson("naukri/job-v4.json"));

  it("matches the snapshot", () => {
    expect(detail).toMatchSnapshot();
  });

  it("reads description, employment type, education, skills, experience, salary and the off-site apply URL", () => {
    expect(detail).toMatchObject({
      employmentType: "Full Time, Permanent",
      department: "Engineering - Software & QA",
      education: { ug: ["B.Tech/B.E. in Any Specialization", "BCA in Any Specialization"], pg: ["MCA in Any Specialization"], doctorate: [] },
      skills: ["Java", "Spring Boot", "SQL", "Kafka"],
      experienceMin: 0,
      experienceMax: 1,
      applyRedirectUrl: "https://careers.acme-analytics.example/jobs/swe-fresher-2026?source=naukri",
      createdAt: "2026-11-25T06:15:00.000Z",
    });
  });

  it("ignores recruiter contact details (personal data)", () => {
    expect(JSON.stringify(detail)).not.toMatch(/recruiter@example\.com|90000-00000|Example Recruiter/);
  });

  it("appends the page's Role/Industry/Education facts to the description", () => {
    const htmlOut = descriptionWithFacts(detail!);
    expect(htmlOut).toContain("<strong>Education (UG):</strong> B.Tech/B.E. in Any Specialization, BCA in Any Specialization");
    expect(htmlOut).toContain("<strong>Department:</strong> Engineering - Software &amp; QA");
  });

  it("returns null for non-detail payloads", () => {
    expect(parseNaukriDetail(null)).toBeNull();
    expect(parseNaukriDetail({ message: "x" })).toBeNull();
  });
});

describe("mapNaukriJob", () => {
  const [first, trainee, walkin] = parseNaukriSearch(fixtureJson("naukri/search-v3.json"), NOW).listings;
  const detail = parseNaukriDetail(fixtureJson("naukri/job-v4.json"));

  it("listing + detail → RawJob (snapshot), valid, official apply URL preferred", () => {
    const job = mapNaukriJob(first!, detail, Q);
    expect(job).toMatchSnapshot();
    expect(validateRawJob(job)).toEqual([]);
    expect(job).toMatchObject({
      source: "naukri",
      sourceKind: "job_board",
      sourceJobId: "251125900001",
      sourceUrl: first!.jdUrl,
      applyUrl: "https://careers.acme-analytics.example/jobs/swe-fresher-2026?source=naukri",
      target: null,
      jobType: "full_time",
      experienceMin: 0,
      experienceMax: 1,
      salary: { min: 300000, max: 500000, currency: "INR", period: "year", raw: "3-5 Lacs PA" },
      locations: ["Bengaluru", "Hyderabad"],
    });
    expect(job.skills?.slice(0, 4)).toEqual(["Java", "Spring Boot", "SQL", "Kafka"]);
  });

  it("listing only → applyUrl = jdURL, teaser in descriptionText, no salary when hidden", () => {
    const job = mapNaukriJob(trainee!, null, Q);
    expect(job.applyUrl).toBe(trainee!.jdUrl);
    expect(job.descriptionHtml).toBeNull();
    expect(job.descriptionText).toBe("Graduate trainee programme for B.Com / M.Com freshers.");
    expect(job.salary).toBeNull();
    expect(job.salaryRaw).toBe("Not disclosed");
    expect(validateRawJob(job)).toEqual([]);
  });

  it("walk-in listings get the walk-in tag", () => {
    expect(mapNaukriJob(walkin!, null, Q).tags).toEqual(["walk-in"]);
  });
});

describe("helpers", () => {
  it.each([
    ["0-1 Yrs", { min: 0, max: 1 }],
    ["2 - 5 years", { min: 2, max: 5 }],
    ["3+ Yrs", { min: 3, max: null }],
    ["5-2 Yrs", null],
    ["Fresher", null],
    [null, null],
  ] as const)("parseYearsRange(%j)", (label, expected) => {
    expect(parseYearsRange(label)).toEqual(expected);
  });

  it("splitLocations / naukriJobUrl / parseSalaryDetail", () => {
    expect(splitLocations("Bengaluru, Hyderabad( Hitech City ), bengaluru")).toEqual(["Bengaluru", "Hyderabad( Hitech City )"]);
    expect(naukriJobUrl("/job-listings-x-123?src=a&sid=b")).toBe("https://www.naukri.com/job-listings-x-123");
    expect(naukriJobUrl("https://evil.example/job-listings-x")).toBeNull();
    expect(parseSalaryDetail({ minimumSalary: 3, maximumSalary: 6, hideSalary: false })).toBeNull();
    expect(parseSalaryDetail({ minimumSalary: 0, maximumSalary: 600000, hideSalary: false })).toEqual({ min: null, max: 600000, currency: "INR", hidden: false });
  });

  it.each([
    ["Full Time, Permanent", "full_time"],
    ["Part Time, Permanent", "part_time"],
    ["Full Time, Temporary/Contractual", "contract"],
    ["Internship", "internship"],
    ["Freelance", "freelance"],
    [null, undefined],
  ] as const)("naukriJobType(%j) → %s", (input, expected) => {
    expect(naukriJobType(input)).toBe(expected);
  });

  it("search URLs follow the public SEO format", () => {
    expect(naukriSearchUrl(Q)).toBe("https://www.naukri.com/software-engineer-jobs?experience=0");
    expect(naukriSearchUrl({ ...Q, experience: null }, 2)).toBe("https://www.naukri.com/software-engineer-jobs-2");
    expect(naukriSlug("HR")).toBe("hr");
    expect(naukriSlug("C++ / .NET developer")).toBe("c-net-developer");
  });

  it("default plan = 13 keywords × experience {0,1}", () => {
    const cfg = naukriConfigFromEnv({});
    expect(cfg.plan).toHaveLength(26);
    expect(cfg.plan.slice(0, 2).map((q) => q.key)).toEqual(["software engineer|X0", "software engineer|X1"]);
    expect(naukriConfigFromEnv({ NAUKRI_EXPERIENCE: "any", NAUKRI_KEYWORDS: "fresher" }).plan).toEqual([{ keywords: "fresher", experience: null, key: "fresher" }]);
  });
});
