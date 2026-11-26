/**
 * Deterministic, realistic request mix for /v1/jobs: filter browsing, popular text searches (often with a
 * location/level), typos and type-ahead prefixes, pagination and the landing page — a popular head plus a
 * long tail of distinct URLs.
 */
import { toQueryString, type SearchQuery } from "@easyjobs/contract";
import { mulberry32 } from "@easyjobs/db/seed";

const TERMS = [
  "software engineer", "data analyst", "intern", "react developer", "java", "python", "machine learning", "frontend",
  "backend", "devops", "sde", "fresher", "product manager", "marketing", "sales", "hr", "business analyst",
  "full stack", "android", "qa", "amazon", "tcs", "infosys", "google", "data scientist", "cloud", "node.js",
  "graduate engineer trainee", "ui ux designer", "financial analyst", "content writer", "embedded", "sre", "golang",
  "c++", "security", "consultant", "customer support", "ml engineer", "software development engineer",
];
const TYPOS = ["devloper", "amazn", "enginee", "softw", "anlyst", "pythn", "javascrpt", "mangaer", "flipkrat", "intrn", "data sci", "reac"];
const CITIES = ["Bengaluru", "Hyderabad", "Pune", "Chennai", "Mumbai", "Gurugram", "Noida", "Delhi", "Remote"];
const LEVELS = ["intern", "fresher", "entry", "mid", "senior", "lead"] as const;
const CTYPES = ["mnc", "startup", "unicorn", "indian_it", "big_tech", "product"];
const CATEGORIES = ["software_engineering", "data_ai", "devops_cloud", "qa_testing", "marketing", "sales", "business_ops", "finance"] as const;

export function buildRequestMix(n = 4000, seed = 7): { head: string[]; tail: string[] } {
  const r = mulberry32(seed);
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(r() * xs.length)]!;
  const some = <T>(xs: readonly T[], k: number): T[] => [...new Set(Array.from({ length: k }, () => pick(xs)))];
  const url = (q: Partial<SearchQuery>): string => {
    const qs = toQueryString(q);
    return `/v1/jobs${qs ? `?${qs}` : ""}`;
  };

  const make = (): string => {
    const x = r();
    if (x < 0.08) return url({});
    if (x < 0.4) {
      // filter browsing
      const q: Partial<SearchQuery> = {};
      if (r() < 0.6) q.level = some(LEVELS, r() < 0.7 ? 1 : 2);
      if (r() < 0.5) q.location = some(CITIES, r() < 0.8 ? 1 : 2);
      if (r() < 0.2) q.type = ["internship"];
      if (r() < 0.2) q.ctype = some(CTYPES, 1);
      if (r() < 0.15) q.category = some(CATEGORIES, 1);
      if (r() < 0.12) q.batch = [pick([2025, 2026, 2027])];
      if (r() < 0.12) q.mode = [pick(["remote", "hybrid"] as const)];
      if (r() < 0.1) q.posted = pick(["24h", "3d", "7d"] as const);
      if (r() < 0.08) q.official = true;
      if (r() < 0.06) q.salaryMin = pick([300_000, 600_000, 1_200_000]);
      if (r() < 0.06) q.exp = pick([0, 1, 2, 3, 5]);
      if (r() < 0.25) q.sort = pick(["newest", "salary"] as const);
      if (r() < 0.15) q.page = 2 + Math.floor(r() * 4);
      return url(q);
    }
    if (x < 0.85) {
      // text search, frequently with a filter
      const q: Partial<SearchQuery> = { q: pick(TERMS) };
      if (r() < 0.35) q.location = [pick(CITIES)];
      if (r() < 0.25) q.level = [pick(LEVELS)];
      if (r() < 0.1) q.type = ["internship"];
      if (r() < 0.15) q.sort = "newest";
      if (r() < 0.15) q.page = 2 + Math.floor(r() * 3);
      return url(q);
    }
    // typos and type-ahead prefixes
    const q: Partial<SearchQuery> = { q: pick(TYPOS) };
    if (r() < 0.3) q.location = [pick(CITIES)];
    return url(q);
  };

  const head = Array.from({ length: 40 }, make);
  const tail = Array.from({ length: n }, make);
  return { head, tail };
}

/** Next URL: 40 % from the popular head, 60 % from the long tail (deterministic sequence). */
export function urlPicker(mix: { head: string[]; tail: string[] }, seed = 99): () => string {
  const r = mulberry32(seed);
  let i = 0;
  return () => {
    i++;
    return r() < 0.4 ? mix.head[Math.floor(r() * mix.head.length)]! : mix.tail[i % mix.tail.length]!;
  };
}

export const SUGGEST_PREFIXES = ["s", "so", "sof", "soft", "d", "da", "dat", "data", "re", "rea", "reac", "am", "ama", "go", "goo", "in", "int", "inf", "ba", "ban", "pu", "py", "pyt", "ja", "jav", "ma", "mac", "an", "and", "fr", "fre", "hy", "hyd"];
