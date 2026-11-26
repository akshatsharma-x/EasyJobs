import { describe, expect, it } from "vitest";
import { classifyIntent, matchesAny, slugPattern } from "../src/parse/intent";
import { COURSEJOINER, KICKCHARM } from "../src/sites";
import type { WpPostRef } from "../src/wp/types";

const ref = (title: string, categories: string[], tags: string[] = []): WpPostRef => ({
  id: 1,
  link: "https://coursejoiner.com/x/",
  title,
  dateGmt: "2026-11-20T00:00:00.000Z",
  modifiedGmt: "2026-11-20T00:00:00.000Z",
  categories: categories.map((slug, i) => ({ id: i + 1, slug, name: slug })),
  tags: tags.map((slug, i) => ({ id: i + 100, slug, name: slug })),
});

describe("slug patterns", () => {
  it("supports exact slugs and * wildcards", () => {
    expect(slugPattern("*-internships").test("content-writing-internships")).toBe(true);
    expect(matchesAny("development-udemy-courses-developmentfree-udemy", ["*udemy*"])).toBe(true);
    expect(matchesAny("internship", ["internships"])).toBe(false);
    expect(matchesAny("internship", undefined)).toBe(false);
  });
});

describe("category filtering (CourseJoiner)", () => {
  const cj = (title: string, cats: string[]) => classifyIntent(ref(title, cats), COURSEJOINER);

  it("accepts job categories", () => {
    expect(cj("EA Internship 2027 | Software Engineering Intern, Hyderabad", ["internship"]).candidate).toBe(true);
    expect(cj("Wipro Job 2027: Data Engineer Role Open for Graduates", ["job"]).candidate).toBe(true);
    expect(cj("Starbucks Apprentice 2027 | Multiple Locations", ["apprenticeship"]).candidate).toBe(true);
    expect(cj("Decathlon Internship 2027 | Omni Sport Advisor", ["challengeshackathoninternships"]).candidate).toBe(true);
  });

  it("rejects courses, scholarships, news and other non-job categories (exclude wins over include)", () => {
    expect(cj("Free Data Science Course 2027", ["free-online-courses"])).toMatchObject({ candidate: false, reason: "excluded category: free-online-courses" });
    expect(cj("Python Bootcamp", ["development-udemy-courses-developmentfree-udemy"]).candidate).toBe(false);
    expect(cj("Google Cohort Scholarship 2027", ["scholarship"]).candidate).toBe(false);
    expect(cj("Some Internship 2027", ["internship", "free-udemy"]).candidate).toBe(false);
    expect(cj("Hiring Challenge", ["challenges"]).candidate).toBe(false);
  });

  it("rejects posts outside the include list", () => {
    expect(cj("Random update", ["some-other-category"])).toMatchObject({ candidate: false });
  });

  it("needs a job word for ambiguous categories (program / fellowship / uncategorized)", () => {
    expect(cj("Google Student Ambassador Program 2026: Get FREE Bottle", ["program"]).candidate).toBe(false);
    expect(cj("Google Gemini Enterprise Program 2027: Get 30-Day Free Trail", ["program"]).candidate).toBe(false);
    expect(cj("Goldman Sachs Summer Analyst Program 2027: Mumbai Opportunity", ["program"]).candidate).toBe(true);
    expect(cj("Teach For India Fellowship 2027: ₹30,000 Stipend", ["fellowship"]).candidate).toBe(true);
  });

  it("rejects non-job titles even in job categories", () => {
    for (const t of [
      "TCS Free Online Course 2027: Master Soft Skills",
      "SSC CGL Admit Card 2026 Out",
      "Infosys to Hire 20,000 Freshers in 2025",
      "India Job Market Today: AI Boom Reshapes Fresher Hiring",
      "Hackathon 2026: Win Prizes",
      "TCS NQT Answer Key 2026",
      "Tata Virtual Job Simulation 2027",
    ]) {
      expect(cj(t, ["job"]).candidate, t).toBe(false);
    }
  });
});

describe("category filtering without an include list (KickCharm)", () => {
  it("uses exclude patterns plus a job signal", () => {
    expect(classifyIntent(ref("CGI Recruitment Hiring Graduates Freshers for Graduate Trainee", ["freshers-jobs", "b-tech-jobs"]), KICKCHARM).candidate).toBe(true);
    expect(classifyIntent(ref("TCS to Hire 40,000 Freshers this Year", ["news"]), KICKCHARM)).toMatchObject({ candidate: false, reason: "excluded category: news" });
    expect(classifyIntent(ref("Top 10 resume tips", ["learning"]), KICKCHARM).candidate).toBe(false);
  });

  it("detects intent kinds", () => {
    const r = classifyIntent(ref("Wipro Walk in Drive 2026 | Customer Support | Off Campus", ["2025-batch"]), KICKCHARM);
    expect(r.kinds).toEqual(expect.arrayContaining(["walk_in", "off_campus"]));
  });
});
