/**
 * DB row → contract shapes (JobListItem / JobDetail) and the matchable projection used by SSE filtering.
 */
import { sql, type SQL } from "drizzle-orm";
import type { JobDetail, JobListItem } from "@easyjobs/contract";
import { displayLocations } from "./merge";
import type { JobRecord } from "./records";
import type { MatchableJob } from "./search/filters";

const iso = (col: string): string => `to_char(${col} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;

/** Columns needed for a JobListItem + MatchableJob (no description). */
export const LIST_COLUMNS: SQL = sql.raw(
  [
    "j.id",
    "j.slug",
    "j.title",
    "j.company",
    `j.company_slug AS "companySlug"`,
    `j.company_domain AS "companyDomain"`,
    `j.company_logo_url AS "companyLogoUrl"`,
    `j.company_tags AS "companyTags"`,
    "j.locations",
    "j.cities",
    "j.countries",
    `j.is_remote AS "isRemote"`,
    `j.work_mode AS "workMode"`,
    `j.job_type AS "jobType"`,
    `j.experience_level AS "experienceLevel"`,
    `j.experience_min AS "experienceMin"`,
    `j.experience_max AS "experienceMax"`,
    "j.batches",
    "j.salary",
    `j.salary_inr_yearly_min AS "salaryInrYearlyMin"`,
    `j.salary_inr_yearly_max AS "salaryInrYearlyMax"`,
    "j.skills",
    "j.category",
    "j.tags",
    `${iso("j.posted_at")} AS "postedAt"`,
    `j.apply_url AS "applyUrl"`,
    `j.is_official AS "isOfficial"`,
    "j.sources",
    `j.source_ids AS "sourceIds"`,
    "j.summary",
    "j.status",
  ].join(", "),
);

export const DETAIL_COLUMNS: SQL = sql.raw(
  [
    `j.description_html AS "descriptionHtml"`,
    "j.degrees",
    "j.department",
    `${iso("j.valid_through")} AS "validThrough"`,
    `${iso("j.first_seen_at")} AS "firstSeenAt"`,
    `${iso("j.last_seen_at")} AS "lastSeenAt"`,
  ].join(", "),
);

export type ListRow = Pick<
  JobRecord,
  | "id" | "slug" | "title" | "company" | "companySlug" | "companyDomain" | "companyLogoUrl" | "companyTags" | "locations"
  | "cities" | "countries" | "isRemote" | "workMode" | "jobType" | "experienceLevel" | "experienceMin" | "experienceMax"
  | "batches" | "salary" | "salaryInrYearlyMin" | "salaryInrYearlyMax" | "skills" | "category" | "tags" | "postedAt"
  | "applyUrl" | "isOfficial" | "sources" | "sourceIds" | "summary" | "status"
>;
export type DetailRow = ListRow & Pick<JobRecord, "descriptionHtml" | "degrees" | "department" | "validThrough" | "firstSeenAt" | "lastSeenAt">;

export function toListItem(r: ListRow): JobListItem {
  return {
    id: r.id,
    slug: r.slug,
    title: r.title,
    company: { name: r.company, slug: r.companySlug, domain: r.companyDomain, logoUrl: r.companyLogoUrl, tags: r.companyTags },
    locations: displayLocations(r.locations, r.isRemote),
    isRemote: r.isRemote,
    workMode: r.workMode,
    jobType: r.jobType,
    experienceLevel: r.experienceLevel,
    experienceMin: r.experienceMin,
    experienceMax: r.experienceMax,
    batches: r.batches,
    salary: r.salary,
    skills: r.skills.slice(0, 8),
    category: r.category,
    tags: r.tags,
    postedAt: r.postedAt,
    applyUrl: r.applyUrl,
    isOfficial: r.isOfficial,
    sources: r.sources,
    summary: r.summary,
  };
}

export function toDetail(r: DetailRow): JobDetail {
  return {
    ...toListItem(r),
    descriptionHtml: r.descriptionHtml,
    degrees: r.degrees,
    department: r.department,
    validThrough: r.validThrough,
    firstSeenAt: r.firstSeenAt,
    lastSeenAt: r.lastSeenAt,
    status: r.status,
  };
}

export function toMatchable(r: ListRow): MatchableJob {
  return {
    status: r.status,
    jobType: r.jobType,
    experienceLevel: r.experienceLevel,
    workMode: r.workMode,
    category: r.category,
    cities: r.cities,
    countries: r.countries,
    isRemote: r.isRemote,
    companySlug: r.companySlug,
    companyTags: r.companyTags,
    skills: r.skills,
    batches: r.batches,
    sourceIds: r.sourceIds,
    tags: r.tags,
    isOfficial: r.isOfficial,
    postedAt: r.postedAt,
    salaryInrYearlyMin: r.salaryInrYearlyMin,
    salaryInrYearlyMax: r.salaryInrYearlyMax,
    experienceMin: r.experienceMin,
    experienceMax: r.experienceMax,
  };
}
