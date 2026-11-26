/**
 * Verifies every fixture target against its live API:  pnpm --filter @easyjobs/scraper-ats-public verify-targets [--write]
 *
 * List requests only (isKnown → true, so list+detail APIs make no detail calls): board size, validity, time.
 * --write updates openJobs/verifiedAt in src/fixtures/targets.ts.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { validateRawJob } from "@easyjobs/contract";
import { createHttpClient, createLogger, createScrapeContext } from "@easyjobs/contract/node";
import { targets } from "../src/fixtures/targets";
import { scrapers } from "../src/index";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const log = createLogger("verify");
const http = createHttpClient({ log });
const today = new Date().toISOString().slice(0, 10);

interface Row {
  ats: string;
  slug: string;
  token: string;
  jobs: number;
  invalid: number;
  seconds: number;
  error: string | null;
}

const rows: Row[] = [];
for (const scraper of scrapers) {
  for (const target of targets.filter((t) => scraper.handlesAts?.includes(t.ats))) {
    const ctx = createScrapeContext({ http, log: log.child(`${scraper.id}:${target.slug}`), targets: [target], isKnown: () => true });
    const t0 = Date.now();
    let jobs = 0;
    let invalid = 0;
    let error: string | null = null;
    try {
      for await (const job of scraper.scrape(ctx)) {
        jobs++;
        if (validateRawJob(job).length > 0) invalid++;
      }
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
    rows.push({ ats: scraper.id, slug: target.slug, token: target.token, jobs, invalid, seconds: (Date.now() - t0) / 1000, error });
    log.info(`${scraper.id}/${target.slug}: ${jobs} jobs${invalid ? `, ${invalid} invalid` : ""}${error ? ` — ERROR ${error}` : ""}`);
  }
}

mkdirSync(join(ROOT, "out"), { recursive: true });
writeFileSync(join(ROOT, "out", "verify-targets.json"), `${JSON.stringify({ verifiedAt: today, rows }, null, 2)}\n`);
console.log("\n| ATS | target | token | open jobs | invalid | time |\n|---|---|---|---:|---:|---:|");
for (const r of rows) console.log(`| ${r.ats} | ${r.slug} | \`${r.token}\` | ${r.error ? `ERROR: ${r.error}` : r.jobs} | ${r.invalid} | ${r.seconds.toFixed(1)}s |`);

if (process.argv.includes("--write")) {
  const file = join(ROOT, "src", "fixtures", "targets.ts");
  let src = readFileSync(file, "utf8");
  for (const r of rows) {
    if (r.error) continue;
    const re = new RegExp(`(\\{ slug: "${r.slug.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}",[^\\n]*?openJobs: )(null|\\d+)`);
    src = src.replace(re, `$1${r.jobs}`);
  }
  src = src.replace(/const VERIFIED_AT = "[^"]*";/, `const VERIFIED_AT = "${today}";`);
  writeFileSync(file, src);
  log.info(`updated openJobs in src/fixtures/targets.ts`);
}
if (rows.some((r) => r.error || r.invalid > 0 || r.jobs === 0)) process.exitCode = 1;
