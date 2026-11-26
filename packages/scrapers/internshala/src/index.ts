/**
 * @easyjobs/scraper-internshala — Internshala internships and jobs (kind "job_board").
 * Discovery notes, selectors and politeness rules: see README.md.
 */
import type { Scraper } from "@easyjobs/contract/node";
import { createInternshalaScraper } from "./scrapers";

export const internshipsScraper: Scraper = createInternshalaScraper("internship");
export const jobsScraper: Scraper = createInternshalaScraper("job");

export const scrapers: Scraper[] = [internshipsScraper, jobsScraper];
export default scrapers;

export { createInternshalaScraper, createInternshalaScrapers, INTERVAL_MINUTES, SCRAPER_IDS } from "./scrapers";
export { DEFAULTS, MIN_DELAY_MS, resolveOptions, type InternshalaOptions } from "./config";
export { FEEDS, type FeedSpec } from "./feeds";
export { parseListingPage } from "./parse/listing";
export { parseDetailPage } from "./parse/detail";
export { parsePay } from "./parse/money";
export { resolvePostedAt, parseRelativeAge, urlTimestampMs } from "./parse/dates";
export { toRawJob } from "./map";
export type { DetailPage, InternshalaKind, ListingCard, ListingPage } from "./types";
