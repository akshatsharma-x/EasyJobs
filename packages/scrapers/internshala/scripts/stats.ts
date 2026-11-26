/**
 * Dev tool: summarise CLI output (out/<scraper>.jsonl) — validity, fill rates and value distributions.
 *
 *   tsx scripts/stats.ts out/internshala-internships.jsonl [out/internshala-jobs.jsonl …]
 */
import { readFileSync } from "node:fs";
import { validateRawJob, type RawJob } from "@easyjobs/contract";

const pct = (n: number, d: number): string => `${d === 0 ? 0 : Math.round((n / d) * 1000) / 10}%`;

function dist(values: (string | number | null | undefined)[]): string {
  const counts = new Map<string, number>();
  for (const v of values) counts.set(String(v ?? "—"), (counts.get(String(v ?? "—")) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([k, n]) => `${k} ${n}`)
    .join(" · ");
}

for (const file of process.argv.slice(2)) {
  const jobs = readFileSync(file, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l) as RawJob);
  const n = jobs.length;
  const invalid = jobs.filter((j) => validateRawJob(j).length > 0);
  const ids = new Set(jobs.map((j) => j.sourceJobId));
  const filled = (f: (j: RawJob) => unknown): string =>
    pct(jobs.filter((j) => { const v = f(j); return v !== null && v !== undefined && v !== "" && !(Array.isArray(v) && v.length === 0); }).length, n);
  const extra = (j: RawJob, k: string): unknown => (j.extra ?? {})[k];
  console.log(`\n## ${file}`);
  console.log(`jobs ${n} · valid ${n - invalid.length} (${pct(n - invalid.length, n)}) · unique ids ${ids.size}`);
  if (invalid.length > 0) console.log("invalid examples:", invalid.slice(0, 3).map((j) => [j.sourceJobId, validateRawJob(j)]));
  console.log(`with detail page: ${pct(jobs.filter((j) => extra(j, "detail") === true).length, n)}`);
  console.log(
    "fill:",
    [
      ["descriptionHtml", (j: RawJob) => j.descriptionHtml],
      ["descriptionText", (j: RawJob) => j.descriptionText],
      ["postedAt", (j: RawJob) => j.postedAt],
      ["validThrough", (j: RawJob) => j.validThrough],
      ["salary", (j: RawJob) => j.salary],
      ["salaryRaw", (j: RawJob) => j.salaryRaw],
      ["skills", (j: RawJob) => j.skills],
      ["companyLogoUrl", (j: RawJob) => j.companyLogoUrl],
      ["companyDomain", (j: RawJob) => j.companyDomain],
      ["department", (j: RawJob) => j.department],
      ["experienceMin", (j: RawJob) => j.experienceMin],
      ["locations", (j: RawJob) => j.locations],
    ]
      .map(([k, f]) => `${k as string} ${filled(f as (j: RawJob) => unknown)}`)
      .join(" · "),
  );
  console.log("feed:", dist(jobs.map((j) => extra(j, "feed") as string)));
  console.log("jobType:", dist(jobs.map((j) => j.jobType)));
  console.log("experienceLevel:", dist(jobs.map((j) => j.experienceLevel)));
  console.log("workMode:", dist(jobs.map((j) => j.workMode)));
  console.log("payKind:", dist(jobs.map((j) => extra(j, "payKind") as string)));
  console.log("salary.period:", dist(jobs.map((j) => j.salary?.period)));
  console.log("postedBasis:", dist(jobs.map((j) => extra(j, "postedBasis") as string)));
  console.log("tags:", dist(jobs.flatMap((j) => (j.tags?.length ? j.tags : ["(none)"]))));
  const ages = jobs.map((j) => (j.postedAt ? (Date.now() - Date.parse(j.postedAt)) / 86_400_000 : null)).filter((x): x is number => x !== null).sort((a, b) => a - b);
  if (ages.length > 0) console.log(`postedAt age (days): min ${ages[0]?.toFixed(2)} · median ${ages[Math.floor(ages.length / 2)]?.toFixed(2)} · max ${ages.at(-1)?.toFixed(2)}`);
  const sal = jobs.map((j) => j.salary).filter((s) => s && s.max !== null && s.max > 0);
  if (sal.length > 0) {
    const maxes = sal.map((s) => s?.max ?? 0).sort((a, b) => a - b);
    console.log(`salary.max: median ${maxes[Math.floor(maxes.length / 2)]} (${sal[0]?.period}) over ${sal.length} paid`);
  }
}
