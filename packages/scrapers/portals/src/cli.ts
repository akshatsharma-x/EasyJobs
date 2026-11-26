/**
 *   pnpm --filter @easyjobs/scraper-portals scrape [--scraper linkedin|naukri] [--limit <n>|all] [--out <dir>]
 * Both scrapers are skipped unless ENABLE_LINKEDIN=1 / ENABLE_NAUKRI=1. The repo-root .env is loaded if present.
 */
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runScraperCli } from "@easyjobs/contract/node";
import { scrapers } from "./index";

const rootEnv = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..", ".env");
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

await runScraperCli(scrapers);
