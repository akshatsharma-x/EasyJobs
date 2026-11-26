import { describe, expect, it } from "vitest";
import type { CompanyTarget } from "@easyjobs/contract";
import { createCompanyIndex } from "../src/match";

function co(slug: string, name: string, domain: string | null, ats: CompanyTarget["ats"], token: string, more: Partial<CompanyTarget> = {}): CompanyTarget {
  return {
    slug,
    name,
    domain,
    ats,
    token,
    careersUrl: `https://${domain ?? "example.com"}/careers`,
    tags: [],
    hq: null,
    indiaPresence: true,
    priority: 2,
    verifiedAt: "2026-11-26T00:00:00.000Z",
    openJobs: 10,
    ...more,
  };
}

const FIXTURE: CompanyTarget[] = [
  co("tcs", "TCS", "tcs.com", "custom", "https://ibegin.tcs.com/iBegin/jobs/search", { priority: 1 }),
  co("infosys", "Infosys", "infosys.com", "custom", "https://career.infosys.com/joblist", { priority: 1 }),
  co("hcltech", "HCLTech", "hcltech.com", "custom", "https://www.hcltech.com/careers"),
  co("ltimindtree", "LTIMindtree", "ltimindtree.com", "custom", "https://www.ltimindtree.com/careers/"),
  co("goldman-sachs", "Goldman Sachs", "goldmansachs.com", "custom", "https://higher.gs.com/results", { careersUrl: "https://higher.gs.com/" }),
  co("jpmorgan-chase", "JPMorgan Chase", "jpmorganchase.com", "oracle", "https://jpmc.fa.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX_1001"),
  co("american-express", "American Express", "americanexpress.com", "eightfold", "https://aexp.eightfold.ai|aexp.com"),
  co("american-airlines", "American Airlines", "aa.com", "custom", "https://jobs.aa.com/"),
  co("stripe", "Stripe", "stripe.com", "greenhouse", "stripe"),
  co("cred", "CRED", "cred.club", "lever", "cred", { extra: { aliases: ["Dreamplug Technologies"] } }),
  co("razorpay", "Razorpay", "razorpay.com", "greenhouse", "razorpaysoftwareprivatelimited"),
  co("nvidia", "NVIDIA", "nvidia.com", "workday", "https://nvidia.wd5.myworkdayjobs.com/NVIDIAExternalCareerSite"),
  co("amazon", "Amazon", "amazon.com", "custom", "https://www.amazon.jobs/en/", { careersUrl: "https://www.amazon.jobs/en/" }),
  co("meta", "Meta", "meta.com", "custom", "https://www.metacareers.com/jobs"),
  co("target", "Target", "target.com", "workday", "https://target.wd5.myworkdayjobs.com/targetcareers"),
  co("urban-company", "Urban Company", "urbancompany.com", "custom", "https://urbancompany.com/careers"),
  co("x", "X", "x.com", "greenhouse", "x"),
  co("box", "Box", "box.com", "greenhouse", "boxinc"),
];

const ALIASES = {
  tcs: ["Tata Consultancy Services", "Tata Consultancy Services Limited"],
  hcltech: ["HCL Technologies", "HCL Tech", "HCL"],
  ltimindtree: ["LTI Mindtree", "L&T Infotech", "Larsen & Toubro Infotech", "Mindtree"],
  "jpmorgan-chase": ["JPMorgan", "J.P. Morgan", "JPMC", "JPMorgan Chase & Co"],
  "american-express": ["Amex"],
  amazon: ["Amazon Web Services", "AWS", "Amazon Development Centre"],
  meta: ["Facebook", "Meta Platforms"],
  "urban-company": ["UrbanClap"],
  x: ["Twitter"],
};

const index = createCompanyIndex(FIXTURE, ALIASES);
const find = (q: string | null | undefined): string | null => index.find(q)?.slug ?? null;

describe("findCompany — aliases and normalized names", () => {
  it.each([
    ["TCS", "tcs"],
    ["tcs", "tcs"],
    ["Tata Consultancy Services", "tcs"],
    ["TATA CONSULTANCY SERVICES LIMITED", "tcs"],
    ["Tata Consultancy Services Ltd.", "tcs"],
    ["HCL Technologies Ltd", "hcltech"],
    ["HCL", "hcltech"],
    ["Larsen & Toubro Infotech Limited", "ltimindtree"],
    ["L&T Infotech", "ltimindtree"],
    ["Mindtree Ltd", "ltimindtree"],
    ["J.P. Morgan", "jpmorgan-chase"],
    ["JP Morgan", "jpmorgan-chase"],
    ["JPMorgan Chase & Co.", "jpmorgan-chase"],
    ["Amex", "american-express"],
    ["Facebook", "meta"],
    ["Twitter", "x"],
    ["UrbanClap", "urban-company"],
    ["Dreamplug Technologies Pvt Ltd", "cred"],
  ])("%s → %s", (q, slug) => {
    expect(find(q)).toBe(slug);
  });

  it("reports how it matched", () => {
    expect(index.match("TCS")?.via).toBe("slug");
    expect(index.match("Tata Consultancy Services")?.via).toBe("alias");
    expect(index.match("Goldman Sachs")?.via).toBe("slug"); // slugify(name) is the slug
    expect(index.match("The Goldman Sachs")?.via).toBe("name");
    expect(index.match("Goldman Sachs India")?.via).toBe("core");
  });
});

describe("findCompany — qualified names (prefix rule)", () => {
  it.each([
    ["Amazon Development Centre (India) Pvt. Ltd.", "amazon"],
    ["Amazon Development Centre India", "amazon"],
    ["Goldman Sachs Services Private Limited", "goldman-sachs"],
    ["Infosys BPM Limited", null],
    ["Infosys Limited Bangalore", "infosys"],
    ["Stripe India", "stripe"],
    ["NVIDIA Graphics Pvt Ltd", null],
    ["Target Corporation India", "target"],
    ["Target Logistics", null],
  ])("%s → %s", (q, slug) => {
    expect(find(q)).toBe(slug);
  });
});

describe("findCompany — domains and URLs", () => {
  it.each([
    ["stripe.com", "stripe"],
    ["www.stripe.com", "stripe"],
    ["https://stripe.com/jobs/listing/123", "stripe"],
    ["careers.tcs.com", "tcs"],
    ["https://higher.gs.com/roles/123", "goldman-sachs"],
    ["amazon.jobs", "amazon"],
    ["https://job-boards.greenhouse.io/razorpaysoftwareprivatelimited/jobs/123", "razorpay"],
    ["https://jobs.lever.co/cred/abc-123", "cred"],
    ["https://nvidia.wd5.myworkdayjobs.com/en-US/NVIDIAExternalCareerSite/job/x_JR1", "nvidia"],
    ["https://nvidia.wd5.myworkdayjobs.com/NVIDIAUniversity", "nvidia"],
    ["https://jpmc.fa.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX_1001/job/1", "jpmorgan-chase"],
    ["https://boards.greenhouse.io/unknownco", null],
    ["https://www.greenhouse.io/", null],
  ])("%s → %s", (q, slug) => {
    expect(find(q)).toBe(slug);
  });
});

describe("findCompany — typos and false positives", () => {
  it.each([
    ["Goldman Sach", "goldman-sachs"],
    ["Razorpy", "razorpay"],
    ["Infsoys", "infosys"],
    ["Ltimindtre", "ltimindtree"],
    ["American Airline", "american-airlines"],
  ])("fuzzy: %s → %s", (q, slug) => {
    expect(find(q)).toBe(slug);
  });

  it.each(["Metamorphosis Labs", "Boxed", "Strike", "Infosis", "Unknown Startup Pvt Ltd", "", "   ", "a", "India", "Technologies", "Private Limited"])(
    "no match for %j",
    (q) => {
      expect(find(q)).toBeNull();
    },
  );

  it("handles null/undefined and very long input", () => {
    expect(find(null)).toBeNull();
    expect(find(undefined)).toBeNull();
    expect(find("x".repeat(1000))).toBeNull();
  });

  it("is case and punctuation insensitive", () => {
    expect(find("goldman   SACHS")).toBe("goldman-sachs");
    expect(find("Goldman-Sachs")).toBe("goldman-sachs");
    expect(find("goldman_sachs")).toBe("goldman-sachs");
  });
});
