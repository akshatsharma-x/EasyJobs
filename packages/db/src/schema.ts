/**
 * Drizzle schema (pg-core). Migrations are generated from this file with drizzle-kit
 * (`pnpm --filter @easyjobs/db db:generate`); SQL that drizzle cannot express (extensions, the
 * search trigger, covering/partial indexes, storage tuning) lives in hand-written custom migrations.
 */
import { sql } from "drizzle-orm";
import {
  boolean,
  customType,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  smallint,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
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

/** Postgres tsvector (maintained by the `jobs_search_refresh` trigger, never written by the app). */
const tsvector = customType<{ data: string; driverData: string }>({
  dataType() {
    return "tsvector";
  },
});

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "string" });
const emptyText = sql`'{}'::text[]`;

export type JobStatus = "open" | "closed";
/** Why a job was closed: swept (no remaining sources), expired (validThrough passed), stale (board-only, unseen 21 d), too_old (board-only, > 45 d). */
export type ClosedReason = "swept" | "expired" | "stale" | "too_old" | "test_posting";

export const jobs = pgTable(
  "jobs",
  {
    /* Hot columns first: filters/facets/ranking read them for every matching row, and Postgres deforms
       tuples left to right — keeping them ahead of the wide/display columns makes facet scans ~2-3x cheaper. */
    status: text("status").$type<JobStatus>().notNull().default("open"),
    postedAt: ts("posted_at").notNull(),
    /** posted_epoch/τ + ln(boosts): ORDER BY rank_base ≡ ORDER BY freshness-decay × boosts (trigger-maintained). */
    rankBase: doublePrecision("rank_base").notNull().default(0),
    isRemote: boolean("is_remote").notNull().default(false),
    isOfficial: boolean("is_official").notNull().default(false),
    qualityScore: smallint("quality_score").notNull().default(0),
    jobType: text("job_type").$type<JobType>().notNull(),
    experienceLevel: text("experience_level").$type<ExperienceLevel>().notNull(),
    category: text("category").$type<JobCategory>().notNull(),
    companySlug: text("company_slug").notNull(),
    workMode: text("work_mode").$type<WorkMode>(),
    experienceMin: doublePrecision("experience_min"),
    experienceMax: doublePrecision("experience_max"),
    salaryInrYearlyMin: doublePrecision("salary_inr_yearly_min"),
    salaryInrYearlyMax: doublePrecision("salary_inr_yearly_max"),
    /** Derived from locations: canonical city names (pseudo-cities like "Remote" excluded). */
    cities: text("cities").array().notNull().default(emptyText),
    /** Derived from locations: ISO alpha-2, upper case. */
    countries: text("countries").array().notNull().default(emptyText),
    companyTags: text("company_tags").array().notNull().default(emptyText),
    skills: text("skills").array().notNull().default(emptyText),
    batches: integer("batches").array().notNull().default(sql`'{}'::int[]`),
    /** Distinct ids of the job's active sources. */
    sourceIds: text("source_ids").array().notNull().default(emptyText),
    tags: text("tags").array().notNull().default(emptyText),
    /** Same without the description: small, stays inline, cheap to rank. */
    searchHead: tsvector("search_head"),
    id: text("id").primaryKey(),
    fingerprint: text("fingerprint").notNull(),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    company: text("company").notNull(),
    companyDomain: text("company_domain"),
    companyLogoUrl: text("company_logo_url"),
    locations: jsonb("locations").$type<JobLocation[]>().notNull().default(sql`'[]'::jsonb`),
    degrees: text("degrees").array().notNull().default(emptyText),
    salary: jsonb("salary").$type<Salary>(),
    department: text("department"),
    descriptionHtml: text("description_html"),
    descriptionText: text("description_text"),
    summary: text("summary"),
    validThrough: ts("valid_through"),
    extra: jsonb("extra").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    applyUrl: text("apply_url").notNull(),
    /** Denormalized active sources (most official first) — what the API returns as JobListItem.sources. */
    sources: jsonb("sources").$type<JobSourceRef[]>().notNull().default(sql`'[]'::jsonb`),
    bestSourceKind: text("best_source_kind").$type<SourceKind>().notNull(),
    closedReason: text("closed_reason").$type<ClosedReason>(),
    firstSeenAt: ts("first_seen_at").notNull(),
    lastSeenAt: ts("last_seen_at").notNull(),
    closedAt: ts("closed_at"),
    updatedAt: ts("updated_at").notNull(),
    /** Merge provenance: field group → SOURCE_KIND_PRIORITY of the source whose value is stored. */
    fieldPrio: jsonb("field_prio").$type<Record<string, number>>().notNull().default(sql`'{}'::jsonb`),
    /** Extra searchable words (cities, remote, type/level words, department) — weight C. */
    searchMeta: text("search_meta").notNull().default(""),
    /** title A · company A · skills B · meta C · description D (trigger-maintained). */
    search: tsvector("search"),
  },
  (t) => [
    uniqueIndex("jobs_fingerprint_key").on(t.fingerprint),
    index("jobs_search_idx").using("gin", t.search),
    index("jobs_title_trgm_idx").using("gin", sql`lower(${t.title}) gin_trgm_ops`),
    index("jobs_company_trgm_idx").using("gin", sql`lower(${t.company}) gin_trgm_ops`),
    index("jobs_status_posted_idx").on(t.status, t.postedAt.desc()),
    index("jobs_cities_idx").using("gin", t.cities),
    index("jobs_countries_idx").using("gin", t.countries),
    index("jobs_skills_idx").using("gin", t.skills),
    index("jobs_batches_idx").using("gin", t.batches),
    index("jobs_tags_idx").using("gin", t.tags),
    index("jobs_company_tags_idx").using("gin", t.companyTags),
    index("jobs_source_ids_idx").using("gin", t.sourceIds),
    index("jobs_experience_level_idx").on(t.experienceLevel),
    index("jobs_job_type_idx").on(t.jobType),
    index("jobs_work_mode_idx").on(t.workMode),
    index("jobs_category_idx").on(t.category),
    index("jobs_company_slug_idx").on(t.companySlug),
    index("jobs_salary_max_idx").on(t.salaryInrYearlyMax),
    index("jobs_valid_through_idx").on(t.validThrough).where(sql`${t.validThrough} is not null and ${t.status} = 'open'`),
  ],
);

export const jobSources = pgTable(
  "job_sources",
  {
    id: serial("id").primaryKey(),
    jobId: text("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    source: text("source").notNull(),
    sourceName: text("source_name").notNull(),
    sourceKind: text("source_kind").$type<SourceKind>().notNull(),
    sourceJobId: text("source_job_id").notNull(),
    target: text("target"),
    url: text("url").notNull(),
    firstSeenAt: ts("first_seen_at").notNull(),
    lastSeenAt: ts("last_seen_at").notNull(),
    /** Set by a sweep; a removed source no longer keeps its job open. A new sighting clears it. */
    removedAt: ts("removed_at"),
    /** Contract 1.1: credit line from `Scraper.attribution` (JobInput.extra.attribution). */
    attribution: text("attribution"),
    /** Contract 1.1: display conditions from the source's terms (JobInput.extra.terms). */
    terms: jsonb("terms").$type<SourceTerms>(),
  },
  (t) => [
    uniqueIndex("job_sources_source_job_key").on(t.source, t.sourceJobId),
    index("job_sources_job_idx").on(t.jobId),
    index("job_sources_source_target_idx").on(t.source, t.target),
  ],
);

export const companies = pgTable(
  "companies",
  {
    slug: text("slug").primaryKey(),
    name: text("name").notNull(),
    domain: text("domain"),
    logoUrl: text("logo_url"),
    tags: text("tags").array().notNull().default(emptyText),
    hq: text("hq"),
    careersUrl: text("careers_url"),
    openJobs: integer("open_jobs").notNull().default(0),
    /** SOURCE_KIND_PRIORITY of the source that last set name/domain/logo. */
    sourcePrio: smallint("source_prio").notNull().default(0),
    updatedAt: ts("updated_at").notNull(),
  },
  (t) => [
    index("companies_open_jobs_idx").on(t.openJobs.desc()),
    index("companies_name_trgm_idx").using("gin", sql`lower(${t.name}) gin_trgm_ops`),
    index("companies_tags_idx").using("gin", t.tags),
  ],
);

/** One row per scraper id seen in ingest — names/kinds for facets and stats. */
export const sources = pgTable("sources", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  kind: text("kind").$type<SourceKind>().notNull(),
  firstSeenAt: ts("first_seen_at").notNull(),
  lastSeenAt: ts("last_seen_at").notNull(),
});

export const scrapeRuns = pgTable(
  "scrape_runs",
  {
    id: serial("id").primaryKey(),
    runId: text("run_id").notNull(),
    source: text("source").notNull(),
    target: text("target"),
    startedAt: ts("started_at").notNull(),
    finishedAt: ts("finished_at").notNull(),
    status: text("status").$type<"ok" | "partial" | "error">().notNull(),
    emitted: integer("emitted").notNull().default(0),
    invalid: integer("invalid").notNull().default(0),
    errors: jsonb("errors").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    /** Optional (P05 contract request): whether the run covered the full listing (sweep-eligible). */
    complete: boolean("complete"),
    /** Optional (P05 contract request): raw/valid/invalid/duplicate/inserted/… counts and scraper stats. */
    stats: jsonb("stats").$type<Record<string, number>>(),
    receivedAt: ts("received_at").notNull(),
  },
  (t) => [
    uniqueIndex("scrape_runs_run_key").on(t.runId, t.source, sql`coalesce(${t.target}, '')`),
    index("scrape_runs_source_finished_idx").on(t.source, t.finishedAt.desc()),
  ],
);

/** Vocabulary of title/company/skill lexemes for typo correction ("amazn" → "amazon"). */
export const searchTerms = pgTable(
  "search_terms",
  {
    term: text("term").primaryKey(),
    freq: integer("freq").notNull().default(0),
  },
  (t) => [index("search_terms_trgm_idx").using("gin", sql`${t.term} gin_trgm_ops`)],
);

export type JobRow = typeof jobs.$inferSelect;
export type JobSourceRow = typeof jobSources.$inferSelect;
export type CompanyRow = typeof companies.$inferSelect;
