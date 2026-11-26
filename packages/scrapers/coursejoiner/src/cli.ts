/**
 * pnpm --filter @easyjobs/scraper-coursejoiner scrape --limit 100 [--scraper coursejoiner] [--out out]
 *   [--backfill-days 60] [--since 2026-11-25T00:00:00Z|6h|2d] [--no-cache]
 */
import { runScraperCli, type Scraper } from "@easyjobs/contract/node";
import { scrapers } from "./index";

const argv = process.argv.slice(2);
const arg = (name: string): string | undefined => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
};

const backfill = arg("backfill-days");
if (backfill !== undefined) {
  if (!(Number(backfill) > 0)) throw new Error(`--backfill-days must be a positive number (got "${backfill}")`);
  process.env.WPJOBS_BACKFILL_DAYS = backfill;
}
if (argv.includes("--no-cache")) process.env.WPJOBS_CACHE_DIR = "off";

function parseSince(v: string): Date {
  const rel = /^(\d+(?:\.\d+)?)\s*([mhd])$/i.exec(v);
  if (rel) {
    const ms = { m: 60_000, h: 3_600_000, d: 86_400_000 }[rel[2]!.toLowerCase() as "m" | "h" | "d"];
    return new Date(Date.now() - Number(rel[1]) * ms);
  }
  const t = Date.parse(v);
  if (Number.isNaN(t)) throw new Error(`--since must be an ISO date or a duration like 6h/2d (got "${v}")`);
  return new Date(t);
}

const sinceArg = arg("since");
const since = sinceArg ? parseSince(sinceArg) : undefined;
const selected: Scraper[] = since ? scrapers.map((s) => ({ ...s, scrape: (ctx) => s.scrape({ ...ctx, since }) })) : scrapers;

await runScraperCli(selected);
