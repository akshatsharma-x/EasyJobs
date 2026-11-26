#!/usr/bin/env node
/**
 * `pnpm scrape:once [extra worker args]` — runs every enabled scraper once with --limit 30 through the full
 * pipeline (scrape → normalize → POST /v1/ingest → DB). Needs the API (`pnpm dev`).
 * ATS scrapers take at most SCRAPE_MAX_TARGETS registry boards each (default 2) to stay polite.
 */
import { spawn } from "node:child_process";
import { ROOT, apiHealthy, apiUrl, loadRootEnv } from "./env.mjs";

loadRootEnv();
if (!(await apiHealthy())) {
  console.error(`✗ The API is not reachable at ${apiUrl()}. Start it first: \`pnpm dev\` (or \`pnpm --filter @easyjobs/api dev\`).`);
  process.exit(1);
}
const args = ["--filter", "@easyjobs/worker", "once", "--all", "--limit", process.env.SCRAPE_LIMIT || "30", "--max-targets", process.env.SCRAPE_MAX_TARGETS || "2", ...process.argv.slice(2)];
console.log(`→ pnpm ${args.join(" ")}  (API ${apiUrl()})`);
const child = spawn("pnpm", args, { cwd: ROOT, stdio: "inherit" });
child.on("close", (code) => process.exit(code ?? 1));
