/** pnpm --filter @easyjobs/db migrate — apply migrations to DATABASE_URL or the PGlite dir. */
import { createDatabase } from "./client";
import { runMigrations } from "./migrate";
import { loadRootEnv } from "./paths";

loadRootEnv();
const db = await createDatabase();
try {
  const t0 = Date.now();
  await runMigrations(db);
  console.log(`migrations applied to ${db.location} in ${Date.now() - t0} ms`);
} finally {
  await db.close();
}
