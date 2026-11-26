/**
 * data/summary.md — counts by ATS, tag and priority, plus the top 50 companies by open jobs.
 *   pnpm --filter @easyjobs/registry summary
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { COMPANY_TAGS, LABELS, type CompanyTarget } from "@easyjobs/contract";
import { DATA_DIR, readJsonFile } from "./lib/fetcher";

interface RejectedLike {
  slug: string;
  name: string;
  reason: string;
  tried: { ats: string; status: string }[];
}

const fmt = (n: number): string => n.toLocaleString("en-US");

function table(headers: string[], rows: (string | number)[][]): string {
  const line = (cells: (string | number)[]): string => `| ${cells.map((c) => String(c).replace(/\|/g, "\\|")).join(" | ")} |`;
  return [line(headers), line(headers.map((_, i) => (i === 0 ? "---" : "---:"))), ...rows.map(line)].join("\n");
}

function rejectionKind(r: RejectedLike): string {
  if (r.tried.length === 0) return "no ATS board or careers page found";
  const statuses = new Set(r.tried.map((t) => t.status));
  if (statuses.has("blocked")) return "blocked (robots.txt / 403)";
  if ([...statuses].every((s) => s === "not_found")) return "board/page not found (404, empty or moved)";
  if (statuses.has("error")) return "errors (network / 5xx / unexpected response)";
  if (r.tried.some((t) => t.status === "ok")) return "board belongs to another company";
  return "other";
}

export function renderSummary(list: readonly CompanyTarget[], rejected: readonly RejectedLike[]): string {
  const api = list.filter((c) => c.extra?.["verifiedBy"] === "ats-api");
  const withJobs = api.filter((c) => (c.openJobs ?? 0) > 0);
  const totalJobs = api.reduce((s, c) => s + (c.openJobs ?? 0), 0);
  const indiaJobs = api.reduce((s, c) => s + (typeof c.extra?.["indiaJobs"] === "number" ? (c.extra["indiaJobs"] as number) : 0), 0);
  const newest = list.map((c) => c.verifiedAt ?? "").sort().pop() ?? "";

  const byAts = new Map<string, { n: number; jobs: number; withJobs: number }>();
  for (const c of list) {
    const a = byAts.get(c.ats) ?? { n: 0, jobs: 0, withJobs: 0 };
    a.n++;
    a.jobs += c.openJobs ?? 0;
    if ((c.openJobs ?? 0) > 0) a.withJobs++;
    byAts.set(c.ats, a);
  }
  const atsRows = [...byAts.entries()].sort((a, b) => b[1].n - a[1].n).map(([ats, a]) => [ats, a.n, a.withJobs, fmt(a.jobs)]);

  const tagRows = COMPANY_TAGS.map((t) => {
    const of = list.filter((c) => c.tags.includes(t));
    return [`${t} (${LABELS.companyTag[t]})`, of.length, of.filter((c) => c.extra?.["verifiedBy"] === "ats-api").length, fmt(of.reduce((s, c) => s + (c.openJobs ?? 0), 0))];
  }).filter((r) => (r[1] as number) > 0);

  const prioRows = ([1, 2, 3] as const).map((p) => {
    const of = list.filter((c) => c.priority === p);
    const cadence = p === 1 ? "~15 min" : p === 2 ? "hourly" : "daily";
    return [`${p} (${cadence})`, of.length, of.filter((c) => c.extra?.["verifiedBy"] === "ats-api").length, fmt(of.reduce((s, c) => s + (c.openJobs ?? 0), 0))];
  });

  const segRows = [...new Set(list.map((c) => String(c.extra?.["segment"] ?? "?")))]
    .sort()
    .map((s) => {
      const of = list.filter((c) => c.extra?.["segment"] === s);
      return [s, of.length, of.filter((c) => c.extra?.["verifiedBy"] === "ats-api").length];
    });

  const top = [...api].sort((a, b) => (b.openJobs ?? 0) - (a.openJobs ?? 0) || a.slug.localeCompare(b.slug)).slice(0, 50);
  const topRows = top.map((c, i) => [
    i + 1,
    `${c.name} (\`${c.slug}\`)`,
    c.ats,
    fmt(c.openJobs ?? 0),
    typeof c.extra?.["indiaJobs"] === "number" ? fmt(c.extra["indiaJobs"] as number) : "–",
    c.priority,
  ]);

  const rejKinds = new Map<string, number>();
  for (const r of rejected) rejKinds.set(rejectionKind(r), (rejKinds.get(rejectionKind(r)) ?? 0) + 1);

  return `# Company registry summary

Generated ${new Date().toISOString()} by \`scripts/verify.ts\` (last check ${newest || "n/a"}).

| | count |
|---|---:|
| Companies in \`companies.json\` | **${fmt(list.length)}** |
| Verified via a live ATS job API (\`verifiedBy: ats-api\`, job count known) | **${fmt(api.length)}** |
| … of which with ≥ 1 open job | ${fmt(withJobs.length)} |
| ATS identified + careers page verified, no job API (\`verifiedBy: ats-page\`: Phenom, SuccessFactors, Avature, iCIMS, Taleo, JSON-LD, Darwinbox, Keka, Zoho Recruit…) | ${fmt(list.filter((c) => c.extra?.["verifiedBy"] === "ats-page").length)} |
| Careers-page entries (\`ats: custom\`, page loaded, no job API) | ${fmt(list.filter((c) => c.extra?.["verifiedBy"] === "careers-page").length)} |
| Curated portals not fetchable politely (\`verifiedBy: unverified\`, \`verifiedAt: null\`) | ${fmt(list.filter((c) => c.extra?.["verifiedBy"] === "unverified").length)} |
| Portals scraped by \`@easyjobs/scraper-bigtech\` (P09; \`extra.scrapedBy\`) | ${fmt(list.filter((c) => c.extra?.["scrapedBy"]).length)} |
| Open jobs across verified boards | ${fmt(totalJobs)} |
| Open jobs in India (Workday tenants that expose a country facet) | ${fmt(indiaJobs)} |
| Companies with India presence | ${fmt(list.filter((c) => c.indiaPresence).length)} |
| Rejected candidates (\`rejected.json\`) | ${fmt(rejected.length)} |

## By ATS

${table(["ats", "companies", "with open jobs", "open jobs"], atsRows)}

## By tag

${table(["tag", "companies", "ATS-verified", "open jobs"], tagRows)}

## By priority

${table(["priority", "companies", "ATS-verified", "open jobs"], prioRows)}

## By candidate segment

${table(["segment", "companies", "ATS-verified"], segRows)}

## Top 50 by open jobs

${table(["#", "company", "ats", "open jobs", "India jobs", "priority"], topRows)}

## Rejected candidates by reason

${table(["reason", "candidates"], [...rejKinds.entries()].sort((a, b) => b[1] - a[1]))}
`;
}

export function writeSummary(list: readonly CompanyTarget[], rejected: readonly RejectedLike[]): void {
  writeFileSync(join(DATA_DIR, "summary.md"), renderSummary(list, rejected));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  writeSummary(readJsonFile<CompanyTarget[]>(join(DATA_DIR, "companies.json"), []), readJsonFile<RejectedLike[]>(join(DATA_DIR, "rejected.json"), []));
  console.log("wrote data/summary.md");
}
