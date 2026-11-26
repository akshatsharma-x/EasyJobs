/**
 * LIVE smoke tests — hit the real career sites. Off by default.
 *   LIVE=1 pnpm --filter @easyjobs/scraper-bigtech test            (all enabled scrapers)
 *   LIVE=1 LIVE_SCRAPERS=amazon,ibm pnpm --filter … test             (a subset)
 */
import { validateRawJob, type RawJob } from "@easyjobs/contract";
import { createLogger, createScrapeContext } from "@easyjobs/contract/node";
import { describe, expect, it } from "vitest";
import { careerSites } from "../src/index";

const LIVE = process.env.LIVE === "1";
const only = new Set((process.env.LIVE_SCRAPERS ?? "").split(",").map((s) => s.trim()).filter(Boolean));
const sites = careerSites.filter((s) => (only.size === 0 || only.has(s.id)) && (s.isEnabled?.(process.env) ?? true));

describe.skipIf(!LIVE)("live smoke", () => {
  for (const site of sites) {
    it(`${site.id} returns valid RawJobs`, { timeout: 180_000 }, async () => {
      const ctx = createScrapeContext({ log: createLogger(`live:${site.id}`), limit: 5 });
      const jobs: RawJob[] = [];
      for await (const job of site.scrape(ctx)) jobs.push(job);
      expect(jobs.length).toBeGreaterThan(0);
      for (const job of jobs) {
        expect(validateRawJob(job)).toEqual([]);
        expect(job.source).toBe(site.id);
        expect(job.sourceKind).toBe("career_site");
        expect(job.applyUrl).toMatch(/^https:\/\//);
      }
    });
  }
});
