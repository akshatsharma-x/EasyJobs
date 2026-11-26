/**
 * Per-ATS counts and fill rates over the fixture targets, as markdown:
 *   pnpm --filter @easyjobs/scraper-ats-public report [--scraper id]       scrape live, like the worker's first run
 *   pnpm --filter @easyjobs/scraper-ats-public report --from out/cli      read <dir>/<scraper>.jsonl written by the CLI
 *
 * Live mode runs each scraper with no isKnown (every posting is new, so list+detail APIs fetch details up to
 * ATS_MAX_DETAILS per target). Writes out/report.md and out/report.json.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { validateRawJob, type RawJob } from "@easyjobs/contract";
import { createHttpClient, createLogger, createScrapeContext } from "@easyjobs/contract/node";
import { targets } from "../src/fixtures/targets";
import { scrapers } from "../src/index";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const log = createLogger("report");
const http = createHttpClient({ log });
const argValue = (name: string): string | undefined =>
  process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : undefined;
const only = argValue("--scraper");
const from = argValue("--from");

/** Jobs of one scraper: live, or from a CLI JSONL file. */
async function* jobsOf(scraper: (typeof scrapers)[number], own: typeof targets): AsyncGenerator<RawJob> {
  if (!from) {
    yield* scraper.scrape(createScrapeContext({ http, log: log.child(scraper.id), targets: own }));
    return;
  }
  const file = join(process.cwd(), from, `${scraper.id}.jsonl`);
  if (!existsSync(file)) throw new Error(`missing ${file}`);
  for (const line of readFileSync(file, "utf8").split("\n")) if (line.trim()) yield JSON.parse(line) as RawJob;
}

const FIELDS: [string, (j: RawJob) => boolean][] = [
  ["description", (j) => Boolean(j.descriptionHtml)],
  ["postedAt", (j) => Boolean(j.postedAt)],
  ["locations", (j) => j.locations.length > 0],
  ["department", (j) => Boolean(j.department)],
  ["jobType", (j) => j.jobType !== undefined],
  ["level", (j) => j.experienceLevel !== undefined],
  ["exp years", (j) => j.experienceMin !== undefined || j.experienceMax !== undefined],
  ["workMode", (j) => j.workMode !== undefined],
  ["isRemote", (j) => j.isRemote !== undefined],
  ["salary", (j) => Boolean(j.salary)],
  ["salaryRaw", (j) => Boolean(j.salaryRaw)],
  ["domain", (j) => Boolean(j.companyDomain)],
  ["logo", (j) => Boolean(j.companyLogoUrl)],
];

interface Stat {
  scraper: string;
  targets: number;
  jobs: number;
  invalid: number;
  seconds: number;
  errors: string[];
  perTarget: Record<string, number>;
  fill: Record<string, number>;
  interns: number;
  remote: number;
}

const stats: Stat[] = [];
for (const scraper of scrapers) {
  if (only && scraper.id !== only) continue;
  const own = targets.filter((t) => scraper.handlesAts?.includes(t.ats));
  const stat: Stat = { scraper: scraper.id, targets: own.length, jobs: 0, invalid: 0, seconds: 0, errors: [], perTarget: {}, fill: {}, interns: 0, remote: 0 };
  const counts: Record<string, number> = {};
  const t0 = Date.now();
  try {
    for await (const job of jobsOf(scraper, own)) {
      stat.jobs++;
      if (validateRawJob(job).length > 0) stat.invalid++;
      stat.perTarget[job.target ?? "?"] = (stat.perTarget[job.target ?? "?"] ?? 0) + 1;
      for (const [name, has] of FIELDS) if (has(job)) counts[name] = (counts[name] ?? 0) + 1;
      if (job.jobType === "internship" || job.experienceLevel === "intern") stat.interns++;
      if (job.workMode === "remote" || job.isRemote === true) stat.remote++;
    }
  } catch (e) {
    stat.errors.push(e instanceof Error ? e.message : String(e));
  }
  stat.seconds = (Date.now() - t0) / 1000;
  for (const [name] of FIELDS) stat.fill[name] = stat.jobs > 0 ? Math.round(((counts[name] ?? 0) / stat.jobs) * 100) : 0;
  stats.push(stat);
  log.info(`${scraper.id}: ${stat.jobs} jobs, ${stat.invalid} invalid, ${stat.seconds.toFixed(1)}s`, stat.perTarget);
}

const lines: string[] = [];
lines.push(`Generated ${new Date().toISOString()} · ${from ? `from ${from}/*.jsonl` : `live · ATS_MAX_DETAILS=${process.env.ATS_MAX_DETAILS ?? "200 (default)"}`}`, "");
lines.push("| ATS | targets | jobs | invalid | interns | remote | time | errors |", "|---|---:|---:|---:|---:|---:|---:|---|");
for (const s of stats) lines.push(`| ${s.scraper} | ${s.targets} | ${s.jobs} | ${s.invalid} | ${s.interns} | ${s.remote} | ${s.seconds.toFixed(1)}s | ${s.errors.join("; ") || "—"} |`);
lines.push("", `| ATS | ${FIELDS.map(([n]) => n).join(" | ")} |`, `|---|${FIELDS.map(() => "---:").join("|")}|`);
for (const s of stats) lines.push(`| ${s.scraper} | ${FIELDS.map(([n]) => `${s.fill[n]}%`).join(" | ")} |`);
lines.push("", "Per target:", "");
for (const s of stats) lines.push(`- **${s.scraper}**: ${Object.entries(s.perTarget).map(([k, v]) => `${k} ${v}`).join(", ") || "—"}`);
const md = `${lines.join("\n")}\n`;

mkdirSync(join(ROOT, "out"), { recursive: true });
const base = `report${from ? "-from-cli" : ""}${only ? `-${only}` : ""}`;
writeFileSync(join(ROOT, "out", `${base}.md`), md);
writeFileSync(join(ROOT, "out", `${base}.json`), `${JSON.stringify(stats, null, 2)}\n`);
console.log(`\n${md}`);
