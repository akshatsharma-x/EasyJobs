#!/usr/bin/env node
/**
 * `pnpm reset` — empties the database (Postgres or PGlite) and clears the worker's schedule state, spool and
 * dry-run output. Scraper caches and politeness/back-off state (e.g. portals/.state) are kept on purpose.
 * PGlite is single-process: stop `pnpm dev` first.
 */
import { spawnSync } from "node:child_process";
import { rmSync } from "node:fs";
import { join } from "node:path";
import { ROOT, loadRootEnv } from "./env.mjs";

loadRootEnv();
const db = spawnSync("pnpm", ["--filter", "@easyjobs/db", "reset"], { cwd: ROOT, stdio: "inherit" });
if (db.status !== 0) process.exit(db.status ?? 1);
for (const dir of [".state", ".spool", "out"]) {
  rmSync(join(ROOT, "apps/worker", dir), { recursive: true, force: true });
}
console.log("reset: worker .state/.spool/out cleared");
