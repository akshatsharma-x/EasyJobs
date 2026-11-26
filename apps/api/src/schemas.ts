/**
 * Strict zod schemas of every §0.5 response, each declared against its contract type. Used by the tests to
 * assert exact shapes (no missing or extra keys) and to generate the OpenAPI document.
 */
import { z } from "zod";
import {
  EXPERIENCE_LEVELS,
  JOB_CATEGORIES,
  JOB_TYPES,
  SOURCE_KINDS,
  WORK_MODES,
  type ApiError,
  type CompaniesResponse,
  type CompanySummary,
  type FacetBucket,
  type Facets,
  type IngestResponse,
  type JobDetail,
  type JobListItem,
  type JobsSearchResponse,
  type KnownIdsResponse,
  type Salary,
  type SimilarJobsResponse,
  type StatsResponse,
  type StreamEvent,
  type SuggestResponse,
  type SweepResponse,
} from "@easyjobs/contract";

const iso = z.string().refine((v) => !Number.isNaN(Date.parse(v)) && v.endsWith("Z"), "ISO-8601 UTC");
const nullableStr = z.string().nullable();

export const salarySchema: z.ZodType<Salary> = z.strictObject({
  min: z.number().nullable(),
  max: z.number().nullable(),
  currency: z.string(),
  period: z.enum(["hour", "month", "year"]),
  raw: nullableStr,
});

export const jobListItemObject = z.strictObject({
  id: z.string().min(1),
  slug: z.string(),
  title: z.string(),
  company: z.strictObject({ name: z.string(), slug: z.string(), domain: nullableStr, logoUrl: nullableStr, tags: z.array(z.string()) }),
  locations: z.array(z.string()),
  isRemote: z.boolean(),
  workMode: z.enum(WORK_MODES).nullable(),
  jobType: z.enum(JOB_TYPES),
  experienceLevel: z.enum(EXPERIENCE_LEVELS),
  experienceMin: z.number().nullable(),
  experienceMax: z.number().nullable(),
  batches: z.array(z.number().int()),
  salary: salarySchema.nullable(),
  skills: z.array(z.string()).max(8),
  category: z.enum(JOB_CATEGORIES),
  tags: z.array(z.string()),
  postedAt: iso,
  applyUrl: z.string().url(),
  isOfficial: z.boolean(),
  sources: z.array(
    z.strictObject({
      id: z.string(),
      name: z.string(),
      kind: z.enum(SOURCE_KINDS),
      url: z.string(),
      // contract 1.1
      attribution: z.string().optional(),
      terms: z
        .strictObject({
          linkBackRequired: z.boolean().optional(),
          followLinkRequired: z.boolean().optional(),
          applyUrlUnchanged: z.boolean().optional(),
          noJobPostingSchema: z.boolean().optional(),
          noThirdPartySyndication: z.boolean().optional(),
          creditRequired: z.boolean().optional(),
          noLogoUse: z.boolean().optional(),
          removeWhenExpired: z.boolean().optional(),
        })
        .optional(),
    }),
  ),
  summary: z.string().max(280).nullable(),
});
export const jobListItemSchema: z.ZodType<JobListItem> = jobListItemObject;

export const jobDetailSchema: z.ZodType<JobDetail> = jobListItemObject.extend({
  descriptionHtml: nullableStr,
  degrees: z.array(z.string()),
  department: nullableStr,
  validThrough: iso.nullable(),
  firstSeenAt: iso,
  lastSeenAt: iso,
  status: z.enum(["open", "closed"]),
});

const bucket: z.ZodType<FacetBucket> = z.strictObject({ value: z.string(), label: z.string(), count: z.number().int().min(0) });
export const facetsSchema: z.ZodType<Facets> = z.strictObject({
  type: z.array(bucket),
  level: z.array(bucket),
  mode: z.array(bucket),
  category: z.array(bucket),
  location: z.array(bucket),
  company: z.array(bucket),
  ctype: z.array(bucket),
  skills: z.array(bucket),
  batch: z.array(bucket),
  source: z.array(bucket),
  tag: z.array(bucket),
});

export const jobsSearchResponseSchema: z.ZodType<JobsSearchResponse> = z.strictObject({
  data: z.array(jobListItemSchema),
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1),
  total: z.number().int().min(0),
  totalPages: z.number().int().min(0),
  facets: facetsSchema,
  tookMs: z.number().min(0),
  // contract 1.1 ("Showing results for …")
  corrections: z.record(z.string(), z.string()).optional(),
  fuzzy: z.boolean().optional(),
});

export const similarJobsResponseSchema: z.ZodType<SimilarJobsResponse> = z.strictObject({ data: z.array(jobListItemSchema) });

export const suggestResponseSchema: z.ZodType<SuggestResponse> = z.strictObject({
  titles: z.array(z.string()).max(8),
  companies: z.array(z.strictObject({ slug: z.string(), name: z.string(), logoUrl: nullableStr, openJobs: z.number().int() })).max(8),
  locations: z.array(z.string()).max(8),
  skills: z.array(z.string()).max(8),
});

const countsBy = <T extends readonly [string, ...string[]]>(keys: T) =>
  z.strictObject(Object.fromEntries(keys.map((k) => [k, z.number().int().min(0)])) as { [K in T[number]]: z.ZodNumber });

export const statsResponseSchema: z.ZodType<StatsResponse> = z.strictObject({
  totalOpen: z.number().int().min(0),
  newLastHour: z.number().int().min(0),
  newLast24h: z.number().int().min(0),
  companies: z.number().int().min(0),
  byLevel: countsBy(EXPERIENCE_LEVELS),
  byType: countsBy(JOB_TYPES),
  sources: z.array(z.strictObject({ id: z.string(), name: z.string(), kind: z.enum(SOURCE_KINDS), open: z.number().int(), lastRunAt: iso.nullable() })),
  lastUpdatedAt: iso.nullable(),
});

export const companySummarySchema: z.ZodType<CompanySummary> = z.strictObject({
  slug: z.string(),
  name: z.string(),
  domain: nullableStr,
  logoUrl: nullableStr,
  tags: z.array(z.string()),
  hq: nullableStr,
  careersUrl: nullableStr,
  openJobs: z.number().int().min(0),
});

export const companiesResponseSchema: z.ZodType<CompaniesResponse> = z.strictObject({
  data: z.array(companySummarySchema),
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1),
  total: z.number().int().min(0),
});

export const apiErrorSchema: z.ZodType<ApiError> = z.strictObject({ error: z.strictObject({ code: z.string(), message: z.string() }) });

export const ingestResponseSchema: z.ZodType<IngestResponse> = z.strictObject({
  inserted: z.number().int().min(0),
  updated: z.number().int().min(0),
  merged: z.number().int().min(0),
  rejected: z.array(z.strictObject({ index: z.number().int().min(0), error: z.string() })),
});
/** SweepResponse plus `removed` (number of (source, sourceJobId) rows removed). */
export const sweepResponseSchema: z.ZodType<SweepResponse & { removed: number }> = z.strictObject({
  closed: z.number().int().min(0),
  removed: z.number().int().min(0),
});
export const knownIdsResponseSchema: z.ZodType<KnownIdsResponse> = z.strictObject({ ids: z.array(z.string()) });
export const okSchema: z.ZodType<{ ok: true }> = z.strictObject({ ok: z.literal(true) });
export const healthSchema: z.ZodType<{ ok: boolean; db: string; version: string }> = z.strictObject({ ok: z.boolean(), db: z.string(), version: z.string() });

export const streamEventSchema: z.ZodType<StreamEvent> = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("job"), job: jobListItemObject }),
  z.strictObject({
    type: z.literal("stats"),
    stats: z.strictObject({ totalOpen: z.number().int(), newLastHour: z.number().int(), newLast24h: z.number().int(), lastUpdatedAt: iso.nullable() }),
  }),
]);
