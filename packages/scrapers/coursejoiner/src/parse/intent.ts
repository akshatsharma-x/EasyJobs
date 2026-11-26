/** Decides whether a post is a job post worth parsing (categories, tags, title). */
import type { WpPostRef } from "../wp/types";
import { DEFAULT_AMBIGUOUS_CATEGORIES, type WpJobBlogConfig } from "../wp/config";

export type IntentKind = "internship" | "job" | "apprenticeship" | "walk_in" | "off_campus" | "wfh" | "experienced";

export interface IntentResult {
  candidate: boolean;
  /** Why a post was skipped (stats/debugging). */
  reason?: string;
  kinds: IntentKind[];
  matchedCategories: string[];
}

/** "*-internships" style patterns → RegExp. */
export function slugPattern(pattern: string): RegExp {
  const body = pattern
    .trim()
    .toLowerCase()
    .split("*")
    .map((p) => p.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp(`^${body}$`);
}

export function matchesAny(slug: string, patterns: readonly string[] | undefined): boolean {
  if (!patterns || patterns.length === 0) return false;
  return patterns.some((p) => slugPattern(p).test(slug.toLowerCase()));
}

/** Titles that are never job posts. */
const NON_JOB_TITLE = new RegExp(
  [
    String.raw`\b(?:free\s+)?(?:online\s+)?courses?\b(?!\s+(?:coordinator|instructor|developer|manager|designer|advisor|counsel(?:l)?or|creator))`,
    String.raw`\budemy\b`, String.raw`\bcoursera\b`, String.raw`\bscholarships?\b`, String.raw`\bquiz(?:zes)?\b`, String.raw`\badmit\s+card\b`,
    String.raw`\bhall\s+ticket\b`, String.raw`\bresults?\s+(?:out|declared|20\d\d)\b`, String.raw`\b(?:exam|merit)\s+(?:result|list|pattern|date)s?\b`,
    String.raw`\bsyllabus\b`, String.raw`\banswer\s+key\b`, String.raw`\bcut[\s-]?off\b`, String.raw`\bquestion\s+papers?\b`, String.raw`\bwebinars?\b`,
    String.raw`\bbootcamps?\b`, String.raw`\bhackathons?\b`, String.raw`\b(?:code|data|idea)thons?\b`, String.raw`\bhiring\s+challenge\b`,
    String.raw`\bcompetitions?\b`, String.raw`\bcontests?\b`, String.raw`\bgiveaways?\b`, String.raw`\bfree\s+(?:trial|trail|subscription|swags?|goodies|offer|access|premium)\b`,
    String.raw`\bsubscription\b`, String.raw`\bget\s+(?:\d+\s+months?\s+of\s+)?free\b`, String.raw`\binterview\s+(?:questions|experience|tips|preparation)\b`,
    String.raw`\bselection\s+process\s+explained\b`, String.raw`\bjob\s+market\s+today\b`, String.raw`\bto\s+hire\s+[\d,]+\b`, String.raw`\blayoffs?\b`,
    String.raw`\bsalary\s+hike\b`, String.raw`\bfresher\s+salary\b`, String.raw`\bhow\s+to\s+get\b`, String.raw`\bcertificat(?:e|ion)\s+course\b`,
    String.raw`\bfree\s+certificat(?:e|ion)\s+(?:program|training)\b`, String.raw`\byojana\b`, String.raw`\bresume\s+(?:tips|template|format)\b`,
    String.raw`\btraining\s+program(?:me)?\b(?!.*\b(?:stipend|intern|trainee|job|salary)\b)`,
    String.raw`\b(?:virtual\s+)?job\s+simulations?\b`, String.raw`\bvirtual\s+experience\s+program(?:me)?\b`, String.raw`\bmicro[\s-]internships?\b`,
  ].join("|"),
  "i",
);

/** Ambassador/fellowship/program posts are jobs only with an explicit job word. */
const AMBASSADOR = /\bambassadors?\b/i;
const POSITIVE_TITLE = /\b(?:intern(?:ship)?s?|jobs?|hiring|recruit(?:ment|ing)?|vacanc(?:y|ies)|apprentice(?:ship)?s?|trainee(?:ship)?s?|walk[\s-]?ins?|walkin|off[\s-]?campus|pool[\s-]?campus|drive|placement|fellowship|careers?|openings?|engineers?|analysts?|developers?|executives?|associates?|officers?|managers?|specialists?|consultants?|representatives?|designers?|writers?|scientists?|programmers?|support|summer analyst|graduate program(?:me)?|sde|swe|stipend)\b/i;
const JOB_CATEGORY = /(?:job|intern|campus|drive|walk|fresher|hiring|recruit|apprentic|trainee|vacanc|career|placement|batch|wfh|work-from-home|opening)/;

export function classifyIntent(post: WpPostRef, site: Pick<WpJobBlogConfig, "includeCategories" | "excludeCategories" | "ambiguousCategories">): IntentResult {
  const cats = post.categories.map((c) => c.slug.toLowerCase());
  const tags = post.tags.map((t) => t.slug.toLowerCase());
  const title = post.title;
  const kinds = detectKinds(title, cats, tags);
  const excluded = cats.find((c) => matchesAny(c, site.excludeCategories));
  if (excluded) return { candidate: false, reason: `excluded category: ${excluded}`, kinds, matchedCategories: [] };

  const amb = /\bintern(?:ship)?s?\b/i.test(title) ? null : AMBASSADOR.test(title) ? "ambassador" : null;
  if (amb) return { candidate: false, reason: "non-job title: ambassador", kinds, matchedCategories: [] };
  const nonJob = NON_JOB_TITLE.exec(title);
  if (nonJob) return { candidate: false, reason: `non-job title: ${nonJob[0].toLowerCase()}`, kinds, matchedCategories: [] };

  const positive = POSITIVE_TITLE.test(title);
  if (site.includeCategories && site.includeCategories.length > 0) {
    const matched = cats.filter((c) => matchesAny(c, site.includeCategories));
    if (matched.length === 0) return { candidate: false, reason: `category not included: ${cats.join(",") || "(none)"}`, kinds, matchedCategories: [] };
    const ambiguous = site.ambiguousCategories ?? DEFAULT_AMBIGUOUS_CATEGORIES;
    const onlyAmbiguous = matched.every((c) => matchesAny(c, ambiguous));
    if (onlyAmbiguous && !positive) return { candidate: false, reason: `ambiguous category without job signal: ${matched.join(",")}`, kinds, matchedCategories: matched };
    return { candidate: true, kinds, matchedCategories: matched };
  }
  const jobCats = cats.filter((c) => JOB_CATEGORY.test(c));
  if (!positive && jobCats.length === 0) return { candidate: false, reason: "no job signal in title/categories", kinds, matchedCategories: [] };
  return { candidate: true, kinds, matchedCategories: jobCats };
}

function detectKinds(title: string, cats: string[], tags: string[]): IntentKind[] {
  const hay = `${title} ${cats.join(" ")} ${tags.join(" ")}`.toLowerCase();
  const kinds = new Set<IntentKind>();
  if (/\bintern(?:ship)?s?\b/.test(hay)) kinds.add("internship");
  if (/apprentic/.test(hay)) kinds.add("apprenticeship");
  if (/walk[\s-]?in|walkin/.test(hay)) kinds.add("walk_in");
  if (/off[\s-]?campus|pool[\s-]?campus/.test(hay)) kinds.add("off_campus");
  if (/work[\s-]from[\s-]home|\bwfh\b|remote/.test(hay)) kinds.add("wfh");
  if (/\b(?:experienced|[3-9]\+?\s*years?)\b/.test(hay)) kinds.add("experienced");
  if (/\bjobs?\b|hiring|recruit|vacanc|trainee|drive/.test(hay) || kinds.size === 0) kinds.add("job");
  return [...kinds];
}
