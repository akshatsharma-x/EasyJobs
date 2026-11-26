import type { Env } from "@easyjobs/contract/node";
import { envFilterList, envInt, envList } from "../shared/env";

export const NAUKRI_ORIGIN = "https://www.naukri.com";
export const NAUKRI_ROBOTS_URL = `${NAUKRI_ORIGIN}/robots.txt`;
/** XHR the search results page makes for its results. Expected shape { noOfJobs, jobDetails: [...] } — NOT observed live (edge-blocked, see README). */
export const NAUKRI_SEARCH_API = /\/jobapi\/v\d+\/search(?:[/?]|$)/;
/** XHR a job page makes for its details. Expected shape { jobDetails: {...} } — NOT observed live (edge-blocked, see README). */
export const NAUKRI_DETAIL_API = /\/jobapi\/v\d+\/job\/\d+/;

/** Same default plan as LinkedIn (NAUKRI_KEYWORDS overrides). */
export const NAUKRI_DEFAULT_KEYWORDS: readonly string[] = [
  "software engineer", "developer", "data analyst", "data scientist", "intern", "fresher", "graduate trainee",
  "product manager", "designer", "marketing", "sales", "finance", "HR",
];

const EXPERIENCE_VALUES = Array.from({ length: 31 }, (_, i) => String(i));

export interface NaukriQuery {
  keywords: string;
  /** Naukri's experience filter in years (?experience=0); null = no filter. */
  experience: string | null;
  /** "software engineer|X0" */
  key: string;
}

export interface NaukriConfig {
  plan: NaukriQuery[];
  queriesPerRun: number;
  pagesPerQuery: number;
  maxRequests: number;
  maxDetails: number;
  navigationTimeoutMs: number;
  apiWaitMs: number;
}

/**
 * Fresher-focused by default: every keyword is searched with experience=0 and experience=1 (one query each),
 * rotated across runs. A "request" here is one page navigation in the headless browser.
 */
export function naukriConfigFromEnv(env: Env): NaukriConfig {
  const keywords = envList(env, "NAUKRI_KEYWORDS", NAUKRI_DEFAULT_KEYWORDS);
  const experience = envFilterList(env, "NAUKRI_EXPERIENCE", ["0", "1"], EXPERIENCE_VALUES);
  const levels: (string | null)[] = experience.length > 0 ? experience : [null];
  const plan: NaukriQuery[] = [];
  for (const kw of keywords) for (const x of levels) plan.push({ keywords: kw, experience: x, key: `${kw}${x !== null ? `|X${x}` : ""}` });
  return {
    plan,
    queriesPerRun: envInt(env, "NAUKRI_QUERIES_PER_RUN", 2, 1, 10),
    pagesPerQuery: envInt(env, "NAUKRI_PAGES_PER_QUERY", 1, 1, 5),
    maxRequests: envInt(env, "NAUKRI_MAX_REQ_PER_RUN", 6, 1, 40),
    maxDetails: envInt(env, "NAUKRI_MAX_DETAILS_PER_RUN", 3, 0, 30),
    navigationTimeoutMs: envInt(env, "NAUKRI_NAV_TIMEOUT_MS", 45_000, 5_000, 120_000),
    apiWaitMs: envInt(env, "NAUKRI_API_WAIT_MS", 20_000, 2_000, 60_000),
  };
}

/** "software engineer" → "software-engineer" (Naukri's SEO search path segment). */
export function naukriSlug(keywords: string): string {
  return keywords
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** https://www.naukri.com/software-engineer-jobs?experience=0 · page 2 → /software-engineer-jobs-2?experience=0 */
export function naukriSearchUrl(q: NaukriQuery, page = 1): string {
  const suffix = page > 1 ? `-${Math.floor(page)}` : "";
  const query = q.experience !== null ? `?experience=${encodeURIComponent(q.experience)}` : "";
  return `${NAUKRI_ORIGIN}/${naukriSlug(q.keywords)}-jobs${suffix}${query}`;
}
