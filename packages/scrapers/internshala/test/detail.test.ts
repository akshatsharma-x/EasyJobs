import { describe, expect, it } from "vitest";
import { parseDetailPage, sectionKind, splitLdDescription } from "../src/parse/detail";
import type { DetailPage } from "../src/types";
import { fixture } from "./helpers";

const parse = (name: string): DetailPage => {
  const d = parseDetailPage(fixture(name));
  if (!d) throw new Error(`${name} did not parse`);
  return d;
};

describe("parseDetailPage — in-office internship", () => {
  const d = parse("detail-internship");

  it("reads the header items", () => {
    expect(d).toMatchObject({
      id: "3334805",
      kind: "internship",
      status: "active",
      title: "Business Development (Sales)",
      company: "Loadit Supply Services Pvt Ltd",
      companyPageUrl: "https://internshala.com/company/loadit-supply-services-pvt-ltd-1739337569",
      locations: ["Delhi"],
      isWfh: false,
      startDateText: "Immediately",
      durationText: "3 Months",
      salaryText: "₹ 10,000 - 12,000 /month",
      applyByText: "16 Dec' 26",
      postedText: "1 week ago",
      labels: ["Internship"],
      applicants: 56,
      activelyHiring: true,
    });
  });

  it("reads the sections: skills, who can apply, perks, openings, company", () => {
    expect(d.sections.map((s) => s.kind)).toEqual(["about", "skills", "who_can_apply", "perks", "openings", "company"]);
    expect(d.skills).toEqual(["Key Account Management"]);
    expect(d.perks).toEqual(["Certificate"]);
    expect(d.openings).toBe(2);
    expect(d.whoCanApply).toContain("are from Delhi only");
    expect(d.whoCanApply).not.toContain("Only those candidates can apply who:");
    expect(d.womenCanApply).toBe(true);
    expect(d.companyWebsite).toBe("http://loadit.in/");
    expect(d.companyActivity).toEqual(["Hiring since July 2026", "3 opportunities posted"]);
    expect(d.aboutCompany).toMatch(/^Loadit Supply Services Pvt Ltd, our cutting-edge logistics firm/);
  });

  it("excludes the 'Earn certifications' training block from the skills section", () => {
    const skills = d.sections.find((s) => s.kind === "skills");
    expect(skills?.html).not.toMatch(/Learn Business Communication|trainings\.internshala/);
  });

  it("extracts the JobPosting JSON-LD", () => {
    expect(d.jsonLd).toMatchObject({
      title: "Business Development (Sales) - Internship",
      datePosted: "2026-11-16",
      validThrough: "2026-12-16 23:59:59",
      employmentType: "INTERN, FULL_TIME",
      industry: "Logistics",
      occupationalCategory: "Business Development (Sales)",
      totalJobOpenings: 2,
      locations: [{ locality: "Delhi", region: "Delhi", country: "IN" }],
      organization: { name: "Loadit Supply Services Pvt Ltd", sameAs: "http://loadit.in" },
      baseSalary: { currency: "INR", min: 10_000, max: 12_000, unit: "MONTH" },
      identifier: "20263334805",
    });
  });
});

describe("parseDetailPage — work-from-home internships", () => {
  it("unpaid, part-time WFH: TELECOMMUTE, no salary in JSON-LD", () => {
    const d = parse("detail-internship-wfh-unpaid");
    expect(d).toMatchObject({ id: "3340945", isWfh: true, salaryText: "Unpaid", labels: ["Internship", "Part time"], openings: 20 });
    expect(d.jsonLd).toMatchObject({ jobLocationType: "TELECOMMUTE", applicantCountry: "IN", baseSalary: null, employmentType: "VOLUNTEER, INTERN, PART_TIME" });
    expect(d.perks).toEqual(["Certificate", "Letter of recommendation", "Flexible work hours"]);
  });

  it("lump sum stipend + 'Additional information' section", () => {
    const d = parse("detail-internship-lumpsum");
    expect(d.salaryText).toBe("₹ 1,500 - 15,000 lump sum");
    expect(d.sections.map((s) => s.kind)).toContain("additional");
    expect(d.sections.find((s) => s.kind === "about")?.heading).toBe("About the work from home job/internship");
  });

  it("weekly stipend + company website from the JSON-LD organisation", () => {
    const d = parse("detail-internship-weekly");
    expect(d.salaryText).toBe("₹ 300 /week");
    expect(d.jsonLd?.baseSalary).toEqual({ currency: "INR", min: 300, max: 300, unit: "WEEK" });
    expect(d.companyWebsite).toBe("https://learnoverse.app/");
  });

  it("performance-based campus ambassador programme with rewards", () => {
    const d = parse("detail-internship-performance");
    expect(d.salaryText).toBe("Performance Based");
    expect(d.sections.map((s) => s.kind)).toEqual(
      expect.arrayContaining(["about", "skills", "who_can_apply", "other_requirements", "rewards", "perks", "openings", "company"]),
    );
    expect(d.openings).toBe(500);
  });
});

describe("parseDetailPage — jobs", () => {
  it("job with CTC, experience and eligibility lines only present in the JSON-LD", () => {
    const d = parse("detail-job-ctc");
    expect(d).toMatchObject({
      id: "3341218",
      kind: "job",
      salaryText: "₹ 4,00,000 - 4,50,000 /year",
      experienceText: "1 year(s)",
      applyByText: "25 Dec' 26",
      earlyApplicant: true,
      applicants: null,
      salaryLines: ["Annual CTC: ₹ 4,00,000 - 4,50,000 /year"],
      probation: null, // hidden block
      companyWebsite: "https://instagram.com/highwaydelite",
    });
    expect(d.whoCanApply).toEqual(["have minimum 1 years of experience", "are from Jamnagar only", "are Computer Science Engineering students"]);
    expect(d.jsonLd?.monthsOfExperience).toBe(12);
    expect(d.companyPageUrl).toBe("https://internshala.com/company/highway-delite-1498117378"); // stray "\" removed
  });

  it("hybrid fresher job with a CTC breakup", () => {
    const d = parse("detail-job-hybrid-fresher");
    expect(d).toMatchObject({ isHybrid: true, hybridNote: "1 day(s) in-office in a week", experienceText: "No experience required", labels: ["Fresher Job"] });
    expect(d.salaryLines[0]).toBe("Annual CTC: ₹ 2,04,000 - 3,20,000 /year");
    expect(d.salaryLines.some((l) => /Fixed pay/.test(l))).toBe(true);
  });

  it("works without any JobPosting JSON-LD (multi-city job with probation)", () => {
    const d = parse("detail-job-no-jsonld");
    expect(d.jsonLd).toBeNull();
    expect(d).toMatchObject({
      id: "3340461",
      locations: ["Mumbai", "Mira Bhayandar", "Vasai-Virar"],
      openings: 5,
      probation: { duration: "6 months", salary: "₹13,000 - 16,000 /month (only for freshers)" },
      salaryLines: [
        "Annual CTC: ₹ 2,05,000 - 3,00,000 /year",
        "Annual CTC breakup:",
        "1. Fixed pay: ₹ 2,00,000 - 2,50,000 /year",
        "2. Variable pay: ₹ 5,000 - 50,000 /year",
      ],
    });
  });

  it("returns null for pages without detail markup or JSON-LD", () => {
    expect(parseDetailPage("<html><title>404: Page not found</title></html>")).toBeNull();
  });
});

describe("parseDetailPage snapshots", () => {
  it.each([
    "detail-internship",
    "detail-internship-wfh-unpaid",
    "detail-internship-lumpsum",
    "detail-internship-weekly",
    "detail-internship-performance",
    "detail-job-ctc",
    "detail-job-hybrid-fresher",
    "detail-job-no-jsonld",
  ])("%s", (name) => {
    const { jsonLd, ...rest } = parse(name);
    expect({ ...rest, jsonLd: jsonLd ? { ...jsonLd, descriptionHtml: `${jsonLd.descriptionHtml?.length ?? 0} chars` } : null }).toMatchSnapshot();
  });
});

describe("helpers", () => {
  it.each([
    ["About the internship", "about"],
    ["About the work from home job/internship", "about"],
    ["About the Program", "about"],
    ["About the job", "about"],
    ["Skill(s) required", "skills"],
    ["Who can apply", "who_can_apply"],
    ["Other requirements", "other_requirements"],
    ["Salary", "salary"],
    ["Perks", "perks"],
    ["Rewards and incentives", "rewards"],
    ["Additional information", "additional"],
    ["Number of openings", "openings"],
    ["About Loadit Supply Services Pvt Ltd", "company"],
    ["Something new", "other"],
  ])("sectionKind(%j) = %s", (heading, kind) => {
    expect(sectionKind(heading)).toBe(kind);
  });

  it("splitLdDescription keeps 'Only those candidates…' inside Who can apply", () => {
    const parts = splitLdDescription(
      "<br><p>About the internship:</p>Do work<br><p>Who can apply:</p><ol><p>Only those candidates can apply who:</p><li>a</li></ol><p>Stipend:</p>INR₹ 1 /month",
    );
    expect(parts.map((p) => p.heading)).toEqual(["About the internship", "Who can apply", "Stipend"]);
    expect(parts[1]?.html).toContain("<li>a</li>");
  });
});
