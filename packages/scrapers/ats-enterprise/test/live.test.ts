/**
 * LIVE=1 smoke tests: one real fixture target per platform, a handful of jobs each, through the real
 * contract HTTP client (robots.txt, politeness). Off by default; run with
 *   LIVE=1 pnpm --filter @easyjobs/scraper-ats-enterprise test -- live
 */
import { describe, expect, it } from "vitest";
import { validateRawJob, type RawJob } from "@easyjobs/contract";
import { createHttpClient, createLogger, createScrapeContext, type Scraper } from "@easyjobs/contract/node";
import { targets } from "../src/fixtures/targets";
import { scrapers } from "../src/index";
import { isBlocked } from "../src/lib/http";

const LIVE = process.env.LIVE === "1";

const cases: { scraper: string; target: string }[] = [
  { scraper: "workday", target: "workday" },
  { scraper: "oracle", target: "oracle" },
  { scraper: "eightfold", target: "paypal" },
  { scraper: "jsonld", target: "boeing" },
  { scraper: "successfactors", target: "ey" },
  { scraper: "phenom", target: "philips" },
  { scraper: "avature", target: "bloomberg" },
];

describe.skipIf(!LIVE)("live smoke", () => {
  for (const c of cases) {
    it(`${c.scraper} → ${c.target}`, async (ctx) => {
      const scraper = scrapers.find((s) => s.id === c.scraper) as Scraper;
      const t = targets.find((x) => x.slug === c.target);
      expect(t, `fixture target ${c.target}`).toBeDefined();
      const log = createLogger(`live:${c.scraper}`);
      const sctx = createScrapeContext({ log, http: createHttpClient({ log }), limit: 3, targets: t ? [t] : [] });
      const jobs: RawJob[] = [];
      try {
        for await (const j of scraper.scrape(sctx)) {
          jobs.push(j);
          if (jobs.length >= 3) break;
        }
      } catch (e) {
        // An anti-bot challenge is an environment condition, not a parser failure — report, don't retry.
        if (jobs.length === 0 && (isBlocked(e) || /anti-bot challenge/.test(String(e)))) ctx.skip(`blocked: ${String(e).slice(0, 160)}`);
        if (jobs.length === 0) throw e;
      }
      expect(jobs.length).toBeGreaterThan(0);
      for (const j of jobs) expect(validateRawJob(j), j.sourceJobId).toEqual([]);
    }, 300_000);
  }
});
