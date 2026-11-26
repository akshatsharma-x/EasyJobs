import type { JobType, RawJob, Salary } from "@easyjobs/contract";
import { uniqueCi } from "../shared/text";
import { descriptionWithFacts, type NaukriDetail } from "./parse-detail";
import type { NaukriListing, NaukriSalary } from "./parse-search";
import type { NaukriQuery } from "./plan";

const EMPLOYMENT: readonly (readonly [RegExp, JobType])[] = [
  [/intern/i, "internship"],
  [/apprentice/i, "apprenticeship"],
  [/freelanc/i, "freelance"],
  [/contract/i, "contract"],
  [/temporary/i, "temporary"],
  [/part[\s-]?time/i, "part_time"],
  [/full[\s-]?time/i, "full_time"],
];

export function naukriJobType(employmentType: string | null): JobType | undefined {
  if (!employmentType) return undefined;
  return EMPLOYMENT.find(([re]) => re.test(employmentType))?.[1];
}

function toSalary(s: NaukriSalary | null, raw: string | null): Salary | null {
  if (!s) return null;
  return { min: s.min, max: s.max, currency: s.currency, period: "year", raw };
}

/** First 300 chars of the listing teaser as plain text (used only when no detail was fetched). */
function snippetText(html: string | null): string | null {
  if (!html) return null;
  const text = html.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
  return text ? text.slice(0, 300) : null;
}

/**
 * Listing (+ optional detail) → RawJob.
 * - sourceUrl = jdURL; applyUrl = the company site when the job redirects off Naukri, otherwise jdURL
 * - hints: experienceMin/Max (structured years), salary (visible structured CTC only), skills (tagsAndSkills / key
 *   skills), jobType ← employment type, tags ← walk-in
 * - target is always null: search results are never a complete listing, so these jobs must never be swept
 */
export function mapNaukriJob(listing: NaukriListing, detail: NaukriDetail | null, query: NaukriQuery): RawJob {
  const employmentType = detail?.employmentType ?? null;
  const jobType = naukriJobType(employmentType);
  const experienceMin = detail?.experienceMin ?? listing.experienceMin;
  const experienceMax = detail?.experienceMax ?? listing.experienceMax;
  const salaryRaw = detail?.salaryLabel ?? listing.salaryLabel;
  const salary = toSalary(detail?.salary ?? listing.salary, salaryRaw);
  const skills = uniqueCi([...(detail?.skills ?? []), ...listing.skills]).slice(0, 20);
  const locations = listing.locations.length > 0 ? listing.locations : (detail?.locations ?? []);
  const walkIn = listing.walkIn || (detail?.walkIn ?? false);

  const job: RawJob = {
    source: "naukri",
    sourceKind: "job_board",
    sourceJobId: listing.jobId,
    sourceUrl: listing.jdUrl,
    target: null,
    applyUrl: detail?.applyRedirectUrl ?? listing.jdUrl,
    title: listing.title,
    company: listing.companyName,
    locations,
    descriptionHtml: detail ? descriptionWithFacts(detail) : null,
    postedAt: listing.postedAt ?? detail?.createdAt ?? null,
    companyLogoUrl: listing.logoUrl,
    descriptionText: detail ? null : snippetText(listing.snippetHtml),
    department: detail?.department ?? null,
    employmentTypeRaw: employmentType,
    experienceRaw: listing.experienceLabel,
    salaryRaw,
    experienceMin,
    experienceMax,
    salary,
    skills,
    tags: walkIn ? ["walk-in"] : [],
    extra: {
      naukri: {
        query: { keywords: query.keywords, experience: query.experience },
        companyId: listing.companyId,
        postedLabel: listing.postedLabel,
        vacancy: listing.vacancy,
        roleCategory: detail?.roleCategory ?? null,
        role: detail?.role ?? null,
        industry: detail?.industry ?? null,
        education: detail?.education ?? null,
        companyWebsite: detail?.companyWebsite ?? null,
        companyApplyUrl: detail?.applyRedirectUrl ?? null,
        detailFetched: detail !== null,
        descriptionIsSnippet: detail === null && listing.snippetHtml !== null,
      },
    },
  };
  if (jobType) job.jobType = jobType;
  return job;
}
