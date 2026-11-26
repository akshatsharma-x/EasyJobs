/** Output stats for out/*.jsonl (used for docs/status/P06.md).  tsx scripts/stats.ts [out-dir] [--markdown] */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { validateRawJob, type RawJob } from "@easyjobs/contract";

const args = process.argv.slice(2);
const dir = args.find((a) => !a.startsWith("--")) ?? "out";
const markdown = args.includes("--markdown");
const pct = (n: number, d: number): string => `${d === 0 ? 0 : Math.round((n / d) * 1000) / 10}%`;
const FIELDS = ["locations", "experienceRaw", "salaryRaw", "batches", "degrees", "validThrough", "workMode", "experienceLevel", "tags", "companyDomain", "descriptionHtml"] as const;

const rows: string[][] = [];
for (const file of readdirSync(dir).filter((f) => f.endsWith(".jsonl")).sort()) {
  const jobs = readFileSync(join(dir, file), "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l) as RawJob);
  const n = jobs.length;
  const valid = jobs.filter((j) => validateRawJob(j).length === 0).length;
  const complete = jobs.filter((j) => validateRawJob(j).length === 0 && j.applyUrl && j.company && j.title).length;
  const kinds: Record<string, number> = {};
  for (const j of jobs) {
    const k = String(j.extra?.applyLinkKind ?? "?");
    kinds[k] = (kinds[k] ?? 0) + 1;
  }
  const posts = new Set(jobs.map((j) => j.sourceJobId.split("#")[0])).size;
  const multi = jobs.filter((j) => Number(j.extra?.roles ?? 1) > 1).length;
  const types: Record<string, number> = {};
  for (const j of jobs) types[j.jobType ?? "?"] = (types[j.jobType ?? "?"] ?? 0) + 1;
  const fill = Object.fromEntries(
    FIELDS.map((f) => [f, pct(jobs.filter((j) => {
      const v = j[f as keyof RawJob];
      return v !== undefined && v !== null && v !== "" && !(Array.isArray(v) && v.length === 0);
    }).length, n)]),
  );
  const official = (kinds.ats ?? 0) + (kinds.company ?? 0);
  rows.push([
    file.replace(/\.jsonl$/, ""), String(n), String(posts), pct(valid, n), pct(complete, n), pct(official, n),
    Object.entries(kinds).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(", "),
    String(multi), Object.entries(types).map(([k, v]) => `${k} ${v}`).join(", "),
    FIELDS.map((f) => `${f} ${fill[f]}`).join(", "),
  ]);
}

const header = ["source", "jobs", "posts", "valid", "valid+apply+company+title", "official apply link", "apply link kinds", "multi-role jobs", "job types", "fill rates"];
if (markdown) {
  console.log(`| ${header.join(" | ")} |\n|${header.map(() => "---").join("|")}|`);
  for (const r of rows) console.log(`| ${r.join(" | ")} |`);
} else {
  for (const r of rows) console.log(header.map((h, i) => `${h}: ${r[i]}`).join("\n  "), "\n");
}
