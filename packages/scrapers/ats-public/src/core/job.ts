/**
 * Builds contract RawJobs with the fields every ATS adapter shares (source, target, company, URLs…),
 * so adapters only map what is specific to their API.
 */
import type { CompanyTarget, ExperienceLevel, JobType, RawJob, Salary, WorkMode } from "@easyjobs/contract";
import { toIso } from "../lib/dates";
import { isBlankHtml } from "../lib/html";
import { pruneLocations } from "../lib/location";
import { clean, cleanMultiline, compact, httpUrl, uniqStrings } from "../lib/text";

export interface JobDraft {
  sourceJobId: unknown;
  title: unknown;
  /** Human-viewable posting page at the ATS (becomes sourceUrl). */
  url: unknown;
  /** Official posting/apply page; defaults to `url`. */
  applyUrl?: unknown;
  /** ATS-side company name; used only when the target has no name. */
  company?: unknown;
  companyLogoUrl?: unknown;
  locations?: unknown[];
  descriptionHtml?: string | null;
  descriptionText?: string | null;
  postedAt?: unknown;
  validThrough?: unknown;
  department?: unknown;
  employmentTypeRaw?: unknown;
  experienceRaw?: unknown;
  salaryRaw?: unknown;
  jobType?: JobType;
  experienceLevel?: ExperienceLevel;
  experienceMin?: number | null;
  experienceMax?: number | null;
  workMode?: WorkMode;
  isRemote?: boolean;
  salary?: Salary | null;
  tags?: string[];
  extra?: Record<string, unknown>;
}

const logoFromTarget = (target: CompanyTarget): string | null => {
  const extra = target.extra ?? {};
  return httpUrl(extra.logoUrl) ?? httpUrl(extra.logo) ?? null;
};

/** null when the draft lacks an id, a title or a valid posting URL (callers count it as skipped). */
export function buildJob(source: string, target: CompanyTarget, draft: JobDraft): RawJob | null {
  const sourceJobId = clean(draft.sourceJobId);
  const title = clean(draft.title);
  const sourceUrl = httpUrl(draft.url);
  const company = clean(target.name) ?? clean(draft.company);
  if (!sourceJobId || !title || !sourceUrl || !company) return null;

  const job: RawJob = {
    source,
    sourceKind: "ats",
    sourceJobId,
    sourceUrl,
    target: target.slug,
    applyUrl: httpUrl(draft.applyUrl) ?? sourceUrl,
    title,
    company,
    locations: pruneLocations(uniqStrings(draft.locations ?? [])),
    descriptionHtml: isBlankHtml(draft.descriptionHtml) ? null : (draft.descriptionHtml as string).trim(),
    postedAt: toIso(draft.postedAt),
    companySlug: target.slug,
    companyDomain: clean(target.domain),
    companyLogoUrl: httpUrl(draft.companyLogoUrl) ?? logoFromTarget(target),
    descriptionText: cleanMultiline(draft.descriptionText) ?? undefined,
    validThrough: toIso(draft.validThrough) ?? undefined,
    department: clean(draft.department) ?? undefined,
    employmentTypeRaw: clean(draft.employmentTypeRaw) ?? undefined,
    experienceRaw: clean(draft.experienceRaw) ?? undefined,
    salaryRaw: clean(draft.salaryRaw) ?? draft.salary?.raw ?? undefined,
    jobType: draft.jobType,
    experienceLevel: draft.experienceLevel,
    experienceMin: draft.experienceMin ?? undefined,
    experienceMax: draft.experienceMax ?? undefined,
    workMode: draft.workMode,
    isRemote: draft.isRemote ?? (draft.workMode ? draft.workMode === "remote" : undefined),
    salary: draft.salary ?? undefined,
    tags: draft.tags && draft.tags.length > 0 ? draft.tags : undefined,
    extra: draft.extra,
  };
  return compact(job);
}
