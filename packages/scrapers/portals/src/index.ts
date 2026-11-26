import type { Scraper } from "@easyjobs/contract/node";
import { linkedinScraper } from "./linkedin/scraper";
import { naukriScraper } from "./naukri/scraper";

/**
 * @easyjobs/scraper-portals — LinkedIn (public guest listings) and Naukri (public search pages).
 * Both are job_board sources, DISABLED unless ENABLE_LINKEDIN=1 / ENABLE_NAUKRI=1. See README.md for the
 * current live status (both blocked as of 2026-11-26) and the evidence.
 */
export const scrapers: Scraper[] = [linkedinScraper, naukriScraper];
export default scrapers;

export { createLinkedInScraper, linkedinScraper } from "./linkedin/scraper";
export { parseLinkedInListing, type LinkedInCard } from "./linkedin/parse-listing";
export { parseLinkedInDetail, type LinkedInDetail, type LinkedInCriteria } from "./linkedin/parse-detail";
export { mapLinkedInJob } from "./linkedin/map";
export { linkedInConfigFromEnv, linkedInSearchUrl, linkedInDetailUrl, linkedInViewUrl, type LinkedInConfig, type LinkedInQuery } from "./linkedin/plan";

export { createNaukriScraper, naukriScraper, type NaukriDeps } from "./naukri/scraper";
export { parseNaukriSearch, type NaukriListing, type NaukriSearchResult } from "./naukri/parse-search";
export { parseNaukriDetail, type NaukriDetail } from "./naukri/parse-detail";
export { mapNaukriJob } from "./naukri/map";
export { naukriConfigFromEnv, naukriSearchUrl, type NaukriConfig, type NaukriQuery } from "./naukri/plan";
export { createPlaywrightFetcher, BrowserUnavailableError, type NaukriFetcher, type FetcherFactory, type BrowserPage } from "./naukri/browser";

export { detectBlock, type BlockSignal } from "./shared/block";
export { judgeRobots, type RobotsVerdict } from "./shared/robots";
export { backoffDelayMs, backoffPolicyFromEnv, type BackoffPolicy } from "./shared/backoff";
export { createFileStateStore, createMemoryStateStore, emptyState, type PortalState, type StateStore } from "./shared/state";
export type { PortalDeps } from "./shared/portal";
