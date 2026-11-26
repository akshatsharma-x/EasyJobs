import type { WpJobBlogConfig } from "./wp/config";

/**
 * Sites verified on 2026-11-26 (robots.txt allows crawling; public WP REST API available).
 * See README.md → "Discovery" for the evidence behind each entry.
 */
export const COURSEJOINER: WpJobBlogConfig = {
  id: "coursejoiner",
  name: "CourseJoiner",
  baseUrl: "https://coursejoiner.com",
  // Job-ish categories. Patterns: exact slug, or "*" wildcards.
  includeCategories: [
    "internship", "internships", "*-internships", "virtual-internship", "job", "jobs", "govt-jobs", "apprenticeship",
    "trainee", "off-campus-drive", "walk-in", "work-from-home-job", "placement", "internship-fair", "fellowship",
    "challengeshackathoninternships", "program", "uncategorized",
  ],
  // Courses, scholarships, quizzes, news, events… (exclude wins over include).
  excludeCategories: [
    "*udemy*", "free-online-courses", "free-best-udemy-courses", "courses-answer", "scholarship", "scholarships", "news",
    "quiz", "free-swags", "educational", "free-trainings", "training-program", "specalised-training", "bootcamp", "event",
    "contest", "hackathon", "challenges", "datathon", "scheme", "campus-ambassador-program", "ambassador",
    "competitions*", "development", "photography*", "*-courses*",
  ],
  attribution: "Jobs via CourseJoiner",
  llm: true,
};

export const KICKCHARM: WpJobBlogConfig = {
  id: "kickcharm",
  name: "KickCharm",
  baseUrl: "https://kickcharm.com",
  excludeCategories: ["news", "learning", "interview-tips", "company", "fresher-salary", "*interview*"],
  attribution: "Jobs via KickCharm",
  llm: true,
};

export const FRESHERSHUNT: WpJobBlogConfig = {
  id: "freshershunt",
  name: "FreshersHunt",
  baseUrl: "https://freshershunt.in",
  excludeCategories: ["blog", "news", "*interview*", "*syllabus*", "*result*"],
  attribution: "Jobs via FreshersHunt",
  // robots.txt disallows /feed/ — REST only (allowed), never the RSS fallback.
  strategies: ["rest"],
  llm: true,
};

export const FRESHEROFFCAMPUS: WpJobBlogConfig = {
  id: "fresheroffcampus",
  name: "FresherOffCampus",
  baseUrl: "https://www.fresheroffcampus.com",
  excludeCategories: ["blog", "news", "*interview*", "*syllabus*", "*result*"],
  attribution: "Jobs via FresherOffCampus",
  llm: true,
};

export const SITES: WpJobBlogConfig[] = [COURSEJOINER, FRESHERSHUNT, FRESHEROFFCAMPUS, KICKCHARM];

export function getSite(id: string): WpJobBlogConfig | undefined {
  return SITES.find((s) => s.id === id);
}
