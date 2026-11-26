/**
 *   pnpm --filter @easyjobs/scraper-internshala scrape [--scraper <id>] [--limit <n>|all] [--out <dir>]
 *        [--pages <n>|all]    listing pages per feed (backfill), default 10
 *        [--details <n>|all]  detail pages per scraper run, default 100
 *        [--cache]            development HTML cache in .cache/http (don't hammer the site while iterating)
 *
 * Standard flags are handled by the contract's runScraperCli.
 */
import { runScraperCli } from "@easyjobs/contract/node";
import { parseCliOptions } from "./cli-options";
import { createInternshalaScrapers } from "./scrapers";

const argv = process.argv.slice(2);
const { overrides, devCache } = parseCliOptions(argv);
if (devCache) process.env.INTERNSHALA_DEV_CACHE ??= "1";

await runScraperCli(createInternshalaScrapers(overrides), { argv });
