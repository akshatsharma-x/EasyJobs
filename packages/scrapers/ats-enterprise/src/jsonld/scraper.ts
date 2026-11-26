import type { RawJob } from "@easyjobs/contract";
import type { Scraper } from "@easyjobs/contract/node";
import { envInt } from "../lib/env";
import { createSourceHttp, type SourceHttp } from "../lib/http";
import { optionalRegex } from "../lib/joburl";
import { extraString, extraStrings, IncompleteRunError, runTargets, type TargetContext } from "../lib/run";
import { discoverJobUrls, type Discovery } from "./discover";
import { crawlJobPages } from "./engine";

/** HTML pages: robots.txt respected, ≤ 1 request/second per host, one at a time. */
export function pageHttp(tctx: TargetContext, url: string, envPrefix: string): SourceHttp {
  return createSourceHttp(tctx.http, {
    limiterKey: `page:${new URL(url).host}`,
    concurrency: 1,
    gapMs: Math.max(1000, envInt(tctx.env, `${envPrefix}_DELAY_MS`, 1000)),
    timeoutMs: envInt(tctx.env, `${envPrefix}_TIMEOUT_MS`, 25_000, 1000),
    robots: true,
    throttleWaitsMs: [30_000],
    signal: tctx.signal,
    log: tctx.log,
    cache: tctx.cache,
  });
}

export async function discoverForTarget(tctx: TargetContext, http: SourceHttp, url: string): Promise<Discovery> {
  const { target, env, log } = tctx;
  return discoverJobUrls(http, url, {
    include: optionalRegex(extraString(target, "jobUrlPattern")),
    exclude: optionalRegex(extraString(target, "jobUrlExclude")),
    hosts: extraStrings(target, "jobHosts"),
    maxSitemaps: envInt(env, "JSONLD_MAX_SITEMAPS", 40, 1),
    maxListingPages: envInt(env, "JSONLD_MAX_LISTING_PAGES", 10, 1),
    log,
  });
}

/**
 * Crawl a careers site (or a sitemap URL) for schema.org JobPosting pages. Also the fallback
 * engine for SuccessFactors / Phenom / iCIMS / Avature / Taleo when their own listings fail.
 */
export async function* scrapeByPages(tctx: TargetContext, source: string, envPrefix: string, url: string): AsyncGenerator<RawJob> {
  const http = pageHttp(tctx, url, envPrefix);
  const discovery = await discoverForTarget(tctx, http, url);
  tctx.log.info(`${source}: ${discovery.urls.length} job URL(s) via ${discovery.via}`, { sitemaps: discovery.sitemapsRead, complete: discovery.complete });
  if (discovery.urls.length === 0) {
    // A large employer with zero postings is far more likely a discovery failure than reality: never sweep on it.
    throw new IncompleteRunError(`${source}: no job URLs discovered from ${url}`);
  }
  const maxPages = envInt(tctx.env, `${envPrefix}_MAX_PAGES`, 200);
  // A limited run is a sample (never swept): don't crawl far past the number of jobs wanted.
  const sampleCap = tctx.limit !== undefined ? Math.min(maxPages, tctx.limit * 2 + 10) : maxPages;
  yield* crawlJobPages(tctx, http, discovery, { source, maxPages: sampleCap });
}

export const jsonldScraper: Scraper = {
  id: "jsonld",
  name: "Career site (schema.org JobPosting)",
  kind: "ats",
  intervalMinutes: 180,
  handlesAts: ["jsonld"],
  scrape: (ctx) => runTargets(ctx, { scraperId: "jsonld", handlesAts: ["jsonld"] }, (tctx) => scrapeByPages(tctx, "jsonld", "JSONLD", tctx.target.token)),
};
