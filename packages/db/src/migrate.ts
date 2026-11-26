import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import { migrate as migratePostgres } from "drizzle-orm/postgres-js/migrator";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type { Database } from "./client";
import { MIGRATIONS_DIR } from "./paths";

/** Arbitrary constant: serialises concurrent migrators (several API instances booting at once). */
const MIGRATION_LOCK = 482_901_337;

/** Applies pending drizzle-kit migrations (generated + custom) from packages/db/drizzle. Idempotent. */
export async function runMigrations(db: Database): Promise<void> {
  const config = { migrationsFolder: MIGRATIONS_DIR };
  if (db.driver === "pglite") {
    await migratePglite(db.orm as unknown as PgliteDatabase<Record<string, never>>, config);
    return;
  }
  await db.withSessionLock(MIGRATION_LOCK, () =>
    migratePostgres(db.orm as unknown as PostgresJsDatabase<Record<string, never>>, config),
  );
}
