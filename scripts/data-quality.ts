/**
 * `pnpm data-quality` → docs/data-quality.md — per-source and overall quality of the stored jobs.
 * Reads the database directly (DATABASE_URL or PGlite; PGlite is single-process, so stop `pnpm dev` first).
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { createDatabase, loadRootEnv, PgliteLockedError, REPO_ROOT, sql } from "@easyjobs/db";
import { isOfficialHost } from "@easyjobs/normalize";

loadRootEnv();

interface Row {
  source: string;
  kind: string;
  id: string;
  status: string;
  closed_reason: string | null;
  apply_url: string;
  has_salary: boolean;
  has_location: boolean;
  level: string;
  category: string;
  job_type: string;
  work_mode: string | null;
  tags: string[];
  posted_at: string;
  first_seen_at: string;
  company: string;
  n_sources: number;
}

const pct = (n: number, d: number): string => (d === 0 ? "—" : `${Math.round((100 * n) / d)}%`);
const median = (xs: number[]): number | null => {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? (s[m] ?? null) : ((s[m - 1] ?? 0) + (s[m] ?? 0)) / 2;
};
const dist = (rows: Row[], key: (r: Row) => string, top = 4): string => {
  const c = new Map<string, number>();
  for (const r of rows) c.set(key(r), (c.get(key(r)) ?? 0) + 1);
  return [...c.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, top)
    .map(([k, v]) => `${k} ${pct(v, rows.length)}`)
    .join(" · ");
};
const officialApply = (url: string): boolean => {
  try {
    return isOfficialHost(url);
  } catch {
    return false;
  }
};
/** Date-only or synthetic times (00:00 / 12:00 UTC) can't measure discovery latency. */
const preciseTime = (iso: string): boolean => {
  const d = new Date(iso);
  const minutes = d.getUTCHours() * 60 + d.getUTCMinutes();
  return !(d.getUTCSeconds() === 0 && (minutes === 0 || minutes === 720));
};

async function main(): Promise<void> {
  let db;
  try {
    db = await createDatabase({});
  } catch (e) {
    if (e instanceof PgliteLockedError) {
      console.error(`${e.message}\n→ PGlite is single-process: stop \`pnpm dev\` and re-run \`pnpm data-quality\` (or use DATABASE_URL).`);
      process.exit(2);
    }
    throw e;
  }
  try {
    const rows = await db.query<Row>(sql`
      SELECT DISTINCT ON (s.source, j.id)
        s.source, s.source_kind AS kind, j.id, j.status, j.closed_reason, j.apply_url,
        (j.salary IS NOT NULL) AS has_salary,
        (j.is_remote OR coalesce(array_length(j.cities, 1), 0) > 0 OR coalesce(array_length(j.countries, 1), 0) > 0) AS has_location,
        j.experience_level AS level, j.category, j.job_type, j.work_mode, j.tags,
        to_char(j.posted_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS posted_at,
        to_char(j.first_seen_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS first_seen_at,
        j.company, jsonb_array_length(j.sources) AS n_sources
      FROM job_sources s JOIN jobs j ON j.id = s.job_id
      ORDER BY s.source, j.id`);
    const jobs = new Map<string, Row>();
    for (const r of rows) if (!jobs.has(r.id)) jobs.set(r.id, r);
    const all = [...jobs.values()];
    const open = all.filter((r) => r.status === "open");
    const crawlStart = Math.min(...all.map((r) => Date.parse(r.first_seen_at)));

    const bySource = new Map<string, Row[]>();
    for (const r of rows) bySource.set(r.source, [...(bySource.get(r.source) ?? []), r]);

    const lines: string[] = [];
    const now = new Date();
    lines.push("# Data quality", "");
    lines.push(`Generated ${now.toISOString()} by \`pnpm data-quality\` from ${db.location.replace(/:[^:@/]*@/, ":***@")}.`);
    lines.push(`**${open.length.toLocaleString("en-IN")} open jobs** (${all.length.toLocaleString("en-IN")} stored) from ${bySource.size} sources and ${new Set(open.map((r) => r.company)).size.toLocaleString("en-IN")} companies. Crawl started ${new Date(crawlStart).toISOString()}.`, "");

    lines.push("## Per source", "");
    lines.push("| Source | Kind | Open | Official apply URL | Salary | Location | Merged (≥2 sources) | Suspicious | Stale/old closed | Levels | Top categories |");
    lines.push("|---|---|---|---|---|---|---|---|---|---|---|");
    for (const [source, rs] of [...bySource.entries()].sort((a, b) => b[1].length - a[1].length)) {
      const o = rs.filter((r) => r.status === "open");
      lines.push(
        `| \`${source}\` | ${rs[0]?.kind ?? ""} | ${o.length.toLocaleString("en-IN")} | ${pct(o.filter((r) => officialApply(r.apply_url)).length, o.length)} | ${pct(o.filter((r) => r.has_salary).length, o.length)} | ${pct(o.filter((r) => r.has_location).length, o.length)} | ${pct(o.filter((r) => r.n_sources > 1).length, o.length)} | ${rs.filter((r) => r.tags.includes("suspicious")).length} | ${rs.filter((r) => r.closed_reason === "stale" || r.closed_reason === "too_old").length} | ${dist(o, (r) => r.level, 3)} | ${dist(o, (r) => r.category, 2)} |`,
      );
    }

    lines.push("", "## Overall (open jobs)", "");
    lines.push(`- **Levels:** ${dist(open, (r) => r.level, 7)}`);
    lines.push(`- **Job types:** ${dist(open, (r) => r.job_type, 7)}`);
    lines.push(`- **Work modes:** ${dist(open, (r) => r.work_mode ?? "unknown", 4)}`);
    lines.push(`- **Official apply URL:** ${pct(open.filter((r) => officialApply(r.apply_url)).length, open.length)} · **salary:** ${pct(open.filter((r) => r.has_salary).length, open.length)} · **parsed location:** ${pct(open.filter((r) => r.has_location).length, open.length)} · **merged (≥2 sources):** ${open.filter((r) => r.n_sources > 1).length.toLocaleString("en-IN")} · **suspicious:** ${open.filter((r) => r.tags.includes("suspicious")).length}`);
    const companies = new Map<string, number>();
    for (const r of open) companies.set(r.company, (companies.get(r.company) ?? 0) + 1);
    lines.push(`- **Top companies:** ${[...companies.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15).map(([c, n]) => `${c} (${n.toLocaleString("en-IN")})`).join(", ")}`);

    lines.push("", "## Freshness", "");
    lines.push("Discovery latency = minutes from `postedAt` to `firstSeenAt`, for postings published **after the crawl started** (older postings measure the backfill, not the crawler), on sources whose timestamps are precise (≥ 70 % of their postings carry a time, not just a date).", "");
    lines.push("| Source | Precise timestamps | Posted after crawl start | Median discovery latency |", "|---|---|---|---|");
    for (const [source, rs] of [...bySource.entries()].sort()) {
      const precise = rs.filter((r) => preciseTime(r.posted_at) && r.posted_at !== r.first_seen_at);
      const share = precise.length / Math.max(1, rs.length);
      if (share < 0.7) continue;
      const after = precise.filter((r) => Date.parse(r.posted_at) >= crawlStart && Date.parse(r.first_seen_at) >= Date.parse(r.posted_at));
      const m = median(after.map((r) => (Date.parse(r.first_seen_at) - Date.parse(r.posted_at)) / 60_000));
      lines.push(`| \`${source}\` | ${pct(precise.length, rs.length)} | ${after.length} | ${m === null ? "—" : `${Math.round(m)} min`} |`);
    }
    const out = join(REPO_ROOT, "docs/data-quality.md");
    writeFileSync(out, `${lines.join("\n")}\n`);
    console.log(`wrote ${out} — ${open.length} open jobs, ${bySource.size} sources`);
  } finally {
    await db.close();
  }
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.stack : e);
  process.exit(1);
});
