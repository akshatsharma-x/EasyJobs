// pnpm --filter @easyjobs/scraper-ats-enterprise scrape --limit 30 [--scraper <id>] [--target <slug>] [--out <dir>]
import { runScraperCli } from "@easyjobs/contract/node";
import { targets } from "./fixtures/targets";
import { scrapers } from "./index";

await runScraperCli(scrapers, { targets });
