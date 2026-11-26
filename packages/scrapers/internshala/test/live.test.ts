/**
 * Opt-in live smoke test against internshala.com — run with `LIVE=1 pnpm --filter @easyjobs/scraper-internshala test`.
 * Polite: the real contract HTTP client (robots.txt) + the 1.5 s site throttle; ≈ 10 requests in total.
 */
import { describe, expect, it } from "vitest";
import { validateRawJob, type RawJob } from "@easyjobs/contract";
import { createScrapeContext } from "@easyjobs/contract/node";
import { createInternshalaScraper } from "../src/scrapers";
import { quietLogger } from "./helpers";

const LIVE = process.env.LIVE === "1";

describe.skipIf(!LIVE)("live: internshala.com", () => {
  for (const kind of ["internship", "job"] as const) {
    it(
      `${kind}s: the first cards parse into valid RawJobs with details`,
      async () => {
        const scraper = createInternshalaScraper(kind, { feeds: ["main"], maxPages: 1, maxDetails: 3, refreshPages: 0, devCacheDir: null });
        const ctx = createScrapeContext({ limit: 4, log: quietLogger() });
        const jobs: RawJob[] = [];
        for await (const job of scraper.scrape(ctx)) jobs.push(job);
        expect(jobs).toHaveLength(4);
        for (const j of jobs) expect(validateRawJob(j)).toEqual([]);
        expect(jobs.filter((j) => j.descriptionHtml !== null).length).toBeGreaterThanOrEqual(2);
        expect(jobs.every((j) => j.sourceUrl.startsWith(`https://internshala.com/${kind}/detail/`))).toBe(true);
      },
      120_000,
    );
  }
});
