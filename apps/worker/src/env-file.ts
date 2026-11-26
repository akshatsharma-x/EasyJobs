import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseEnv } from "node:util";

/** Keys set by the real environment before any .env was applied — those always win. */
const SHELL_KEYS = new Set(Object.keys(process.env));

/**
 * Loads <repo>/.env into process.env (same semantics as process.loadEnvFile: the shell environment wins).
 * Safe to call again (e.g. on SIGHUP): values that came from .env are refreshed.
 */
export function loadRepoEnv(repoRoot: string, env: NodeJS.ProcessEnv = process.env): { file: string | null; applied: string[] } {
  const file = join(repoRoot, ".env");
  if (!existsSync(file)) return { file: null, applied: [] };
  let parsed: Record<string, string | undefined>;
  try {
    parsed = parseEnv(readFileSync(file, "utf8")) as Record<string, string | undefined>;
  } catch {
    return { file, applied: [] };
  }
  const applied: string[] = [];
  for (const [key, value] of Object.entries(parsed)) {
    if (value === undefined || SHELL_KEYS.has(key)) continue;
    env[key] = value;
    applied.push(key);
  }
  return { file, applied };
}
