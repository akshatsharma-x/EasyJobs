#!/usr/bin/env node
/**
 * `pnpm scrape:once [extra worker args]` — runs every enabled scraper once with --limit 30 through the full
 * pipeline (scrape → normalize → POST /v1/ingest → DB). Needs the API (`pnpm dev`).
 * ATS scrapers take at most SCRAPE_MAX_TARGETS registry boards each (default 2) to stay polite.
 * Exit 0 when at least one task delivered jobs (dead boards / blocked sources are normal); 1 otherwise.
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

const TASK = /\] (ok|partial|error) +(\S+) .*?\| (\d+) read, (\d+) valid, (\d+) invalid/;
const tally = { ok: 0, partial: 0, error: 0, valid: 0, invalid: 0 };
const failed = [];
const scan = (chunk) => {
  for (const line of chunk.toString().split("\n")) {
    const m = TASK.exec(line);
    if (!m) continue;
    tally[m[1]]++;
    tally.valid += Number(m[4]);
    tally.invalid += Number(m[5]);
    if (m[1] !== "ok") failed.push(`${m[1]} ${m[2]}`);
  }
};
const child = spawn("pnpm", args, { cwd: ROOT, stdio: ["inherit", "pipe", "pipe"] });
child.stdout.on("data", (d) => {
  process.stdout.write(d);
  scan(d);
});
child.stderr.on("data", (d) => {
  process.stderr.write(d);
  scan(d);
});
child.on("close", (code) => {
  const tasks = tally.ok + tally.partial + tally.error;
  console.log(`\nscrape:once — ${tasks} tasks: ${tally.ok} ok, ${tally.partial} partial, ${tally.error} failed · ${tally.valid} valid jobs, ${tally.invalid} invalid`);
  if (failed.length) console.log(`  not ok: ${failed.join(", ")}`);
  if (tasks === 0) process.exit(code || 1);
  process.exit(tally.valid > 0 ? 0 : 1);
});
