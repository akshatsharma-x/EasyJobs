/**
 * pnpm --filter @easyjobs/scraper-ats-public scrape --limit 30 [--scraper greenhouse] [--target groww] [--out out]
 * Runs against the verified fixture targets; writes out/<scraper>.jsonl and logs fill rates.
 */
import { runScraperCli } from "@easyjobs/contract/node";
import { targets } from "./fixtures/targets";
import { scrapers } from "./index";

await runScraperCli(scrapers, { targets });
