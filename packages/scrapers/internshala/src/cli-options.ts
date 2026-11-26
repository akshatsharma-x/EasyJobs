import { parseCount, type InternshalaOptions } from "./config";

export interface CliOptions {
  overrides: InternshalaOptions;
  /** --cache: development HTML cache in .cache/http */
  devCache: boolean;
}

/**
 * Package-specific CLI flags (the standard ones — --scraper, --limit, --target, --out — belong to runScraperCli):
 *   --pages <n>|all     listing pages per feed (backfill)
 *   --details <n>|all   detail pages per scraper run
 *   --cache             development HTML cache
 */
export function parseCliOptions(argv: string[]): CliOptions {
  const flag = (name: string): string | undefined => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const overrides: InternshalaOptions = {};
  for (const name of ["pages", "details"] as const) {
    const raw = flag(name);
    if (raw === undefined) continue;
    const n = parseCount(raw);
    if (n === undefined) throw new Error(`--${name} expects a number or "all", got "${raw}"`);
    if (name === "pages") overrides.maxPages = Math.max(1, n);
    else overrides.maxDetails = n;
  }
  return { overrides, devCache: argv.includes("--cache") };
}
