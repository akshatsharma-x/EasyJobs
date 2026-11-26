import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanCompanyName, cleanDomain, companyLogoUrl, COMPANY_ALIAS_COUNT, deriveCompanyDomain, resolveCompany, titleKey, cleanTitle } from "../src/index";

describe("cleanTitle", () => {
  const cases: [string, string | string[] | undefined, string][] = [
    ["Hiring!! Software Engineer Intern | Apply Now", undefined, "Software Engineer Intern"],
    ["Urgent Hiring: Java Developer", undefined, "Java Developer"],
    ["URGENT: Python Developer", undefined, "Python Developer"],
    ["TCS Off Campus Drive 2026 for Freshers | Software Engineer", "TCS", "Software Engineer"],
    ["TCS Off Campus Drive 2026 for Freshers | Software Engineer", "Tata Consultancy Services", "Software Engineer"],
    ["🚀 Amazon Hiring SDE-1 🔥", "Amazon", "SDE-1"],
    ["Infosys Recruitment 2025 | Systems Engineer | BE/BTech | Apply Now", "Infosys", "Systems Engineer"],
    ["Wipro is hiring for Project Engineer – 2024/2025 batch", "Wipro", "Project Engineer"],
    ["Accenture Off Campus Drive 2025 – Hiring Freshers as Associate Software Engineer", "Accenture", "Associate Software Engineer"],
    ["We're Hiring: Frontend Developer (React) [Urgent]", undefined, "Frontend Developer (React)"],
    ["Walk-in Interview for Customer Support Executive", undefined, "Customer Support Executive"],
    ["Software Engineer - Backend (Remote)", undefined, "Software Engineer - Backend"],
    ["Data Analyst Intern (Work From Home)", undefined, "Data Analyst Intern"],
    ["Software Engineer - Bangalore", undefined, "Software Engineer"],
    ["Software Engineer, Pune", undefined, "Software Engineer"],
    ["Software Engineer (0-2 yrs)", undefined, "Software Engineer"],
    ["Business Analyst | 6 LPA", undefined, "Business Analyst"],
    ["Graduate Engineer Trainee (2025 Batch) - Mechanical", undefined, "Graduate Engineer Trainee - Mechanical"],
    ["Senior Product Designer at Razorpay", "Razorpay", "Senior Product Designer"],
    ["SENIOR SOFTWARE ENGINEER - AWS", undefined, "Senior Software Engineer - AWS"],
    ["Software Engineer in Test", undefined, "Software Engineer in Test"],
    ["Hiring Manager", undefined, "Hiring Manager"],
    ["Remote Sensing Analyst", undefined, "Remote Sensing Analyst"],
    ["Software Engineer - Backend", undefined, "Software Engineer - Backend"],
    ["Urgent", undefined, "Urgent"],
    ["   ", undefined, ""],
  ];
  it.each(cases)("%j (%s) → %j", (input, company, expected) => {
    expect(cleanTitle(input, { company })).toBe(expected);
  });
  it("is idempotent on clean titles", () => {
    for (const t of ["Software Engineer II", "Senior Data Scientist, NLP", "Product Manager - Payments"]) expect(cleanTitle(cleanTitle(t))).toBe(t);
  });
});

describe("titleKey", () => {
  it("normalizes abbreviations and noise for dedupe", () => {
    expect(titleKey("Sr. Software Engineer - Backend (Remote)")).toBe("senior software engineer backend");
    expect(titleKey("Senior Software Engineer, Backend")).toBe("senior software engineer backend");
    expect(titleKey("SDE 2")).toBe(titleKey("Software Development Engineer II"));
    expect(titleKey("Front-End Developer")).toBe(titleKey("Frontend Developer"));
  });
});

describe("cleanCompanyName / resolveCompany", () => {
  const cases: [string, string][] = [
    ["Amazon Development Centre (India) Pvt. Ltd.", "Amazon"],
    ["Amazon Web Services, Inc.", "Amazon"],
    ["Tata Consultancy Services Limited", "TCS"],
    ["Tata Consultancy Services", "TCS"],
    ["Bundl Technologies Private Limited", "Swiggy"],
    ["One97 Communications Ltd", "Paytm"],
    ["Google India Private Limited", "Google"],
    ["Microsoft India (R&D) Pvt. Ltd.", "Microsoft"],
    ["JPMorgan Chase & Co.", "JPMorgan Chase"],
    ["J.P. Morgan", "JPMorgan Chase"],
    ["Samsung R&D Institute India", "Samsung"],
    ["Razorpay Software Private Limited", "Razorpay"],
    ["Deloitte Touche Tohmatsu India LLP", "Deloitte"],
    ["HCL Technologies Ltd", "HCLTech"],
    ["Mindtree", "LTIMindtree"],
    ["State Bank of India", "SBI"],
    ["Acme Technologies Pvt Ltd", "Acme Technologies"],
    ["ACME SOLUTIONS LLP", "Acme Solutions"],
    ["ABC TECHNOLOGIES", "ABC Technologies"],
    ["Globex Corporation", "Globex"],
    ["  ", ""],
  ];
  it.each(cases)("%j → %j", (raw, name) => expect(cleanCompanyName(raw)).toBe(name));

  it("returns the known domain for aliases", () => {
    expect(resolveCompany("Tata Consultancy Services")).toEqual({ name: "TCS", domain: "tcs.com", known: true });
    expect(resolveCompany("Unknown Startup Pvt Ltd")).toEqual({ name: "Unknown Startup", domain: null, known: false });
    expect(COMPANY_ALIAS_COUNT).toBeGreaterThanOrEqual(150);
  });
});

describe("domains and logos", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("cleanDomain → registrable domain", () => {
    expect(cleanDomain("https://www.Razorpay.com/careers")).toBe("razorpay.com");
    expect(cleanDomain("careers.google.com")).toBe("google.com");
    expect(cleanDomain("jobs.tcs.co.in")).toBe("tcs.co.in");
    expect(cleanDomain("not a domain")).toBeNull();
    expect(cleanDomain("127.0.0.1")).toBeNull();
  });
  it("deriveCompanyDomain prefers hints, then registry, then alias, then the company's own apply URL", () => {
    expect(deriveCompanyDomain({ hint: "acme.io", registry: "acme.com" })).toBe("acme.io");
    expect(deriveCompanyDomain({ registry: "acme.com", alias: "x.com" })).toBe("acme.com");
    expect(deriveCompanyDomain({ urls: ["https://boards.greenhouse.io/acme/jobs/1", "https://careers.acme.com/jobs/1"] })).toBe("acme.com");
    expect(deriveCompanyDomain({ urls: ["https://www.linkedin.com/jobs/view/1", "https://bit.ly/x"] })).toBeNull();
    expect(deriveCompanyDomain({ urls: ["https://www.amazon.jobs/en/jobs/123"] })).toBe("amazon.com");
  });
  it("uses logo.dev when LOGO_DEV_TOKEN is set, otherwise the Google favicon", () => {
    vi.stubEnv("LOGO_DEV_TOKEN", "pk_test");
    expect(companyLogoUrl("razorpay.com")).toBe("https://img.logo.dev/razorpay.com?token=pk_test&size=128");
    vi.stubEnv("LOGO_DEV_TOKEN", "");
    expect(companyLogoUrl("razorpay.com")).toBe("https://www.google.com/s2/favicons?domain=razorpay.com&sz=128");
    expect(companyLogoUrl("razorpay.com", { token: "pk_x" })).toBe("https://img.logo.dev/razorpay.com?token=pk_x&size=128");
  });
  it("keeps a stable source logo when there is no token, skips expiring CDN logos, null without domain", () => {
    expect(companyLogoUrl("acme.com", { token: null, sourceLogoUrl: "https://s3.amazonaws.com/logos/acme.png" })).toBe("https://s3.amazonaws.com/logos/acme.png");
    expect(companyLogoUrl("acme.com", { token: null, sourceLogoUrl: "https://media.licdn.com/dms/image/x?e=1" })).toBe("https://www.google.com/s2/favicons?domain=acme.com&sz=128");
    expect(companyLogoUrl(null, { token: null })).toBeNull();
  });
});
