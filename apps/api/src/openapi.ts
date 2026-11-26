/**
 * OpenAPI 3.1 document for /openapi.json (rendered by Scalar at /docs). Component schemas are generated
 * from the strict response schemas in schemas.ts, which are themselves typed against the contract.
 */
import { z } from "zod";
import { EXPERIENCE_LEVELS, JOB_CATEGORIES, JOB_TYPES, POSTED_WITHIN, SORTS, WORK_MODES } from "@easyjobs/contract";
import {
  apiErrorSchema,
  companiesResponseSchema,
  companySummarySchema,
  healthSchema,
  ingestResponseSchema,
  jobDetailSchema,
  jobListItemSchema,
  jobsSearchResponseSchema,
  knownIdsResponseSchema,
  okSchema,
  similarJobsResponseSchema,
  statsResponseSchema,
  streamEventSchema,
  suggestResponseSchema,
  sweepResponseSchema,
} from "./schemas";

type Json = Record<string, unknown>;

const schema = (s: z.ZodType): Json => {
  const out = z.toJSONSchema(s, { unrepresentable: "any", target: "draft-2020-12" }) as Json;
  delete out.$schema;
  return out;
};
const ref = (name: string): Json => ({ $ref: `#/components/schemas/${name}` });
const json = (name: string, description = "OK"): Json => ({ description, content: { "application/json": { schema: ref(name) } } });
const err = (description: string): Json => json("ApiError", description);
const list = (name: string, description: string, values?: readonly string[]): Json => ({
  name,
  in: "query",
  description: `${description} Comma-separated or repeated.`,
  schema: values ? { type: "array", items: { type: "string", enum: values } } : { type: "array", items: { type: "string" } },
  style: "form",
  explode: false,
});
const q = (name: string, description: string, s: Json = { type: "string" }): Json => ({ name, in: "query", description, schema: s });

const filterParams: Json[] = [
  list("type", "Job types (OR).", JOB_TYPES),
  list("level", "Experience levels (OR).", EXPERIENCE_LEVELS),
  list("mode", "Work modes (OR).", WORK_MODES),
  list("category", "Categories (OR).", JOB_CATEGORIES),
  list("location", 'Canonical city names or "Remote" (matches isRemote). Aliases like "bangalore" are accepted.'),
  list("country", "ISO 3166-1 alpha-2 codes."),
  list("company", "Company slugs."),
  list("ctype", "Company tags (mnc, startup, unicorn, …) — matches company_tags."),
  list("skills", "Skills (OR, case-insensitive)."),
  list("batch", "Graduation years."),
  list("source", "Source ids (coursejoiner, greenhouse, …)."),
  list("tag", "Job tags (off-campus, walk-in, wfh, …)."),
  q("official", "Only jobs with at least one official (career_site/ats) source.", { type: "string", enum: ["1", "true"] }),
  q("posted", "Posted within.", { type: "string", enum: POSTED_WITHIN, default: "any" }),
  q("salaryMin", "Minimum INR per year (top of the job's range must reach it).", { type: "number", minimum: 0 }),
  q("exp", "Candidate's years of experience: experienceMin ≤ exp ≤ experienceMax (null bounds open-ended).", { type: "number", minimum: 0, maximum: 50 }),
];
const cacheHeaders: Json = {
  ETag: { description: "Weak ETag of the body (send If-None-Match for 304).", schema: { type: "string" } },
  "Cache-Control": { description: "public, max-age=15, stale-while-revalidate=60", schema: { type: "string" } },
};
const withCache = (r: Json): Json => ({ ...r, headers: cacheHeaders });
const ingestSecurity = [{ ingestKey: [] }];

export function buildOpenApi(version: string): Json {
  return {
    openapi: "3.1.0",
    info: {
      title: "EasyJobs API",
      version,
      description:
        "Real-time internship and job search for India (plus remote and global roles). Public read API + authenticated ingest API used by the worker. " +
        "Errors use the ApiError shape. Public routes are rate limited per IP (429 + Retry-After).",
    },
    servers: [{ url: "/" }],
    tags: [{ name: "Jobs" }, { name: "Companies" }, { name: "Live" }, { name: "Ingest" }, { name: "Meta" }],
    paths: {
      "/v1/jobs": {
        get: {
          tags: ["Jobs"],
          summary: "Search jobs",
          description:
            "Full-text search (websearch syntax: quotes, -negation, OR; prefix match on the last word; synonyms; typo correction) with filters, sorts, pagination and disjunctive facets (each facet applies every other active filter).",
          parameters: [
            q("q", "Free text (≤ 200 chars)."),
            ...filterParams,
            q("sort", "Sort order.", { type: "string", enum: SORTS, default: "relevance" }),
            q("page", "1–500.", { type: "integer", minimum: 1, maximum: 500, default: 1 }),
            q("pageSize", "1–50.", { type: "integer", minimum: 1, maximum: 50, default: 20 }),
          ],
          responses: { 200: withCache(json("JobsSearchResponse")), 304: { description: "Not modified" }, 429: err("Rate limited") },
        },
      },
      "/v1/jobs/{id}": {
        get: {
          tags: ["Jobs"],
          summary: "Job detail (closed jobs too)",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: { 200: withCache(json("JobDetail")), 404: err("Unknown job") },
        },
      },
      "/v1/jobs/{id}/similar": {
        get: {
          tags: ["Jobs"],
          summary: "Similar open jobs",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }, q("limit", "1–12", { type: "integer", minimum: 1, maximum: 12, default: 6 })],
          responses: { 200: withCache(json("SimilarJobsResponse")), 404: err("Unknown job") },
        },
      },
      "/v1/suggest": {
        get: {
          tags: ["Jobs"],
          summary: "Type-ahead suggestions (≤ 8 per list)",
          parameters: [q("q", "Prefix typed so far.")],
          responses: { 200: withCache(json("SuggestResponse")) },
        },
      },
      "/v1/stats": { get: { tags: ["Meta"], summary: "Live counters", responses: { 200: withCache(json("StatsResponse")) } } },
      "/v1/companies": {
        get: {
          tags: ["Companies"],
          summary: "Companies by open jobs",
          parameters: [q("q", "Name/slug/domain search (typo tolerant)."), list("ctype", "Company tags (OR)."), q("page", "1–500", { type: "integer", default: 1 }), q("pageSize", "1–100", { type: "integer", default: 24 })],
          responses: { 200: withCache(json("CompaniesResponse")) },
        },
      },
      "/v1/companies/{slug}": {
        get: {
          tags: ["Companies"],
          summary: "Company",
          parameters: [{ name: "slug", in: "path", required: true, schema: { type: "string" } }],
          responses: { 200: withCache(json("CompanySummary")), 404: err("Unknown company") },
        },
      },
      "/v1/stream": {
        get: {
          tags: ["Live"],
          summary: "Server-sent events: new jobs matching the filters + stats",
          description:
            "`event: job` / `event: stats`, `data` = JSON StreamEvent. Filters are the SearchQuery filter params (q/sort/page ignored), evaluated server-side. `: ping` comment every 25 s, stats every 30 s.",
          parameters: filterParams,
          responses: { 200: { description: "text/event-stream", content: { "text/event-stream": { schema: ref("StreamEvent") } } }, 429: err("Too many streams") },
        },
      },
      "/v1/ingest/jobs": {
        post: {
          tags: ["Ingest"],
          summary: "Upsert ≤ 500 JobInputs (gzip allowed)",
          security: ingestSecurity,
          requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["source", "runId", "jobs"], properties: { source: { type: "string" }, runId: { type: "string" }, jobs: { type: "array", maxItems: 500, items: { type: "object" } } } } } } },
          responses: { 200: json("IngestResponse"), 400: err("Invalid envelope"), 401: err("Missing/invalid x-ingest-key"), 413: err("Too large") },
        },
      },
      "/v1/ingest/sweep": {
        post: {
          tags: ["Ingest"],
          summary: "Close (source, target) postings not seen in a complete run",
          security: ingestSecurity,
          requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["source", "target", "seenSourceJobIds"], properties: { source: { type: "string" }, target: { type: ["string", "null"] }, seenSourceJobIds: { type: "array", items: { type: "string" } } } } } } },
          responses: { 200: json("SweepResponse"), 400: err("Invalid body"), 401: err("Unauthorized") },
        },
      },
      "/v1/ingest/known": {
        get: {
          tags: ["Ingest"],
          summary: "sourceJobIds already stored for (source[, target])",
          security: ingestSecurity,
          parameters: [q("source", "Source id (required)."), q("target", "Target slug / feed key (omit for all; empty = null target).")],
          responses: { 200: json("KnownIdsResponse"), 400: err("Missing source"), 401: err("Unauthorized") },
        },
      },
      "/v1/ingest/runs": {
        post: {
          tags: ["Ingest"],
          summary: "Record a RunReport",
          security: ingestSecurity,
          requestBody: { required: true, content: { "application/json": { schema: { type: "object" } } } },
          responses: { 200: json("Ok"), 400: err("Invalid body"), 401: err("Unauthorized") },
        },
      },
      "/health": { get: { tags: ["Meta"], summary: "Liveness + DB check", responses: { 200: json("Health"), 503: json("Health", "Database unreachable") } } },
    },
    components: {
      securitySchemes: { ingestKey: { type: "apiKey", in: "header", name: "x-ingest-key" } },
      schemas: {
        JobListItem: schema(jobListItemSchema),
        JobDetail: schema(jobDetailSchema),
        JobsSearchResponse: schema(jobsSearchResponseSchema),
        SimilarJobsResponse: schema(similarJobsResponseSchema),
        SuggestResponse: schema(suggestResponseSchema),
        StatsResponse: schema(statsResponseSchema),
        CompanySummary: schema(companySummarySchema),
        CompaniesResponse: schema(companiesResponseSchema),
        StreamEvent: schema(streamEventSchema),
        IngestResponse: schema(ingestResponseSchema),
        SweepResponse: schema(sweepResponseSchema),
        KnownIdsResponse: schema(knownIdsResponseSchema),
        Ok: schema(okSchema),
        Health: schema(healthSchema),
        ApiError: schema(apiErrorSchema),
      },
    },
  };
}
