/**
 * Opt-in live smoke tests against the real public APIs:  LIVE=1 pnpm --filter @easyjobs/scraper-ats-public test:live
 * Per ATS: the first two fixture targets, two jobs each, through the real polite HttpClient.
 */
import { validateRawJob } from "@easyjobs/contract";
import { createScrapeContext, createLogger } from "@easyjobs/contract/node";
import { describe, expect, it } from "vitest";
import { targetsFor } from "../src/fixtures/targets";
import { scrapers } from "../src/index";

const live = process.env.LIVE === "1";

describe.skipIf(!live)("live smoke (LIVE=1)", () => {
  for (const scraper of scrapers) {
    it(`${scraper.id}: fixture targets return valid RawJobs`, async () => {
      const targets = targetsFor(scraper.handlesAts![0]!).slice(0, 2);
      expect(targets.length).toBeGreaterThan(0);
      const ctx = createScrapeContext({ log: createLogger(`live:${scraper.id}`), targets, limit: targets.length * 2 });
      const perTarget = new Map<string, number>();
      for await (const job of scraper.scrape(ctx)) {
        expect(validateRawJob(job), `${job.sourceJobId}`).toEqual([]);
        expect(job).toMatchObject({ source: scraper.id, sourceKind: "ats" });
        expect(targets.map((t) => t.slug)).toContain(job.target);
        perTarget.set(job.target!, (perTarget.get(job.target!) ?? 0) + 1);
      }
      for (const t of targets) expect(perTarget.get(t.slug) ?? 0, `jobs for ${t.slug}`).toBeGreaterThan(0);
    });
  }
});
