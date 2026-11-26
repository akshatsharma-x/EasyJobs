import { sql } from "drizzle-orm";
import type { Executor } from "./client";

/** Delete all data (keeps the schema). Used by `seed --reset` and the benchmark. */
export async function resetData(db: Executor): Promise<void> {
  await db.query(sql`TRUNCATE job_sources, jobs, companies, sources, scrape_runs, search_terms RESTART IDENTITY CASCADE`);
}
