/** Local (package-private) types for the Internshala scrapers. Contract types come from @easyjobs/contract. */

/** Internshala's own `employment_type`: every posting is either an internship or a job. */
export type InternshalaKind = "internship" | "job";

/** One listing card as shown on /internships/… and /jobs/… pages. */
export interface ListingCard {
  /** `internshipId` attribute — stable across reposts (the URL is not). */
  id: string;
  kind: InternshalaKind;
  /** Detail path without query/hash, e.g. "/internship/detail/…-at-acme1794806827". */
  path: string;
  /** Absolute detail URL. */
  url: string;
  title: string;
  company: string;
  /** null when Internshala shows its placeholder logo. */
  logoUrl: string | null;
  /** Location strings exactly as displayed ("Mumbai (Hybrid)", "Work from home"). */
  locations: string[];
  isWfh: boolean;
  /** Location shown as "Mumbai (Hybrid)". */
  isHybrid: boolean;
  /** Hybrid popover, e.g. "1 day(s) in-office in a week". */
  hybridNote: string | null;
  /** Stipend (internships) or CTC (jobs) in its most complete displayed form, e.g. "₹ 4,00,000 - 4,50,000 /year". */
  salaryText: string | null;
  /** Internships: "3 Months", "2 Weeks". */
  durationText: string | null;
  /** Jobs: "1 year(s)", "No experience required". */
  experienceText: string | null;
  /** "Few hours ago", "Today", "2 days ago", "1 week ago". */
  postedText: string | null;
  /** Grey status labels: "Part time", "Fresher Job", "International". */
  labels: string[];
  /** Pre-placement offer label: "Job offer upto ₹ 3LPA post internship". */
  ppoText: string | null;
  activelyHiring: boolean;
  earlyApplicant: boolean;
  skills: string[];
  /** Truncated "about" preview shown on the card. */
  snippet: string | null;
  /** Listed in the page's `pinned_internship_ids` (promoted to the top of page 1). */
  pinned: boolean;
}

export interface ListingPage {
  /** From `#pagination[data-employment-type]`. */
  kind: InternshalaKind | null;
  cards: ListingCard[];
  /** Page number the server says it rendered (null if no pagination block). */
  page: number | null;
  lastPage: number | null;
  isLastPage: boolean;
  /** From the H1, e.g. "6080 Total Internships" → 6080. */
  totalCount: number | null;
  /** Cards present in the markup that could not be parsed (missing id/title/company/link). */
  skipped: number;
}

export type SectionKind =
  | "about"
  | "skills"
  | "who_can_apply"
  | "other_requirements"
  | "salary"
  | "perks"
  | "rewards"
  | "additional"
  | "openings"
  | "company"
  | "other";

export interface DetailSection {
  heading: string;
  kind: SectionKind;
  /** Cleaned inner HTML of the section body. */
  html: string;
  text: string;
  /** List-like content: skill/perk chips, numbered "who can apply" lines, salary lines. */
  items: string[];
}

/** The subset of the schema.org JobPosting JSON-LD that Internshala detail pages embed (not always present). */
export interface JobPostingLd {
  title: string | null;
  descriptionHtml: string | null;
  datePosted: string | null;
  validThrough: string | null;
  employmentType: string | null;
  industry: string | null;
  occupationalCategory: string | null;
  totalJobOpenings: number | null;
  skills: string[];
  jobLocationType: string | null;
  applicantCountry: string | null;
  locations: { locality: string | null; region: string | null; country: string | null }[];
  organization: { name: string | null; sameAs: string | null; logo: string | null };
  baseSalary: { currency: string | null; min: number | null; max: number | null; unit: string | null } | null;
  monthsOfExperience: number | null;
  identifier: string | null;
}

export interface DetailPage {
  id: string | null;
  kind: InternshalaKind | null;
  /** Hidden `#status` input — "active" for open postings. */
  status: string | null;
  title: string | null;
  company: string | null;
  companyPageUrl: string | null;
  logoUrl: string | null;
  locations: string[];
  isWfh: boolean;
  isHybrid: boolean;
  hybridNote: string | null;
  /** "Immediately" or a date such as "1 Dec' 26". */
  startDateText: string | null;
  durationText: string | null;
  salaryText: string | null;
  experienceText: string | null;
  applyByText: string | null;
  /** Without the "Posted " prefix: "1 week ago". */
  postedText: string | null;
  /** "Internship", "Job", "Fresher Job", "Part time", "International", "Job offer …". */
  labels: string[];
  applicants: number | null;
  activelyHiring: boolean;
  earlyApplicant: boolean;
  sections: DetailSection[];
  skills: string[];
  perks: string[];
  whoCanApply: string[];
  otherRequirements: string[];
  openings: number | null;
  /** "Annual CTC: …", "Annual CTC breakup:", "1. Fixed pay: …" */
  salaryLines: string[];
  probation: { duration: string | null; salary: string | null } | null;
  aboutCompany: string | null;
  companyWebsite: string | null;
  /** "Hiring since July 2026", "3 opportunities posted", … */
  companyActivity: string[];
  /** "Women wanting to start/restart their career can also apply." */
  womenCanApply: boolean;
  jsonLd: JobPostingLd | null;
}
