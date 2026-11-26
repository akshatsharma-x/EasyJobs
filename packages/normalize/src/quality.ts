import type { JobLocation, Salary, SourceKind } from "@easyjobs/contract";
import { bag, isRecord, validNow } from "./text";
import { isJobBoardHost, isJobSpecificUrl, isOfficialHost, parseHttpUrl } from "./url";

export interface QualityInput {
  sourceKind: SourceKind;
  applyUrl: string | null;
  sourceUrl: string | null;
  descriptionText: string | null;
  salary: Salary | null;
  locations: readonly JobLocation[];
  isRemote: boolean;
  postedAt: string;
  tags: readonly string[];
  now?: Date;
}

const DAY = 86_400_000;

/**
 * 0–100. Points: official source 25 · real apply URL ≤20 · description length ≤20 · salary 10 ·
 * parsed location 10 · recency ≤15. Suspicious −40.
 */
export function qualityScore(input: QualityInput): number {
  const job = bag(input);
  const locations = Array.isArray(job.locations) ? job.locations : [];
  const tags = Array.isArray(job.tags) ? job.tags : [];
  let score = 0;
  if (job.sourceKind === "ats" || job.sourceKind === "career_site") score += 25;

  const apply = typeof job.applyUrl === "string" && parseHttpUrl(job.applyUrl) ? job.applyUrl : null;
  if (apply) {
    if (isOfficialHost(apply)) score += isJobSpecificUrl(apply) ? 20 : 12;
    else if (isJobBoardHost(apply)) score += apply === job.sourceUrl ? 4 : 8;
    else score += 2;
  }

  const len = typeof job.descriptionText === "string" ? job.descriptionText.length : 0;
  score += len >= 1500 ? 20 : len >= 700 ? 15 : len >= 300 ? 10 : len >= 80 ? 5 : 0;

  if (isRecord(job.salary) && (typeof job.salary.min === "number" || typeof job.salary.max === "number")) score += 10;
  if (job.isRemote === true || locations.some((l) => isRecord(l) && (l.city || l.country))) score += 10;

  const now = validNow(job.now).getTime();
  const posted = typeof job.postedAt === "string" ? Date.parse(job.postedAt) : Number.NaN;
  if (Number.isFinite(posted)) {
    const age = Math.max(0, now - posted);
    score += age <= 3 * DAY ? 15 : age <= 7 * DAY ? 12 : age <= 14 * DAY ? 9 : age <= 30 * DAY ? 6 : age <= 60 * DAY ? 3 : 0;
  }

  if (tags.includes("suspicious")) score -= 40;
  if (tags.includes("test-posting")) score -= 80;
  return Math.max(0, Math.min(100, Math.round(score)));
}
