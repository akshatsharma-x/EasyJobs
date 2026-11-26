/**
 * Stored-record shapes and the single column spec that drives both reading (camelCase SELECT with ISO
 * timestamps) and bulk writing (one JSON parameter → jsonb_to_recordset → INSERT … ON CONFLICT).
 */
import { sql, type SQL } from "drizzle-orm";
import type {
  ExperienceLevel,
  JobCategory,
  JobLocation,
  JobSourceRef,
  JobType,
  Salary,
  SourceKind,
  SourceTerms,
  WorkMode,
} from "@easyjobs/contract";
import type { ClosedReason, JobStatus } from "./schema";

export interface JobRecord {
  id: string;
  fingerprint: string;
  slug: string;
  title: string;
  company: string;
  companySlug: string;
  companyDomain: string | null;
  companyLogoUrl: string | null;
  companyTags: string[];
  locations: JobLocation[];
  cities: string[];
  countries: string[];
  workMode: WorkMode | null;
  isRemote: boolean;
  jobType: JobType;
  experienceLevel: ExperienceLevel;
  experienceMin: number | null;
  experienceMax: number | null;
  batches: number[];
  degrees: string[];
  salary: Salary | null;
  salaryInrYearlyMin: number | null;
  salaryInrYearlyMax: number | null;
  skills: string[];
  category: JobCategory;
  department: string | null;
  descriptionHtml: string | null;
  descriptionText: string | null;
  summary: string | null;
  postedAt: string;
  validThrough: string | null;
  qualityScore: number;
  tags: string[];
  extra: Record<string, unknown>;
  applyUrl: string;
  sourceIds: string[];
  sources: JobSourceRef[];
  bestSourceKind: SourceKind;
  isOfficial: boolean;
  status: JobStatus;
  closedReason: ClosedReason | null;
  firstSeenAt: string;
  lastSeenAt: string;
  closedAt: string | null;
  updatedAt: string;
  fieldPrio: Record<string, number>;
  searchMeta: string;
}

export interface SourceRecord {
  jobId: string;
  source: string;
  sourceName: string;
  sourceKind: SourceKind;
  sourceJobId: string;
  target: string | null;
  url: string;
  firstSeenAt: string;
  lastSeenAt: string;
  removedAt: string | null;
  /** Contract 1.1 (`JobSourceRef.attribution`). */
  attribution: string | null;
  /** Contract 1.1 (`JobSourceRef.terms`). */
  terms: SourceTerms | null;
}

type PgType = "text" | "text[]" | "int[]" | "jsonb" | "boolean" | "float8" | "int" | "timestamptz";
type ColumnSpec<T> = readonly (readonly [keyof T & string, string, PgType])[];

export const JOB_COLUMNS: ColumnSpec<JobRecord> = [
  ["id", "id", "text"],
  ["fingerprint", "fingerprint", "text"],
  ["slug", "slug", "text"],
  ["title", "title", "text"],
  ["company", "company", "text"],
  ["companySlug", "company_slug", "text"],
  ["companyDomain", "company_domain", "text"],
  ["companyLogoUrl", "company_logo_url", "text"],
  ["companyTags", "company_tags", "text[]"],
  ["locations", "locations", "jsonb"],
  ["cities", "cities", "text[]"],
  ["countries", "countries", "text[]"],
  ["workMode", "work_mode", "text"],
  ["isRemote", "is_remote", "boolean"],
  ["jobType", "job_type", "text"],
  ["experienceLevel", "experience_level", "text"],
  ["experienceMin", "experience_min", "float8"],
  ["experienceMax", "experience_max", "float8"],
  ["batches", "batches", "int[]"],
  ["degrees", "degrees", "text[]"],
  ["salary", "salary", "jsonb"],
  ["salaryInrYearlyMin", "salary_inr_yearly_min", "float8"],
  ["salaryInrYearlyMax", "salary_inr_yearly_max", "float8"],
  ["skills", "skills", "text[]"],
  ["category", "category", "text"],
  ["department", "department", "text"],
  ["descriptionHtml", "description_html", "text"],
  ["descriptionText", "description_text", "text"],
  ["summary", "summary", "text"],
  ["postedAt", "posted_at", "timestamptz"],
  ["validThrough", "valid_through", "timestamptz"],
  ["qualityScore", "quality_score", "int"],
  ["tags", "tags", "text[]"],
  ["extra", "extra", "jsonb"],
  ["applyUrl", "apply_url", "text"],
  ["sourceIds", "source_ids", "text[]"],
  ["sources", "sources", "jsonb"],
  ["bestSourceKind", "best_source_kind", "text"],
  ["isOfficial", "is_official", "boolean"],
  ["status", "status", "text"],
  ["closedReason", "closed_reason", "text"],
  ["firstSeenAt", "first_seen_at", "timestamptz"],
  ["lastSeenAt", "last_seen_at", "timestamptz"],
  ["closedAt", "closed_at", "timestamptz"],
  ["updatedAt", "updated_at", "timestamptz"],
  ["fieldPrio", "field_prio", "jsonb"],
  ["searchMeta", "search_meta", "text"],
];

export const SOURCE_COLUMNS: ColumnSpec<SourceRecord> = [
  ["jobId", "job_id", "text"],
  ["source", "source", "text"],
  ["sourceName", "source_name", "text"],
  ["sourceKind", "source_kind", "text"],
  ["sourceJobId", "source_job_id", "text"],
  ["target", "target", "text"],
  ["url", "url", "text"],
  ["firstSeenAt", "first_seen_at", "timestamptz"],
  ["lastSeenAt", "last_seen_at", "timestamptz"],
  ["removedAt", "removed_at", "timestamptz"],
  ["attribution", "attribution", "text"],
  ["terms", "terms", "jsonb"],
];

const isoExpr = (col: string): string => `to_char(${col} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;

/** SELECT list producing exactly the record shape (camelCase keys, ISO timestamps). */
export function selectList<T>(spec: ColumnSpec<T>, alias: string): SQL {
  return sql.raw(
    spec
      .map(([key, col, type]) => {
        const ref = `${alias}.${col}`;
        return `${type === "timestamptz" ? isoExpr(ref) : ref} AS "${key}"`;
      })
      .join(", "),
  );
}

/** `jsonb_to_recordset($json) AS x("key" type, …)` */
export function recordset<T>(spec: ColumnSpec<T>, rows: readonly T[]): SQL {
  const defs = spec.map(([key, , type]) => `"${key}" ${type}`).join(", ");
  return sql`jsonb_to_recordset(${JSON.stringify(rows)}::jsonb) AS x(${sql.raw(defs)})`;
}

export function insertColumns<T>(spec: ColumnSpec<T>): { cols: SQL; values: SQL; updates: (skip?: string[]) => SQL } {
  return {
    cols: sql.raw(spec.map(([, col]) => col).join(", ")),
    values: sql.raw(spec.map(([key]) => `x."${key}"`).join(", ")),
    updates: (skip = []) =>
      sql.raw(
        spec
          .filter(([, col]) => !skip.includes(col))
          .map(([, col]) => `${col} = excluded.${col}`)
          .join(", "),
      ),
  };
}
