import type { ExperienceLevel, JobType, RawJob, Salary } from "@easyjobs/contract";
import type { ScrapeContext, Scraper } from "@easyjobs/contract/node";
import { mulberry32 } from "./util";

/**
 * Internal "demo" scraper: deterministic synthetic jobs with realistic churn.
 * Job N "opens" at N × 10 min; a run emits the newest WORKER_DEMO_JOBS jobs, so every 10 minutes one job
 * appears and the oldest drops out (and is then closed by the sweep). Companies use the reserved `.example`
 * TLD and every posting says it is synthetic, so demo data can never be mistaken for a real job.
 */
export const DEMO_SCRAPER_ID = "demo";
export const DEMO_TARGET = "demo-feed";
export const DEMO_SLOT_MS = 10 * 60_000;

interface DemoCompany {
  name: string;
  slug: string;
  domain: string;
}

interface DemoRole {
  title: string;
  dept: string;
  exp: string;
  type: string;
  skills: string[];
  jobType?: JobType;
  level?: ExperienceLevel;
  salary?: Salary;
  salaryRaw?: string;
  batches?: number[];
}

const COMPANIES: readonly DemoCompany[] = [
  { name: "Nimbus Robotics", slug: "nimbus-robotics", domain: "nimbus-robotics.example" },
  { name: "Saffron Analytics", slug: "saffron-analytics", domain: "saffron-analytics.example" },
  { name: "Tidewater Software", slug: "tidewater-software", domain: "tidewater-software.example" },
  { name: "Banyan Health Labs", slug: "banyan-health-labs", domain: "banyan-health.example" },
  { name: "Kestrel Mobility", slug: "kestrel-mobility", domain: "kestrel-mobility.example" },
  { name: "Lotus Fintech", slug: "lotus-fintech", domain: "lotus-fintech.example" },
  { name: "Monsoon Data", slug: "monsoon-data", domain: "monsoon-data.example" },
  { name: "Peacock Payments", slug: "peacock-payments", domain: "peacock-payments.example" },
];

const inr = (min: number, max: number, period: Salary["period"], raw: string): Salary => ({ min, max, currency: "INR", period, raw });

const ROLES: readonly DemoRole[] = [
  {
    title: "Software Engineering Intern",
    dept: "Engineering",
    exp: "0 years",
    type: "Internship",
    skills: ["Java", "Data Structures", "Git"],
    jobType: "internship",
    salary: inr(40_000, 40_000, "month", "Stipend: ₹40,000 /month"),
    batches: [2026, 2027],
  },
  {
    title: "Data Science Intern",
    dept: "Data",
    exp: "0 years",
    type: "Internship (6 months)",
    skills: ["Python", "SQL", "Pandas"],
    salaryRaw: "₹30,000 /month",
    batches: [2026],
  },
  {
    title: "Graduate Engineer Trainee (2025 Batch)",
    dept: "Engineering",
    exp: "0-1 years",
    type: "Full-time",
    skills: ["C++", "Linux"],
    salary: inr(450_000, 600_000, "year", "₹4.5–6 LPA"),
    batches: [2025],
  },
  {
    title: "Associate Software Engineer",
    dept: "Engineering",
    exp: "0-2 years",
    type: "Full-time",
    skills: ["React", "TypeScript", "Node.js"],
    salaryRaw: "₹6–9 LPA",
  },
  { title: "Frontend Developer", dept: "Engineering", exp: "1-3 years", type: "Full-time", skills: ["React", "Next.js", "CSS"] },
  { title: "Backend Engineer (Node.js)", dept: "Engineering", exp: "2-4 years", type: "Full-time", skills: ["Node.js", "PostgreSQL", "AWS"] },
  { title: "Data Analyst", dept: "Analytics", exp: "1-3 years", type: "Full-time", skills: ["SQL", "Excel", "Tableau"] },
  { title: "DevOps Engineer", dept: "Platform", exp: "3-5 years", type: "Full-time", skills: ["Kubernetes", "Terraform", "AWS"] },
  {
    title: "Senior Software Engineer",
    dept: "Engineering",
    exp: "5-8 years",
    type: "Full-time",
    skills: ["Go", "Kafka", "Distributed Systems"],
    salary: inr(3_000_000, 4_500_000, "year", "₹30–45 LPA"),
  },
  { title: "Product Designer", dept: "Design", exp: "2-5 years", type: "Full-time", skills: ["Figma", "Prototyping"] },
  { title: "QA Automation Engineer", dept: "Quality", exp: "1-3 years", type: "Contract (12 months)", skills: ["Selenium", "Java"] },
  { title: "Staff Machine Learning Engineer", dept: "AI", exp: "8+ years", type: "Full-time", skills: ["PyTorch", "Python", "MLOps"] },
];

const LOCATIONS: readonly string[][] = [
  ["Bengaluru, Karnataka, India"],
  ["Hyderabad, Telangana, India"],
  ["Pune, Maharashtra, India"],
  ["Gurugram, Haryana, India"],
  ["Remote - India"],
  ["Mumbai, Maharashtra, India", "Remote - India"],
  ["Chennai, Tamil Nadu, India"],
  ["Noida, Uttar Pradesh, India"],
];

/** Deterministic synthetic job number `n`. */
export function demoJob(n: number): RawJob {
  const rand = mulberry32(Math.imul(n, 2654435761) ^ 0x5eed);
  const pick = <T>(list: readonly T[]): T => list[Math.floor(rand() * list.length)] as T;
  const company = pick(COMPANIES);
  const role = pick(ROLES);
  const locations = pick(LOCATIONS);
  const id = `demo-${n}`;
  const remote = locations.some((l) => /remote/i.test(l));
  const where = remote && locations.length === 1 ? "remotely (India)" : `in ${locations[0]?.split(",")[0] ?? "India"}`;
  const descriptionHtml = [
    `<p><strong>${company.name}</strong> is hiring a <strong>${role.title}</strong> to work ${where}.</p>`,
    `<h3>What you will do</h3><ul><li>Build and ship features with the ${role.dept} team</li><li>Work with ${role.skills.join(", ")}</li><li>Learn from code reviews and mentoring</li></ul>`,
    `<h3>Requirements</h3><ul><li>Experience: ${role.exp}</li>${role.batches ? `<li>Eligible batches: ${role.batches.join(", ")}</li>` : ""}</ul>`,
    `<p><em>This is a synthetic demo posting generated by the EasyJobs worker. It is not a real job.</em></p>`,
  ].join("");
  return {
    source: DEMO_SCRAPER_ID,
    sourceKind: "aggregator",
    sourceJobId: id,
    sourceUrl: `https://demo.easyjobs.example/jobs/${id}`,
    target: DEMO_TARGET,
    applyUrl: `https://careers.${company.domain}/jobs/${n}`,
    title: role.title,
    company: company.name,
    locations,
    descriptionHtml,
    postedAt: new Date(n * DEMO_SLOT_MS).toISOString(),
    companySlug: company.slug,
    companyDomain: company.domain,
    department: role.dept,
    employmentTypeRaw: role.type,
    experienceRaw: role.exp,
    salaryRaw: role.salary?.raw ?? role.salaryRaw ?? null,
    ...(role.jobType ? { jobType: role.jobType } : {}),
    ...(role.salary ? { salary: role.salary } : {}),
    ...(role.batches ? { batches: role.batches } : {}),
    ...(remote ? { isRemote: locations.length === 1 } : {}),
    skills: role.skills,
    tags: ["demo"],
    extra: { demo: true },
  };
}

/** Job numbers visible at `nowMs`, newest first. */
export function demoJobNumbers(nowMs: number, count: number): number[] {
  const newest = Math.floor(nowMs / DEMO_SLOT_MS);
  return Array.from({ length: Math.max(0, count) }, (_, i) => newest - i);
}

export const demoScraper: Scraper = {
  id: DEMO_SCRAPER_ID,
  name: "Demo (synthetic jobs)",
  kind: "aggregator",
  intervalMinutes: 15,
  attribution: "Synthetic demo data generated by the EasyJobs worker",
  async *scrape(ctx: ScrapeContext): AsyncIterable<RawJob> {
    const count = Math.min(5000, Math.max(1, Math.floor(Number(ctx.env.WORKER_DEMO_JOBS) || 30)));
    let emitted = 0;
    for (const n of demoJobNumbers(Date.now(), count)) {
      if (ctx.signal.aborted) return;
      const job = demoJob(n);
      // Incremental mode: newest first, so stop at the first job older than the cutoff (like a paginated feed).
      if (ctx.since && job.postedAt && Date.parse(job.postedAt) < ctx.since.getTime()) return;
      // Known jobs → light record (no description), exactly as real scrapers are allowed to do.
      yield ctx.isKnown?.(job.sourceJobId, job.target) ? { ...job, descriptionHtml: null } : job;
      if (ctx.limit !== undefined && ++emitted >= ctx.limit) return;
      await Promise.resolve();
    }
  },
};
