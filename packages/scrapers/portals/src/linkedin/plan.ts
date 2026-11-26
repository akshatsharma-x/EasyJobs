import type { Env } from "@easyjobs/contract/node";
import { envFilterList, envInt, envList } from "../shared/env";
import { DEFAULT_KEYWORDS, F_E_VALUES, F_WT_VALUES, LINKEDIN_DETAIL_PATH, LINKEDIN_ORIGIN, LINKEDIN_SEARCH_PATH, type FECode, type FWTCode } from "./constants";

export interface LinkedInQuery {
  keywords: string;
  /** Single f_E code per query, so every result gets an unambiguous experience hint. */
  experience: FECode | null;
  /** f_WT codes applied together (LINKEDIN_WORK_TYPES). */
  workTypes: FWTCode[];
  /** Stable id for rotation/logs, e.g. "software engineer|E2". */
  key: string;
}

export interface LinkedInConfig {
  plan: LinkedInQuery[];
  location: string;
  /** f_TPR value, "r86400" = posted in the last 24 h. */
  timePosted: string;
  queriesPerRun: number;
  pagesPerQuery: number;
  maxRequests: number;
  maxDetails: number;
}

/**
 * Env → config. The plan is keywords × f_E values (one query each), rotated across runs.
 * Defaults keep a run at ≤ 10 requests: robots.txt + 2 listing pages + ≤ 6 detail pages.
 */
export function linkedInConfigFromEnv(env: Env): LinkedInConfig {
  const keywords = envList(env, "LINKEDIN_KEYWORDS", DEFAULT_KEYWORDS);
  const experience = envFilterList(env, "LINKEDIN_EXPERIENCE", ["1", "2"], F_E_VALUES) as FECode[];
  const workTypes = envFilterList(env, "LINKEDIN_WORK_TYPES", [], F_WT_VALUES) as FWTCode[];
  const levels: (FECode | null)[] = experience.length > 0 ? experience : [null];
  const plan: LinkedInQuery[] = [];
  for (const kw of keywords) {
    for (const e of levels) {
      plan.push({ keywords: kw, experience: e, workTypes, key: `${kw}${e ? `|E${e}` : ""}${workTypes.length ? `|WT${workTypes.join("")}` : ""}` });
    }
  }
  const tpr = (env.LINKEDIN_TIME_POSTED ?? "r86400").trim();
  return {
    plan,
    location: (env.LINKEDIN_LOCATION ?? "India").trim() || "India",
    timePosted: /^r\d{3,8}$/.test(tpr) ? tpr : "r86400",
    queriesPerRun: envInt(env, "LINKEDIN_QUERIES_PER_RUN", 2, 1, 10),
    pagesPerQuery: envInt(env, "LINKEDIN_PAGES_PER_QUERY", 1, 1, 5),
    maxRequests: envInt(env, "LINKEDIN_MAX_REQ_PER_RUN", 10, 1, 60),
    maxDetails: envInt(env, "LINKEDIN_MAX_DETAILS_PER_RUN", 6, 0, 50),
  };
}

/** Guest search fragment URL. `start` pages through results (0, 25, … — or by however many cards came back). */
export function linkedInSearchUrl(q: LinkedInQuery, cfg: Pick<LinkedInConfig, "location" | "timePosted">, start: number): string {
  const p = new URLSearchParams();
  p.set("keywords", q.keywords);
  p.set("location", cfg.location);
  p.set("f_TPR", cfg.timePosted);
  if (q.experience) p.set("f_E", q.experience);
  if (q.workTypes.length > 0) p.set("f_WT", q.workTypes.join(","));
  p.set("sortBy", "DD");
  p.set("start", String(Math.max(0, Math.floor(start))));
  return `${LINKEDIN_ORIGIN}${LINKEDIN_SEARCH_PATH}?${p.toString()}`;
}

export function linkedInDetailUrl(id: string): string {
  return `${LINKEDIN_ORIGIN}${LINKEDIN_DETAIL_PATH}${encodeURIComponent(id)}`;
}

/** Canonical public job page — used as sourceUrl and (unless an off-site apply URL is known) applyUrl. */
export function linkedInViewUrl(id: string): string {
  return `${LINKEDIN_ORIGIN}/jobs/view/${encodeURIComponent(id)}`;
}
