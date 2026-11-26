import { isoFromEpochOrDate, parseRelativeTime } from "../shared/relative-time";
import { absoluteUrl, cleanText, stripQuery, uniqueCi } from "../shared/text";
import { asArray, asRecord, bool, labels, num, str, type Json } from "./json";
import { NAUKRI_ORIGIN } from "./plan";

/** Naukri's structured salary block (annual CTC). */
export interface NaukriSalary {
  min: number | null;
  max: number | null;
  currency: string;
  hidden: boolean;
}

/** One job of the search API response the results page receives. */
export interface NaukriListing {
  jobId: string;
  title: string;
  companyName: string;
  companyId: string | null;
  /** Absolute job page URL without tracking params. */
  jdUrl: string;
  logoUrl: string | null;
  /** placeholders[type=experience] — "0-1 Yrs" */
  experienceLabel: string | null;
  experienceMin: number | null;
  experienceMax: number | null;
  /** placeholders[type=salary] — "3-6 Lacs PA", "Not disclosed" */
  salaryLabel: string | null;
  salary: NaukriSalary | null;
  /** placeholders[type=location] — "Bengaluru, Hyderabad" */
  locationLabel: string | null;
  locations: string[];
  /** tagsAndSkills split on commas */
  skills: string[];
  /** footerPlaceholderLabel — "1 Day Ago", "Few Hours Ago", "Just Now" */
  postedLabel: string | null;
  /** createdDate (epoch ms) as ISO */
  createdAt: string | null;
  /** createdAt, else derived from postedLabel */
  postedAt: string | null;
  /** jobDescription — a short HTML teaser, not the full description */
  snippetHtml: string | null;
  vacancy: number | null;
  walkIn: boolean;
}

export interface NaukriSearchResult {
  /** noOfJobs — total matches for the query */
  total: number | null;
  listings: NaukriListing[];
}

export function parseNaukriSearch(payload: unknown, now: Date): NaukriSearchResult {
  const root = asRecord(payload);
  const listings: NaukriListing[] = [];
  const seen = new Set<string>();
  for (const item of asArray(root?.jobDetails)) {
    const listing = parseListing(asRecord(item), now);
    if (listing && !seen.has(listing.jobId)) {
      seen.add(listing.jobId);
      listings.push(listing);
    }
  }
  return { total: num(root?.noOfJobs), listings };
}

/** True when the payload looks like a search response at all (even with zero jobs). */
export function isNaukriSearchPayload(payload: unknown): boolean {
  const root = asRecord(payload);
  return root !== null && (Array.isArray(root.jobDetails) || "noOfJobs" in root);
}

function parseListing(r: Json | null, now: Date): NaukriListing | null {
  if (!r) return null;
  const jobId = str(r.jobId);
  const title = cleanText(str(r.title));
  const companyName = cleanText(str(r.companyName));
  const jdUrl = naukriJobUrl(str(r.jdURL));
  if (!jobId || !title || !companyName || !jdUrl) return null;

  const placeholder = (type: string): string | null => {
    for (const p of asArray(r.placeholders)) {
      const rec = asRecord(p);
      if (str(rec?.type)?.toLowerCase() === type) return cleanText(str(rec?.label));
    }
    return null;
  };
  const experienceLabel = placeholder("experience") ?? cleanText(str(r.experienceText));
  const years = parseYearsRange(experienceLabel);
  const locationLabel = placeholder("location");
  const createdAt = isoFromEpochOrDate(r.createdDate);
  const postedLabel = cleanText(str(r.footerPlaceholderLabel));

  return {
    jobId,
    title,
    companyName,
    companyId: str(r.companyId),
    jdUrl,
    logoUrl: absoluteUrl(str(r.logoPathV3) ?? str(r.logoPath)),
    experienceLabel,
    experienceMin: years?.min ?? null,
    experienceMax: years?.max ?? null,
    salaryLabel: placeholder("salary"),
    salary: parseSalaryDetail(r.salaryDetail),
    locationLabel,
    locations: splitLocations(locationLabel),
    skills: uniqueCi(labels(r.tagsAndSkills)),
    postedLabel,
    createdAt,
    postedAt: createdAt ?? parseRelativeTime(postedLabel, now),
    snippetHtml: str(r.jobDescription),
    vacancy: num(r.vacancy),
    walkIn: bool(r.isWalkIn) || bool(r.walkIn) || /walk[\s-]?in/i.test(str(r.mode) ?? ""),
  };
}

/** "/job-listings-…-251125500123?src=…" → "https://www.naukri.com/job-listings-…-251125500123" */
export function naukriJobUrl(jdUrl: string | null): string | null {
  const abs = absoluteUrl(jdUrl, NAUKRI_ORIGIN);
  if (!abs || !/(^|\.)naukri\.com$/.test(new URL(abs).hostname)) return null;
  return stripQuery(abs);
}

/** "0-1 Yrs" · "2 - 5 years" · "3+ Yrs" → {min, max}; anything else → null (the normalizer parses the raw label). */
export function parseYearsRange(label: string | null): { min: number; max: number | null } | null {
  if (!label) return null;
  const range = /^(\d{1,2})\s*(?:-|to|–)\s*(\d{1,2})\s*(?:yrs?|years?)$/i.exec(label.trim());
  if (range) {
    const min = Number(range[1]);
    const max = Number(range[2]);
    return min <= max ? { min, max } : null;
  }
  const plus = /^(\d{1,2})\s*\+\s*(?:yrs?|years?)$/i.exec(label.trim());
  return plus ? { min: Number(plus[1]), max: null } : null;
}

/** "Bengaluru, Hyderabad( Hitech City )" → ["Bengaluru", "Hyderabad( Hitech City )"]; slashes are left to the normalizer. */
export function splitLocations(label: string | null): string[] {
  if (!label) return [];
  return uniqueCi(label.split(",").map((s) => s.trim()).filter(Boolean));
}

/**
 * Structured salary, accepted only when visible and plausible as annual INR (≥ 10,000) — Naukri shows CTC per
 * annum. Never invents one: hidden, zero or implausible values → null (the raw label still goes to salaryRaw).
 */
export function parseSalaryDetail(v: unknown): NaukriSalary | null {
  const r = asRecord(v);
  if (!r) return null;
  const hidden = bool(r.hideSalary);
  const min = num(r.minimumSalary);
  const max = num(r.maximumSalary);
  const currency = (str(r.currency) ?? "INR").toUpperCase();
  const plausible = (n: number | null): n is number => n !== null && n >= 10_000;
  if (hidden || (!plausible(min) && !plausible(max))) return null;
  return { min: plausible(min) ? min : null, max: plausible(max) ? max : null, currency, hidden };
}
