import type { ExperienceLevel, JobType, WorkMode } from "@easyjobs/contract";

export const LINKEDIN_ORIGIN = "https://www.linkedin.com";
export const LINKEDIN_ROBOTS_URL = `${LINKEDIN_ORIGIN}/robots.txt`;
export const LINKEDIN_SEARCH_PATH = "/jobs-guest/jobs/api/seeMoreJobPostings/search";
export const LINKEDIN_DETAIL_PATH = "/jobs-guest/jobs/api/jobPosting/";

/** Default keyword plan (LINKEDIN_KEYWORDS overrides). */
export const DEFAULT_KEYWORDS: readonly string[] = [
  "software engineer", "developer", "data analyst", "data scientist", "intern", "fresher", "graduate trainee",
  "product manager", "designer", "marketing", "sales", "finance", "HR",
];

/** f_E — LinkedIn's "Experience level" search filter. */
export const F_E_CODES = { "1": "Internship", "2": "Entry level", "3": "Associate", "4": "Mid-Senior level", "5": "Director", "6": "Executive" } as const;
export type FECode = keyof typeof F_E_CODES;
export const F_E_VALUES = Object.keys(F_E_CODES) as FECode[];

/** f_WT — LinkedIn's "On-site/remote" search filter. */
export const F_WT_CODES = { "1": "onsite", "2": "remote", "3": "hybrid" } as const satisfies Record<string, WorkMode>;
export type FWTCode = keyof typeof F_WT_CODES;
export const F_WT_VALUES = Object.keys(F_WT_CODES) as FWTCode[];

/**
 * Seniority (detail criteria or f_E filter) → contract level. Only unambiguous ones:
 * LinkedIn's "Associate" and "Mid-Senior level" each span several of our levels, so the normalizer decides.
 */
export const SENIORITY_LEVEL: Readonly<Record<string, ExperienceLevel>> = {
  internship: "intern",
  "entry level": "entry",
  director: "executive",
  executive: "executive",
};

export const F_E_LEVEL: Readonly<Partial<Record<FECode, ExperienceLevel>>> = { "1": "intern", "2": "entry", "5": "executive", "6": "executive" };

/** "Employment type" criterion → contract job type ("Volunteer"/"Other" → no hint). */
export const EMPLOYMENT_TYPE: Readonly<Record<string, JobType>> = {
  "full-time": "full_time",
  "part-time": "part_time",
  contract: "contract",
  temporary: "temporary",
  internship: "internship",
};
