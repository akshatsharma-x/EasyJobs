import { describe, expect, it } from "vitest";
import { validateJobInput, type RawJob } from "@easyjobs/contract";
import { classifyLevel, detectJobType, detectTags, levelFromYears, normalizeJob, parseExperience } from "../src/index";

/** Regressions found by W2's manual review of 350 stored jobs (docs/qa-report.md). */
describe("job type: an intern title beats a generic full-time hint", () => {
  it.each([
    ["Software Engineering Intern", "full_time"],
    ["2027 Operations & Logistics Intern Costa Rica", "full_time"],
    ["Praktikum Entwicklung und Konstruktion", "full_time"],
  ])("%s (hint %s) → internship", (title, hint) => {
    expect(detectJobType({ title, hint })).toBe("internship");
  });
  it("other explicit hints still win", () => {
    expect(detectJobType({ title: "Data Intern", hint: "part_time" })).toBe("part_time");
    expect(detectJobType({ title: "Data Intern", hint: "apprenticeship" })).toBe("apprenticeship");
    expect(detectJobType({ title: "Software Engineer", hint: "full_time" })).toBe("full_time");
  });
});

describe("tags: test postings and non-jobs", () => {
  const tags = (title: string): string[] => detectTags({ title });
  it("flags a test requisition named after a person, not real test roles", () => {
    expect(tags("Test Jerin")).toContain("test-posting");
    expect(tags("Test Engineer")).not.toContain("test-posting");
    expect(tags("Test Automation")).not.toContain("test-posting");
  });
  it.each(["Don't see a fit? Fill out a general application", "Multiple Roles", "Join our Talent Community", "General Application - Engineering", "Future Opportunities"])(
    "%s → general-application",
    (title) => expect(tags(title)).toContain("general-application"),
  );
  it.each([
    "Non trovi posizioni aperte in linea con il tuo profilo?",
    "Candidature spontanée",
    "Initiativbewerbung (m/w/d)",
    "Candidatura espontánea",
    "Banco de Talentos",
    "Open sollicitatie",
    "Don't see the right role? Apply here",
    "Can’t find the right job? Join us",
  ])("non-English / reworded general application %s → general-application", (title) => expect(tags(title)).toContain("general-application"));
  it.each(["General Manager", "Talent Acquisition Partner", "Open Source Engineer", "Applications Engineer", "Software Engineer - Find your fit", "Candidate Experience Specialist"])("%s is a real job", (title) => {
    expect(tags(title)).not.toContain("general-application");
  });
});

describe("normalizeJob end to end", () => {
  const raw: RawJob = {
    source: "smartrecruiters",
    sourceKind: "ats",
    sourceJobId: "w2-1",
    sourceUrl: "https://jobs.smartrecruiters.com/BoschGroup/w2-1",
    target: "bosch",
    applyUrl: "https://jobs.smartrecruiters.com/BoschGroup/w2-1",
    title: "Praktikum Entwicklung und Konstruktion",
    company: "Bosch",
    locations: ["Stuttgart, Germany"],
    descriptionHtml: "<p>Dein Praktikum bei Bosch.</p>",
    postedAt: "2026-11-20T10:00:00Z",
    jobType: "full_time",
  };
  it("a German internship with a full_time hint becomes intern / internship", () => {
    const job = normalizeJob(raw, { now: new Date("2026-11-26T00:00:00Z") });
    expect(validateJobInput(job)).toEqual([]);
    expect(job.jobType).toBe("internship");
    expect(job.experienceLevel).toBe("intern");
  });
});

describe("salary placeholders (W2)", () => {
  it("drops undisclosed-pay placeholder ranges, keeps real ones", async () => {
    const { parseSalary, cleanSalaryHint } = await import("../src/index");
    expect(cleanSalaryHint({ min: 1, max: 999_999, currency: "USD", period: "year", raw: "USD 1–999,999 (Base Pay Range)" })).toBeNull();
    expect(cleanSalaryHint({ min: 0, max: 9_999_999, currency: "INR", period: "year" })).toBeNull();
    expect(parseSalary("USD 1–999,999 (Base Pay Range)")).toBeNull();
    expect(cleanSalaryHint({ min: 380_000, max: 850_000, currency: "USD", period: "year" })).not.toBeNull();
    expect(cleanSalaryHint({ min: 0, max: 10_000, currency: "INR", period: "month", raw: "₹0 - 10,000 /month" })).not.toBeNull();
    expect(parseSalary("₹4–6 LPA")?.min).toBe(400_000);
  });
});

describe("round 3 (seed 0.31): titles, years and boilerplate", () => {
  it.each(["contract", "temporary"] as const)("an intern title beats a generic %s hint", (hint) => {
    expect(detectJobType({ title: "Accounting Intern", hint })).toBe("internship");
    expect(detectJobType({ title: "Data Engineer", hint })).toBe(hint);
  });

  it.each<[string, string]>([
    ["RVP, Health Plan Sales", "executive"],
    ["Diretor Comercial", "executive"],
    ["Principle Network Engineer", "lead"],
    ["Forward Deployed Chief AI Engineering Expert", "lead"],
    ["Teamleiterin Logistik", "lead"],
    ["Power Generation Field Service Technician - Level II", "mid"],
    ["Level 2 Support Engineer", "entry"],
    ["Gerente de Projetos", "mid"],
    // recruiting roles name the audience, not the level
    ["Talent Acquisition Specialist, Early Careers", "entry"],
    ["Campus Recruiter", "entry"],
    ["Software Engineer, Early Careers", "fresher"],
  ])("%s → %s", (title, level) => expect(classifyLevel({ title })).toBe(level));

  it("a recruiter for early careers with 7+ years is senior, not fresher", () => {
    expect(classifyLevel({ title: "Talent Acquisition Specialist, Early Careers", experienceMin: 7, experienceMax: null, experienceSource: "description" })).toBe("senior");
  });

  it("exactly 1 year of experience is entry; up to 1 year is fresher", () => {
    expect(levelFromYears(1, 1)).toBe("entry");
    expect(levelFromYears(0, 1)).toBe("fresher");
    expect(levelFromYears(1, 2, true)).toBe("fresher");
  });

  it("employer boilerplate ('Whether you're … or a recent graduate') is not a fresher signal", () => {
    const description =
      "Whether you're an established professional looking for a career change, an undergraduate student exploring possibilities, or a recent graduate with an advanced degree, you'll find your chance to make a difference.";
    expect(classifyLevel({ title: "Gerente de Projetos", description })).toBe("mid");
    expect(classifyLevel({ title: "Analyst", description: "We are hiring recent graduates for our analyst program." })).toBe("fresher");
  });

  it("description years: thousands separators and domain-specific 'not required'", () => {
    expect(parseExperience("Developers have used Deepgram to process more than 200,000 years of audio. Typically 2+ years of engineering experience.", { strict: true })).toEqual({ min: 2, max: null });
    expect(parseExperience("An engineering degree or professional software development experience is not required.", { strict: true })).toBeNull();
    expect(parseExperience("Prior experience is not required; we train you.", { strict: true })).toEqual({ min: 0, max: 0 });
    expect(parseExperience("Experience is not required.", { strict: true })).toEqual({ min: 0, max: 0 });
  });
});

describe("round 3 (seed 0.31): mid / senior", () => {
  it.each(["Engineering Manager, Agents", "Engineering Manager, Inference Infrastructure", "Manager, Software Engineering", "Software Development Manager"])(
    "%s is a people manager of engineers → lead",
    (title) => expect(classifyLevel({ title, experienceMin: 3, experienceMax: null, experienceSource: "description" })).toBe("lead"),
  );
  it.each(["Engineering Project Manager", "Assistant Manager - Engineering", "Product Manager", "Business Development Manager", "Partner Development Manager", "Research Manager"])("%s is not", (title) =>
    expect(classifyLevel({ title })).not.toBe("lead"),
  );
  it("a broad 'mid' hint yields to stated years that point higher, unless the title agrees", () => {
    const d = (title: string, hint: string, min: number) => classifyLevel({ title, hint, experienceMin: min, experienceMax: null, experienceSource: "description" });
    expect(d("Federal Account Executive - USPS", "mid", 5)).toBe("senior");
    expect(d("SAP DRC Consultant - Offshore", "senior", 8)).toBe("lead");
    expect(d("Software Engineer II", "mid", 5)).toBe("mid");
    expect(d("Account Executive", "mid", 2)).toBe("mid");
    expect(d("Account Executive", "senior", 2)).toBe("senior");
  });
});

describe("round 3 (seed 0.31): lead / executive", () => {
  it.each<[string, string]>([
    ["Assistant Manager_Active Directory", "mid"],
    ["Executive Assistant to VP, Cloud & VP, Product", "entry"],
    ["Executive Assistant to the CEO", "entry"],
    ["IC5 - Director, Federal Deployment Strategist - Oracle Health", "lead"],
    ["Software Engineer - Platform [IC3]", "senior"],
    ["AMS Device Manager Product Engineer", "entry"],
    ["Senior Mortgage Closing Manager", "senior"],
    ["Senior Manager, Finance", "lead"],
    ["Senior Engineering Manager", "lead"],
    ["Directora Comercial", "executive"],
    ["Director, Enterprise Sales", "executive"],
  ])("%s → %s", (title, level) => expect(classifyLevel({ title })).toBe(level));

  it("architects without a qualifier are weak: stated years decide", () => {
    const d = (title: string, min: number) => classifyLevel({ title, experienceMin: min, experienceMax: null, experienceSource: "description" });
    expect(d("Commercial Outcomes Architect [12-Month Contract]", 3)).toBe("mid");
    expect(d("Solutions Architect", 4)).toBe("mid");
    expect(d("Senior Solutions Architect", 4)).toBe("lead");
    expect(classifyLevel({ title: "Solutions Architect" })).toBe("lead");
  });

  it("wide year bands are classified by their middle", () => {
    expect(levelFromYears(2, 10)).toBe("senior");
    expect(levelFromYears(1, 7)).toBe("mid");
    expect(levelFromYears(10, 18)).toBe("lead");
    expect(levelFromYears(6, 10)).toBe("senior");
  });
});

describe("round 4 (seed 0.53)", () => {
  it("'Region Head' is a department head", () => expect(classifyLevel({ title: "Region Head" })).toBe("executive"));
  it("enterprise / strategic account executives are senior unless years say otherwise", () => {
    expect(classifyLevel({ title: "Strategic Account Executive" })).toBe("senior");
    expect(classifyLevel({ title: "Enterprise Account Executive", experienceMin: 3, experienceMax: null, experienceSource: "description" })).toBe("mid");
    expect(classifyLevel({ title: "Mid-Market Account Executive, Tech" })).toBe("mid");
    expect(classifyLevel({ title: "Account Executive" })).toBe("entry");
    expect(classifyLevel({ title: "Senior Enterprise Account Executive", experienceMin: 10, experienceMax: null, experienceSource: "description" })).toBe("senior");
  });
  it("negated fresher phrases are not fresher signals", () => {
    expect(classifyLevel({ title: "AI Research Engineer", description: "You have shipped models to production – we’re not currently looking for new grad folks." })).toBe("entry");
    expect(classifyLevel({ title: "Analyst", description: "Freshers need not apply. This role is not suitable for freshers." })).toBe("entry");
    expect(classifyLevel({ title: "Research Engineer", description: "This is a strong opportunity for a new graduate or early-career engineer." })).toBe("fresher");
  });
});

describe("round 4 (seed 0.53): upper levels", () => {
  it.each<[string, string]>([
    ["Country Leader, Japan", "executive"],
    ["Country Manager - India", "executive"],
    ["AI Associate, Office of the CEO", "entry"],
    ["Chief of Staff to the CEO", "executive"],
    ["Art Director - Brand", "senior"],
    ["Associate Art Director", "mid"],
    ["Creative Director", "executive"],
  ])("%s → %s", (title, level) => expect(classifyLevel({ title })).toBe(level));

  it("banks use Vice President as a grade even without a role noun", () => {
    expect(classifyLevel({ title: "Vice President, Fiduciary Tax Reporting & Compliance", company: "BNY" })).toBe("lead");
    expect(classifyLevel({ title: "Outcome Driven Strategies, Trading and Portfolio Operations - Vice President", company: "iCapital" })).toBe("lead");
    expect(classifyLevel({ title: "Vice President, Fiduciary Tax Reporting & Compliance", company: "Stripe" })).toBe("executive");
    expect(classifyLevel({ title: "Executive Vice President, Operations", company: "BNY" })).toBe("executive");
    expect(classifyLevel({ title: "Vice President, Head of Treasury", company: "HSBC" })).toBe("executive");
    expect(classifyLevel({ title: "Vice President and Area Head Bangalore", company: "HSBC" })).toBe("executive");
  });

  it("4+ year bands use their middle: '2-6 years' is mid", () => {
    expect(levelFromYears(2, 6)).toBe("mid");
    expect(levelFromYears(4, 8)).toBe("senior");
    expect(levelFromYears(8, 12)).toBe("lead");
  });
});

describe("round 5 (seed 0.97)", () => {
  it("a newline / bullet ends the clause: sales-cycle months are not experience", () => {
    expect(parseExperience("• Comfortable with sales cycles of between 2-3 months\n• Experience with renewals", { strict: true })).toBeNull();
    expect(parseExperience("• 2-3 years of experience\n• Comfortable with travel", { strict: true })).toEqual({ min: 2, max: 3 });
  });
  it("3+ year bands use their middle: '0-3 years' is entry, '3-6' mid", () => {
    expect(levelFromYears(0, 3)).toBe("entry");
    expect(levelFromYears(3, 6)).toBe("mid");
    expect(levelFromYears(1, 3)).toBe("mid");
    expect(levelFromYears(7, 10)).toBe("lead");
  });
});

describe("round 5 (seed 0.97): upper levels", () => {
  it.each<[string, string]>([
    ["Senior Product Marketing Manager, IT and CIO Audiences", "senior"],
    ["Marketing Manager for CXO Programs", "mid"],
    ["CIO", "executive"],
    ["Manager, Delivery Solutions Architects", "lead"],
    ["GRC Manager", "mid"],
  ])("%s → %s", (title, level) => expect(classifyLevel({ title })).toBe(level));
});
