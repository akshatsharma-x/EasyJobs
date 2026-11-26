import type { CompanyTarget } from "@easyjobs/contract";

/**
 * Real, live-verified fixture targets (2026-11-25/26) used by the CLI and LIVE=1 smoke tests.
 * Tokens follow prompts.md §0.6. openJobs = what the platform reported when verified.
 */
const VERIFIED_AT = "2026-11-25T22:00:00.000Z";

const t = (x: Omit<CompanyTarget, "verifiedAt" | "priority" | "indiaPresence"> & Partial<CompanyTarget>): CompanyTarget => ({
  priority: 2,
  indiaPresence: true,
  verifiedAt: VERIFIED_AT,
  ...x,
});

export const workdayTargets: CompanyTarget[] = [
  t({
    slug: "nvidia",
    name: "NVIDIA",
    domain: "nvidia.com",
    ats: "workday",
    token: "https://nvidia.wd5.myworkdayjobs.com/NVIDIAExternalCareerSite",
    careersUrl: "https://www.nvidia.com/en-us/about-nvidia/careers/",
    tags: ["big_tech", "mnc", "product", "ai"],
    hq: "Santa Clara, US",
    priority: 1,
    openJobs: 2629,
  }),
  t({
    slug: "salesforce",
    name: "Salesforce",
    domain: "salesforce.com",
    ats: "workday",
    token: "https://salesforce.wd12.myworkdayjobs.com/External_Career_Site",
    careersUrl: "https://careers.salesforce.com/",
    tags: ["big_tech", "mnc", "product"],
    hq: "San Francisco, US",
    priority: 1,
    openJobs: 1596,
    // India-only mode: resolved through the tenant's country facet.
    extra: { workdayCountry: "IN" },
  }),
  t({
    slug: "intel",
    name: "Intel",
    domain: "intel.com",
    ats: "workday",
    token: "https://intel.wd1.myworkdayjobs.com/External",
    careersUrl: "https://jobs.intel.com/",
    tags: ["big_tech", "mnc", "product"],
    hq: "Santa Clara, US",
    openJobs: 950,
  }),
  t({
    slug: "workday",
    name: "Workday",
    domain: "workday.com",
    ats: "workday",
    token: "https://workday.wd5.myworkdayjobs.com/Workday",
    careersUrl: "https://www.workday.com/en-us/company/careers/overview.html",
    tags: ["mnc", "product"],
    hq: "Pleasanton, US",
    openJobs: 339,
  }),
  t({
    slug: "analog-devices",
    name: "Analog Devices",
    domain: "analog.com",
    ats: "workday",
    token: "https://analogdevices.wd1.myworkdayjobs.com/External",
    careersUrl: "https://careers.analog.com/",
    tags: ["mnc", "product"],
    hq: "Wilmington, US",
    openJobs: 763,
  }),
  t({
    slug: "mastercard",
    name: "Mastercard",
    domain: "mastercard.com",
    ats: "workday",
    token: "https://mastercard.wd1.myworkdayjobs.com/CorporateCareers",
    careersUrl: "https://careers.mastercard.com/",
    tags: ["mnc", "fintech", "gcc"],
    hq: "Purchase, US",
    openJobs: 705,
  }),
];


export const oracleTargets: CompanyTarget[] = [
  t({
    slug: "oracle",
    name: "Oracle",
    domain: "oracle.com",
    ats: "oracle",
    token: "https://eeho.fa.us2.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX_45001",
    careersUrl: "https://careers.oracle.com/",
    tags: ["big_tech", "mnc", "product"],
    hq: "Austin, US",
    priority: 1,
    openJobs: 2859,
  }),
  t({
    slug: "jpmorgan-chase",
    name: "JPMorgan Chase",
    domain: "jpmorganchase.com",
    ats: "oracle",
    token: "https://jpmc.fa.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX_1001",
    careersUrl: "https://careers.jpmorgan.com/",
    tags: ["mnc", "bank", "gcc"],
    hq: "New York, US",
    priority: 1,
    openJobs: 6792,
  }),
  t({
    slug: "texas-instruments",
    name: "Texas Instruments",
    domain: "ti.com",
    ats: "oracle",
    // Vanity domain: REST host (edbz.fa.us2.oraclecloud.com) and site number are read from the page.
    token: "https://careers.ti.com/en/sites/CX",
    careersUrl: "https://careers.ti.com/",
    tags: ["mnc", "product"],
    hq: "Dallas, US",
    openJobs: 921,
  }),
  t({
    slug: "honeywell",
    name: "Honeywell",
    domain: "honeywell.com",
    ats: "oracle",
    // Vanity code "Honeywell" ≠ real siteNumber "CX_1" (resolved from data-sitenumber).
    token: "https://careers.honeywell.com/en/sites/Honeywell",
    careersUrl: "https://careers.honeywell.com/",
    tags: ["mnc", "gcc"],
    hq: "Charlotte, US",
    openJobs: 1339,
    extra: { country: "IN" },
  }),
];

export const eightfoldTargets: CompanyTarget[] = [
  t({
    slug: "netflix",
    name: "Netflix",
    domain: "netflix.com",
    ats: "eightfold",
    // Legacy /api/apply/v2 tenant (PCSX answers 403 "PCSX is not enabled").
    token: "https://explore.jobs.netflix.net|netflix.com",
    careersUrl: "https://explore.jobs.netflix.net/careers",
    tags: ["big_tech", "mnc", "product"],
    hq: "Los Gatos, US",
    openJobs: 445,
  }),
  t({
    slug: "paypal",
    name: "PayPal",
    domain: "paypal.com",
    ats: "eightfold",
    // PCSX tenant (v2 answers 403 "Not authorized for PCSX"). India-only via the location filter.
    token: "https://paypal.eightfold.ai|paypal.com",
    careersUrl: "https://paypal.eightfold.ai/careers",
    tags: ["mnc", "fintech", "gcc"],
    hq: "San Jose, US",
    openJobs: 369,
    extra: { country: "IN" },
  }),
];

export const jsonldTargets: CompanyTarget[] = [
  t({
    slug: "boeing",
    name: "Boeing",
    domain: "boeing.com",
    ats: "jsonld",
    // Radancy/TalentBrew site: no Sitemap: line in robots.txt → /sitemap.xml (≈1.2k /job/ URLs among category pages).
    token: "https://jobs.boeing.com/",
    careersUrl: "https://jobs.boeing.com/",
    tags: ["mnc", "gcc"],
    hq: "Arlington, US",
    openJobs: 1173,
  }),
  t({
    slug: "citi",
    name: "Citi",
    domain: "citi.com",
    ats: "jsonld",
    token: "https://jobs.citi.com/",
    careersUrl: "https://jobs.citi.com/",
    tags: ["mnc", "bank", "gcc"],
    hq: "New York, US",
    priority: 1,
    openJobs: 3195,
    // Only Indian cities (URL path carries the city) — keeps the page budget on India-relevant jobs.
    extra: { jobUrlPattern: "/job/(?:pune|chennai|mumbai|bengaluru|bangalore|gurugram|gurgaon|hyderabad|noida|new-delhi)/" },
  }),
  t({
    slug: "adobe",
    name: "Adobe",
    domain: "adobe.com",
    ats: "jsonld",
    // Sitemap-URL token form (Phenom front end; job pages carry entity-escaped JSON-LD descriptions).
    token: "https://careers.adobe.com/us/en/sitemap.xml",
    careersUrl: "https://careers.adobe.com/us/en",
    tags: ["big_tech", "mnc", "product"],
    hq: "San Jose, US",
    openJobs: 258,
  }),
];

/** Best-effort platforms (verified live where a public customer site was found). */
export const otherTargets: CompanyTarget[] = [
  t({
    slug: "thermo-fisher",
    name: "Thermo Fisher Scientific",
    domain: "thermofisher.com",
    ats: "phenom",
    token: "https://jobs.thermofisher.com/global/en",
    careersUrl: "https://jobs.thermofisher.com/",
    tags: ["mnc", "gcc"],
    hq: "Waltham, US",
    openJobs: 3196,
  }),
  t({
    slug: "philips",
    name: "Philips",
    domain: "philips.com",
    ats: "phenom",
    token: "https://www.careers.philips.com/global/en",
    careersUrl: "https://www.careers.philips.com/",
    tags: ["mnc", "gcc"],
    hq: "Amsterdam, NL",
    openJobs: 769,
  }),
  t({
    slug: "ey",
    name: "EY",
    domain: "ey.com",
    ats: "successfactors",
    // SuccessFactors RMK: /search/ result pages + microdata job pages.
    token: "https://careers.ey.com/",
    careersUrl: "https://careers.ey.com/",
    tags: ["mnc", "consulting", "gcc"],
    hq: "London, GB",
    priority: 1,
    openJobs: 9713,
  }),
  t({
    slug: "bloomberg",
    name: "Bloomberg",
    domain: "bloomberg.com",
    ats: "avature",
    token: "https://bloomberg.avature.net/careers",
    careersUrl: "https://www.bloomberg.com/company/careers/",
    tags: ["mnc", "fintech"],
    hq: "New York, US",
    openJobs: 315,
  }),
  t({
    slug: "deloitte-us",
    name: "Deloitte",
    domain: "deloitte.com",
    ats: "avature",
    token: "https://apply.deloitte.com/careers",
    careersUrl: "https://apply.deloitte.com/careers",
    tags: ["mnc", "consulting"],
    hq: "New York, US",
  }),
];

export const targets: CompanyTarget[] = [...workdayTargets, ...oracleTargets, ...eightfoldTargets, ...jsonldTargets, ...otherTargets];
export default targets;
