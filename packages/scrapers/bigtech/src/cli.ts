// pnpm --filter @easyjobs/scraper-bigtech scrape [--scraper <id>] [--limit <n>|all] [--out <dir>]
import { runScraperCli } from "@easyjobs/contract/node";
import { scrapers } from "./index";

await runScraperCli(scrapers);
