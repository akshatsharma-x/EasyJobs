import type { CompanyTarget, RawJob } from "@easyjobs/contract";
import { compact } from "../lib/mapping";
import { canonicalPageUrl, jobIdFromUrl } from "../lib/joburl";
import { findJobPostings, jobPostingToFields, type JobPostingFields, type JsonObject } from "../lib/jsonld";
import { extractMicrodataJobPosting } from "../lib/microdata";
import type { PageIndexEntry } from "../lib/page-index";
import { targetBase } from "../lib/run";

export interface ParsedJobPage {
  fields: JobPostingFields;
  via: "jsonld" | "microdata";
  /** JobPosting nodes found on the page. */
  postings: number;
  /** ld+json blocks that could not be parsed even after repairs. */
  malformed: number;
}

function sameUrl(a: string | null, b: string): boolean {
  if (!a) return false;
  try {
    return canonicalPageUrl(a) === canonicalPageUrl(b);
  } catch {
    return false;
  }
}

/** JSON-LD JobPosting (preferred) or schema.org microdata → fields. null when the page has neither. */
export function parseJobPage(html: string, pageUrl: string, now: Date = new Date()): ParsedJobPage | null {
  const scan = findJobPostings(html);
  if (scan.postings.length > 0) {
    const mapped = scan.postings.map((p: JsonObject) => jobPostingToFields(p, pageUrl, now)).filter((f) => f.title);
    const best = mapped.find((f) => sameUrl(f.url, pageUrl)) ?? mapped[0];
    if (best) return { fields: best, via: "jsonld", postings: scan.postings.length, malformed: scan.malformed };
  }
  const micro = extractMicrodataJobPosting(html);
  if (micro) {
    const fields = jobPostingToFields(micro, pageUrl, now);
    if (fields.title) return { fields, via: "microdata", postings: 1, malformed: scan.malformed };
  }
  return null;
}

/** The posting's own URL when it points at the same site, else the page we fetched. */
function applyUrlFor(fields: JobPostingFields, pageUrl: string): string {
  if (!fields.url) return pageUrl;
  try {
    const a = new URL(fields.url);
    const b = new URL(pageUrl);
    const base = (h: string): string => h.replace(/^www\./, "").split(".").slice(-2).join(".");
    return base(a.hostname) === base(b.hostname) ? fields.url : pageUrl;
  } catch {
    return pageUrl;
  }
}

export function pageToRawJob(source: string, target: CompanyTarget, pageUrl: string, parsed: ParsedJobPage, extra: Record<string, unknown> = {}): RawJob {
  const f = parsed.fields;
  return compact({
    source,
    sourceKind: "ats",
    sourceJobId: jobIdFromUrl(pageUrl),
    sourceUrl: pageUrl,
    applyUrl: applyUrlFor(f, pageUrl),
    title: f.title,
    ...targetBase(target),
    companyLogoUrl: f.companyLogoUrl ?? undefined,
    locations: f.locations,
    descriptionHtml: f.descriptionHtml,
    postedAt: f.postedAt,
    validThrough: f.validThrough ?? undefined,
    department: f.department ?? undefined,
    employmentTypeRaw: f.employmentTypeRaw ?? undefined,
    jobType: f.jobType,
    workMode: f.workMode,
    isRemote: f.isRemote,
    salary: f.salary ?? undefined,
    salaryRaw: f.salaryRaw ?? undefined,
    experienceRaw: f.experienceRaw ?? undefined,
    experienceMin: f.experienceMin ?? undefined,
    degrees: f.degrees.length > 0 ? f.degrees : undefined,
    skills: f.skills.length > 0 ? f.skills : undefined,
    extra: {
      [source]: compact({
        via: parsed.via,
        identifier: f.identifier ?? undefined,
        hiringOrganization: f.hiringOrganization ?? undefined,
        directApply: f.directApply ?? undefined,
        ...extra,
      }),
    },
  } satisfies RawJob);
}

/** Light record for a known job from what the page index remembers (no page fetch). */
export function lightFromIndex(source: string, target: CompanyTarget, pageUrl: string, entry: PageIndexEntry): RawJob | null {
  if (!entry.t) return null;
  return compact({
    source,
    sourceKind: "ats",
    sourceJobId: jobIdFromUrl(pageUrl),
    sourceUrl: pageUrl,
    applyUrl: pageUrl,
    title: entry.t,
    ...targetBase(target),
    locations: entry.l ?? [],
    descriptionHtml: null,
    postedAt: entry.p ?? null,
    validThrough: entry.v ?? undefined,
    extra: { [source]: { via: "index", detail: false }, light: true },
  } satisfies RawJob);
}

export function indexEntryFor(job: RawJob, lastmod: string | null, now: Date): PageIndexEntry {
  return compact({ t: job.title, l: job.locations, p: job.postedAt, v: job.validThrough ?? null, at: now.getTime(), lm: lastmod ?? undefined });
}
