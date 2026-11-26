import { describe, expect, it } from "vitest";
import {
  batchesFromValue, deadlineFromTitle, detectJobType, detectLevel, extractBatches, extractDegrees, parseDeadline, salaryFromTitle,
  salaryFromValue, type IntentSignals,
} from "../src/parse/hints";
import { splitLocations } from "../src/parse/geo";
import { cleanRole, roleFromTitle } from "../src/parse/role";
import { cleanCompanyName, companyFromTitle } from "../src/parse/company";
import { labelToField } from "../src/parse/labels";

const posted = new Date("2026-11-20T10:00:00Z");

describe("labels", () => {
  it.each([
    ["Company Name", "company"], ["Organization", "company"], ["Hiring Organization", "company"], ["Institution", "company"],
    ["Job Role", "role"], ["Role Title", "role"], ["Post Name", "role"], ["Designation", "role"], ["Internship Name", "role"],
    ["Qualification", "qualification"], ["Educational Qualification", "qualification"], ["Eligible Stream", "qualification"],
    ["Batch", "batch"], ["Eligible Batch", "batch"], ["Passing Year", "batch"], ["Experience Required", "experience"],
    ["Salary / CTC", "salary"], ["Offered Salary / CTC", "salary"], ["Stipend", "salary"], ["Monthly Stipend", "salary"], ["Package", "salary"],
    ["Job Location", "location"], ["Office Location(s)", "location"], ["Job Type", "jobType"], ["Employment Type", "jobType"],
    ["Work Mode", "workMode"], ["Last Date to Apply", "lastDate"], ["Application Deadline", "lastDate"], ["Skills Required", "skills"],
    ["Apply Link", "applyLink"], ["Official Job Apply Link", "applyLink"], ["Official Website", "website"], ["Venue", "venue"],
  ])("%s → %s", (label, key) => {
    expect(labelToField(label)).toBe(key);
  });

  it("ignores prose labels", () => {
    expect(labelToField("Build Scalable Software")).toBeNull();
    expect(labelToField("Application Mode")).toBeNull();
    expect(labelToField("Mode of Payment")).toBeNull();
  });
});

describe("batches", () => {
  it("reads years next to batch words only", () => {
    expect(extractBatches(["Targeted toward students graduating in the 2027 cohort"], 2026)).toEqual([2027]);
    expect(extractBatches(["Batch: 2024, 2025 or 2026 UG/PG graduate"], 2026)).toEqual([2024, 2025, 2026]);
    expect(extractBatches(["Infosys Off Campus Drive 2026 | 2024–26 Batch"], 2026)).toEqual([2024, 2025, 2026]);
    expect(extractBatches(["2025/2026 passouts can apply"], 2026)).toEqual([2025, 2026]);
    expect(extractBatches(["EA Internship 2027 | Software Engineering Intern", "Founded in 1982"], 2026)).toEqual([]);
    expect(batchesFromValue("Not Mentioned", 2026)).toEqual([]);
    expect(batchesFromValue("2023 to 2026", 2026)).toEqual([2023, 2024, 2025, 2026]);
  });
});

describe("degrees", () => {
  it("matches abbreviations without English-word false positives", () => {
    expect(extractDegrees(["B.E. / B.Tech / M.E. / M.Tech / MCA in Computer Science"])).toEqual(["B.E/B.Tech", "M.E/M.Tech", "MCA"]);
    expect(extractDegrees(["Candidates must be willing to relocate. Contact me for details."])).toEqual([]);
    expect(extractDegrees(["Graduation in Any Stream (UG: Any Graduate)"])).toEqual(["Any Graduate"]);
    expect(extractDegrees(["CA Intermediate cleared candidates"])).toEqual(["CA"]);
    expect(extractDegrees(["BCom, BBA, BA graduates"])).toEqual(["BBA", "B.Com", "BA"]);
  });
});

describe("salary", () => {
  it("compacts KV values and reads titles", () => {
    expect(salaryFromValue("₹3 Lacs P.A.")).toBe("₹3 Lacs P.A.");
    expect(salaryFromValue("Not publicly disclosed in notification")).toBeNull();
    expect(salaryFromValue("For the Infosys Off Campus Drive 2026, the Naukri listings state ₹10 LPA plus a ₹1 lakh joining bonus for SP L1")).toBe("₹10 LPA");
    expect(salaryFromTitle("Meesho Internship 2027; Stipend Rs.20,000 / Month: Apply By 24th December")).toBe("Rs.20,000 / Month");
    expect(salaryFromTitle("Jio Finance Job 2027: Sales Manager | ₹5-14 LPA | Apply Now")).toBe("₹5-14 LPA");
    expect(salaryFromTitle("LIC Job 2027 | Management Trainee – for Fresher, 6 Lakh CTC Apply by 28 Nov")).toBe("6 Lakh CTC");
  });
});

describe("deadlines", () => {
  it("parses dates and infers missing years from the posting date", () => {
    expect(parseDeadline("14 March 2026", posted)).toBe("2026-03-14T18:29:59.000Z");
    expect(parseDeadline("24th December", posted)).toBe("2026-12-24T18:29:59.000Z");
    expect(parseDeadline("Dec 20", posted)).toBe("2026-12-20T18:29:59.000Z");
    expect(parseDeadline("10 January", posted)).toBe("2027-01-10T18:29:59.000Z");
    expect(parseDeadline("24/12/2026", posted)).toBe("2026-12-24T18:29:59.000Z");
    expect(parseDeadline("ASAP", posted)).toBeNull();
    expect(parseDeadline("Not publicly specified (Rolling review; apply early)", posted)).toBeNull();
    expect(deadlineFromTitle("Raymond Internship 2027; Stipend Rs.12,000 / Month: Apply By 19th December", posted)).toBe("2026-12-19T18:29:59.000Z");
  });
});

describe("job type & level", () => {
  const sig = (title: string, extra: Partial<IntentSignals> = {}): IntentSignals => ({ title, categories: [], tags: [], text: "", ...extra });
  it("detects internships, apprenticeships and fresher roles", () => {
    expect(detectJobType(sig("Goldman Sachs Trainee 2026 | Industrial Trainee"), "Industrial Trainee")).toBe("internship");
    expect(detectJobType(sig("Starbucks Apprentice 2027"), "Apprentice (Store Operations)")).toBe("apprenticeship");
    expect(detectJobType(sig("Swiggy Hiring", { jobTypeValue: "Full Time, Temporary/Contractual" }), "Social Media Trainee")).toBe("full_time");
    expect(detectLevel("full_time", sig("Nobroker Job 2027 for freshers"), "Sales Executive", "0 Years (Freshers Only)")).toBe("fresher");
    expect(detectLevel("full_time", sig("HCLTech Jobs 2026"), "GCP Data Engineer", "5 to 10 Years")).toBeUndefined();
    expect(detectLevel("internship", sig("x"), "Intern", null)).toBe("intern");
  });
});

describe("locations, roles, companies", () => {
  it("splits locations without breaking City, State, Country", () => {
    expect(splitLocations("Noida, Hyderabad, Bengaluru")).toEqual(["Noida", "Hyderabad", "Bengaluru"]);
    expect(splitLocations("Hyderabad, Telangana, India")).toEqual(["Hyderabad, Telangana, India"]);
    expect(splitLocations("Pune / Mysore")).toEqual(["Pune", "Mysore"]);
    expect(splitLocations("Bengaluru, Delhi / NCR, Mumbai (All Areas)")).toEqual(["Bengaluru", "Delhi", "NCR", "Mumbai"]);
    expect(splitLocations("Multiple Cities Across India (Delhi NCR / Mumbai / Bengaluru)")).toEqual(["Delhi NCR", "Mumbai", "Bengaluru"]);
  });

  it("cleans role titles", () => {
    expect(cleanRole("Software Engineering Intern, 2027")).toBe("Software Engineering Intern");
    expect(cleanRole("Specialist Programmer (Trainee) listing on Naukri")).toBe("Specialist Programmer (Trainee)");
    expect(cleanRole("apply for Honeywell Intern (Bachelor’s) 162285", "Honeywell")).toBe("Intern (Bachelor’s)");
    expect(cleanRole("M00I0: Intern – Professional")).toBe("Intern – Professional");
    expect(roleFromTitle("EA Internship 2027 | Software Engineering Intern, Hybrid, Hyderabad, Apply Now 2027", "EA")).toBe("Software Engineering Intern");
    expect(roleFromTitle("CGI Recruitment Hiring Graduates Freshers for Graduate Trainee", "CGI")).toBe("Graduate Trainee");
    expect(roleFromTitle("Oracle Support Engineer 2026 | India — Apply Now", "Oracle")).toBe("Support Engineer");
  });

  it("derives companies from titles", () => {
    const body = "fedex fedex data analyst fedex careers fedex express mahindra finance mahindra finance hr fresher mahindra finance is hiring mahindra finance";
    expect(companyFromTitle("Cisco Spring Internship 2027: ASIC Engineer Intern", body)).toBe("Cisco");
    expect(companyFromTitle("FedEx Data Analyst Job for Freshers: UG, PG and Graduates", body)).toBe("FedEx");
    expect(companyFromTitle("Mahindra Finance HR Fresher Job 2027: Check Eligibility", body)).toBe("Mahindra Finance");
    expect(companyFromTitle("Urgent opening in Tech Mahindra for Support executive", "")).toBe("Tech Mahindra");
    expect(companyFromTitle("Jobs in Mumbai for Freshers, Get Details", "")).toBeNull();
    expect(cleanCompanyName("Cisco (Silicon One Engineering Team)")).toBe("Cisco");
    expect(cleanCompanyName("FirstCry.com")).toBe("FirstCry");
  });
});
