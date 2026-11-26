/**
 * Deterministic synthetic JobInputs for dev seeding, tests and benchmarks.
 * Realistic companies (with ATS / career-site URL patterns), weighted Indian cities, levels, batches,
 * salaries/stipends and sources — plus deliberate cross-source duplicates that exercise merging:
 *  - board posts (CourseJoiner, LinkedIn, Naukri, Unstop) that link to the official posting → same "k:" fingerprint
 *  - board-only jobs re-posted on a second board → same "t:" fingerprint
 */
import { createHash } from "node:crypto";
import { slugify, type CompanyTarget, type ExperienceLevel, type JobCategory, type JobInput, type JobLocation, type JobType, type Salary, type SourceKind, type WorkMode } from "@easyjobs/contract";

/* ─────────────── PRNG ─────────────── */

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

class Rng {
  constructor(private readonly next: () => number) {}
  float(): number {
    return this.next();
  }
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }
  chance(p: number): boolean {
    return this.next() < p;
  }
  pick<T>(xs: readonly T[]): T {
    return xs[Math.floor(this.next() * xs.length)]!;
  }
  weighted<T>(xs: readonly (readonly [T, number])[]): T {
    const total = xs.reduce((s, [, w]) => s + w, 0);
    let r = this.next() * total;
    for (const [v, w] of xs) {
      r -= w;
      if (r <= 0) return v;
    }
    return xs[xs.length - 1]![0];
  }
  sample<T>(xs: readonly T[], n: number): T[] {
    const copy = [...xs];
    const out: T[] = [];
    while (out.length < n && copy.length > 0) out.push(copy.splice(Math.floor(this.next() * copy.length), 1)[0]!);
    return out;
  }
  hex(n: number): string {
    let s = "";
    for (let i = 0; i < n; i++) s += Math.floor(this.next() * 16).toString(16);
    return s;
  }
  uuid(): string {
    return `${this.hex(8)}-${this.hex(4)}-4${this.hex(3)}-a${this.hex(3)}-${this.hex(12)}`;
  }
}

/* ─────────────── reference data ─────────────── */

type Ats = "greenhouse" | "lever" | "ashby" | "workday" | "smartrecruiters" | "career_site";
interface SeedCompany {
  name: string;
  domain: string;
  tags: string[];
  ats: Ats;
  hq: string;
  weight: number;
  /** career-site source id (for ats = career_site) */
  site?: string;
}

const C = (name: string, domain: string, tags: string[], ats: Ats, hq: string, weight = 1, site?: string): SeedCompany => ({ name, domain, tags, ats, hq, weight, site });

export const SEED_COMPANIES: readonly SeedCompany[] = [
  C("Google", "google.com", ["big_tech", "mnc", "product", "ai"], "career_site", "Mountain View, US", 4, "google"),
  C("Microsoft", "microsoft.com", ["big_tech", "mnc", "product", "ai"], "career_site", "Redmond, US", 4, "microsoft"),
  C("Amazon", "amazon.com", ["big_tech", "mnc", "product"], "career_site", "Seattle, US", 5, "amazon"),
  C("Meta", "meta.com", ["big_tech", "mnc", "product", "ai"], "career_site", "Menlo Park, US", 1.5, "meta"),
  C("Apple", "apple.com", ["big_tech", "mnc", "product"], "career_site", "Cupertino, US", 1.5, "apple"),
  C("Adobe", "adobe.com", ["mnc", "product"], "workday", "San Jose, US", 2),
  C("Salesforce", "salesforce.com", ["mnc", "product"], "workday", "San Francisco, US", 2),
  C("Atlassian", "atlassian.com", ["mnc", "product"], "smartrecruiters", "Sydney, AU", 1.5),
  C("Uber", "uber.com", ["mnc", "product"], "career_site", "San Francisco, US", 1.5, "uber"),
  C("NVIDIA", "nvidia.com", ["mnc", "product", "ai"], "workday", "Santa Clara, US", 2),
  C("Intel", "intel.com", ["mnc", "product"], "workday", "Santa Clara, US", 1.5),
  C("Qualcomm", "qualcomm.com", ["mnc", "product"], "workday", "San Diego, US", 1.5),
  C("Cisco", "cisco.com", ["mnc", "product"], "workday", "San Jose, US", 1.5),
  C("Oracle", "oracle.com", ["mnc", "product"], "career_site", "Austin, US", 2, "oracle"),
  C("SAP", "sap.com", ["mnc", "product"], "smartrecruiters", "Walldorf, DE", 1.5),
  C("Walmart Global Tech", "walmart.com", ["mnc", "gcc"], "workday", "Bentonville, US", 2),
  C("Goldman Sachs", "goldmansachs.com", ["mnc", "bank", "gcc"], "career_site", "New York, US", 2, "goldman-sachs"),
  C("JPMorgan Chase", "jpmorganchase.com", ["mnc", "bank", "gcc"], "career_site", "New York, US", 2.5, "jpmorgan"),
  C("Morgan Stanley", "morganstanley.com", ["mnc", "bank", "gcc"], "career_site", "New York, US", 1.5, "morgan-stanley"),
  C("American Express", "americanexpress.com", ["mnc", "bank", "fintech"], "workday", "New York, US", 1.2),
  C("Visa", "visa.com", ["mnc", "fintech"], "smartrecruiters", "San Francisco, US", 1.2),
  C("Mastercard", "mastercard.com", ["mnc", "fintech"], "workday", "Purchase, US", 1.2),
  C("PayPal", "paypal.com", ["mnc", "fintech", "product"], "workday", "San Jose, US", 1.2),
  C("Intuit", "intuit.com", ["mnc", "product", "fintech"], "workday", "Mountain View, US", 1.2),
  C("ServiceNow", "servicenow.com", ["mnc", "product"], "smartrecruiters", "Santa Clara, US", 1),
  C("Texas Instruments", "ti.com", ["mnc", "product"], "workday", "Dallas, US", 1),
  C("Flipkart", "flipkart.com", ["unicorn", "product"], "career_site", "Bengaluru, IN", 3, "flipkart"),
  C("Razorpay", "razorpay.com", ["unicorn", "startup", "fintech", "product"], "lever", "Bengaluru, IN", 2),
  C("Swiggy", "swiggy.com", ["unicorn", "product"], "lever", "Bengaluru, IN", 2),
  C("Zomato", "zomato.com", ["unicorn", "product"], "greenhouse", "Gurugram, IN", 2),
  C("CRED", "cred.club", ["unicorn", "startup", "fintech", "product"], "lever", "Bengaluru, IN", 1.5),
  C("Zepto", "zeptonow.com", ["unicorn", "startup", "product"], "lever", "Mumbai, IN", 1.5),
  C("Meesho", "meesho.com", ["unicorn", "startup", "product"], "lever", "Bengaluru, IN", 1.5),
  C("PhonePe", "phonepe.com", ["unicorn", "fintech", "product"], "greenhouse", "Bengaluru, IN", 2),
  C("Groww", "groww.in", ["unicorn", "startup", "fintech", "product"], "greenhouse", "Bengaluru, IN", 1.5),
  C("Paytm", "paytm.com", ["fintech", "product"], "career_site", "Noida, IN", 1.5, "paytm"),
  C("Freshworks", "freshworks.com", ["product", "unicorn"], "smartrecruiters", "Chennai, IN", 1.5),
  C("Zoho", "zoho.com", ["product"], "career_site", "Chennai, IN", 2, "zoho"),
  C("Postman", "postman.com", ["unicorn", "startup", "product"], "greenhouse", "Bengaluru, IN", 1),
  C("BrowserStack", "browserstack.com", ["unicorn", "startup", "product"], "greenhouse", "Mumbai, IN", 1),
  C("Dream11", "dream11.com", ["unicorn", "product"], "lever", "Mumbai, IN", 1),
  C("ShareChat", "sharechat.com", ["unicorn", "startup", "product"], "lever", "Bengaluru, IN", 0.8),
  C("upGrad", "upgrad.com", ["unicorn", "startup"], "lever", "Mumbai, IN", 0.8),
  C("PhysicsWallah", "pw.live", ["unicorn", "startup"], "lever", "Noida, IN", 0.8),
  C("InMobi", "inmobi.com", ["unicorn", "product", "ai"], "greenhouse", "Bengaluru, IN", 0.8),
  C("Myntra", "myntra.com", ["product"], "career_site", "Bengaluru, IN", 1, "myntra"),
  C("Nykaa", "nykaa.com", ["unicorn", "product"], "lever", "Mumbai, IN", 0.8),
  C("Lenskart", "lenskart.com", ["unicorn", "product"], "lever", "Gurugram, IN", 0.8),
  C("Urban Company", "urbancompany.com", ["unicorn", "startup", "product"], "lever", "Gurugram, IN", 0.8),
  C("Rapido", "rapido.bike", ["unicorn", "startup"], "lever", "Bengaluru, IN", 0.7),
  C("Juspay", "juspay.in", ["startup", "fintech", "product"], "lever", "Bengaluru, IN", 0.7),
  C("Chargebee", "chargebee.com", ["unicorn", "startup", "product"], "greenhouse", "Chennai, IN", 0.7),
  C("Ola", "olacabs.com", ["unicorn", "product"], "career_site", "Bengaluru, IN", 1, "ola"),
  C("Sarvam AI", "sarvam.ai", ["startup", "ai"], "ashby", "Bengaluru, IN", 0.5),
  C("Krutrim", "olakrutrim.com", ["startup", "ai"], "ashby", "Bengaluru, IN", 0.5),
  C("OpenAI", "openai.com", ["startup", "ai", "product"], "ashby", "San Francisco, US", 0.4),
  C("Anthropic", "anthropic.com", ["startup", "ai", "product"], "greenhouse", "San Francisco, US", 0.4),
  C("Vercel", "vercel.com", ["startup", "product"], "ashby", "San Francisco, US", 0.4),
  C("Supabase", "supabase.com", ["startup", "yc", "product"], "ashby", "Singapore, SG", 0.4),
  C("Deel", "deel.com", ["startup", "unicorn", "yc"], "ashby", "San Francisco, US", 0.5),
  C("Rippling", "rippling.com", ["startup", "unicorn", "yc"], "ashby", "San Francisco, US", 0.5),
  C("TCS", "tcs.com", ["indian_it", "service", "mnc"], "career_site", "Mumbai, IN", 5, "tcs"),
  C("Infosys", "infosys.com", ["indian_it", "service", "mnc"], "career_site", "Bengaluru, IN", 4.5, "infosys"),
  C("Wipro", "wipro.com", ["indian_it", "service", "mnc"], "career_site", "Bengaluru, IN", 3.5, "wipro"),
  C("HCLTech", "hcltech.com", ["indian_it", "service", "mnc"], "career_site", "Noida, IN", 3, "hcltech"),
  C("Tech Mahindra", "techmahindra.com", ["indian_it", "service", "mnc"], "career_site", "Pune, IN", 2.5, "techmahindra"),
  C("LTIMindtree", "ltimindtree.com", ["indian_it", "service", "mnc"], "career_site", "Mumbai, IN", 2, "ltimindtree"),
  C("Cognizant", "cognizant.com", ["service", "mnc"], "workday", "Teaneck, US", 3),
  C("Capgemini", "capgemini.com", ["service", "mnc", "consulting"], "workday", "Paris, FR", 2.5),
  C("Accenture", "accenture.com", ["service", "mnc", "consulting"], "workday", "Dublin, IE", 3.5),
  C("Deloitte", "deloitte.com", ["consulting", "mnc"], "workday", "London, GB", 2.5),
  C("EY", "ey.com", ["consulting", "mnc"], "workday", "London, GB", 2),
  C("PwC", "pwc.com", ["consulting", "mnc"], "workday", "London, GB", 2),
  C("KPMG", "kpmg.com", ["consulting", "mnc"], "workday", "Amstelveen, NL", 1.5),
  C("IBM", "ibm.com", ["mnc", "service", "product"], "career_site", "Armonk, US", 2, "ibm"),
  C("Larsen & Toubro", "larsentoubro.com", ["mnc"], "career_site", "Mumbai, IN", 1.5, "lnt"),
  C("Bosch", "bosch.com", ["mnc", "gcc"], "smartrecruiters", "Gerlingen, DE", 1.2),
  C("Siemens", "siemens.com", ["mnc", "gcc"], "workday", "Munich, DE", 1.2),
  C("Honeywell", "honeywell.com", ["mnc", "gcc"], "workday", "Charlotte, US", 1),
  C("HDFC Bank", "hdfcbank.com", ["bank"], "career_site", "Mumbai, IN", 1.5, "hdfc"),
  C("ICICI Bank", "icicibank.com", ["bank"], "career_site", "Mumbai, IN", 1.2, "icici"),
  C("State Bank of India", "sbi.co.in", ["bank", "psu", "govt"], "career_site", "Mumbai, IN", 0.8, "sbi"),
  C("ISRO", "isro.gov.in", ["psu", "govt"], "career_site", "Bengaluru, IN", 0.4, "isro"),
  C("Swiggy Instamart", "swiggy.com", ["unicorn", "product"], "lever", "Bengaluru, IN", 0.4),
  C("Acko", "acko.com", ["unicorn", "startup", "fintech"], "lever", "Bengaluru, IN", 0.5),
  C("Zerodha", "zerodha.com", ["fintech", "product"], "career_site", "Bengaluru, IN", 0.5, "zerodha"),
  C("Unacademy", "unacademy.com", ["unicorn", "startup"], "lever", "Bengaluru, IN", 0.5),
  C("Delhivery", "delhivery.com", ["unicorn", "product"], "lever", "Gurugram, IN", 0.7),
  C("MakeMyTrip", "makemytrip.com", ["product"], "career_site", "Gurugram, IN", 0.7, "makemytrip"),
  C("Thoughtworks", "thoughtworks.com", ["service", "mnc", "consulting"], "greenhouse", "Chicago, US", 1),
];

const SOURCE_NAMES: Record<string, string> = {
  greenhouse: "Greenhouse", lever: "Lever", ashby: "Ashby", workday: "Workday", smartrecruiters: "SmartRecruiters",
  google: "Google Careers", microsoft: "Microsoft Careers", amazon: "Amazon Jobs", meta: "Meta Careers", apple: "Apple Jobs",
  uber: "Uber Careers", oracle: "Oracle Careers", "goldman-sachs": "Goldman Sachs Careers", jpmorgan: "JPMorgan Chase Careers",
  "morgan-stanley": "Morgan Stanley Careers", flipkart: "Flipkart Careers", paytm: "Paytm Careers", zoho: "Zoho Careers",
  myntra: "Myntra Careers", ola: "Ola Careers", tcs: "TCS Careers", infosys: "Infosys Careers", wipro: "Wipro Careers",
  hcltech: "HCLTech Careers", techmahindra: "Tech Mahindra Careers", ltimindtree: "LTIMindtree Careers", ibm: "IBM Careers",
  lnt: "L&T Careers", hdfc: "HDFC Bank Careers", icici: "ICICI Bank Careers", sbi: "SBI Careers", isro: "ISRO Careers",
  zerodha: "Zerodha Careers", makemytrip: "MakeMyTrip Careers",
  coursejoiner: "CourseJoiner", internshala: "Internshala", linkedin: "LinkedIn", naukri: "Naukri", unstop: "Unstop",
  remoteok: "Remote OK", adzuna: "Adzuna",
};

type City = readonly [city: string, state: string | null, country: string, weight: number];
const CITIES: readonly City[] = [
  ["Bengaluru", "Karnataka", "IN", 28], ["Hyderabad", "Telangana", "IN", 14], ["Pune", "Maharashtra", "IN", 11],
  ["Chennai", "Tamil Nadu", "IN", 9], ["Mumbai", "Maharashtra", "IN", 9], ["Gurugram", "Haryana", "IN", 8],
  ["Noida", "Uttar Pradesh", "IN", 6], ["Delhi", "Delhi", "IN", 3], ["Kolkata", "West Bengal", "IN", 2],
  ["Ahmedabad", "Gujarat", "IN", 2], ["Kochi", "Kerala", "IN", 1], ["Jaipur", "Rajasthan", "IN", 1],
  ["Indore", "Madhya Pradesh", "IN", 1], ["Coimbatore", "Tamil Nadu", "IN", 1], ["Chandigarh", "Chandigarh", "IN", 1],
  ["Thiruvananthapuram", "Kerala", "IN", 0.6], ["Bhubaneswar", "Odisha", "IN", 0.6], ["Mysuru", "Karnataka", "IN", 0.4],
  ["Singapore", null, "SG", 0.8], ["London", "England", "GB", 0.6], ["San Francisco", "California", "US", 0.6],
  ["New York", "New York", "US", 0.5], ["Dublin", null, "IE", 0.3], ["Berlin", null, "DE", 0.3], ["Toronto", "Ontario", "CA", 0.3],
  ["Dubai", null, "AE", 0.3],
];
/** Raw spellings boards use (normalised city stays canonical). */
const RAW_ALIASES: Record<string, string[]> = {
  Bengaluru: ["Bangalore", "Bengaluru, Karnataka", "Bangalore Urban"], Gurugram: ["Gurgaon", "Gurugram, Haryana"],
  Mumbai: ["Mumbai, Maharashtra", "Bombay"], Chennai: ["Chennai, Tamil Nadu"], Hyderabad: ["Hyderabad, Telangana", "Secunderabad"],
};

const CATEGORY_WEIGHTS: readonly (readonly [JobCategory, number])[] = [
  ["software_engineering", 34], ["data_ai", 12], ["devops_cloud", 6], ["qa_testing", 5], ["security", 2.5], ["product", 4],
  ["design", 3], ["marketing", 5], ["sales", 6], ["business_ops", 6], ["finance", 4], ["hr", 2.5], ["consulting", 3],
  ["customer_support", 3], ["core_engineering", 3], ["research", 1], ["content", 2], ["legal", 0.6], ["healthcare", 0.4], ["education", 0.6],
];

const ROLES: Record<JobCategory, readonly string[]> = {
  software_engineering: ["Software Engineer", "Backend Engineer", "Frontend Engineer", "Full Stack Developer", "Software Development Engineer", "Android Developer", "iOS Developer", "Java Developer", "Python Developer", "React Developer", "Node.js Developer", "Golang Developer", "Mobile Engineer", "C++ Developer", ".NET Developer"],
  data_ai: ["Data Analyst", "Data Scientist", "Machine Learning Engineer", "Data Engineer", "AI Engineer", "Business Intelligence Analyst", "NLP Engineer", "Analytics Engineer", "Computer Vision Engineer"],
  devops_cloud: ["DevOps Engineer", "Site Reliability Engineer", "Cloud Engineer", "Platform Engineer", "Cloud Support Engineer"],
  security: ["Security Engineer", "SOC Analyst", "Application Security Engineer", "Cyber Security Analyst"],
  qa_testing: ["QA Engineer", "Automation Test Engineer", "SDET", "Manual Tester", "Performance Test Engineer"],
  product: ["Product Manager", "Associate Product Manager", "Product Analyst", "Technical Product Manager"],
  design: ["Product Designer", "UI/UX Designer", "Graphic Designer", "Visual Designer"],
  marketing: ["Digital Marketing Executive", "Content Marketing Specialist", "Growth Marketer", "SEO Analyst", "Brand Manager", "Performance Marketing Manager"],
  sales: ["Business Development Executive", "Sales Associate", "Account Executive", "Inside Sales Representative", "Key Account Manager"],
  business_ops: ["Operations Analyst", "Business Analyst", "Program Manager", "Supply Chain Analyst", "Strategy Analyst"],
  finance: ["Financial Analyst", "Accountant", "Investment Banking Analyst", "Risk Analyst", "Credit Analyst"],
  hr: ["HR Executive", "Talent Acquisition Specialist", "HR Business Partner", "Recruiter"],
  consulting: ["Associate Consultant", "Technology Consultant", "Management Consultant", "SAP Consultant"],
  customer_support: ["Customer Support Executive", "Technical Support Engineer", "Customer Success Manager"],
  core_engineering: ["Mechanical Engineer", "Electrical Engineer", "VLSI Design Engineer", "Embedded Software Engineer", "Civil Engineer", "Hardware Engineer"],
  research: ["Research Scientist", "Research Engineer", "Applied Scientist"],
  content: ["Content Writer", "Technical Writer", "Copywriter", "Video Editor"],
  legal: ["Legal Associate", "Compliance Analyst", "Company Secretary"],
  healthcare: ["Clinical Data Analyst", "Medical Coder", "Pharmacovigilance Associate"],
  education: ["Academic Counsellor", "Subject Matter Expert", "Instructional Designer"],
  other: ["Associate", "Analyst"],
};

const SKILLS: Record<JobCategory, readonly string[]> = {
  software_engineering: ["Java", "Python", "JavaScript", "TypeScript", "React", "Node.js", "Go", "C++", "Spring Boot", "SQL", "AWS", "Docker", "Kubernetes", "Microservices", "REST APIs", "Git", "Kotlin", "Swift", "Next.js", "PostgreSQL", "MongoDB", "Redis", "Kafka", "GraphQL", "C#", ".NET", "System Design", "Data Structures"],
  data_ai: ["Python", "SQL", "Machine Learning", "Deep Learning", "PyTorch", "TensorFlow", "Pandas", "NumPy", "Spark", "Tableau", "Power BI", "Excel", "Statistics", "NLP", "LLMs", "Airflow", "Snowflake", "dbt", "Scikit-learn", "Computer Vision"],
  devops_cloud: ["AWS", "Azure", "GCP", "Kubernetes", "Docker", "Terraform", "Linux", "CI/CD", "Jenkins", "Ansible", "Prometheus", "Python", "Bash", "Networking"],
  security: ["Network Security", "SIEM", "Penetration Testing", "OWASP", "Python", "Linux", "Cloud Security", "IAM"],
  qa_testing: ["Selenium", "Java", "Python", "Cypress", "Playwright", "API Testing", "JMeter", "Postman", "SQL", "Appium"],
  product: ["Product Management", "SQL", "Analytics", "Jira", "A/B Testing", "Figma", "User Research", "Roadmapping"],
  design: ["Figma", "Adobe XD", "Photoshop", "Illustrator", "Prototyping", "User Research", "Design Systems"],
  marketing: ["SEO", "Google Ads", "Social Media Marketing", "Content Marketing", "Google Analytics", "Email Marketing", "Excel", "Copywriting"],
  sales: ["B2B Sales", "CRM", "Salesforce", "Negotiation", "Lead Generation", "Communication", "Excel"],
  business_ops: ["Excel", "SQL", "Power BI", "Stakeholder Management", "Process Improvement", "Tableau", "Project Management"],
  finance: ["Excel", "Financial Modeling", "Accounting", "Tally", "Valuation", "Risk Management", "SAP"],
  hr: ["Recruitment", "Sourcing", "HRMS", "Employee Engagement", "Communication", "Excel"],
  consulting: ["SAP", "Excel", "PowerPoint", "Stakeholder Management", "Business Analysis", "SQL"],
  customer_support: ["Communication", "CRM", "Zendesk", "Troubleshooting", "Excel"],
  core_engineering: ["AutoCAD", "SolidWorks", "MATLAB", "Verilog", "Embedded C", "PLC", "ANSYS", "Circuit Design"],
  research: ["Python", "PyTorch", "Machine Learning", "Statistics", "Research", "C++"],
  content: ["Content Writing", "Copywriting", "SEO", "WordPress", "Editing"],
  legal: ["Contract Drafting", "Compliance", "Legal Research", "Corporate Law"],
  healthcare: ["Medical Coding", "Clinical Research", "Excel"],
  education: ["Teaching", "Communication", "Instructional Design"],
  other: ["Communication", "Excel"],
};

const DEGREES: Record<string, readonly string[]> = {
  tech: ["B.E/B.Tech", "M.E/M.Tech", "MCA", "BCA", "B.Sc"],
  biz: ["MBA", "BBA", "B.Com", "Any graduate"],
  core: ["B.E/B.Tech", "M.E/M.Tech", "Diploma"],
};

const LEVEL_WEIGHTS: readonly (readonly [ExperienceLevel, number])[] = [
  ["intern", 15], ["fresher", 15], ["entry", 25], ["mid", 22], ["senior", 13], ["lead", 7], ["executive", 3],
];

const EXP: Record<ExperienceLevel, readonly [number | null, number | null]> = {
  intern: [0, 0], fresher: [0, 1], entry: [0, 2], mid: [2, 5], senior: [5, 8], lead: [8, 12], executive: [12, null],
};
/** INR LPA ranges by level (full-time). */
const LPA: Record<ExperienceLevel, readonly [number, number]> = {
  intern: [0, 0], fresher: [3, 12], entry: [4, 18], mid: [10, 35], senior: [20, 60], lead: [40, 95], executive: [70, 200],
};

function titleFor(rng: Rng, role: string, level: ExperienceLevel, category: JobCategory): string {
  const eng = category === "software_engineering" || category === "qa_testing" || category === "devops_cloud" || category === "data_ai";
  switch (level) {
    case "intern":
      return rng.pick([`${role} Intern`, `Intern - ${role}`, `${role} Internship`, `Summer Intern - ${role}`]);
    case "fresher":
      return rng.pick(eng ? [`Graduate Engineer Trainee`, `${role} - Fresher`, `Associate ${role}`, `${role} (New Grad 2026)`, `Trainee ${role}`] : [`${role} - Fresher`, `Graduate Trainee - ${role}`, `Trainee ${role}`]);
    case "entry":
      return rng.pick(eng ? [`${role} I`, `Junior ${role}`, `SDE-1`, `Associate ${role}`, role] : [`Junior ${role}`, `Associate ${role}`, role]);
    case "mid":
      return rng.pick(eng ? [`${role} II`, `SDE-2`, role, `${role} 2`] : [role, `${role} II`]);
    case "senior":
      return rng.pick(eng ? [`Senior ${role}`, `Sr. ${role}`, `SDE-3`, `${role} III`] : [`Senior ${role}`, `Sr. ${role}`]);
    case "lead":
      return rng.pick(eng ? [`Staff ${role}`, `Principal ${role}`, `Lead ${role}`, `Engineering Manager`] : [`Lead ${role}`, `${role} Manager`]);
    case "executive":
      return rng.pick(eng ? [`Director of Engineering`, `Head of ${category === "data_ai" ? "Data Science" : "Engineering"}`, `VP Engineering`] : [`Director - ${role.replace(/ (Executive|Associate|Analyst)$/, "")}`, `Head of ${role.split(" ")[0]}`]);
  }
}

const sha1 = (s: string): string => createHash("sha1").update(s).digest("hex");

function inrRaw(minLpa: number, maxLpa: number): string {
  return minLpa === maxLpa ? `₹${minLpa} LPA` : `₹${minLpa}–${maxLpa} LPA`;
}

function descriptionHtml(rng: Rng, company: SeedCompany, title: string, skills: readonly string[], level: ExperienceLevel, degrees: readonly string[], cityLine: string, evil: boolean): string {
  const resp = rng.sample(
    [
      `Design, build and ship features used by millions of customers across India.`,
      `Collaborate with product, design and data teams to turn ideas into reliable software.`,
      `Write clean, well-tested code and review pull requests from peers.`,
      `Own services end to end: design docs, implementation, rollout and on-call.`,
      `Analyse data to find insights and drive decisions with stakeholders.`,
      `Improve performance, reliability and observability of production systems.`,
      `Mentor junior team members and contribute to engineering best practices.`,
      `Work closely with customers to understand their needs and solve problems.`,
      `Prepare reports and dashboards for leadership reviews.`,
      `Participate in sprint planning, estimation and retrospectives.`,
    ],
    rng.int(3, 6),
  );
  const reqs = [
    level === "intern" || level === "fresher" ? `Pursuing or recently completed ${degrees.join(" / ") || "a bachelor's degree"}.` : `${EXP[level][0]}+ years of relevant experience.`,
    `Hands-on experience with ${skills.slice(0, 3).join(", ")}${skills.length > 3 ? ` and ${skills[3]}` : ""}.`,
    `Strong problem-solving and communication skills.`,
    ...(skills.length > 4 ? [`Familiarity with ${skills.slice(4, 7).join(", ")} is a plus.`] : []),
  ];
  const perks = rng.sample(["Health insurance for you and your family", "Flexible working hours", "Learning budget and certifications", "Hybrid work model", "Relocation support", "Stock options", "Free meals at office"], 3);
  const parts = [
    `<p><strong>${company.name}</strong> is hiring a <strong>${title}</strong> to join our team in ${cityLine}.</p>`,
    `<h3>What you will do</h3><ul>${resp.map((r) => `<li>${r}</li>`).join("")}</ul>`,
    `<h3>What we are looking for</h3><ul>${reqs.map((r) => `<li>${r}</li>`).join("")}</ul>`,
    `<h3>Perks</h3><ul>${perks.map((p) => `<li>${p}</li>`).join("")}</ul>`,
    `<p>About ${company.name}: headquartered in ${company.hq}, ${company.name} builds products and services for customers worldwide. Learn more at <a href="https://www.${company.domain}">${company.domain}</a>.</p>`,
  ];
  if (evil) parts.push(`<p onclick="steal()" style="color:red">Apply fast!</p><script>alert('xss')</script><iframe src="https://tracker.example/pixel"></iframe><img src="https://tracker.example/p.gif">`);
  return parts.join("\n");
}

const textOf = (html: string): string =>
  html.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

export interface SeedOptions {
  /** Approximate number of JobInputs (≈ 83% unique jobs + duplicates). */
  count: number;
  seed?: number;
  now?: Date;
}

interface OfficialPosting {
  source: string;
  sourceKind: SourceKind;
  target: string | null;
  sourceJobId: string;
  url: string;
  key: string;
}

function officialPosting(rng: Rng, c: SeedCompany, seq: number, citySlug: string, titleSlug: string): OfficialPosting {
  const token = slugify(c.name).replace(/-/g, "");
  switch (c.ats) {
    case "greenhouse": {
      const id = String(4_000_000 + seq);
      return { source: "greenhouse", sourceKind: "ats", target: slugify(c.name), sourceJobId: id, url: `https://job-boards.greenhouse.io/${token}/jobs/${id}`, key: `greenhouse:${id}` };
    }
    case "lever": {
      const id = rng.uuid();
      return { source: "lever", sourceKind: "ats", target: slugify(c.name), sourceJobId: id, url: `https://jobs.lever.co/${token}/${id}`, key: `lever:${id}` };
    }
    case "ashby": {
      const id = rng.uuid();
      return { source: "ashby", sourceKind: "ats", target: slugify(c.name), sourceJobId: id, url: `https://jobs.ashbyhq.com/${token}/${id}`, key: `ashby:${id}` };
    }
    case "workday": {
      const jr = `JR${String(100_000 + seq)}`;
      return {
        source: "workday",
        sourceKind: "ats",
        target: slugify(c.name),
        sourceJobId: jr,
        url: `https://${token}.wd5.myworkdayjobs.com/en-US/External/job/${citySlug}/${titleSlug}_${jr}`,
        key: `workday:${token}:${jr}`,
      };
    }
    case "smartrecruiters": {
      const id = String(744_000_000_000 + seq);
      return { source: "smartrecruiters", sourceKind: "ats", target: slugify(c.name), sourceJobId: id, url: `https://jobs.smartrecruiters.com/${c.name.replace(/\s+/g, "")}/${id}-${titleSlug}`, key: `smartrecruiters:${id}` };
    }
    case "career_site": {
      const id = String(100_000 + seq);
      const site = c.site ?? slugify(c.name);
      const url = site === "amazon" ? `https://www.amazon.jobs/en/jobs/${id}/${titleSlug}` : `https://careers.${c.domain}/jobs/${id}`;
      return { source: site, sourceKind: "career_site", target: null, sourceJobId: id, url, key: `${site}:${id}` };
    }
  }
}

/** Generate ~count JobInputs (shuffled so merges happen in both directions). */
export function generateSeedJobs(opts: SeedOptions): JobInput[] {
  const rng = new Rng(mulberry32(opts.seed ?? 42));
  const now = (opts.now ?? new Date()).getTime();
  const companyWeights = SEED_COMPANIES.map((c) => [c, c.weight] as const);
  const cityWeights = CITIES.map((c) => [c, c[3]] as const);
  const out: JobInput[] = [];
  let seq = 0;

  while (out.length < opts.count) {
    seq++;
    const company = rng.weighted(companyWeights);
    const it = company.tags.includes("indian_it") || company.tags.includes("service");
    const category = it && rng.chance(0.5) ? rng.pick<JobCategory>(["software_engineering", "qa_testing", "consulting", "devops_cloud"]) : rng.weighted(CATEGORY_WEIGHTS);
    const level = rng.weighted(LEVEL_WEIGHTS);
    const jobType: JobType =
      level === "intern" ? "internship" : rng.weighted<JobType>([["full_time", 90], ["contract", 5], ["part_time", 2], ["temporary", 1], ["apprenticeship", 1], ["freelance", 1]]);
    const role = rng.pick(ROLES[category]);
    const title = titleFor(rng, role, level, category);

    // Location / work mode
    const remote = rng.chance(category === "sales" || category === "core_engineering" ? 0.03 : 0.1);
    const cityCount = remote ? (rng.chance(0.5) ? 0 : 1) : rng.weighted([[1, 85], [2, 10], [3, 5]] as const);
    const cities: City[] = [];
    while (cities.length < cityCount) {
      const c = rng.weighted(cityWeights);
      if (!cities.includes(c)) cities.push(c);
    }
    const locations: JobLocation[] = cities.map(([city, state, country]) => ({ raw: [city, state, country === "IN" ? "India" : country].filter(Boolean).join(", "), city, state, country }));
    if (remote) locations.push({ raw: "Remote - India", city: null, state: null, country: "IN" });
    const workMode: WorkMode | null = remote ? "remote" : rng.weighted<WorkMode | null>([["onsite", 55], ["hybrid", 40], [null, 5]]);
    const global = cities.some((c) => c[2] !== "IN");

    // Experience / batches
    const [emin, emax] = EXP[level];
    const experienceMin = rng.chance(0.85) ? emin : null;
    const experienceMax = rng.chance(0.8) ? emax : null;
    const batches =
      (level === "intern" || level === "fresher") && rng.chance(0.6)
        ? rng.sample([2024, 2025, 2026, 2027], rng.int(1, 3)).sort((a, b) => a - b)
        : level === "entry" && rng.chance(0.15)
          ? [2024, 2025]
          : [];

    // Salary (never for everyone)
    let salary: Salary | null = null;
    let inrMin: number | null = null;
    let inrMax: number | null = null;
    if (level === "intern") {
      if (rng.chance(0.55)) {
        const k = rng.pick([10, 12, 15, 20, 25, 30, 35, 40, 50, 60, 80]);
        const k2 = rng.chance(0.4) ? k + rng.pick([5, 10, 20]) : k;
        salary = { min: k * 1000, max: k2 * 1000, currency: "INR", period: "month", raw: k === k2 ? `₹${k},000 /month` : `₹${k},000–${k2},000 /month` };
        inrMin = k * 12_000;
        inrMax = k2 * 12_000;
      }
    } else if (global && rng.chance(0.5)) {
      const lo = rng.int(8, 20) * 10_000;
      const hi = lo + rng.int(2, 6) * 10_000;
      salary = { min: lo, max: hi, currency: "USD", period: "year", raw: `$${lo / 1000}k–${hi / 1000}k /yr` };
      inrMin = lo * 84;
      inrMax = hi * 84;
    } else if (rng.chance(0.45)) {
      const [lo, hi] = LPA[level];
      const a = rng.int(lo, Math.max(lo, hi - 2));
      const b = Math.min(hi, a + rng.int(1, Math.max(2, Math.round((hi - lo) / 3))));
      salary = { min: a * 100_000, max: b * 100_000, currency: "INR", period: "year", raw: inrRaw(a, b) };
      inrMin = a * 100_000;
      inrMax = b * 100_000;
    }

    const skills = rng.sample(SKILLS[category], rng.int(4, 10));
    const degrees = category === "core_engineering" ? rng.sample(DEGREES.core!, 2) : ["software_engineering", "data_ai", "devops_cloud", "qa_testing", "security", "research"].includes(category) ? rng.sample(DEGREES.tech!, rng.int(1, 3)) : rng.sample(DEGREES.biz!, rng.int(1, 2));

    // Freshness: many in the last 24 h, the rest over 30 days, a few older.
    const ageMs = rng.weighted<() => number>([
      [() => rng.float() * 86_400_000, 35],
      [() => 86_400_000 + rng.float() * 2 * 86_400_000, 20],
      [() => 3 * 86_400_000 + rng.float() * 27 * 86_400_000, 43],
      [() => 30 * 86_400_000 + rng.float() * 30 * 86_400_000, 2],
    ])();
    const postedAt = new Date(now - ageMs).toISOString();
    const validThrough = rng.chance(0.2) ? new Date(now - ageMs + rng.int(30, 60) * 86_400_000).toISOString() : rng.chance(0.01) ? new Date(now - rng.int(1, 5) * 86_400_000).toISOString() : null;

    const primaryCity = cities[0]?.[0] ?? null;
    const cityLine = remote ? "a remote-first setup (India)" : cities.map((c) => c[0]).join(" / ") || "India";
    const html = descriptionHtml(rng, company, title, skills, level, degrees, cityLine, rng.chance(0.01));
    const text = textOf(html);
    const companySlug = slugify(company.name);
    const logo = `https://www.google.com/s2/favicons?domain=${company.domain}&sz=128`;
    const tags: string[] = [];
    if (remote && rng.chance(0.5)) tags.push("wfh");
    if (rng.chance(0.02)) tags.push("women");
    if (rng.chance(0.03)) tags.push("urgent");

    const baseJob = {
      title,
      company: company.name,
      companySlug,
      companyDomain: company.domain,
      companyLogoUrl: logo,
      companyTags: company.tags,
      locations,
      workMode,
      isRemote: remote,
      jobType,
      experienceLevel: level,
      experienceMin,
      experienceMax,
      batches,
      degrees,
      salary,
      salaryInrYearlyMin: inrMin,
      salaryInrYearlyMax: inrMax,
      skills,
      category,
      department: category === "software_engineering" ? "Engineering" : category === "data_ai" ? "Data Science" : null,
      descriptionHtml: html,
      descriptionText: text,
      summary: text.slice(0, 277).replace(/\s+\S*$/, "") + "…",
      postedAt,
      validThrough,
      tags,
      extra: {},
    } satisfies Partial<JobInput>;

    const titleSlug = slugify(title);
    const citySlug = slugify(primaryCity ?? "remote");
    const official = rng.chance(0.7);
    if (official) {
      const p = officialPosting(rng, company, seq, citySlug, titleSlug);
      const fingerprint = `k:${sha1(p.key)}`;
      out.push({
        ...baseJob,
        fingerprint,
        source: p.source,
        sourceName: SOURCE_NAMES[p.source] ?? p.source,
        sourceKind: p.sourceKind,
        sourceJobId: p.sourceJobId,
        sourceUrl: p.url,
        target: p.target,
        applyUrl: p.url,
        qualityScore: rng.int(65, 95),
      });
      // 25%: a board re-posts it, linking to the official URL → same fingerprint, merged.
      if (rng.chance(0.25)) {
        const board = level === "intern" || level === "fresher" ? rng.weighted([["coursejoiner", 5], ["unstop", 2], ["linkedin", 2]] as const) : rng.weighted([["linkedin", 4], ["naukri", 3], ["coursejoiner", 1]] as const);
        const bid = `${board}-${seq}`;
        const fresh = level === "intern" || level === "fresher";
        out.push({
          ...baseJob,
          fingerprint,
          source: board,
          sourceName: SOURCE_NAMES[board]!,
          sourceKind: "job_board",
          sourceJobId: bid,
          sourceUrl: boardUrl(board, titleSlug, seq),
          target: null,
          applyUrl: p.url,
          title: board === "coursejoiner" ? `${company.name} ${fresh ? "Off Campus Drive" : "Hiring"} | ${title}` : title,
          skills: rng.sample(SKILLS[category], rng.int(2, 6)),
          batches: fresh && batches.length === 0 && rng.chance(0.5) ? [2025, 2026] : batches,
          tags: fresh && board === "coursejoiner" ? [...tags, "off-campus"] : tags,
          // boards sometimes know a salary the ATS doesn't publish
          salary: salary ?? null,
          descriptionHtml: rng.chance(0.5) ? null : `<p>${company.name} is hiring ${title}. Apply via the official link.</p>`,
          descriptionText: null,
          summary: null,
          postedAt: new Date(Date.parse(postedAt) + rng.int(1, 30) * 3_600_000).toISOString(),
          validThrough: null,
          qualityScore: rng.int(40, 70),
          workMode: rng.chance(0.3) ? null : workMode,
        });
      }
    } else {
      const board =
        remote && rng.chance(0.4) ? "remoteok" : level === "intern" ? (rng.chance(0.8) ? "internshala" : "unstop") : rng.weighted([["naukri", 4], ["linkedin", 4], ["unstop", 1], ["coursejoiner", 1], ["adzuna", 1]] as const);
      const kind: SourceKind = board === "remoteok" || board === "adzuna" ? "aggregator" : "job_board";
      const fingerprint = `t:${sha1(`${companySlug}|${title.toLowerCase()}|${(primaryCity ?? "remote").toLowerCase()}|${jobType}`)}`;
      const url = boardUrl(board, titleSlug, seq);
      const boardLocations = locations.map((l) => (l.city && RAW_ALIASES[l.city] && rng.chance(0.5) ? { ...l, raw: rng.pick(RAW_ALIASES[l.city]!) } : l));
      const suspicious = kind === "aggregator" && rng.chance(0.03);
      out.push({
        ...baseJob,
        locations: boardLocations,
        fingerprint,
        source: board,
        sourceName: SOURCE_NAMES[board]!,
        sourceKind: kind,
        sourceJobId: `${board}-${seq}`,
        sourceUrl: url,
        target: null,
        applyUrl: url,
        qualityScore: rng.int(30, 70),
        tags: suspicious ? [...baseJob.tags, "suspicious"] : level === "fresher" && rng.chance(0.3) ? [...baseJob.tags, "off-campus"] : baseJob.tags,
      });
      // 10%: the same job on a second board → same "t:" fingerprint, merged.
      if (rng.chance(0.1)) {
        const second = board === "linkedin" ? "naukri" : "linkedin";
        out.push({
          ...baseJob,
          fingerprint,
          source: second,
          sourceName: SOURCE_NAMES[second]!,
          sourceKind: "job_board",
          sourceJobId: `${second}-${seq}`,
          sourceUrl: boardUrl(second, titleSlug, seq),
          target: null,
          applyUrl: boardUrl(second, titleSlug, seq),
          qualityScore: rng.int(30, 70),
          salary: null,
          salaryInrYearlyMin: null,
          salaryInrYearlyMax: null,
        });
      }
    }
  }

  // Deterministic shuffle: duplicates arrive before or after their originals.
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng.float() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out.slice(0, opts.count);
}

function boardUrl(board: string, titleSlug: string, seq: number): string {
  switch (board) {
    case "coursejoiner":
      return `https://coursejoiner.com/jobs/${titleSlug}-${seq}/`;
    case "internshala":
      return `https://internshala.com/internship/detail/${titleSlug}-internship-${seq}`;
    case "linkedin":
      return `https://www.linkedin.com/jobs/view/${3_900_000_000 + seq}`;
    case "naukri":
      return `https://www.naukri.com/job-listings-${titleSlug}-${seq}`;
    case "unstop":
      return `https://unstop.com/jobs/${titleSlug}-${seq}`;
    case "remoteok":
      return `https://remoteok.com/remote-jobs/${seq}`;
    default:
      return `https://www.adzuna.in/details/${seq}`;
  }
}

/** Registry-like profiles for the seeded companies (hq, careers URL) — used by the seed to enrich companies. */
export function seedCompanyProfiles(): CompanyTarget[] {
  return SEED_COMPANIES.map((c) => ({
    slug: slugify(c.name),
    name: c.name,
    domain: c.domain,
    ats: c.ats === "career_site" ? "custom" : c.ats,
    token: slugify(c.name),
    careersUrl: `https://careers.${c.domain}`,
    tags: c.tags,
    hq: c.hq,
    indiaPresence: true,
    priority: 1,
  }));
}
