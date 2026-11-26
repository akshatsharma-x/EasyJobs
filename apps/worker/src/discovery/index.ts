import { join } from "node:path";
import type { Logger } from "@easyjobs/contract/node";
import { discoverNormalizer, type NormalizerHandle } from "./normalizer";
import { discoverRegistry, type RegistryHandle } from "./registry";
import { discoverScrapers, type DiscoveredScraper, type PackageReport, type ScraperCache } from "./scrapers";

export * from "./normalizer";
export * from "./registry";
export * from "./scrapers";
export { safeImport, treeVersion } from "./safe-import";

export interface Discovery {
  at: Date;
  /** Real scrapers from packages/scrapers/* (internal demo excluded). */
  scrapers: DiscoveredScraper[];
  demo: DiscoveredScraper;
  packages: PackageReport[];
  warnings: string[];
  normalizer: NormalizerHandle;
  registry: RegistryHandle;
}

export interface DiscoverOptions {
  repoRoot: string;
  importTimeoutMs: number;
  log: Logger;
  previous?: Discovery | null;
  scraperCache?: ScraperCache;
}

/** Scrapers + normalizer + registry. Never throws for broken sibling packages. */
export async function discoverAll(opts: DiscoverOptions): Promise<Discovery> {
  const scr = await discoverScrapers({
    scrapersDir: join(opts.repoRoot, "packages", "scrapers"),
    importTimeoutMs: opts.importTimeoutMs,
    log: opts.log,
    cache: opts.scraperCache,
  });
  const normalizer = await discoverNormalizer({ ...opts, previous: opts.previous?.normalizer });
  const registry = await discoverRegistry({ ...opts, previous: opts.previous?.registry });
  return { at: new Date(), scrapers: scr.scrapers, demo: scr.demo, packages: scr.packages, warnings: scr.warnings, normalizer, registry };
}

/** Real scrapers followed by the internal demo scraper. */
export function allScrapers(d: Pick<Discovery, "scrapers" | "demo">): DiscoveredScraper[] {
  return [...d.scrapers, d.demo];
}

export function findScraper(d: Pick<Discovery, "scrapers" | "demo">, id: string): DiscoveredScraper | undefined {
  return allScrapers(d).find((s) => s.scraper.id === id);
}
