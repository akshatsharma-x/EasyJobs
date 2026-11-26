/**
 * Static catalog for the deterministic mock dataset: companies, sources, cities, titles, skills and copy.
 * Real companies and domains; careers URLs point at real careers landing pages (never fake deep links).
 */
import type { CompanyTag, ExperienceLevel, JobCategory, SourceKind } from "@easyjobs/contract";

/* ─────────────────────────── Sources ─────────────────────────── */

export interface MockSourceDef {
  id: string;
  name: string;
  kind: SourceKind;
}

export const MOCK_SOURCES: readonly MockSourceDef[] = [
  // Official — company boards on ATS platforms
  { id: "greenhouse", name: "Greenhouse", kind: "ats" },
  { id: "lever", name: "Lever", kind: "ats" },
  { id: "ashby", name: "Ashby", kind: "ats" },
  { id: "workday", name: "Workday", kind: "ats" },
  { id: "oracle", name: "Oracle Recruiting", kind: "ats" },
  { id: "eightfold", name: "Eightfold", kind: "ats" },
  { id: "successfactors", name: "SAP SuccessFactors", kind: "ats" },
  { id: "smartrecruiters", name: "SmartRecruiters", kind: "ats" },
  // Official — custom career portals
  { id: "google", name: "Google Careers", kind: "career_site" },
  { id: "microsoft", name: "Microsoft Careers", kind: "career_site" },
  { id: "amazon", name: "Amazon Jobs", kind: "career_site" },
  { id: "flipkart", name: "Flipkart Careers", kind: "career_site" },
  { id: "swiggy", name: "Swiggy Careers", kind: "career_site" },
  { id: "zomato", name: "Zomato Careers", kind: "career_site" },
  { id: "phonepe", name: "PhonePe Careers", kind: "career_site" },
  { id: "atlassian", name: "Atlassian Careers", kind: "career_site" },
  { id: "uber", name: "Uber Careers", kind: "career_site" },
  { id: "goldmansachs", name: "Goldman Sachs Careers", kind: "career_site" },
  { id: "tcs", name: "TCS Careers", kind: "career_site" },
  { id: "infosys", name: "Infosys Careers", kind: "career_site" },
  { id: "accenture", name: "Accenture Careers", kind: "career_site" },
  { id: "cognizant", name: "Cognizant Careers", kind: "career_site" },
  { id: "capgemini", name: "Capgemini Careers", kind: "career_site" },
  { id: "zoho", name: "Zoho Careers", kind: "career_site" },
  { id: "cisco", name: "Cisco Careers", kind: "career_site" },
  { id: "hcltech", name: "HCLTech Careers", kind: "career_site" },
  { id: "techmahindra", name: "Tech Mahindra Careers", kind: "career_site" },
  { id: "myntra", name: "Myntra Careers", kind: "career_site" },
  { id: "zerodha", name: "Zerodha Careers", kind: "career_site" },
  // Job boards and aggregators
  { id: "coursejoiner", name: "CourseJoiner", kind: "aggregator" },
  { id: "internshala", name: "Internshala", kind: "job_board" },
  { id: "linkedin", name: "LinkedIn", kind: "job_board" },
  { id: "naukri", name: "Naukri", kind: "job_board" },
  { id: "unstop", name: "Unstop", kind: "job_board" },
];

/** Public section pages of the job boards / aggregators (real URLs, no fake deep links). */
export function boardUrl(sourceId: string, internship: boolean): string {
  switch (sourceId) {
    case "internshala":
      return internship ? "https://internshala.com/internships/" : "https://internshala.com/jobs/";
    case "unstop":
      return internship ? "https://unstop.com/internships" : "https://unstop.com/jobs";
    case "linkedin":
      return "https://www.linkedin.com/jobs/";
    case "naukri":
      return "https://www.naukri.com/";
    case "coursejoiner":
      return "https://coursejoiner.com/";
    default:
      return "https://www.linkedin.com/jobs/";
  }
}

/* ─────────────────────────── Cities ─────────────────────────── */

export interface CityDef {
  name: string;
  state: string | null;
  /** ISO 3166-1 alpha-2 */
  country: string;
  weight: number;
}

export const CITY_CATALOG: readonly CityDef[] = [
  { name: "Bengaluru", state: "Karnataka", country: "IN", weight: 30 },
  { name: "Hyderabad", state: "Telangana", country: "IN", weight: 14 },
  { name: "Pune", state: "Maharashtra", country: "IN", weight: 10 },
  { name: "Gurugram", state: "Haryana", country: "IN", weight: 9 },
  { name: "Chennai", state: "Tamil Nadu", country: "IN", weight: 9 },
  { name: "Mumbai", state: "Maharashtra", country: "IN", weight: 8 },
  { name: "Noida", state: "Uttar Pradesh", country: "IN", weight: 6 },
  { name: "Delhi", state: "Delhi", country: "IN", weight: 2 },
  { name: "Kolkata", state: "West Bengal", country: "IN", weight: 2.5 },
  { name: "Ahmedabad", state: "Gujarat", country: "IN", weight: 1.5 },
  { name: "Kochi", state: "Kerala", country: "IN", weight: 1.5 },
  { name: "Jaipur", state: "Rajasthan", country: "IN", weight: 1.2 },
  { name: "Singapore", state: null, country: "SG", weight: 1 },
  { name: "London", state: "England", country: "GB", weight: 1 },
  { name: "Dublin", state: null, country: "IE", weight: 1 },
  { name: "San Francisco", state: "California", country: "US", weight: 1 },
  { name: "Seattle", state: "Washington", country: "US", weight: 1 },
  { name: "New York", state: "New York", country: "US", weight: 1 },
  { name: "Berlin", state: null, country: "DE", weight: 1 },
  { name: "Amsterdam", state: null, country: "NL", weight: 1 },
  { name: "Toronto", state: "Ontario", country: "CA", weight: 1 },
];

export const COUNTRY_CURRENCY: Record<string, string> = {
  IN: "INR", US: "USD", GB: "GBP", IE: "EUR", DE: "EUR", NL: "EUR", SG: "SGD", CA: "CAD",
};

/** Static FX → INR (prompts.md §0.4: static table). */
export const FX_TO_INR: Record<string, number> = { INR: 1, USD: 84, EUR: 91, GBP: 106, SGD: 63, CAD: 61 };

/** Multiplier applied to USD salary bands for other currencies (local pay levels). */
export const CURRENCY_BAND_FACTOR: Record<string, number> = { USD: 1, GBP: 0.62, EUR: 0.7, SGD: 1.05, CAD: 1.05 };

/* ─────────────────────────── Companies ─────────────────────────── */

export type CompanyProfile = "bigtech" | "product" | "startup" | "fintech" | "services" | "consulting" | "bank" | "semis" | "global";

export interface MockCompanyDef {
  slug: string;
  name: string;
  domain: string;
  tags: CompanyTag[];
  hq: string;
  careersUrl: string;
  /** Source id (in MOCK_SOURCES) of the company's official listing channel. */
  official: string;
  profile: CompanyProfile;
  /** Relative share of jobs. */
  weight: number;
  /** Canonical Indian city names. Empty → remote-first. */
  cities: string[];
  /** Global offices (CITY_CATALOG names). */
  globalCities?: string[];
  /** Probability that a role is remote (overrides the profile default). */
  remoteShare?: number;
  fresherTitles?: string[];
  internTitles?: string[];
  blurb: string;
}

export const MOCK_COMPANIES: readonly MockCompanyDef[] = [
  {
    slug: "google", name: "Google", domain: "google.com", tags: ["big_tech", "mnc", "product", "ai"], hq: "Mountain View, US",
    careersUrl: "https://www.google.com/about/careers/applications/", official: "google", profile: "bigtech", weight: 9,
    cities: ["Bengaluru", "Hyderabad", "Gurugram", "Pune", "Mumbai"], globalCities: ["London", "Dublin", "Singapore", "New York"],
    internTitles: ["Software Engineering Intern, Summer 2027", "STEP Intern", "Software Engineering Intern (Winter)"],
    fresherTitles: ["Software Engineer, Early Career", "Software Engineer – New Grad {batch}"],
    blurb: "Google builds products like Search, Android, Maps and Cloud that billions of people use every day.",
  },
  {
    slug: "microsoft", name: "Microsoft", domain: "microsoft.com", tags: ["big_tech", "mnc", "product", "ai"], hq: "Redmond, US",
    careersUrl: "https://careers.microsoft.com/", official: "microsoft", profile: "bigtech", weight: 9,
    cities: ["Hyderabad", "Bengaluru", "Noida", "Gurugram"], globalCities: ["Seattle", "Dublin", "London"],
    internTitles: ["Software Engineer Intern", "Research Intern – Microsoft Research India", "Explore Intern"],
    fresherTitles: ["Software Engineer – New Grad {batch}", "Support Engineer – University Hire"],
    blurb: "Microsoft builds the platforms and tools — from Azure to Microsoft 365 and GitHub — that help people and organisations achieve more.",
  },
  {
    slug: "amazon", name: "Amazon", domain: "amazon.com", tags: ["big_tech", "mnc", "product"], hq: "Seattle, US",
    careersUrl: "https://www.amazon.jobs/", official: "amazon", profile: "bigtech", weight: 10,
    cities: ["Bengaluru", "Hyderabad", "Chennai", "Pune", "Gurugram"], globalCities: ["Seattle", "London", "Dublin"],
    internTitles: ["SDE Intern", "Software Development Engineer Intern – 6 months", "Applied Scientist Intern"],
    fresherTitles: ["SDE-1 – New Grad {batch}", "Software Development Engineer I – University Hire", "Cloud Support Associate"],
    blurb: "Amazon serves customers across retail, AWS, devices and entertainment, and builds for India at scale.",
  },
  {
    slug: "flipkart", name: "Flipkart", domain: "flipkart.com", tags: ["product", "unicorn"], hq: "Bengaluru, IN",
    careersUrl: "https://www.flipkartcareers.com/", official: "flipkart", profile: "startup", weight: 6, cities: ["Bengaluru", "Hyderabad"],
    internTitles: ["SDE Intern", "Flipkart GRiD – Software Development Intern"],
    fresherTitles: ["Software Development Engineer – 1 (Campus {batch})", "Associate Software Engineer"],
    blurb: "Flipkart is one of India's largest e-commerce marketplaces, serving customers in every corner of the country.",
  },
  {
    slug: "razorpay", name: "Razorpay", domain: "razorpay.com", tags: ["startup", "unicorn", "fintech", "product", "yc"], hq: "Bengaluru, IN",
    careersUrl: "https://razorpay.com/jobs/", official: "lever", profile: "fintech", weight: 6, cities: ["Bengaluru", "Mumbai"],
    blurb: "Razorpay builds payments and banking infrastructure for businesses across India.",
  },
  {
    slug: "swiggy", name: "Swiggy", domain: "swiggy.com", tags: ["product", "unicorn"], hq: "Bengaluru, IN",
    careersUrl: "https://careers.swiggy.com/", official: "swiggy", profile: "startup", weight: 5, cities: ["Bengaluru", "Hyderabad", "Gurugram"],
    blurb: "Swiggy is a convenience platform for food delivery, groceries and more across hundreds of Indian cities.",
  },
  {
    slug: "zomato", name: "Zomato", domain: "zomato.com", tags: ["product"], hq: "Gurugram, IN",
    careersUrl: "https://www.zomato.com/careers", official: "zomato", profile: "startup", weight: 5, cities: ["Gurugram"],
    blurb: "Zomato helps people discover and get great food — from restaurant discovery to quick delivery.",
  },
  {
    slug: "cred", name: "CRED", domain: "cred.club", tags: ["startup", "unicorn", "fintech", "product"], hq: "Bengaluru, IN",
    careersUrl: "https://careers.cred.club/", official: "lever", profile: "fintech", weight: 4, cities: ["Bengaluru"],
    blurb: "CRED is a members-only platform that rewards people for being financially trustworthy.",
  },
  {
    slug: "zepto", name: "Zepto", domain: "zeptonow.com", tags: ["startup", "unicorn", "product", "yc"], hq: "Mumbai, IN",
    careersUrl: "https://www.zeptonow.com/careers", official: "ashby", profile: "startup", weight: 4, cities: ["Mumbai", "Bengaluru"],
    blurb: "Zepto delivers groceries and essentials in minutes across Indian cities.",
  },
  {
    slug: "meesho", name: "Meesho", domain: "meesho.com", tags: ["startup", "unicorn", "product", "yc"], hq: "Bengaluru, IN",
    careersUrl: "https://www.meesho.io/jobs", official: "lever", profile: "startup", weight: 4, cities: ["Bengaluru", "Delhi"],
    blurb: "Meesho is an e-commerce platform that makes online shopping and selling accessible to everyone in India.",
  },
  {
    slug: "phonepe", name: "PhonePe", domain: "phonepe.com", tags: ["unicorn", "fintech", "product"], hq: "Bengaluru, IN",
    careersUrl: "https://www.phonepe.com/careers/", official: "phonepe", profile: "fintech", weight: 5, cities: ["Bengaluru", "Pune"],
    blurb: "PhonePe is one of India's leading digital payments and financial services platforms.",
  },
  {
    slug: "groww", name: "Groww", domain: "groww.in", tags: ["startup", "unicorn", "fintech", "product"], hq: "Bengaluru, IN",
    careersUrl: "https://groww.in/careers", official: "lever", profile: "fintech", weight: 3, cities: ["Bengaluru"],
    blurb: "Groww makes investing in stocks, mutual funds and more simple for millions of Indians.",
  },
  {
    slug: "atlassian", name: "Atlassian", domain: "atlassian.com", tags: ["mnc", "product"], hq: "Sydney, AU",
    careersUrl: "https://www.atlassian.com/company/careers", official: "atlassian", profile: "product", weight: 4, cities: ["Bengaluru"],
    globalCities: ["Amsterdam"], remoteShare: 0.35,
    blurb: "Atlassian builds team collaboration tools like Jira, Confluence and Loom.",
  },
  {
    slug: "adobe", name: "Adobe", domain: "adobe.com", tags: ["mnc", "product"], hq: "San Jose, US",
    careersUrl: "https://careers.adobe.com/", official: "workday", profile: "product", weight: 5, cities: ["Noida", "Bengaluru"],
    blurb: "Adobe builds creative, document and customer-experience software used by people and businesses worldwide.",
  },
  {
    slug: "salesforce", name: "Salesforce", domain: "salesforce.com", tags: ["mnc", "product"], hq: "San Francisco, US",
    careersUrl: "https://careers.salesforce.com/", official: "workday", profile: "product", weight: 5, cities: ["Hyderabad", "Bengaluru", "Gurugram"],
    globalCities: ["San Francisco", "Dublin", "London"],
    blurb: "Salesforce builds CRM and AI products that help companies connect with their customers.",
  },
  {
    slug: "uber", name: "Uber", domain: "uber.com", tags: ["big_tech", "mnc", "product"], hq: "San Francisco, US",
    careersUrl: "https://www.uber.com/careers/", official: "uber", profile: "bigtech", weight: 4, cities: ["Bengaluru", "Hyderabad"],
    globalCities: ["San Francisco", "Amsterdam"],
    blurb: "Uber builds the platform that moves people, food and goods across thousands of cities.",
  },
  {
    slug: "goldman-sachs", name: "Goldman Sachs", domain: "goldmansachs.com", tags: ["mnc", "bank", "gcc"], hq: "New York, US",
    careersUrl: "https://www.goldmansachs.com/careers/", official: "goldmansachs", profile: "bank", weight: 5, cities: ["Bengaluru", "Hyderabad"],
    globalCities: ["New York", "London", "Singapore"],
    internTitles: ["Summer Analyst – Engineering", "Summer Analyst – Engineering (2027)"],
    fresherTitles: ["Analyst – Engineering (New Analyst Program {batch})", "Analyst – Software Engineering"],
    blurb: "Goldman Sachs is a global investment banking, securities and asset management firm.",
  },
  {
    slug: "jpmorgan", name: "JPMorgan Chase", domain: "jpmorganchase.com", tags: ["mnc", "bank", "gcc"], hq: "New York, US",
    careersUrl: "https://careers.jpmorgan.com/", official: "oracle", profile: "bank", weight: 6, cities: ["Mumbai", "Bengaluru", "Hyderabad"],
    globalCities: ["New York", "London"],
    internTitles: ["Software Engineer Program – Summer Intern", "Code for Good – Software Engineering Intern"],
    fresherTitles: ["Software Engineer Program – Analyst ({batch})", "Analyst – Technology"],
    blurb: "JPMorgan Chase is a global financial services firm serving consumers, businesses and institutions.",
  },
  {
    slug: "tcs", name: "TCS", domain: "tcs.com", tags: ["indian_it", "service"], hq: "Mumbai, IN",
    careersUrl: "https://www.tcs.com/careers", official: "tcs", profile: "services", weight: 10,
    cities: ["Chennai", "Mumbai", "Pune", "Bengaluru", "Hyderabad", "Kolkata", "Gurugram", "Ahmedabad", "Kochi", "Delhi"],
    fresherTitles: ["Assistant System Engineer – TCS Ninja", "System Engineer – TCS Digital", "Graduate Trainee – TCS Prime", "TCS NQT – Assistant System Engineer"],
    blurb: "TCS (Tata Consultancy Services) is an IT services, consulting and business solutions organisation.",
  },
  {
    slug: "infosys", name: "Infosys", domain: "infosys.com", tags: ["indian_it", "service"], hq: "Bengaluru, IN",
    careersUrl: "https://www.infosys.com/careers/", official: "infosys", profile: "services", weight: 9,
    cities: ["Bengaluru", "Pune", "Hyderabad", "Chennai", "Jaipur", "Kolkata"],
    fresherTitles: ["Systems Engineer", "Digital Specialist Engineer", "Specialist Programmer", "Power Programmer"],
    blurb: "Infosys is a global leader in next-generation digital services and consulting.",
  },
  {
    slug: "wipro", name: "Wipro", domain: "wipro.com", tags: ["indian_it", "service"], hq: "Bengaluru, IN",
    careersUrl: "https://careers.wipro.com/", official: "successfactors", profile: "services", weight: 7,
    cities: ["Bengaluru", "Hyderabad", "Chennai", "Pune", "Kochi", "Kolkata"],
    fresherTitles: ["Project Engineer – Wipro Elite NTH", "Turbo Project Engineer", "Scholar Trainee – WILP"],
    blurb: "Wipro is a technology services and consulting company focused on building innovative solutions for clients.",
  },
  {
    slug: "accenture", name: "Accenture", domain: "accenture.com", tags: ["mnc", "consulting", "service"], hq: "Dublin, IE",
    careersUrl: "https://www.accenture.com/in-en/careers", official: "accenture", profile: "consulting", weight: 9,
    cities: ["Bengaluru", "Hyderabad", "Pune", "Mumbai", "Chennai", "Gurugram", "Kolkata"],
    fresherTitles: ["Associate Software Engineer", "Packaged App Development Associate", "Advanced Associate Software Engineer"],
    blurb: "Accenture is a global professional services company with leading capabilities in digital, cloud and security.",
  },
  {
    slug: "deloitte", name: "Deloitte", domain: "deloitte.com", tags: ["mnc", "consulting"], hq: "London, GB",
    careersUrl: "https://www2.deloitte.com/in/en/careers.html", official: "workday", profile: "consulting", weight: 6,
    cities: ["Hyderabad", "Bengaluru", "Gurugram", "Mumbai", "Pune"],
    fresherTitles: ["Analyst – Technology Consulting", "Analyst Trainee – Deloitte USI"],
    blurb: "Deloitte provides audit, consulting, tax and advisory services to clients around the world.",
  },
  {
    slug: "cognizant", name: "Cognizant", domain: "cognizant.com", tags: ["mnc", "service"], hq: "Teaneck, US",
    careersUrl: "https://careers.cognizant.com/", official: "cognizant", profile: "services", weight: 7,
    cities: ["Chennai", "Pune", "Kolkata", "Hyderabad", "Bengaluru", "Gurugram", "Kochi"],
    fresherTitles: ["Programmer Analyst Trainee – GenC", "GenC Next – Programmer Analyst", "GenC Pro – Associate"],
    blurb: "Cognizant helps companies modernise technology, reimagine processes and transform experiences.",
  },
  {
    slug: "capgemini", name: "Capgemini", domain: "capgemini.com", tags: ["mnc", "service", "consulting"], hq: "Paris, FR",
    careersUrl: "https://www.capgemini.com/in-en/careers/", official: "capgemini", profile: "services", weight: 6,
    cities: ["Mumbai", "Pune", "Bengaluru", "Chennai", "Hyderabad", "Noida"],
    fresherTitles: ["Analyst – Capgemini Exceller", "Senior Analyst – Capgemini Excellence", "Software Engineer Trainee"],
    blurb: "Capgemini is a global business and technology transformation partner.",
  },
  {
    slug: "freshworks", name: "Freshworks", domain: "freshworks.com", tags: ["mnc", "product"], hq: "San Mateo, US",
    careersUrl: "https://www.freshworks.com/company/careers/", official: "smartrecruiters", profile: "product", weight: 4,
    cities: ["Chennai", "Bengaluru"],
    blurb: "Freshworks builds AI-powered customer and employee service software for businesses of every size.",
  },
  {
    slug: "zoho", name: "Zoho", domain: "zoho.com", tags: ["product"], hq: "Chennai, IN",
    careersUrl: "https://www.zoho.com/careers/", official: "zoho", profile: "product", weight: 5, cities: ["Chennai"],
    fresherTitles: ["Member Technical Staff – Fresher", "Software Developer – Fresher"],
    blurb: "Zoho builds a large suite of business software — from CRM to Mail — engineered largely in India.",
  },
  {
    slug: "postman", name: "Postman", domain: "postman.com", tags: ["startup", "unicorn", "product"], hq: "San Francisco, US",
    careersUrl: "https://www.postman.com/company/careers/", official: "greenhouse", profile: "product", weight: 3, cities: ["Bengaluru"],
    globalCities: ["San Francisco"],
    blurb: "Postman is the API platform developers use to design, test and ship APIs.",
  },
  {
    slug: "browserstack", name: "BrowserStack", domain: "browserstack.com", tags: ["startup", "unicorn", "product"], hq: "Mumbai, IN",
    careersUrl: "https://www.browserstack.com/careers", official: "greenhouse", profile: "product", weight: 3, cities: ["Mumbai", "Bengaluru"],
    remoteShare: 0.3,
    blurb: "BrowserStack is a cloud testing platform that helps teams test on thousands of real browsers and devices.",
  },
  {
    slug: "paytm", name: "Paytm", domain: "paytm.com", tags: ["fintech", "product"], hq: "Noida, IN",
    careersUrl: "https://paytm.com/careers", official: "lever", profile: "fintech", weight: 4, cities: ["Noida", "Bengaluru", "Mumbai"],
    blurb: "Paytm is a payments and financial services company serving consumers and merchants across India.",
  },
  {
    slug: "nvidia", name: "NVIDIA", domain: "nvidia.com", tags: ["big_tech", "mnc", "product", "ai"], hq: "Santa Clara, US",
    careersUrl: "https://www.nvidia.com/en-us/about-nvidia/careers/", official: "workday", profile: "semis", weight: 5,
    cities: ["Bengaluru", "Pune", "Hyderabad"],
    blurb: "NVIDIA pioneered accelerated computing and builds the GPUs and platforms behind modern AI.",
  },
  {
    slug: "intel", name: "Intel", domain: "intel.com", tags: ["mnc", "product"], hq: "Santa Clara, US",
    careersUrl: "https://jobs.intel.com/", official: "workday", profile: "semis", weight: 4, cities: ["Bengaluru", "Hyderabad"],
    blurb: "Intel designs and manufactures the semiconductors that power computing around the world.",
  },
  {
    slug: "qualcomm", name: "Qualcomm", domain: "qualcomm.com", tags: ["mnc", "product"], hq: "San Diego, US",
    careersUrl: "https://careers.qualcomm.com/", official: "eightfold", profile: "semis", weight: 4, cities: ["Bengaluru", "Hyderabad", "Chennai"],
    blurb: "Qualcomm builds the wireless and compute technology at the heart of mobile and connected devices.",
  },
  {
    slug: "cisco", name: "Cisco", domain: "cisco.com", tags: ["mnc", "product"], hq: "San Jose, US",
    careersUrl: "https://jobs.cisco.com/", official: "cisco", profile: "product", weight: 4, cities: ["Bengaluru", "Pune"],
    blurb: "Cisco builds the networking, security and collaboration technology that connects the internet.",
  },
  {
    slug: "oracle", name: "Oracle", domain: "oracle.com", tags: ["mnc", "product"], hq: "Austin, US",
    careersUrl: "https://careers.oracle.com/", official: "oracle", profile: "product", weight: 5, cities: ["Bengaluru", "Hyderabad", "Noida"],
    blurb: "Oracle offers cloud infrastructure, databases and enterprise applications to businesses worldwide.",
  },
  {
    slug: "sap", name: "SAP", domain: "sap.com", tags: ["mnc", "product"], hq: "Walldorf, DE",
    careersUrl: "https://jobs.sap.com/", official: "successfactors", profile: "product", weight: 4, cities: ["Bengaluru", "Gurugram"],
    globalCities: ["Berlin"],
    blurb: "SAP builds enterprise software that helps companies run finance, supply chain, HR and more.",
  },
  {
    slug: "walmart-global-tech", name: "Walmart Global Tech", domain: "walmart.com", tags: ["mnc", "gcc"], hq: "Bentonville, US",
    careersUrl: "https://careers.walmart.com/", official: "workday", profile: "product", weight: 5, cities: ["Bengaluru", "Chennai"],
    blurb: "Walmart Global Tech builds the technology behind Walmart's stores, e-commerce and supply chain.",
  },
  {
    slug: "hcltech", name: "HCLTech", domain: "hcltech.com", tags: ["indian_it", "service"], hq: "Noida, IN",
    careersUrl: "https://www.hcltech.com/careers", official: "hcltech", profile: "services", weight: 6,
    cities: ["Noida", "Chennai", "Bengaluru", "Hyderabad", "Delhi"],
    fresherTitles: ["Graduate Engineer Trainee", "Associate Software Engineer – Fresher"],
    blurb: "HCLTech is a global technology company helping enterprises reimagine their business for the digital age.",
  },
  {
    slug: "tech-mahindra", name: "Tech Mahindra", domain: "techmahindra.com", tags: ["indian_it", "service"], hq: "Pune, IN",
    careersUrl: "https://careers.techmahindra.com/", official: "techmahindra", profile: "services", weight: 5,
    cities: ["Pune", "Hyderabad", "Noida", "Bengaluru", "Chennai", "Kolkata"],
    fresherTitles: ["Associate Software Engineer", "Graduate Engineer Trainee"],
    blurb: "Tech Mahindra offers technology consulting and digital solutions to enterprises worldwide.",
  },
  {
    slug: "myntra", name: "Myntra", domain: "myntra.com", tags: ["product", "unicorn"], hq: "Bengaluru, IN",
    careersUrl: "https://careers.myntra.com/", official: "myntra", profile: "startup", weight: 3, cities: ["Bengaluru"],
    blurb: "Myntra is one of India's leading fashion and lifestyle e-commerce platforms.",
  },
  {
    slug: "zerodha", name: "Zerodha", domain: "zerodha.com", tags: ["fintech", "product", "startup"], hq: "Bengaluru, IN",
    careersUrl: "https://zerodha.com/careers/", official: "zerodha", profile: "fintech", weight: 2, cities: ["Bengaluru"],
    blurb: "Zerodha is a technology-first stock broking platform built for Indian investors and traders.",
  },
  {
    slug: "dream11", name: "Dream11", domain: "dream11.com", tags: ["startup", "unicorn", "product"], hq: "Mumbai, IN",
    careersUrl: "https://www.dreamsports.group/careers/", official: "greenhouse", profile: "startup", weight: 3, cities: ["Mumbai"],
    blurb: "Dream11 is a fantasy sports platform for India's cricket, football and kabaddi fans.",
  },
  {
    slug: "juspay", name: "Juspay", domain: "juspay.io", tags: ["startup", "fintech", "product"], hq: "Bengaluru, IN",
    careersUrl: "https://juspay.io/careers", official: "lever", profile: "fintech", weight: 3, cities: ["Bengaluru"],
    blurb: "Juspay builds payment orchestration and checkout infrastructure for merchants and banks.",
  },
  {
    slug: "gitlab", name: "GitLab", domain: "gitlab.com", tags: ["mnc", "product"], hq: "San Francisco, US",
    careersUrl: "https://about.gitlab.com/jobs/", official: "greenhouse", profile: "global", weight: 3, cities: [], remoteShare: 1,
    blurb: "GitLab is the all-remote company behind the DevSecOps platform used by teams around the world.",
  },
  {
    slug: "stripe", name: "Stripe", domain: "stripe.com", tags: ["mnc", "fintech", "product", "unicorn"], hq: "San Francisco, US",
    careersUrl: "https://stripe.com/jobs", official: "greenhouse", profile: "global", weight: 3, cities: ["Bengaluru"],
    globalCities: ["Singapore", "Dublin", "San Francisco", "Toronto"], remoteShare: 0.25,
    blurb: "Stripe builds financial infrastructure for the internet.",
  },
];

/* ─────────────────────────── Distributions ─────────────────────────── */

export const LEVEL_WEIGHTS: Record<ExperienceLevel, number> = {
  intern: 22, fresher: 22, entry: 20, mid: 18, senior: 11, lead: 5, executive: 2,
};

export const LEVEL_AFFINITY: Record<CompanyProfile, Record<ExperienceLevel, number>> = {
  bigtech: { intern: 1.1, fresher: 0.8, entry: 1.0, mid: 1.2, senior: 1.4, lead: 1.6, executive: 1.0 },
  product: { intern: 0.9, fresher: 0.8, entry: 1.0, mid: 1.3, senior: 1.4, lead: 1.4, executive: 1.0 },
  startup: { intern: 1.4, fresher: 0.8, entry: 1.2, mid: 1.2, senior: 1.0, lead: 0.9, executive: 1.0 },
  fintech: { intern: 1.2, fresher: 0.8, entry: 1.1, mid: 1.2, senior: 1.1, lead: 1.0, executive: 1.0 },
  services: { intern: 0.6, fresher: 2.6, entry: 1.2, mid: 0.8, senior: 0.6, lead: 0.5, executive: 0.4 },
  consulting: { intern: 0.8, fresher: 1.6, entry: 1.2, mid: 1.0, senior: 0.8, lead: 0.8, executive: 0.9 },
  bank: { intern: 1.5, fresher: 1.0, entry: 1.0, mid: 1.0, senior: 1.0, lead: 1.0, executive: 1.0 },
  semis: { intern: 1.0, fresher: 1.0, entry: 1.1, mid: 1.2, senior: 1.2, lead: 1.1, executive: 0.8 },
  global: { intern: 0.3, fresher: 0.3, entry: 0.8, mid: 1.4, senior: 1.6, lead: 1.4, executive: 1.0 },
};

export const CATEGORY_WEIGHTS: Record<CompanyProfile, Partial<Record<JobCategory, number>>> = {
  bigtech: { software_engineering: 40, data_ai: 15, devops_cloud: 7, security: 5, qa_testing: 2, product: 8, design: 5, research: 4, business_ops: 5, sales: 4, marketing: 3, finance: 2 },
  product: { software_engineering: 42, data_ai: 10, devops_cloud: 7, security: 4, qa_testing: 5, product: 9, design: 6, marketing: 4, sales: 5, customer_support: 5, content: 3 },
  startup: { software_engineering: 34, data_ai: 12, product: 9, design: 7, marketing: 9, business_ops: 12, sales: 6, customer_support: 4, hr: 3, content: 3, finance: 2 },
  fintech: { software_engineering: 36, data_ai: 12, product: 8, design: 5, security: 6, finance: 8, business_ops: 8, customer_support: 6, sales: 4, marketing: 4, legal: 3 },
  services: { software_engineering: 44, qa_testing: 12, devops_cloud: 9, data_ai: 9, customer_support: 8, business_ops: 5, consulting: 5, security: 4, hr: 2, sales: 2 },
  consulting: { consulting: 30, software_engineering: 18, data_ai: 10, business_ops: 10, finance: 10, security: 6, hr: 4, marketing: 4, devops_cloud: 4, content: 2, legal: 2 },
  bank: { software_engineering: 34, finance: 30, data_ai: 10, business_ops: 8, security: 6, devops_cloud: 4, legal: 3, hr: 2, qa_testing: 3 },
  semis: { core_engineering: 40, software_engineering: 26, data_ai: 12, devops_cloud: 5, research: 7, qa_testing: 5, business_ops: 3, design: 2 },
  global: { software_engineering: 44, devops_cloud: 10, security: 8, product: 8, design: 6, sales: 8, customer_support: 7, marketing: 6, data_ai: 6, content: 3 },
};

/** Base remote share by profile (interns get a small bump). */
export const REMOTE_SHARE: Record<CompanyProfile, number> = {
  bigtech: 0.1, product: 0.22, startup: 0.2, fintech: 0.17, services: 0.09, consulting: 0.1, bank: 0.04, semis: 0.05, global: 0.6,
};

/** Probability that a role is posted in a global office (if the company has any). */
export const GLOBAL_OFFICE_SHARE: Record<CompanyProfile, number> = {
  bigtech: 0.34, product: 0.3, startup: 0, fintech: 0, services: 0, consulting: 0, bank: 0.38, semis: 0, global: 0.6,
};

/* ─────────────────────────── Titles ─────────────────────────── */

type TitlesByLevel = Record<ExperienceLevel, string[]>;

export const CATEGORY_TITLES: Partial<Record<JobCategory, TitlesByLevel>> = {
  software_engineering: {
    intern: ["Software Engineering Intern", "SDE Intern", "Software Developer Intern", "Backend Engineering Intern", "Frontend Developer Intern", "Full Stack Developer Intern", "Android Developer Intern", "Summer Intern – Software Engineering"],
    fresher: ["Software Engineer – New Grad {batch}", "Graduate Engineer Trainee", "Associate Software Engineer", "Software Engineer – Campus Hire {batch}", "Software Developer – Fresher", "Trainee Software Engineer"],
    entry: ["Software Engineer I", "SDE-1", "Associate Software Engineer", "Junior Backend Developer", "Frontend Engineer", "Android Developer", "iOS Developer", "Full Stack Developer"],
    mid: ["Software Engineer II", "SDE-2", "Backend Engineer (Java)", "Full Stack Engineer", "Android Engineer", "Frontend Engineer (React)", "Backend Engineer (Go)", "Platform Engineer"],
    senior: ["Senior Software Engineer", "SDE-3", "Senior Backend Engineer", "Senior Frontend Engineer (React)", "Senior Android Engineer", "Senior Full Stack Engineer", "Senior iOS Engineer"],
    lead: ["Staff Software Engineer", "Principal Engineer", "Engineering Manager", "Tech Lead – Backend", "Software Architect", "Lead Engineer – Mobile"],
    executive: ["Director of Engineering", "Head of Engineering", "VP Engineering"],
  },
  data_ai: {
    intern: ["Data Science Intern", "Machine Learning Intern", "Data Analyst Intern", "AI Research Intern", "Business Intelligence Intern"],
    fresher: ["Data Analyst – Fresher", "Associate Data Scientist", "Junior Data Analyst", "Graduate Trainee – Analytics"],
    entry: ["Data Analyst", "Data Engineer", "Machine Learning Engineer", "Business Intelligence Analyst", "Analytics Engineer"],
    mid: ["Data Scientist", "ML Engineer II", "Senior Data Analyst", "Data Engineer II", "Applied Scientist"],
    senior: ["Senior Data Scientist", "Senior ML Engineer", "Senior Data Engineer", "Senior Applied Scientist"],
    lead: ["Principal Data Scientist", "Staff ML Engineer", "Analytics Manager", "Lead Data Engineer"],
    executive: ["Head of Data Science", "Director – AI & Analytics"],
  },
  devops_cloud: {
    intern: ["DevOps Intern", "Cloud Engineering Intern"],
    fresher: ["Associate Cloud Engineer", "DevOps Engineer – Fresher", "Graduate Trainee – Cloud"],
    entry: ["DevOps Engineer", "Cloud Engineer (AWS)", "Site Reliability Engineer I", "Linux Systems Engineer"],
    mid: ["Site Reliability Engineer", "DevOps Engineer II", "Platform Engineer", "Cloud Infrastructure Engineer"],
    senior: ["Senior SRE", "Senior DevOps Engineer", "Senior Platform Engineer"],
    lead: ["Staff SRE", "DevOps Lead", "Cloud Architect"],
    executive: ["Director – Cloud Infrastructure"],
  },
  security: {
    intern: ["Security Intern", "Cybersecurity Intern"],
    fresher: ["Security Analyst – Fresher", "SOC Analyst Trainee"],
    entry: ["Security Analyst", "SOC Analyst L1", "Application Security Engineer"],
    mid: ["Application Security Engineer", "Cloud Security Engineer", "Security Engineer II"],
    senior: ["Senior Security Engineer", "Senior Penetration Tester"],
    lead: ["Security Architect", "Principal Security Engineer"],
    executive: ["Head of Information Security", "Chief Information Security Officer"],
  },
  qa_testing: {
    intern: ["QA Intern", "Software Testing Intern"],
    fresher: ["QA Engineer – Fresher", "Test Engineer Trainee"],
    entry: ["QA Engineer", "SDET", "Test Automation Engineer"],
    mid: ["SDET II", "Automation Test Engineer", "Senior QA Engineer"],
    senior: ["Senior SDET", "QA Lead"],
    lead: ["QA Manager", "Principal SDET"],
    executive: ["Director – Quality Engineering"],
  },
  product: {
    intern: ["Product Management Intern", "APM Intern"],
    fresher: ["Associate Product Manager", "Product Analyst – Fresher"],
    entry: ["Associate Product Manager", "Product Analyst"],
    mid: ["Product Manager", "Product Manager – Payments", "Technical Product Manager"],
    senior: ["Senior Product Manager", "Senior Technical Product Manager"],
    lead: ["Group Product Manager", "Principal Product Manager"],
    executive: ["Director of Product", "VP Product"],
  },
  design: {
    intern: ["UI/UX Design Intern", "Product Design Intern", "Graphic Design Intern"],
    fresher: ["Associate Product Designer", "Junior UI/UX Designer"],
    entry: ["Product Designer", "UI/UX Designer", "Visual Designer"],
    mid: ["Product Designer II", "Interaction Designer", "UX Researcher"],
    senior: ["Senior Product Designer", "Senior UX Researcher"],
    lead: ["Design Lead", "Principal Product Designer"],
    executive: ["Head of Design"],
  },
  marketing: {
    intern: ["Marketing Intern", "Social Media Marketing Intern", "Growth Intern", "Content Marketing Intern"],
    fresher: ["Marketing Associate", "Digital Marketing Executive"],
    entry: ["Growth Marketing Associate", "SEO Specialist", "Performance Marketing Executive"],
    mid: ["Product Marketing Manager", "Growth Marketing Manager", "Brand Manager"],
    senior: ["Senior Product Marketing Manager", "Senior Brand Manager"],
    lead: ["Marketing Lead", "Group Marketing Manager"],
    executive: ["Head of Marketing", "VP Marketing"],
  },
  sales: {
    intern: ["Business Development Intern", "Sales Intern"],
    fresher: ["Business Development Associate", "Inside Sales Associate", "Sales Trainee"],
    entry: ["Inside Sales Representative", "Business Development Executive", "Sales Development Representative"],
    mid: ["Account Executive", "Key Account Manager", "Enterprise Sales Manager"],
    senior: ["Senior Account Executive", "Senior Enterprise Sales Manager"],
    lead: ["Regional Sales Manager", "Sales Lead – Enterprise"],
    executive: ["Head of Sales – India", "VP Sales"],
  },
  business_ops: {
    intern: ["Business Analyst Intern", "Operations Intern", "Strategy & Ops Intern"],
    fresher: ["Business Analyst – Fresher", "Operations Associate", "Management Trainee"],
    entry: ["Business Analyst", "Operations Analyst", "Program Associate"],
    mid: ["Program Manager", "Senior Business Analyst", "Strategy & Operations Manager"],
    senior: ["Senior Program Manager", "Operations Manager"],
    lead: ["Principal Program Manager", "Senior Manager – Strategy"],
    executive: ["Chief of Staff", "Head of Operations"],
  },
  finance: {
    intern: ["Finance Intern", "Summer Analyst", "Investment Banking Summer Analyst"],
    fresher: ["Analyst – Finance", "Financial Analyst Trainee", "Accounts Executive"],
    entry: ["Financial Analyst", "Risk Analyst", "Credit Analyst", "Investment Banking Analyst", "Quantitative Analyst"],
    mid: ["Associate – Investment Banking", "Senior Financial Analyst", "Quantitative Researcher"],
    senior: ["Finance Manager", "Vice President – Risk"],
    lead: ["Senior Finance Manager", "Executive Director – Markets"],
    executive: ["Chief Financial Officer", "Managing Director"],
  },
  hr: {
    intern: ["HR Intern", "Talent Acquisition Intern"],
    fresher: ["HR Associate", "Recruitment Associate"],
    entry: ["Talent Acquisition Specialist", "HR Generalist"],
    mid: ["HR Business Partner", "Senior Recruiter", "Technical Recruiter"],
    senior: ["Senior HR Business Partner", "Talent Acquisition Manager"],
    lead: ["HR Lead", "Senior Manager – Talent"],
    executive: ["Chief People Officer", "Head of HR"],
  },
  consulting: {
    intern: ["Consulting Intern", "Summer Associate – Consulting"],
    fresher: ["Analyst – Consulting", "Associate Consultant", "Technology Analyst"],
    entry: ["Associate Consultant", "Technology Consultant", "Business Technology Analyst"],
    mid: ["Consultant", "Senior Consultant", "SAP Consultant"],
    senior: ["Manager – Consulting", "Senior Consultant – Cloud"],
    lead: ["Senior Manager – Consulting", "Associate Director"],
    executive: ["Partner", "Director – Consulting"],
  },
  customer_support: {
    intern: ["Customer Support Intern"],
    fresher: ["Customer Support Associate", "Technical Support Associate", "Customer Care Executive"],
    entry: ["Technical Support Engineer", "Customer Success Associate", "Support Engineer L1"],
    mid: ["Customer Success Manager", "Technical Support Engineer II"],
    senior: ["Senior Customer Success Manager", "Support Team Lead"],
    lead: ["Customer Support Manager"],
    executive: ["Head of Customer Experience"],
  },
  core_engineering: {
    intern: ["VLSI Design Intern", "Hardware Engineering Intern", "Embedded Systems Intern"],
    fresher: ["Graduate Engineer Trainee – VLSI", "Associate Hardware Engineer", "Embedded Software Engineer – Fresher"],
    entry: ["VLSI Design Engineer", "Embedded Software Engineer", "Hardware Design Engineer", "Physical Design Engineer", "Design Verification Engineer"],
    mid: ["ASIC Design Engineer", "Design Verification Engineer II", "Embedded Firmware Engineer"],
    senior: ["Senior ASIC Design Engineer", "Senior Embedded Engineer", "Senior Physical Design Engineer"],
    lead: ["Principal Hardware Engineer", "Silicon Architect"],
    executive: ["Director – Silicon Engineering"],
  },
  research: {
    intern: ["Research Intern", "AI Research Intern"],
    fresher: ["Research Associate", "Junior Research Fellow"],
    entry: ["Research Engineer", "Research Associate"],
    mid: ["Research Scientist", "Applied Research Engineer"],
    senior: ["Senior Research Scientist"],
    lead: ["Principal Research Scientist"],
    executive: ["Director of Research"],
  },
  content: {
    intern: ["Content Writing Intern", "Technical Writing Intern"],
    fresher: ["Content Writer", "Junior Copywriter"],
    entry: ["Technical Writer", "Content Writer", "Copywriter"],
    mid: ["Senior Technical Writer", "Content Strategist"],
    senior: ["Senior Content Strategist"],
    lead: ["Documentation Lead", "Editorial Lead"],
    executive: ["Head of Content"],
  },
  legal: {
    intern: ["Legal Intern"],
    fresher: ["Legal Associate – Fresher"],
    entry: ["Legal Associate", "Compliance Analyst"],
    mid: ["Corporate Counsel", "Senior Compliance Analyst"],
    senior: ["Senior Legal Counsel"],
    lead: ["Associate General Counsel"],
    executive: ["Head of Legal", "General Counsel"],
  },
};

/** Team suffixes for experienced engineering/product roles ("Software Engineer II – Payments"). */
export const TEAMS: readonly string[] = [
  "Payments", "Platform", "Growth", "Search", "Ads", "Infrastructure", "Checkout", "Identity", "Data Platform",
  "Mobile", "Developer Experience", "Logistics", "Risk", "Lending", "Merchant", "Catalog", "Notifications",
];

export const TEAM_CATEGORIES: ReadonlySet<JobCategory> = new Set(["software_engineering", "data_ai", "devops_cloud", "product"]);

/* ─────────────────────────── Skills ─────────────────────────── */

export const SKILL_STACKS: Partial<Record<JobCategory, string[][]>> = {
  software_engineering: [
    ["Java", "Spring Boot", "Microservices", "SQL", "Kafka", "AWS", "Docker"],
    ["React", "TypeScript", "JavaScript", "Next.js", "HTML", "CSS", "Redux"],
    ["Node.js", "TypeScript", "React", "MongoDB", "REST APIs", "AWS", "GraphQL"],
    ["Go", "Kubernetes", "gRPC", "PostgreSQL", "Redis", "Docker", "Microservices"],
    ["Python", "Django", "PostgreSQL", "REST APIs", "Celery", "AWS", "Redis"],
    ["Kotlin", "Android", "Jetpack Compose", "Java", "REST APIs", "Git"],
    ["Swift", "iOS", "SwiftUI", "Objective-C", "Git"],
    ["C++", "Data Structures", "Algorithms", "Linux", "Multithreading", "OOP"],
    ["C#", ".NET", "Azure", "SQL Server", "Angular", "Microservices"],
    ["Java", "Python", "SQL", "Data Structures", "OOP", "DBMS", "Git"],
  ],
  data_ai: [
    ["Python", "SQL", "Pandas", "Machine Learning", "Statistics", "Tableau"],
    ["Python", "PyTorch", "Deep Learning", "NLP", "LLMs", "MLOps"],
    ["SQL", "Excel", "Power BI", "Tableau", "Statistics", "Python"],
    ["Spark", "Python", "Airflow", "SQL", "Kafka", "AWS", "dbt"],
    ["Python", "TensorFlow", "Computer Vision", "Deep Learning", "OpenCV"],
  ],
  devops_cloud: [
    ["AWS", "Kubernetes", "Terraform", "Docker", "CI/CD", "Linux"],
    ["GCP", "Kubernetes", "Prometheus", "Grafana", "Go", "Helm"],
    ["Azure", "Ansible", "Jenkins", "Linux", "Bash", "Docker"],
  ],
  security: [
    ["Network Security", "SIEM", "Splunk", "Incident Response", "Linux"],
    ["OWASP", "Penetration Testing", "Burp Suite", "Python", "Threat Modeling"],
    ["Cloud Security", "AWS", "IAM", "Kubernetes", "Python"],
  ],
  qa_testing: [
    ["Selenium", "Java", "TestNG", "API Testing", "Postman", "JIRA"],
    ["Cypress", "Playwright", "JavaScript", "TypeScript", "CI/CD"],
    ["Appium", "Manual Testing", "SQL", "Agile", "JIRA"],
  ],
  product: [
    ["Product Strategy", "SQL", "Analytics", "A/B Testing", "Roadmapping", "Figma"],
    ["User Research", "Mixpanel", "PRDs", "Agile", "Stakeholder Management", "SQL"],
  ],
  design: [
    ["Figma", "Prototyping", "User Research", "Design Systems", "Interaction Design"],
    ["Figma", "Adobe XD", "Illustrator", "Visual Design", "Motion Design"],
  ],
  marketing: [
    ["SEO", "Google Analytics", "Content Marketing", "Social Media", "Copywriting"],
    ["Performance Marketing", "Google Ads", "Meta Ads", "CRM", "Excel"],
    ["Brand Strategy", "Market Research", "Communication", "Canva"],
  ],
  sales: [
    ["B2B Sales", "CRM", "Salesforce", "Negotiation", "Lead Generation", "Communication"],
    ["SaaS Sales", "HubSpot", "Account Management", "Cold Calling", "Communication"],
  ],
  business_ops: [
    ["Excel", "SQL", "Process Improvement", "Stakeholder Management", "Power BI"],
    ["Program Management", "JIRA", "Agile", "Communication", "Analytics"],
  ],
  finance: [
    ["Financial Modeling", "Excel", "Valuation", "Accounting", "PowerPoint"],
    ["Risk Management", "Python", "SQL", "Statistics", "Credit Analysis"],
    ["Tally", "GST", "Accounting", "Excel", "Taxation"],
  ],
  hr: [
    ["Recruitment", "Sourcing", "LinkedIn Recruiter", "Communication", "HRMS"],
    ["Employee Relations", "Payroll", "HR Policies", "Excel", "Communication"],
  ],
  consulting: [
    ["Problem Solving", "Excel", "PowerPoint", "Stakeholder Management", "SQL"],
    ["SAP", "ERP", "Business Analysis", "Agile", "SQL"],
    ["Cloud", "AWS", "Azure", "Solution Architecture", "Java"],
  ],
  customer_support: [
    ["Communication", "CRM", "Zendesk", "Troubleshooting", "English"],
    ["Technical Support", "Linux", "Networking", "Ticketing", "SQL"],
  ],
  core_engineering: [
    ["Verilog", "SystemVerilog", "UVM", "ASIC", "RTL Design", "Perl"],
    ["Embedded C", "RTOS", "Microcontrollers", "C", "Linux Kernel", "Python"],
    ["Physical Design", "STA", "Synopsys", "Cadence", "Tcl"],
  ],
  research: [["Python", "PyTorch", "Machine Learning", "Statistics", "Research", "LLMs"]],
  content: [
    ["Content Writing", "Copywriting", "SEO", "Editing", "WordPress"],
    ["Technical Writing", "Markdown", "API Documentation", "Git"],
  ],
  legal: [["Contract Drafting", "Corporate Law", "Compliance", "Legal Research"]],
};

/** Title keyword → preferred stack index within the category. */
export const STACK_HINTS: { category: JobCategory; pattern: RegExp; stack: number }[] = [
  { category: "software_engineering", pattern: /front|react|ui engineer/i, stack: 1 },
  { category: "software_engineering", pattern: /full stack/i, stack: 2 },
  { category: "software_engineering", pattern: /\(go\)/i, stack: 3 },
  { category: "software_engineering", pattern: /java|backend/i, stack: 0 },
  { category: "software_engineering", pattern: /android|mobile/i, stack: 5 },
  { category: "software_engineering", pattern: /ios/i, stack: 6 },
  { category: "software_engineering", pattern: /trainee|ninja|digital|systems engineer|programmer|genc|elite|exceller/i, stack: 9 },
  { category: "data_ai", pattern: /machine learning|ml |ml$|applied|ai /i, stack: 1 },
  { category: "data_ai", pattern: /data engineer|analytics engineer/i, stack: 3 },
  { category: "data_ai", pattern: /analyst|intelligence/i, stack: 2 },
  { category: "core_engineering", pattern: /embedded|firmware/i, stack: 1 },
  { category: "core_engineering", pattern: /physical/i, stack: 2 },
  { category: "core_engineering", pattern: /vlsi|asic|verification|hardware|silicon/i, stack: 0 },
  { category: "content", pattern: /technical|documentation/i, stack: 1 },
  { category: "finance", pattern: /risk|credit|quant/i, stack: 1 },
  { category: "finance", pattern: /accounts/i, stack: 2 },
];

/** Every skill that can appear (used to encode a forced skill by index). */
export const ALL_SKILLS: readonly string[] = [...new Set(Object.values(SKILL_STACKS).flatMap((stacks) => (stacks ?? []).flat()))].sort();

/* ─────────────────────────── Degrees & departments ─────────────────────────── */

const TECH_DEGREES = ["B.E / B.Tech", "M.E / M.Tech", "MCA", "B.Sc (Computer Science)", "BCA"];

export const DEGREES: Partial<Record<JobCategory, string[]>> = {
  software_engineering: TECH_DEGREES,
  devops_cloud: TECH_DEGREES,
  qa_testing: TECH_DEGREES,
  security: [...TECH_DEGREES, "CEH / OSCP (preferred)"],
  data_ai: ["B.E / B.Tech", "M.E / M.Tech", "M.Sc (Statistics / Mathematics)", "MCA"],
  core_engineering: ["B.E / B.Tech (ECE / EEE)", "M.Tech (VLSI / Embedded)", "B.E / B.Tech (Electrical)"],
  product: ["B.E / B.Tech", "MBA", "Any graduate"],
  design: ["B.Des", "M.Des", "Any graduate with a strong portfolio"],
  marketing: ["Any graduate", "BBA", "MBA (Marketing)"],
  sales: ["Any graduate", "BBA", "MBA"],
  business_ops: ["Any graduate", "B.E / B.Tech", "MBA"],
  hr: ["Any graduate", "MBA (HR)"],
  customer_support: ["Any graduate", "B.E / B.Tech"],
  finance: ["B.Com", "MBA (Finance)", "CA", "CFA (any level)"],
  consulting: ["B.E / B.Tech", "MBA", "Any graduate"],
  research: ["M.Tech", "M.S / Ph.D", "B.E / B.Tech"],
  content: ["BA (English / Journalism / Mass Communication)", "Any graduate"],
  legal: ["LLB", "BA LLB", "LLM"],
};

export const DEPARTMENTS: Partial<Record<JobCategory, string>> = {
  software_engineering: "Engineering", data_ai: "Data Science & Analytics", devops_cloud: "Infrastructure", security: "Security",
  qa_testing: "Quality Engineering", product: "Product", design: "Design", marketing: "Marketing", sales: "Sales",
  business_ops: "Operations", finance: "Finance", hr: "People", consulting: "Consulting", customer_support: "Customer Experience",
  core_engineering: "Silicon Engineering", research: "Research", content: "Content", legal: "Legal",
};

/* ─────────────────────────── Description copy ─────────────────────────── */

export interface CategoryCopy {
  mission: string[];
  responsibilities: string[];
  requirements: string[];
  niceToHave: string[];
}

const GENERIC_COPY: CategoryCopy = {
  mission: ["help the team deliver great outcomes for our customers"],
  responsibilities: [
    "Own well-defined projects from planning to delivery",
    "Collaborate with cross-functional partners across the business",
    "Track outcomes with clear metrics and share learnings with the team",
    "Continuously improve processes, tooling and documentation",
  ],
  requirements: ["Clear written and verbal communication", "Strong ownership and attention to detail", "Comfort working in a fast-moving team"],
  niceToHave: ["Experience in a high-growth company", "Familiarity with the Indian market"],
};

export const CATEGORY_COPY: Partial<Record<JobCategory, CategoryCopy>> = {
  software_engineering: {
    mission: [
      "design, build and scale services used by millions of customers",
      "ship well-tested features end to end, from design docs to production",
      "own core systems and keep them fast, reliable and secure",
    ],
    responsibilities: [
      "Design, build and operate services and features end to end",
      "Write clean, well-tested code and review code written by your peers",
      "Break down ambiguous problems into simple, incremental milestones",
      "Improve performance, reliability and observability of production systems",
      "Collaborate with product managers and designers to ship delightful experiences",
      "Participate in on-call and help the team learn from incidents",
      "Mentor teammates and raise the engineering bar through design reviews",
    ],
    requirements: [
      "Strong fundamentals in data structures, algorithms and system design",
      "Comfort with at least one of Java, Go, Python, TypeScript or C++",
      "Experience with relational databases and REST or gRPC APIs",
      "A habit of writing tests and caring about code quality",
      "Ability to debug across the stack, from the browser to the database",
    ],
    niceToHave: [
      "Experience with distributed systems and event-driven architectures",
      "Contributions to open-source projects",
      "Experience with cloud platforms such as AWS or GCP",
      "Competitive programming or hackathon achievements",
    ],
  },
  data_ai: {
    mission: [
      "turn data into decisions with models, pipelines and dashboards",
      "build machine learning systems for ranking, personalisation and risk",
      "partner with product teams to measure, experiment and learn",
    ],
    responsibilities: [
      "Build and maintain reliable data pipelines and models",
      "Design experiments and analyse results to guide product decisions",
      "Develop dashboards and self-serve datasets for business teams",
      "Train, evaluate and deploy machine learning models to production",
      "Communicate insights clearly to technical and non-technical stakeholders",
      "Monitor data quality and model performance over time",
    ],
    requirements: [
      "Strong SQL and Python skills",
      "Solid grounding in statistics and experimental design",
      "Experience with pandas, scikit-learn or deep learning frameworks",
      "Ability to translate business questions into analytical problems",
      "Clear storytelling with data",
    ],
    niceToHave: ["Experience with Spark, Airflow or dbt", "Hands-on work with LLMs or recommendation systems", "Kaggle or research publications"],
  },
  devops_cloud: {
    mission: [
      "keep our infrastructure fast, secure and cost-efficient",
      "build the platforms, pipelines and tooling every engineer relies on",
      "improve reliability through automation and great incident response",
    ],
    responsibilities: [
      "Build and operate cloud infrastructure using infrastructure as code",
      "Maintain CI/CD pipelines that let teams ship safely many times a day",
      "Improve monitoring, alerting and on-call runbooks",
      "Drive reliability reviews and capacity planning",
      "Automate repetitive operational work",
    ],
    requirements: [
      "Hands-on experience with AWS, GCP or Azure",
      "Comfort with Linux, networking fundamentals and scripting",
      "Experience with Docker and Kubernetes",
      "Familiarity with Terraform, Ansible or similar tools",
    ],
    niceToHave: ["Cloud certifications (AWS / GCP / Azure)", "Experience running large Kubernetes clusters", "Experience with service meshes"],
  },
  security: {
    mission: ["protect our customers, systems and data", "find and fix vulnerabilities before attackers do", "build security into how we ship software"],
    responsibilities: [
      "Perform security reviews, threat modelling and penetration tests",
      "Monitor, triage and respond to security alerts and incidents",
      "Partner with engineering teams to fix vulnerabilities quickly",
      "Build tooling that automates security checks in CI/CD",
      "Contribute to security awareness and secure coding guidelines",
    ],
    requirements: [
      "Understanding of the OWASP Top 10 and common attack techniques",
      "Experience with SIEM, EDR or vulnerability scanning tools",
      "Scripting skills in Python or Bash",
      "A curious, methodical approach to problem solving",
    ],
    niceToHave: ["Certifications such as OSCP, CEH or CISSP", "Bug bounty or CTF experience", "Cloud security experience"],
  },
  qa_testing: {
    mission: ["make quality everyone's job through great automation", "build test frameworks that catch bugs before customers do"],
    responsibilities: [
      "Design test plans and automate regression suites",
      "Build and maintain UI and API test frameworks",
      "Integrate automated tests into CI/CD pipelines",
      "Triage defects and work with developers on root causes",
      "Own release quality for critical user journeys",
    ],
    requirements: [
      "Experience with Selenium, Cypress, Playwright or Appium",
      "Programming skills in Java, Python or JavaScript",
      "Good understanding of testing types and the SDLC",
      "Strong attention to detail",
    ],
    niceToHave: ["Performance testing with JMeter or k6", "Experience testing payment or mobile apps"],
  },
  product: {
    mission: ["define what we build and why, with customers at the centre", "turn customer problems into clear roadmaps and great launches"],
    responsibilities: [
      "Talk to customers and synthesise their problems into clear opportunities",
      "Write crisp product requirement documents and prioritise the roadmap",
      "Work closely with engineering and design from discovery to launch",
      "Define success metrics and run experiments",
      "Communicate plans and progress to leadership and partner teams",
    ],
    requirements: [
      "Strong analytical skills and comfort with SQL or analytics tools",
      "Excellent written and verbal communication",
      "Ability to make trade-offs with incomplete information",
      "Genuine empathy for users",
    ],
    niceToHave: ["An engineering or design background", "Experience with consumer or fintech products in India"],
  },
  design: {
    mission: ["craft simple, beautiful and accessible product experiences", "turn complex workflows into intuitive interfaces"],
    responsibilities: [
      "Design end-to-end flows, from early sketches to high-fidelity prototypes",
      "Run usability studies and iterate based on what you learn",
      "Contribute to and evolve our design system",
      "Partner with product managers and engineers through delivery",
      "Present and defend design decisions with clarity",
    ],
    requirements: [
      "A portfolio that shows strong interaction and visual design",
      "Fluency in Figma and prototyping tools",
      "Understanding of accessibility and responsive design",
      "Ability to give and receive thoughtful feedback",
    ],
    niceToHave: ["Motion design skills", "Experience designing for mobile-first Indian users"],
  },
  marketing: {
    mission: ["grow our brand and reach new customers", "tell our story through content, community and data-driven growth"],
    responsibilities: [
      "Plan and run campaigns across digital, social and email channels",
      "Create content that educates and converts",
      "Analyse campaign performance and optimise spend",
      "Work with product and sales teams on launches",
      "Manage agencies and creators where needed",
    ],
    requirements: [
      "Strong writing and communication skills",
      "Comfort with Google Analytics, Meta Ads or similar tools",
      "A data-driven approach to experimentation",
      "Creativity and a strong sense of brand",
    ],
    niceToHave: ["Experience marketing to students or young professionals", "Video editing or design skills"],
  },
  sales: {
    mission: ["bring our products to new customers and grow key accounts", "drive revenue through consultative, customer-first selling"],
    responsibilities: [
      "Prospect and qualify new business opportunities",
      "Run discovery calls and product demos",
      "Negotiate and close deals with decision makers",
      "Maintain an accurate pipeline in the CRM",
      "Build long-term relationships with customers",
    ],
    requirements: [
      "Excellent communication and negotiation skills",
      "Self-motivated with a strong sense of ownership",
      "Comfort with CRM tools such as Salesforce or HubSpot",
      "Willingness to travel to meet customers when needed",
    ],
    niceToHave: ["Experience selling SaaS or fintech products", "Fluency in Hindi or a regional language"],
  },
  business_ops: {
    mission: ["make the business run better with data and great execution", "drive cross-functional programs from idea to impact"],
    responsibilities: [
      "Analyse operational data to find bottlenecks and opportunities",
      "Design and roll out process improvements",
      "Drive cross-functional programs with clear milestones",
      "Build reports and dashboards for leadership",
      "Coordinate with vendors and partner teams",
    ],
    requirements: ["Strong Excel or Google Sheets skills", "Structured problem solving", "Clear communication with stakeholders", "Bias for action"],
    niceToHave: ["SQL or Power BI experience", "Experience in e-commerce, logistics or fintech operations"],
  },
  finance: {
    mission: ["support strategic decisions with rigorous analysis", "model, analyse and manage financial risk"],
    responsibilities: [
      "Build financial models, forecasts and valuations",
      "Prepare reports and presentations for senior stakeholders",
      "Analyse market, credit or operational risk",
      "Support audits, compliance and month-end processes",
      "Partner with business teams on pricing and investment decisions",
    ],
    requirements: [
      "Strong grasp of accounting and corporate finance",
      "Advanced Excel and financial modelling skills",
      "Attention to detail and integrity",
      "Clear communication of complex numbers",
    ],
    niceToHave: ["CFA / FRM progress", "Python or SQL for analysis"],
  },
  hr: {
    mission: ["hire and grow exceptional people", "build a great experience for every employee"],
    responsibilities: [
      "Run end-to-end hiring for assigned roles",
      "Partner with managers on workforce planning and onboarding",
      "Support performance, engagement and learning programs",
      "Maintain accurate HR records and policies",
    ],
    requirements: ["Excellent interpersonal and communication skills", "Discretion with confidential information", "Organised and detail-oriented"],
    niceToHave: ["Experience with HRMS tools", "Campus hiring experience"],
  },
  consulting: {
    mission: ["help clients solve their toughest business and technology problems", "turn strategy into working solutions for clients"],
    responsibilities: [
      "Work with client teams to understand requirements and constraints",
      "Analyse data and processes to recommend improvements",
      "Configure, build or implement solutions with delivery teams",
      "Prepare clear client presentations and status reports",
      "Contribute to proposals and practice development",
    ],
    requirements: [
      "Strong analytical and problem-solving skills",
      "Excellent communication and presentation skills",
      "Ability to work in client-facing, fast-paced environments",
      "Willingness to learn new tools and domains quickly",
    ],
    niceToHave: ["Experience with SAP, Salesforce or cloud platforms", "Industry certifications"],
  },
  customer_support: {
    mission: ["make every customer interaction fast, friendly and helpful", "solve technical issues for customers and partners"],
    responsibilities: [
      "Resolve customer queries over chat, email and phone",
      "Troubleshoot technical issues and escalate when needed",
      "Document solutions in the knowledge base",
      "Share customer feedback with product teams",
    ],
    requirements: ["Excellent spoken and written English", "Patience and empathy", "Basic technical aptitude", "Willingness to work in rotational shifts"],
    niceToHave: ["Fluency in Hindi or a regional language", "Experience with Zendesk or Freshdesk"],
  },
  core_engineering: {
    mission: ["design and verify the silicon behind next-generation devices", "take chips from RTL to tape-out with world-class teams"],
    responsibilities: [
      "Develop RTL, firmware or physical design for complex SoCs",
      "Write test benches and verification plans",
      "Debug silicon and system-level issues in the lab",
      "Collaborate with architecture, verification and software teams",
      "Drive timing, power and area improvements",
    ],
    requirements: [
      "Strong fundamentals in digital electronics and computer architecture",
      "Experience with Verilog / SystemVerilog or embedded C",
      "Familiarity with EDA tools from Synopsys or Cadence",
      "Scripting in Python, Perl or Tcl",
    ],
    niceToHave: ["UVM methodology experience", "Experience with low-power design", "Published research or patents"],
  },
  research: {
    mission: ["push the state of the art and turn research into products", "explore hard problems with world-class researchers"],
    responsibilities: [
      "Design and run experiments on challenging research problems",
      "Publish at top venues and share findings internally",
      "Prototype ideas and collaborate with product teams to ship them",
      "Mentor interns and junior researchers",
    ],
    requirements: [
      "Strong background in machine learning, mathematics or a related field",
      "Proficiency in Python and deep learning frameworks",
      "A track record of research (publications, theses or open-source)",
    ],
    niceToHave: ["Publications at NeurIPS, ICML, ACL or CVPR", "Experience training large models"],
  },
  content: {
    mission: ["explain complex products in clear, simple words", "own documentation that people love to read"],
    responsibilities: [
      "Write and edit articles, guides and product documentation",
      "Work with subject-matter experts to get the details right",
      "Optimise content for search and readability",
      "Maintain a consistent voice and style",
    ],
    requirements: ["Excellent written English", "Strong research skills", "Attention to detail", "Ability to meet deadlines"],
    niceToHave: ["Experience writing for developers", "Basic HTML / Markdown knowledge"],
  },
  legal: {
    mission: ["keep the business compliant while helping it move fast", "advise on contracts, regulation and policy"],
    responsibilities: ["Draft and review commercial contracts", "Advise teams on regulatory requirements", "Track changes in relevant regulation", "Support disputes and audits"],
    requirements: ["A law degree from a recognised university", "Strong drafting and research skills", "Sound judgement"],
    niceToHave: ["Experience with fintech or RBI regulation", "Enrolment with the Bar Council of India"],
  },
};

export function copyFor(category: JobCategory): CategoryCopy {
  return CATEGORY_COPY[category] ?? GENERIC_COPY;
}

export const PERKS: Record<"growth" | "enterprise" | "services" | "intern", string[]> = {
  growth: [
    "Competitive salary with meaningful ESOPs",
    "Comprehensive health insurance for you and your family",
    "Flexible hours and a hybrid-friendly culture",
    "Annual learning budget for courses, books and conferences",
    "Latest MacBook and a home-office setup allowance",
    "Free meals and snacks at the office",
  ],
  enterprise: [
    "Industry-leading compensation and annual bonus",
    "Medical, life and accident insurance for you and your dependants",
    "Generous parental leave and wellness programs",
    "Internal mobility across teams and geographies",
    "Learning platforms and tuition reimbursement",
    "Employee stock purchase plan",
  ],
  services: [
    "Structured training program for new joiners",
    "Health insurance for you and your family",
    "Opportunities to work with global clients",
    "Certification sponsorship and learning portals",
    "Transport and meal facilities at select offices",
    "Clear career progression framework",
  ],
  intern: [
    "Monthly stipend paid on time",
    "Pre-placement offer (PPO) for top performers",
    "Mentorship from experienced engineers and managers",
    "Work on real projects that ship to customers",
    "Flexible hours and an inclusive intern community",
    "Internship certificate and letter of recommendation",
  ],
};
