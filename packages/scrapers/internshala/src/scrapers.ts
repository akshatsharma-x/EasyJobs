import type { RawJob } from "@easyjobs/contract";
import type { Env, ScrapeContext, Scraper } from "@easyjobs/contract/node";
import { resolveOptions, type InternshalaOptions } from "./config";
import { crawlInternshala, newStats } from "./crawl";
import { createPageFetcher } from "./fetch";
import { sharedThrottle } from "./throttle";
import type { InternshalaKind } from "./types";

export const INTERVAL_MINUTES = 20;

export const SCRAPER_IDS: Record<InternshalaKind, string> = {
  internship: "internshala-internships",
  job: "internshala-jobs",
};

const NAMES: Record<InternshalaKind, string> = {
  internship: "Internshala Internships",
  job: "Internshala Jobs",
};

/** INTERNSHALA_ENABLED=0 turns both scrapers off (default: on). */
export function isInternshalaEnabled(env: Env): boolean {
  const v = (env.INTERNSHALA_ENABLED ?? "").trim().toLowerCase();
  return v !== "0" && v !== "false" && v !== "off" && v !== "no";
}

export function createInternshalaScraper(kind: InternshalaKind, overrides: InternshalaOptions = {}): Scraper {
  const id = SCRAPER_IDS[kind];
  return {
    id,
    name: NAMES[kind],
    kind: "job_board",
    intervalMinutes: INTERVAL_MINUTES,
    attribution: "Listings via Internshala",
    isEnabled: isInternshalaEnabled,
    async *scrape(ctx: ScrapeContext): AsyncIterable<RawJob> {
      const opts = resolveOptions(kind, ctx.env, overrides);
      const throttle = opts.throttle ?? sharedThrottle(new URL(opts.origin).host, opts.delayMs);
      const fetchPage = createPageFetcher({ http: ctx.http, throttle, log: ctx.log, devCacheDir: opts.devCacheDir });
      if (opts.devCacheDir) ctx.log.warn(`${id}: development HTML cache enabled at ${opts.devCacheDir}`);
      yield* crawlInternshala(
        ctx,
        {
          source: id,
          kind,
          intervalMinutes: INTERVAL_MINUTES,
          maxPages: opts.maxPages,
          maxDetails: opts.maxDetails,
          refreshPages: opts.refreshPages,
          stopAfterKnownPages: opts.stopAfterKnownPages,
          feeds: opts.feeds,
          origin: opts.origin,
          now: opts.now,
        },
        fetchPage,
        newStats(),
      );
    },
  };
}

/** Both scrapers, sharing one site throttle. */
export function createInternshalaScrapers(overrides: InternshalaOptions = {}): Scraper[] {
  return [createInternshalaScraper("internship", overrides), createInternshalaScraper("job", overrides)];
}
