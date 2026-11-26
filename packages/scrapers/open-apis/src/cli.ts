// pnpm --filter @easyjobs/scraper-open-apis scrape --limit 30 [--scraper <id>] [--out <dir>]
import { runScraperCli } from "@easyjobs/contract/node";
import { scrapers } from "./index";

try {
  process.loadEnvFile(new URL("../../../../.env", import.meta.url));
} catch {
  /* no repo-root .env — fine */
}
await runScraperCli(scrapers);
