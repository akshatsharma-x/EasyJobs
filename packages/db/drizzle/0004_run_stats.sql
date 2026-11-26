ALTER TABLE "scrape_runs" ADD COLUMN "complete" boolean;--> statement-breakpoint
ALTER TABLE "scrape_runs" ADD COLUMN "stats" jsonb;