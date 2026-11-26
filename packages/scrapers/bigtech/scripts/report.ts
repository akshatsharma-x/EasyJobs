/**
 * Live report: runs every registered company scraper with a limit and prints a markdown table
 * (status, endpoint type, site total, emitted, invalid, key-field fill rates, duration).
 *
 *   npx tsx scripts/report.ts [--limit 50] [--only amazon,ibm] [--concurrency 3] [--json .cache/report.json] [--opt-in]
 *
 * --opt-in also measures off-by-default scrapers (e.g. ENABLE_INFOSYS) — reported as "opt-in".
 *   npx tsx scripts/report.ts --merge a.json,b.json [--json out.json]
 * --merge renders one table from earlier partial runs (last file wins per id) without fetching anything.
 *
 * Sites are on different hosts, so running a few in parallel doesn't change per-host politeness.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { validateRawJob, type RawJob } from "@easyjobs/contract";
import { createHttpClient, createLogger, createScrapeContext, type Logger } from "@easyjobs/contract/node";
import { careerSites } from "../src/index";
import type { CareerSiteScraper } from "../src/lib/site";

const argv = process.argv.slice(2);
const arg = (name: string): string | undefined => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
};
const limit = Number(arg("limit") ?? 50);
const only = new Set((arg("only") ?? "").split(",").map((s) => s.trim()).filter(Boolean));
const concurrency = Math.max(1, Number(arg("concurrency") ?? 3));
const jsonOut = arg("json") ?? ".cache/report.json";
const includeOptIn = argv.includes("--opt-in");

const FIELDS = ["descriptionHtml", "postedAt", "locations", "jobType", "experienceLevel", "workMode", "department", "employmentTypeRaw", "experienceMin", "skills"] as const;

export interface SiteReport {
  id: string;
  name: string;
  status: "working" | "opt-in" | "opt-in (off)" | "disabled" | "error" | "empty";
  endpointType: string;
  siteTotal: number | null;
  listed: number;
  emitted: number;
  invalid: number;
  seconds: number;
  fill: Record<string, number>;
  note: string;
}

const filled = (v: unknown): boolean => v !== undefined && v !== null && v !== "" && !(Array.isArray(v) && v.length === 0);

const quiet = (base: Logger): Logger => ({ ...base, info: () => {}, debug: () => {}, child: (s) => quiet(base.child(s)) });

async function run(site: CareerSiteScraper): Promise<SiteReport> {
  const base: SiteReport = {
    id: site.id, name: site.name, status: "working", endpointType: site.endpointType, siteTotal: null,
    listed: 0, emitted: 0, invalid: 0, seconds: 0, fill: {}, note: "",
  };
  const env = site.optIn && includeOptIn ? { ...process.env, [site.optIn.env]: "1" } : process.env;
  if (!(site.isEnabled?.(env) ?? true)) {
    if (site.optIn && !site.disabledReason) return { ...base, status: "opt-in (off)", note: `${site.optIn.env}=1 — ${site.optIn.reason}` };
    return { ...base, status: "disabled", note: site.disabledReason ?? "disabled by env" };
  }
  if (site.optIn) {
    base.status = "opt-in";
    base.note = `off by default (${site.optIn.env}=1): ${site.optIn.reason}`;
  }
  const log = quiet(createLogger(`report:${site.id}`));
  const ctx = createScrapeContext({ log, http: createHttpClient({ log }), limit, env });
  const jobs: RawJob[] = [];
  const t0 = Date.now();
  try {
    for await (const job of site.scrape(ctx)) jobs.push(job);
  } catch (e) {
    base.status = "error";
    base.note = e instanceof Error ? e.message.slice(0, 200) : String(e);
  }
  base.seconds = Math.round((Date.now() - t0) / 100) / 10;
  base.emitted = jobs.length;
  base.invalid = jobs.filter((j) => validateRawJob(j).length > 0).length + (site.lastRun?.invalid ?? 0);
  base.siteTotal = site.lastRun?.siteTotal ?? null;
  base.listed = site.lastRun?.listed ?? jobs.length;
  for (const f of FIELDS) base.fill[f] = jobs.length ? Math.round((jobs.filter((j) => filled(j[f])).length / jobs.length) * 100) : 0;
  if ((base.status === "working" || base.status === "opt-in") && jobs.length === 0) base.status = "empty";
  return base;
}

const sites = careerSites.filter((s) => only.size === 0 || only.has(s.id));
let results: SiteReport[];
let reportLimit = limit;
const mergeFiles = (arg("merge") ?? "").split(",").map((f) => f.trim()).filter(Boolean);
if (mergeFiles.length > 0) {
  const byId = new Map<string, SiteReport>();
  for (const file of mergeFiles) {
    const data = JSON.parse(readFileSync(file, "utf8")) as { limit: number; results: SiteReport[] };
    reportLimit = data.limit;
    for (const r of data.results) if (r) byId.set(r.id, r);
  }
  results = sites.map((s) => byId.get(s.id)).filter((r): r is SiteReport => r !== undefined);
} else {
  results = new Array(sites.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, sites.length) }, async () => {
      while (next < sites.length) {
        const i = next++;
        const site = sites[i] as CareerSiteScraper;
        process.stderr.write(`… ${site.id}\n`);
        results[i] = await run(site);
        process.stderr.write(`✓ ${site.id}: ${results[i]?.status} ${results[i]?.emitted} jobs\n`);
      }
    }),
  );
}

const pct = (n: number | undefined): string => (n === undefined ? "–" : `${n}%`);
const lines = [
  `| Company (id) | Status | Endpoint type | Site total | Emitted (limit ${reportLimit}) | Invalid | desc | posted | loc | type | level | mode | dept | Time |`,
  "|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|",
  ...results.map((r) =>
    r.status === "disabled" || r.status === "opt-in (off)"
      ? `| ${r.name} (\`${r.id}\`) | ${r.status} | ${r.endpointType} | – | – | – | – | – | – | – | – | – | – | – |`
      : `| ${r.name} (\`${r.id}\`) | ${r.status} | ${r.endpointType} | ${r.siteTotal ?? "?"} | ${r.emitted} | ${r.invalid} | ${pct(r.fill.descriptionHtml)} | ${pct(r.fill.postedAt)} | ${pct(r.fill.locations)} | ${pct(r.fill.jobType)} | ${pct(r.fill.experienceLevel)} | ${pct(r.fill.workMode)} | ${pct(r.fill.department)} | ${r.seconds}s |`,
  ),
];
console.log(lines.join("\n"));
const notes = results.filter((r) => r.note).map((r) => `- \`${r.id}\` (${r.status}): ${r.note}`);
if (notes.length > 0) console.log(`\n${notes.join("\n")}`);
const working = results.filter((r) => r.status === "working" && r.emitted > 0 && r.invalid === 0).length;
console.log(`\nWorking scrapers: ${working} of ${results.length} (${results.filter((r) => r.status === "disabled").length} disabled)`);
mkdirSync(dirname(jsonOut), { recursive: true });
writeFileSync(jsonOut, JSON.stringify({ at: new Date().toISOString(), limit: reportLimit, results }, null, 2));
