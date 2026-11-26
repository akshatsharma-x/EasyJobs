/**
 * RawJob assembly: fills the company-level fields once, cleans strings, dedupes locations,
 * derives descriptionText/isRemote, defaults applyUrl to the official job page, and drops
 * empty optional hints so output stays compact.
 */
import type { RawJob } from "@easyjobs/contract";
import { cleanInline, ensureHtml, htmlToText } from "./html";
import { isRemoteLocation } from "./hints";

export interface CompanyInfo {
  /** Scraper id, RawJob.source, RawJob.target and companySlug — the registry slug ("amazon"). */
  slug: string;
  /** Display company name ("Amazon"). */
  name: string;
  domain: string;
  logoUrl?: string | null;
  /** Public careers landing page. */
  careersUrl: string;
}

type Optional = Omit<RawJob, "source" | "sourceKind" | "target" | "company" | "companySlug" | "companyDomain" | "title" | "sourceJobId" | "sourceUrl" | "applyUrl" | "locations" | "descriptionHtml" | "postedAt">;

export interface JobFields extends Optional {
  sourceJobId: string | number;
  title: string;
  /** Official job page (also the default applyUrl). */
  sourceUrl: string;
  applyUrl?: string | null;
  locations?: (string | null | undefined)[];
  /** HTML or plain text — plain text is converted to simple HTML. */
  descriptionHtml?: string | null;
  postedAt?: string | null;
  /** Overrides the company display name (e.g. a subsidiary brand). */
  company?: string;
}

const isEmpty = (v: unknown): boolean =>
  v === undefined || v === null || (typeof v === "string" && v.trim() === "") || (Array.isArray(v) && v.length === 0) ||
  (typeof v === "object" && !Array.isArray(v) && Object.keys(v as object).length === 0);

export function uniqueStrings(values: (string | null | undefined)[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const v of values) {
    const s = cleanInline(v);
    if (!s) continue;
    const k = s.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(s);
  }
  return out;
}

export function buildRawJob(company: CompanyInfo, f: JobFields): RawJob {
  const {
    sourceJobId, title, sourceUrl, applyUrl, locations, descriptionHtml, postedAt, company: companyName, descriptionText, ...hints
  } = f;
  const html = ensureHtml(descriptionHtml);
  const locs = uniqueStrings(locations ?? []);
  const job: RawJob = {
    source: company.slug,
    sourceKind: "career_site",
    sourceJobId: String(sourceJobId).trim(),
    sourceUrl,
    target: company.slug,
    applyUrl: applyUrl ?? sourceUrl,
    title: cleanInline(title),
    company: companyName ?? company.name,
    locations: locs,
    descriptionHtml: html,
    postedAt: postedAt ?? null,
    companySlug: company.slug,
    companyDomain: company.domain,
  };
  if (company.logoUrl) job.companyLogoUrl = company.logoUrl;
  const text = descriptionText ?? htmlToText(html);
  if (text) job.descriptionText = text;
  if (hints.isRemote === undefined) {
    if (hints.workMode) hints.isRemote = hints.workMode === "remote";
    else if (locs.length > 0 && locs.every((l) => isRemoteLocation(l))) hints.isRemote = true;
  }
  for (const [k, v] of Object.entries(hints) as [keyof Optional, unknown][]) {
    if (k === "tags" || k === "skills" || k === "degrees") {
      const arr = uniqueStrings((v as string[] | undefined) ?? []);
      if (arr.length > 0) (job as unknown as Record<string, unknown>)[k] = arr;
      continue;
    }
    if (k === "extra" && v && typeof v === "object") {
      const extra = Object.fromEntries(Object.entries(v as Record<string, unknown>).filter(([, x]) => !isEmpty(x)));
      if (Object.keys(extra).length > 0) job.extra = extra;
      continue;
    }
    if (!isEmpty(v)) (job as unknown as Record<string, unknown>)[k] = typeof v === "string" ? v.trim() : v;
  }
  return job;
}

/** Absolute URL helper (relative links on career pages). */
export function absoluteUrl(href: string | null | undefined, base: string): string | null {
  if (!href) return null;
  try {
    const u = new URL(href.trim(), base);
    return /^https?:$/.test(u.protocol) ? u.toString() : null;
  } catch {
    return null;
  }
}

/** URL-safe slug for building job page URLs ("Software Engineer II" → "software-engineer-ii"). */
export function urlSlug(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100)
    .replace(/-+$/g, "");
}
