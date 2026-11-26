import { toQueryString, type SearchQuery } from "@easyjobs/contract";

export interface LandingPreset {
  slug: "internships" | "freshers" | "remote" | "off-campus" | "work-from-home";
  path: string;
  /** <title> / nav label */
  title: string;
  heading: string;
  lede: string;
  description: string;
  query: Partial<SearchQuery>;
  /** Short SEO copy shown under the results */
  seo: { heading: string; paragraphs: string[] };
}

export const LANDING_PRESETS: Record<LandingPreset["slug"], LandingPreset> = {
  internships: {
    slug: "internships",
    path: "/internships",
    title: "Internships in India",
    heading: "Internships",
    lede: "Paid internships from official career sites and trusted boards — summer, winter and 6-month roles.",
    description: "Find paid internships in India and remote — software, data, product, design, finance and more. Updated every few minutes from official career sites.",
    query: { level: ["intern"] },
    seo: {
      heading: "About internships on EasyJobs",
      paragraphs: [
        "We collect internships straight from company career portals (Greenhouse, Lever, Workday and custom sites) and from trusted boards like Internshala and Unstop, then remove duplicates so every role appears once.",
        "Filter by stipend, batch, city or remote, and apply on the official page — we always link to the original posting.",
      ],
    },
  },
  freshers: {
    slug: "freshers",
    path: "/freshers",
    title: "Fresher jobs & new grad roles",
    heading: "Fresher jobs",
    lede: "New grad, graduate engineer trainee and campus roles for 0 years of experience.",
    description: "Fresher jobs and new grad roles in India: software engineer, GET, analyst and more. Filter by batch, salary and location. Updated in real time.",
    query: { level: ["fresher"] },
    seo: {
      heading: "Fresher hiring, all in one place",
      paragraphs: [
        "From Indian IT mass-hiring drives to product-company new grad roles, EasyJobs tracks fresher openings across 1,000+ official career sites and fresher job blogs like CourseJoiner.",
        "Use the batch filter to see roles open to your graduation year and the salary slider to skip the noise.",
      ],
    },
  },
  remote: {
    slug: "remote",
    path: "/remote",
    title: "Remote jobs for India",
    heading: "Remote jobs",
    lede: "Fully remote roles open to candidates in India — from Indian startups and global companies.",
    description: "Remote jobs you can do from India: engineering, data, design, product and more, from startups and global companies. Updated every few minutes.",
    query: { mode: ["remote"] },
    seo: {
      heading: "Working remotely from India",
      paragraphs: [
        "Remote roles are tagged when a posting is explicitly remote or open to candidates in India. Global remote roles show their salary in the original currency.",
        "Combine Remote with Internship or Fresher to find remote roles early in your career.",
      ],
    },
  },
  "off-campus": {
    slug: "off-campus",
    path: "/off-campus",
    title: "Off-campus drives",
    heading: "Off-campus drives",
    lede: "Off-campus hiring drives for recent graduates — dates, batches and eligibility at a glance.",
    description: "Latest off-campus drives in India for 2025, 2026 and 2027 batches from TCS, Infosys, Wipro, Accenture, startups and more.",
    query: { tag: ["off-campus"] },
    seo: {
      heading: "Never miss an off-campus drive",
      paragraphs: [
        "Off-campus drives are often announced on company portals and fresher blogs at the same time. We merge both so you see the official link first.",
        "Check the batch and degree requirements on each card before applying.",
      ],
    },
  },
  "work-from-home": {
    slug: "work-from-home",
    path: "/work-from-home",
    title: "Work from home jobs & internships",
    heading: "Work from home",
    lede: "Work-from-home jobs and internships you can start from anywhere in India.",
    description: "Work from home jobs and internships in India — part-time and full-time, with stipend and salary filters.",
    query: { tag: ["wfh"] },
    seo: {
      heading: "Genuine work-from-home roles",
      paragraphs: [
        "Work-from-home listings come from official career sites and verified boards. Roles marked “Official ✓” link to the company's own page.",
        "Be cautious of postings that ask for payment — report them and we'll take a look.",
      ],
    },
  },
};

export interface QuickLink {
  label: string;
  href: string;
}

/** Chips under the home search. */
export const QUICK_CHIPS: QuickLink[] = [
  { label: "Internships", href: "/internships" },
  { label: "Freshers", href: "/freshers" },
  { label: "Remote", href: "/remote" },
  { label: "Work from home", href: "/work-from-home" },
  { label: "2026 batch", href: `/jobs?${toQueryString({ batch: [2026] })}` },
  { label: "Off-campus drives", href: "/off-campus" },
  { label: "Official sites only", href: `/jobs?${toQueryString({ official: true })}` },
];

export interface PalettePreset {
  label: string;
  hint: string;
  query: Partial<SearchQuery>;
}

/** ⌘K presets. */
export const PALETTE_PRESETS: PalettePreset[] = [
  { label: "Remote internships", hint: "Internship · Remote", query: { level: ["intern"], mode: ["remote"] } },
  { label: "Fresher jobs in Bengaluru", hint: "Fresher · Bengaluru", query: { level: ["fresher"], location: ["Bengaluru"] } },
  { label: "2026 batch off-campus", hint: "2026 batch · Off-campus drive", query: { batch: [2026], tag: ["off-campus"] } },
  { label: "Official career sites only", hint: "Skip aggregators", query: { official: true } },
  { label: "Posted in the last 24 hours", hint: "Newest first", query: { posted: "24h", sort: "newest" } },
  { label: "Highest-paying entry-level roles", hint: "Entry · Highest pay", query: { level: ["entry"], sort: "salary" } },
];

export const jobsHref = (query: Partial<SearchQuery>): string => {
  const qs = toQueryString(query);
  return qs ? `/jobs?${qs}` : "/jobs";
};
