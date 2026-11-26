CREATE TABLE "companies" (
	"slug" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"domain" text,
	"logo_url" text,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"hq" text,
	"careers_url" text,
	"open_jobs" integer DEFAULT 0 NOT NULL,
	"source_prio" smallint DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_sources" (
	"id" serial PRIMARY KEY NOT NULL,
	"job_id" text NOT NULL,
	"source" text NOT NULL,
	"source_name" text NOT NULL,
	"source_kind" text NOT NULL,
	"source_job_id" text NOT NULL,
	"target" text,
	"url" text NOT NULL,
	"first_seen_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone NOT NULL,
	"removed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"status" text DEFAULT 'open' NOT NULL,
	"posted_at" timestamp with time zone NOT NULL,
	"rank_base" double precision DEFAULT 0 NOT NULL,
	"is_remote" boolean DEFAULT false NOT NULL,
	"is_official" boolean DEFAULT false NOT NULL,
	"quality_score" smallint DEFAULT 0 NOT NULL,
	"job_type" text NOT NULL,
	"experience_level" text NOT NULL,
	"category" text NOT NULL,
	"company_slug" text NOT NULL,
	"work_mode" text,
	"experience_min" double precision,
	"experience_max" double precision,
	"salary_inr_yearly_min" double precision,
	"salary_inr_yearly_max" double precision,
	"cities" text[] DEFAULT '{}'::text[] NOT NULL,
	"countries" text[] DEFAULT '{}'::text[] NOT NULL,
	"company_tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"skills" text[] DEFAULT '{}'::text[] NOT NULL,
	"batches" integer[] DEFAULT '{}'::int[] NOT NULL,
	"source_ids" text[] DEFAULT '{}'::text[] NOT NULL,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"search_head" "tsvector",
	"id" text PRIMARY KEY NOT NULL,
	"fingerprint" text NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"company" text NOT NULL,
	"company_domain" text,
	"company_logo_url" text,
	"locations" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"degrees" text[] DEFAULT '{}'::text[] NOT NULL,
	"salary" jsonb,
	"department" text,
	"description_html" text,
	"description_text" text,
	"summary" text,
	"valid_through" timestamp with time zone,
	"extra" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"apply_url" text NOT NULL,
	"sources" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"best_source_kind" text NOT NULL,
	"closed_reason" text,
	"first_seen_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone NOT NULL,
	"closed_at" timestamp with time zone,
	"updated_at" timestamp with time zone NOT NULL,
	"field_prio" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"search_meta" text DEFAULT '' NOT NULL,
	"search" "tsvector"
);
--> statement-breakpoint
CREATE TABLE "scrape_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"run_id" text NOT NULL,
	"source" text NOT NULL,
	"target" text,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone NOT NULL,
	"status" text NOT NULL,
	"emitted" integer DEFAULT 0 NOT NULL,
	"invalid" integer DEFAULT 0 NOT NULL,
	"errors" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"received_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "search_terms" (
	"term" text PRIMARY KEY NOT NULL,
	"freq" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sources" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"first_seen_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "job_sources" ADD CONSTRAINT "job_sources_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "companies_open_jobs_idx" ON "companies" USING btree ("open_jobs" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "companies_name_trgm_idx" ON "companies" USING gin (lower("name") gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "companies_tags_idx" ON "companies" USING gin ("tags");--> statement-breakpoint
CREATE UNIQUE INDEX "job_sources_source_job_key" ON "job_sources" USING btree ("source","source_job_id");--> statement-breakpoint
CREATE INDEX "job_sources_job_idx" ON "job_sources" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "job_sources_source_target_idx" ON "job_sources" USING btree ("source","target");--> statement-breakpoint
CREATE UNIQUE INDEX "jobs_fingerprint_key" ON "jobs" USING btree ("fingerprint");--> statement-breakpoint
CREATE INDEX "jobs_search_idx" ON "jobs" USING gin ("search");--> statement-breakpoint
CREATE INDEX "jobs_title_trgm_idx" ON "jobs" USING gin (lower("title") gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "jobs_company_trgm_idx" ON "jobs" USING gin (lower("company") gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "jobs_status_posted_idx" ON "jobs" USING btree ("status","posted_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "jobs_cities_idx" ON "jobs" USING gin ("cities");--> statement-breakpoint
CREATE INDEX "jobs_countries_idx" ON "jobs" USING gin ("countries");--> statement-breakpoint
CREATE INDEX "jobs_skills_idx" ON "jobs" USING gin ("skills");--> statement-breakpoint
CREATE INDEX "jobs_batches_idx" ON "jobs" USING gin ("batches");--> statement-breakpoint
CREATE INDEX "jobs_tags_idx" ON "jobs" USING gin ("tags");--> statement-breakpoint
CREATE INDEX "jobs_company_tags_idx" ON "jobs" USING gin ("company_tags");--> statement-breakpoint
CREATE INDEX "jobs_source_ids_idx" ON "jobs" USING gin ("source_ids");--> statement-breakpoint
CREATE INDEX "jobs_experience_level_idx" ON "jobs" USING btree ("experience_level");--> statement-breakpoint
CREATE INDEX "jobs_job_type_idx" ON "jobs" USING btree ("job_type");--> statement-breakpoint
CREATE INDEX "jobs_work_mode_idx" ON "jobs" USING btree ("work_mode");--> statement-breakpoint
CREATE INDEX "jobs_category_idx" ON "jobs" USING btree ("category");--> statement-breakpoint
CREATE INDEX "jobs_company_slug_idx" ON "jobs" USING btree ("company_slug");--> statement-breakpoint
CREATE INDEX "jobs_salary_max_idx" ON "jobs" USING btree ("salary_inr_yearly_max");--> statement-breakpoint
CREATE INDEX "jobs_valid_through_idx" ON "jobs" USING btree ("valid_through") WHERE "jobs"."valid_through" is not null and "jobs"."status" = 'open';--> statement-breakpoint
CREATE UNIQUE INDEX "scrape_runs_run_key" ON "scrape_runs" USING btree ("run_id","source",coalesce("target", ''));--> statement-breakpoint
CREATE INDEX "scrape_runs_source_finished_idx" ON "scrape_runs" USING btree ("source","finished_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "search_terms_trgm_idx" ON "search_terms" USING gin ("term" gin_trgm_ops);