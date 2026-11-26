/**
 * Dev helper: run the scrapers exported by ONE site module through the standard contract CLI,
 * without registering them in src/index.ts.
 *
 *   npx tsx scripts/try.ts src/sites/ibm.ts [--limit 30] [--out out] [--scraper <id>]
 */
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { runScraperCli, type Scraper } from "@easyjobs/contract/node";

const [file, ...rest] = process.argv.slice(2);
if (!file) {
  console.error("usage: tsx scripts/try.ts <src/sites/x.ts> [--limit n] [--out dir]");
  process.exit(2);
}
const mod = (await import(pathToFileURL(resolve(file)).href)) as Record<string, unknown>;
const isScraper = (v: unknown): v is Scraper =>
  !!v && typeof v === "object" && typeof (v as Scraper).id === "string" && typeof (v as Scraper).scrape === "function";
const found = [...new Set(Object.values(mod).filter(isScraper))];
if (found.length === 0) throw new Error(`no Scraper exports in ${file}`);
await runScraperCli(found, { argv: rest });
for (const s of found) {
  const stats = (s as { lastRun?: unknown }).lastRun;
  if (stats) console.log(`${s.id} stats`, stats);
}
