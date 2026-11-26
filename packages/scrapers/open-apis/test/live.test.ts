/**
 * Live smoke tests — run with `LIVE=1 pnpm --filter @easyjobs/scraper-open-apis test` (or `test:live`).
 * Each source is hit once with a small limit through the real polite HttpClient (robots.txt, per-host spacing).
 * Keyed sources run only when their keys are present.
 */
import { validateRawJob } from "@easyjobs/contract";
import { createLogger, createScrapeContext, type Scraper } from "@easyjobs/contract/node";
import { describe, expect, it } from "vitest";
import { SourceBlockedError } from "../src/lib/http";
import { scrapers } from "../src/index";

const LIVE = process.env.LIVE === "1";
/** LIVE_SKIP=remotive,hn-whoishiring — skip sources (e.g. Remotive asks for ≤ 4 calls/day; each LIVE run costs one). */
const SKIP = new Set((process.env.LIVE_SKIP ?? "").split(",").map((x) => x.trim()).filter(Boolean));
const log = createLogger("live");

async function run(s: Scraper, limit: number): Promise<{ count: number; invalid: string[] }> {
  const ctx = createScrapeContext({
    limit,
    log: log.child(s.id),
    env: { ...process.env, HN_RESOLVE_MAX: process.env.HN_RESOLVE_MAX ?? "5", OPEN_APIS_CACHE_DIR: process.env.OPEN_APIS_CACHE_DIR ?? "off" },
  });
  let count = 0;
  const invalid: string[] = [];
  for await (const job of s.scrape(ctx)) {
    count++;
    const errs = validateRawJob(job);
    if (errs.length > 0) invalid.push(`${job.sourceJobId}: ${errs.join("; ")}`);
  }
  return { count, invalid };
}

describe.skipIf(!LIVE)("LIVE smoke", () => {
  for (const s of scrapers) {
    const enabled = (s.isEnabled ? s.isEnabled(process.env) : true) && !SKIP.has(s.id);
    it.skipIf(!enabled)(
      `${s.id} returns valid RawJobs`,
      async () => {
        try {
          const { count, invalid } = await run(s, 5);
          log.info(`${s.id}: ${count} jobs`);
          expect(invalid).toEqual([]);
          expect(count).toBeGreaterThan(0);
        } catch (e) {
          // The Muse sits behind a Cloudflare managed challenge on some networks; we never try to get past it.
          if (s.id === "themuse" && e instanceof SourceBlockedError) {
            log.warn(`themuse blocked on this network: ${e.message}`);
            return;
          }
          throw e;
        }
      },
      180_000,
    );
  }
});
