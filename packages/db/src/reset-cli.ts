/**
 * pnpm --filter @easyjobs/db reset — truncates every table (jobs, sources, companies, runs, search terms).
 * Uses DATABASE_URL (Postgres) or PGlite. PGlite is single-process: stop `pnpm dev` (the API holds the lock) first.
 */
import { PgliteLockedError } from "./client";
import { resetData } from "./maintenance";
import { loadRootEnv } from "./paths";
import { openRepository } from "./repository";

loadRootEnv();

async function main(): Promise<void> {
  let repo;
  try {
    repo = await openRepository({});
  } catch (e) {
    if (e instanceof PgliteLockedError) {
      console.error(`${e.message}\n→ stop the running API (pnpm dev) and run \`pnpm reset\` again.`);
      process.exit(2);
    }
    throw e;
  }
  try {
    await resetData(repo.db);
    console.log(`reset: all tables truncated (${process.env.DATABASE_URL ? "Postgres" : "PGlite"})`);
  } finally {
    await repo.close();
  }
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
