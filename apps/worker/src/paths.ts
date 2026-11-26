import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Absolute path of apps/worker (independent of the current working directory). */
export const WORKER_DIR: string = resolve(fileURLToPath(new URL(".", import.meta.url)), "..");

/** Walks up from `start` to the directory containing pnpm-workspace.yaml. */
export function findRepoRoot(start: string = WORKER_DIR): string {
  let dir = resolve(start);
  for (;;) {
    if (existsSync(join(dir, "pnpm-workspace.yaml"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return resolve(WORKER_DIR, "..", "..");
    dir = parent;
  }
}
