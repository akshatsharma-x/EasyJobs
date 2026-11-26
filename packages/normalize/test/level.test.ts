import { describe, expect, it } from "vitest";
import type { ExperienceLevel } from "@easyjobs/contract";
import { classifyLevel, classifyLevelDetailed, levelFromYears } from "../src/index";

describe("classifyLevel — title keywords", () => {
  const cases: [string, ExperienceLevel][] = [
    ["Software Engineer Intern", "intern"],
    ["Summer Analyst 2026 - Investment Banking", "intern"],
    ["Summer Associate", "intern"],
    ["Intern-Trainee, Data Science", "intern"],
    ["Co-op Student, Firmware", "intern"],
    ["Campus Ambassador", "intern"],
    ["Graduate Engineer Trainee (GET)", "fresher"],
    ["GET - Mechanical", "fresher"],
    ["Trainee Software Engineer", "fresher"],
    ["Management Trainee - Sales", "fresher"],
    ["Apprentice - Electrical", "fresher"],
    ["New Grad Software Engineer 2026", "fresher"],
    ["Software Engineer, University Graduate", "fresher"],
    ["Early Career Software Engineer", "fresher"],
    ["Campus Hire - Analyst", "fresher"],
    ["Off Campus Drive - Associate Engineer", "fresher"],
    ["Fresher Java Developer", "fresher"],
    ["2026 Batch - Software Developer", "fresher"],
    ["SDE I", "entry"],
    ["SDE-1, Payments", "entry"],
    ["Software Engineer I", "entry"],
    ["Engineer 1, Platform", "entry"],
    ["Software Engineer, L3", "entry"],
    ["Associate Software Engineer", "entry"],
    ["Junior Frontend Developer", "entry"],
    ["Jr. Data Analyst", "entry"],
    ["Entry Level Accountant", "entry"],
    ["SDE-2", "mid"],
    ["SDE II - Backend", "mid"],
    ["Software Engineer II", "mid"],
    ["Engineer 2", "mid"],
    ["Software Engineer, L4", "mid"],
    ["Assistant Manager - Finance", "mid"],
    ["Mid-Level Python Developer", "mid"],
    ["Product Manager", "mid"],
    ["SDE III", "senior"],
    ["Engineer 3", "senior"],
    ["L5 Software Engineer", "senior"],
    ["Senior Software Engineer", "senior"],
    ["Sr. Data Analyst", "senior"],
    ["Senior Product Manager", "senior"],
    ["Staff Engineer", "lead"],
    ["Staff Software Engineer, Infra", "lead"],
    ["Principal Engineer", "lead"],
    ["Software Engineer L6", "lead"],
    ["L7 Engineering Lead", "lead"],
    ["Tech Lead - Mobile", "lead"],
    ["Team Lead, Customer Support", "lead"],
    ["Solution Architect", "lead"],
    ["Engineering Manager", "lead"],
    ["Senior Manager, Engineering", "lead"],
    ["Director of Engineering", "executive"],
    ["Associate Director - Analytics", "executive"],
    ["Head of Marketing", "executive"],
    ["Head - Talent Acquisition", "executive"],
    ["Sales Head", "executive"],
    ["VP, Product", "executive"],
    ["Vice President - Engineering", "executive"],
    ["Chief Technology Officer", "executive"],
    ["CTO", "executive"],
  ];
  it.each(cases)("%s → %s", (title, level) => {
    expect(classifyLevel({ title })).toBe(level);
  });

  const notLevels: [string, ExperienceLevel][] = [
    ["Lead Generation Executive", "entry"],
    ["Sales Executive", "entry"],
    ["Executive Assistant to CEO", "entry"],
    ["Campus Recruiter", "entry"],
    ["L2 Support Engineer", "entry"],
    ["Staff Accountant", "entry"],
    ["Internal Auditor", "entry"],
    ["Founder's Office Associate", "entry"],
  ];
  it.each(notLevels)("does not misread %s (→ %s)", (title, level) => {
    expect(classifyLevel({ title })).toBe(level);
  });

  it("defaults to entry with low confidence when nothing is known", () => {
    expect(classifyLevelDetailed({ title: "Data Analyst" })).toEqual({ level: "entry", confidence: "low", source: "default" });
  });
});

describe("classifyLevel — §0.4 precedence", () => {
  it("internship job type always gives intern", () => {
    expect(classifyLevel({ title: "Software Engineer", jobType: "internship", experienceMin: 2, experienceMax: 3 })).toBe("intern");
  });
  it("explicit years beat the source hint and the title", () => {
    expect(classifyLevel({ title: "Senior Engineer", hint: "senior", experienceMin: 0, experienceMax: 1, experienceSource: "raw" })).toBe("fresher");
  });
  it("fresher words + max ≤ 2 years → fresher", () => {
    expect(classifyLevel({ title: "Software Engineer", experienceMin: 0, experienceMax: 2, description: "Freshers can apply" })).toBe("fresher");
    expect(classifyLevel({ title: "Software Engineer", experienceMin: 0, experienceMax: 2, batches: [2025] })).toBe("fresher");
  });
  it("structured hint beats title keywords", () => {
    expect(classifyLevel({ title: "Senior Software Engineer", hint: "mid" })).toBe("mid");
  });
  it("hint beats years that only come from the description", () => {
    expect(classifyLevel({ title: "Software Engineer", hint: "entry", experienceMin: 3, experienceMax: null, experienceSource: "description" })).toBe("entry");
  });
  it("description-only years yield to a strong conflicting title", () => {
    expect(classifyLevel({ title: "Senior Software Engineer", experienceMin: 2, experienceMax: null, experienceSource: "description" })).toBe("senior");
  });
  it("description years decide when the title is silent", () => {
    expect(classifyLevelDetailed({ title: "Backend Engineer", experienceMin: 5, experienceMax: 8, experienceSource: "description" })).toMatchObject({
      level: "senior",
      confidence: "medium",
    });
  });
  it("an executive title with ≥5 years stays executive (years can never say executive)", () => {
    expect(classifyLevel({ title: "Director of Engineering", experienceMin: 15, experienceMax: null, experienceSource: "raw" })).toBe("executive");
  });
  it("title keywords beat description keywords", () => {
    expect(classifyLevel({ title: "Senior Data Scientist", description: "Freshers are welcome to apply" })).toBe("senior");
  });
  it("description fresher keywords and batches are the last signal", () => {
    expect(classifyLevelDetailed({ title: "Analyst", description: "Freshers can apply. Graduating in 2026." })).toMatchObject({ level: "fresher", source: "description" });
    expect(classifyLevel({ title: "Analyst", batches: [2025, 2026] })).toBe("fresher");
    expect(classifyLevel({ title: "Analyst", description: "This is an entry-level role" })).toBe("entry");
  });
  it("apprenticeship job type → fresher when nothing else is known", () => {
    expect(classifyLevel({ title: "Electrician", jobType: "apprenticeship" })).toBe("fresher");
  });
});

describe("levelFromYears", () => {
  const cases: [number | null, number | null, ExperienceLevel | null][] = [
    [0, 0, "fresher"],
    [0, 1, "fresher"],
    [0, 2, "entry"],
    [1, 2, "entry"],
    [1, 3, "mid"],
    [2, 5, "mid"],
    [5, 8, "senior"],
    [8, 12, "lead"],
    [1, null, "entry"],
    [2, null, "mid"],
    [3, null, "mid"],
    [5, null, "senior"],
    [8, null, "lead"],
    [10, null, "lead"],
    [null, null, null],
  ];
  it.each(cases)("%s–%s years → %s", (min, max, level) => {
    expect(levelFromYears(min, max)).toBe(level);
  });
  it("open-ended 0+ with fresher words → fresher", () => {
    expect(levelFromYears(0, null, true)).toBe("fresher");
    expect(levelFromYears(0, null, false)).toBe("entry");
  });
});

describe("classifyLevel — W2 real-data fixes (manual review of 350 stored jobs)", () => {
  const desc = (title: string, min: number | null, max: number | null): ExperienceLevel =>
    classifyLevel({ title, experienceMin: min, experienceMax: max, experienceSource: "description" });

  it.each<[string, number | null, number | null, ExperienceLevel]>([
    // "Associate" is ambiguous → weak: the stated years decide
    ["Associate General Counsel, Security & National Security", 15, null, "lead"],
    ["Operations Associate, Guest Services", 5, null, "senior"],
    ["Associate Software Engineer", null, null, "entry"],
    // Deputy / assistant manager → weak
    ["Deputy Manager_eAxle Function Safety Engineer", 8, null, "lead"],
    ["Assistant Manager - Finance", null, null, "mid"],
    // Big-4 grade
    ["Senior Associate 1 - Canada Audit", 2.5, 4, "mid"],
    ["Senior Associate", null, null, "mid"],
  ])("%s (%s–%s y in description) → %s", (title, min, max, level) => {
    expect(desc(title, min, max)).toBe(level);
  });

  it("'senior partner' is executive only as a firm title, not the partner ecosystem", () => {
    expect(classifyLevel({ title: "Senior Partner Sales Engineer" })).toBe("senior");
    expect(classifyLevel({ title: "Partner Success Manager" })).not.toBe("executive");
    expect(classifyLevel({ title: "Managing Partner" })).toBe("executive");
    expect(classifyLevel({ title: "Senior Partner, Strategy Consulting" })).toBe("executive");
  });

  it.each<[string, ExperienceLevel]>([
    // Bank corporate grades: a plain VP paired with an individual role is ≈ 8+ years, not an executive
    ["Vice President, Full-Stack Engineer", "lead"],
    ["Treasury and Chief Investment Office (TCIO) Liquidity Controller, Vice President", "lead"],
    ["Vice President, Relationship Manager", "lead"],
    ["Compliance Officer - Markets - Assistant Vice President", "lead"],
    ["Associate Vice President - Sales", "lead"],
    // …while real VPs stay executive
    ["Vice President of Engineering", "executive"],
    ["VP, Engineering", "executive"],
    ["Vice President - Marketing", "executive"],
    ["Senior Vice President, Software Engineer", "lead"],
    ["SVP, Principal Python Full Stack Engineer - Margin Calculation", "lead"],
    ["Senior Vice President, Engineering", "executive"],
    ["SVP, Sales", "executive"],
    ["Vice President & Chief Compliance Officer", "executive"],
    ["Vice President, Head of Data", "executive"],
    ["President", "executive"],
    ["Vice President & Deputy General Counsel, Corporate", "executive"],
    ["Vice President, Associate General Counsel", "lead"],
    ["Senior Partner Programs Manager", "senior"],
    ["Senior Partner Development Manager, Technology Partnerships", "senior"],
    // "Staff" + any design / engineering role is the staff grade; "Staff Nurse" / "Staff Accountant" are not
    ["Staff Content Designer", "lead"],
    ["Staff Machine Learning Research Scientist", "lead"],
    ["Staff Nurse", "entry"],
    ["Staff Accountant", "entry"],
  ])("title %s → %s", (title, level) => {
    expect(classifyLevel({ title })).toBe(level);
  });

  it("an 'executive' hint counts only when the title agrees (sources over-use it)", () => {
    expect(classifyLevel({ title: "Account Manager", hint: "executive" })).toBe("mid");
    expect(classifyLevel({ title: "Retail Associate", hint: "executive" })).toBe("entry");
    expect(classifyLevel({ title: "Principal Product Manager II", hint: "executive" })).toBe("lead");
    expect(classifyLevel({ title: "Director of Sales", hint: "executive" })).toBe("executive");
    expect(classifyLevel({ title: "Account Manager", hint: "senior" })).toBe("senior");
  });

  it.each(["Stagiaire PMO RH - France et Luxembourg F/H", "Praktikum Entwicklung und Konstruktion", "Estágio em Engenharia de Software", "Becario de Marketing", "Tirocinio Data Analyst", "Werkstudentin Controlling"])(
    "non-English internship title %s → intern",
    (title) => {
      expect(classifyLevel({ title })).toBe("intern");
    },
  );
});
