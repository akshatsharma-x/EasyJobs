import { describe, expect, it } from "vitest";
import type { JobCategory, JobType } from "@easyjobs/contract";
import { categorize, categorizeDetailed, cleanDegreeList, detectJobType, detectJobTypeDetailed, extractDegrees, jobTypeFromEmploymentType } from "../src/index";

describe("detectJobType", () => {
  const employment: [string, JobType | null][] = [
    ["FULL_TIME", "full_time"],
    ["Full-time", "full_time"],
    ["Permanent", "full_time"],
    ["PART_TIME", "part_time"],
    ["Part-time; Remote", "part_time"],
    ["INTERN", "internship"],
    ["Internship", "internship"],
    ["Student (Fixed Term)", "internship"],
    ["CONTRACTOR", "contract"],
    ["Contract to hire", "contract"],
    ["Fixed Term", "contract"],
    ["TEMPORARY", "temporary"],
    ["Seasonal", "temporary"],
    ["Freelance", "freelance"],
    ["Apprenticeship", "apprenticeship"],
    ["OTHER", null],
  ];
  it.each(employment)("employment type %s → %s", (raw, type) => expect(jobTypeFromEmploymentType(raw)).toBe(type));

  const titles: [string, JobType][] = [
    ["Software Engineer Intern", "internship"],
    ["Summer Analyst", "internship"],
    ["Data Science Internship (6 months)", "internship"],
    ["Apprentice - Fitter", "apprenticeship"],
    ["Content Writer (Part Time)", "part_time"],
    ["Java Developer - Contract", "contract"],
    ["Contract Manager", "full_time"],
    ["Freelance Video Editor", "freelance"],
    ["Temporary Data Entry Operator", "temporary"],
    ["Graduate Trainee", "full_time"],
    ["Software Engineer", "full_time"],
  ];
  it.each(titles)("title %s → %s", (title, type) => expect(detectJobType({ title })).toBe(type));

  it("hint wins; a title saying Intern beats a generic Full-time employment type", () => {
    expect(detectJobType({ hint: "contract", title: "Software Engineer Intern" })).toBe("contract");
    expect(detectJobType({ employmentTypeRaw: "Full-time", title: "SDE Intern" })).toBe("internship");
    expect(detectJobType({ employmentTypeRaw: "Part-time", title: "Software Engineer" })).toBe("part_time");
  });
  it("uses tags and strong description phrases only", () => {
    expect(detectJobType({ title: "Web Development", tags: ["internship"] })).toBe("internship");
    expect(detectJobTypeDetailed({ title: "Associate", description: "This is a 6 month paid internship with PPO opportunity." })).toEqual({
      jobType: "internship",
      source: "description",
    });
    expect(detectJobType({ title: "Engineer", description: "Internship experience is a plus." })).toBe("full_time");
    expect(detectJobType({ title: "Engineer", description: "This is a 12 month contractual position." })).toBe("contract");
    expect(detectJobType({ title: "Electrician", description: "Training under the Apprentices Act (NAPS)." })).toBe("apprenticeship");
  });
});

describe("extractDegrees", () => {
  const cases: [string, string[]][] = [
    ["B.E/B.Tech in CSE/IT, MCA", ["B.E/B.Tech", "MCA"]],
    ["BE / B.Tech / ME / M.Tech", ["B.E/B.Tech", "M.E/M.Tech"]],
    ["BCA/MCA", ["BCA", "MCA"]],
    ["B.Sc/M.Sc (Computer Science)", ["B.Sc", "M.Sc"]],
    ["BBA/MBA", ["BBA", "MBA"]],
    ["MBA/PGDM in Marketing", ["MBA"]],
    ["B.Com", ["B.Com"]],
    ["B.Com/M.Com with Tally", ["B.Com", "M.Com"]],
    ["Diploma in Mechanical", ["Diploma"]],
    ["PhD in Machine Learning", ["PhD"]],
    ["MS or PhD in Computer Science", ["M.Sc", "PhD"]],
    ["BS/MS in CS", ["B.Sc", "M.Sc"]],
    ["Any graduate can apply", ["Any graduate"]],
    ["Graduation in any stream", ["Any graduate"]],
    ["Bachelor's degree in Computer Science or related field", ["Bachelor's"]],
    ["Master's degree preferred", ["Master's"]],
    ["Bachelor of Technology in ECE", ["B.E/B.Tech"]],
    ["Qualification: BE", ["B.E/B.Tech"]],
    ["12th pass", ["12th Pass"]],
    ["10th pass / ITI", ["10th Pass", "ITI"]],
    ["B.Pharm/M.Pharm", ["B.Pharm", "M.Pharm"]],
    ["MBBS doctors", ["MBBS"]],
    ["LLB graduates", ["LLB"]],
    ["CA Inter/CA Final", ["CA"]],
    ["CFA Level 2 cleared", ["CFA"]],
    ["MS Excel and MS Office", []],
    ["BE A PART OF OUR TEAM", []],
    ["We will be glad to have you", []],
    ["Our team members can work remotely", []],
    // Real-data regressions: AI "LLM" is not a law degree; Portuguese "alguém com" is not M.Com.
    ["Experience with LLM inference stacks and LLM tooling", []],
    ["LLB/LLM from a recognised university", ["LLB", "LLM"]],
    ["LL.M in Corporate Law", ["LLM"]],
    ["Procuramos alguém com sólida capacidade técnica", []],
    ["Qualifications B Com, BBA, M Com, MBA", ["BBA", "MBA", "B.Com", "M.Com"]],
  ];
  it.each(cases)("%j → %j", (text, expected) => expect(extractDegrees(text)).toEqual(expected));

  it("cleans scraper hints", () => {
    expect(cleanDegreeList(["B.Tech", "BE", "MBA", "Any Graduate", "Some Certificate"])).toEqual(["B.E/B.Tech", "MBA", "Any graduate", "Some Certificate"]);
  });
  it("maps the scrapers' shared hint vocabulary (P06/P12) onto canonical labels", () => {
    expect(cleanDegreeList(["BA", "MA", "B.Sc", "M.Com", "PGDM", "Any Postgraduate", "12th Pass", "10th Pass", "UG", "PG", "LLB", "B.Des", "ITI"])).toEqual([
      "BA", "MA", "B.Sc", "M.Com", "MBA", "Any postgraduate", "12th Pass", "10th Pass", "Bachelor's", "Master's", "LLB", "B.Des", "ITI",
    ]);
    expect(extractDegrees("Any postgraduate can apply; B.A. or M.A. in English")).toEqual(["BA", "MA", "Any postgraduate"]);
  });
});

describe("categorize", () => {
  const cases: [string, JobCategory][] = [
    ["Software Engineer", "software_engineering"],
    ["SDE-1 Backend", "software_engineering"],
    ["Systems Engineer", "software_engineering"],
    ["Data Analyst", "data_ai"],
    ["Data Engineer", "data_ai"],
    ["Machine Learning Engineer", "data_ai"],
    ["Research Engineer, Applied ML", "data_ai"],
    ["DevOps Engineer", "devops_cloud"],
    ["Site Reliability Engineer", "devops_cloud"],
    ["Network Engineer", "devops_cloud"],
    ["Security Analyst - SOC", "security"],
    ["QA Engineer", "qa_testing"],
    ["Software Engineer in Test", "qa_testing"],
    ["Product Manager", "product"],
    ["Product Designer", "design"],
    ["UI/UX Designer", "design"],
    ["Product Marketing Manager", "marketing"],
    ["Digital Marketing Intern", "marketing"],
    ["Business Development Executive", "sales"],
    ["Sales Engineer", "sales"],
    ["Business Analyst", "business_ops"],
    ["Operations Executive", "business_ops"],
    ["Financial Analyst", "finance"],
    ["Chartered Accountant", "finance"],
    ["HR Executive", "hr"],
    ["Talent Acquisition Specialist", "hr"],
    ["Management Consultant", "consulting"],
    ["Customer Success Manager", "customer_support"],
    ["Technical Support Engineer", "customer_support"],
    ["Mechanical Design Engineer", "core_engineering"],
    ["Graduate Engineer Trainee", "core_engineering"],
    ["Embedded Software Engineer", "software_engineering"],
    ["VLSI Design Engineer", "core_engineering"],
    ["Research Scientist", "research"],
    ["Content Writer", "content"],
    ["Legal Associate", "legal"],
    ["Staff Nurse", "healthcare"],
    ["Mathematics Teacher", "education"],
    ["Associate", "other"],
    ["Commercial Electrician", "core_engineering"],
    ["Branch: Teller", "finance"],
    ["Process Executive - Voice", "customer_support"],
    ["Trust & Safety Associate", "business_ops"],
    ["KAM - Senior Manager - Ads", "sales"],
    ["Campus Ambassador", "marketing"],
    ["Creative Producer", "content"],
    ["(Senior) Projektingenieur (m/w/d) für New Energy Großprojekte", "core_engineering"],
    ["Softwareentwickler Java (m/w/d)", "software_engineering"],
    ["Desenvolvedor Backend Pleno", "software_engineering"],
    ["Anlagenmechaniker SHK (m/w/d)", "core_engineering"],
    ["Montagehelfer Photovoltaik (m/w/d)", "core_engineering"],
    ["Telugu Language Project", "content"],
  ];
  it.each(cases)("%s → %s", (title, cat) => expect(categorize({ title })).toBe(cat));

  it("falls back to department and skills when the title is generic", () => {
    expect(categorize({ title: "Intern", skills: ["React", "Node.js", "MongoDB"] })).toBe("software_engineering");
    expect(categorize({ title: "Graduate Engineer Trainee", skills: ["React", "Java", "Spring Boot", "AWS", "Docker"] })).toBe("software_engineering");
    expect(categorize({ title: "Associate", department: "People Team" })).toBe("hr");
    expect(categorize({ title: "Analyst", skills: ["Tableau", "SQL", "Python"] })).toBe("data_ai");
    expect(categorizeDetailed({ title: "Associate" })).toMatchObject({ category: "other", confidence: "low" });
  });
});
