import { existsSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

/** <repo>/ — packages/db/src → ../../.. */
export const REPO_ROOT: string = resolve(here, "../../..");
/** packages/db/drizzle — generated + custom SQL migrations. */
export const MIGRATIONS_DIR: string = resolve(here, "../drizzle");
/** Default PGlite data directory (§0.7). */
export const DEFAULT_PGLITE_DIR: string = resolve(REPO_ROOT, ".data/pglite");

/** Resolve a path relative to the repo root (absolute paths are returned as-is). */
export function fromRepoRoot(p: string): string {
  return isAbsolute(p) ? p : resolve(REPO_ROOT, p);
}

let envLoaded = false;
/** Loads <repo>/.env once if it exists (§0.7). Existing process.env values win. */
export function loadRootEnv(): void {
  if (envLoaded) return;
  envLoaded = true;
  const file = resolve(REPO_ROOT, ".env");
  if (!existsSync(file)) return;
  try {
    process.loadEnvFile(file);
  } catch (e) {
    console.warn(`[db] could not load ${file}: ${e instanceof Error ? e.message : String(e)}`);
  }
}
