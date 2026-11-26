import type { ExperienceLevel, JobType, RawJob, WorkMode } from "@easyjobs/contract";
import { EMPLOYMENT_TYPE, F_E_CODES, F_E_LEVEL, F_WT_CODES, SENIORITY_LEVEL } from "./constants";
import type { LinkedInCard } from "./parse-listing";
import type { LinkedInDetail } from "./parse-detail";
import { linkedInViewUrl, type LinkedInQuery } from "./plan";

/**
 * Card (+ optional detail) → RawJob.
 * - sourceUrl = https://www.linkedin.com/jobs/view/{id}
 * - applyUrl  = the company/ATS URL behind "Apply" when the detail exposes one (lets §0.4 rule 1 merge it with the
 *   official posting), otherwise the LinkedIn view URL
 * - hints: jobType ← "Employment type"; experienceLevel ← "Seniority level" (or the query's single f_E code when no
 *   detail was fetched); workMode ← a single f_WT code; department ← "Job function"
 * - target is always null: a search window is never a complete listing, so these jobs must never be swept
 */
export function mapLinkedInJob(card: LinkedInCard, detail: LinkedInDetail | null, query: LinkedInQuery): RawJob {
  const viewUrl = linkedInViewUrl(card.id);
  const criteria = detail?.criteria ?? null;
  const jobType: JobType | undefined = criteria?.employmentType ? EMPLOYMENT_TYPE[criteria.employmentType.toLowerCase()] : undefined;
  let level: ExperienceLevel | undefined = criteria?.seniority
    ? SENIORITY_LEVEL[criteria.seniority.toLowerCase()]
    : query.experience
      ? F_E_LEVEL[query.experience]
      : undefined;
  if (jobType === "internship") level = "intern";
  const onlyWorkType = query.workTypes.length === 1 ? query.workTypes[0] : undefined;
  const workMode: WorkMode | undefined = onlyWorkType ? F_WT_CODES[onlyWorkType] : undefined;
  const location = card.location ?? detail?.location ?? null;

  const job: RawJob = {
    source: "linkedin",
    sourceKind: "job_board",
    sourceJobId: card.id,
    sourceUrl: viewUrl,
    target: null,
    applyUrl: detail?.offsiteApplyUrl ?? viewUrl,
    title: card.title,
    company: card.company,
    locations: location ? [location] : [],
    descriptionHtml: detail?.descriptionHtml ?? null,
    postedAt: card.postedAt ?? detail?.postedAt ?? null,
    companyLogoUrl: card.companyLogoUrl,
    department: criteria?.jobFunction ?? null,
    employmentTypeRaw: criteria?.employmentType ?? null,
    salaryRaw: detail?.salaryText ?? card.salaryText ?? null,
    extra: {
      linkedin: {
        query: {
          keywords: query.keywords,
          f_E: query.experience ? `${query.experience} (${F_E_CODES[query.experience]})` : null,
          f_WT: query.workTypes.length > 0 ? query.workTypes.join(",") : null,
        },
        seniority: criteria?.seniority ?? null,
        employmentType: criteria?.employmentType ?? null,
        jobFunction: criteria?.jobFunction ?? null,
        industries: criteria?.industries ?? null,
        companyPage: card.companyUrl ?? detail?.companyUrl ?? null,
        offsiteApplyUrl: detail?.offsiteApplyUrl ?? null,
        listedDate: card.listedDate,
        listedText: card.listedText,
        isNew: card.isNew,
        benefits: card.benefits,
        detailFetched: detail !== null,
      },
    },
  };
  if (jobType) job.jobType = jobType;
  if (level) job.experienceLevel = level;
  if (workMode) {
    job.workMode = workMode;
    job.isRemote = workMode === "remote";
  }
  return job;
}
