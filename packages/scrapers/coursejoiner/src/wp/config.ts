export type SourceStrategy = "rest" | "rss" | "html";

/** Configuration of one WordPress job blog (createWpJobBlogScraper). */
export interface WpJobBlogConfig {
  /** Scraper id → RawJob.source, e.g. "coursejoiner". */
  id: string;
  /** Display name, e.g. "CourseJoiner". */
  name: string;
  /** Site origin, e.g. "https://coursejoiner.com" (no trailing slash needed). */
  baseUrl: string;
  /**
   * Category (or tag) slug patterns that mark job posts. Exact slugs or `*` wildcards ("*-internships").
   * When set, a post must match at least one of them. When omitted, every post that is not excluded is a candidate.
   */
  includeCategories?: string[];
  /** Category slug patterns that mark non-job posts (courses, scholarships, news…). Exclude wins over include. */
  excludeCategories?: string[];
  /**
   * Included categories that are too broad on their own ("program", "uncategorized"): posts whose only
   * matching include category is one of these also need a job word in the title.
   * Default: ["program", "programs", "fellowship", "uncategorized", "placement", "educational", "blog"].
   */
  ambiguousCategories?: string[];
  /** Strategies to try in order. Default ["rest", "rss", "html"]. */
  strategies?: SourceStrategy[];
  /** RSS feed URL for the rss/html strategies. Default `${baseUrl}/feed/`. */
  feedUrl?: string;
  /** Default schedule in minutes (default 15). */
  intervalMinutes?: number;
  /** First-run / refresh window in days (default 60; env/CLI override). */
  backfillDays?: number;
  /** Shown in the UI, e.g. "Jobs via CourseJoiner". */
  attribution?: string;
  /** Allow optional LLM extraction for low-confidence posts (default true; still requires ANTHROPIC_API_KEY). */
  llm?: boolean;
  /** Min gap between requests to this site (default 1000 ms → ≤ 1 req/s). */
  minGapMs?: number;
}

export const DEFAULT_AMBIGUOUS_CATEGORIES = ["program", "programs", "fellowship", "uncategorized", "placement", "educational", "blog"];
