/** Live smoke test against the real sites — runs only with LIVE=1 (polite: small limit, no cache). */
import { describe, expect, it } from "vitest";
import { validateRawJob } from "@easyjobs/contract";
import { createHttpClient, createScrapeContext } from "@easyjobs/contract/node";
import { scrapers } from "../src/index";
import { testLogger } from "./helpers";

describe.skipIf(!process.env.LIVE)("live", () => {
  for (const s of scrapers) {
    it(
      `${s.id}: emits valid jobs with apply links`,
      async () => {
        const log = testLogger();
        const ctx = createScrapeContext({ http: createHttpClient({ log }), log, limit: 5, env: { ...process.env, WPJOBS_CACHE_DIR: "off" } });
        const jobs = [];
        for await (const j of s.scrape(ctx)) jobs.push(j);
        expect(jobs.length).toBeGreaterThan(0);
        for (const j of jobs) {
          expect(validateRawJob(j)).toEqual([]);
          expect(j.applyUrl).toMatch(/^https?:\/\//);
          expect(j.company.length).toBeGreaterThan(0);
        }
      },
      180_000,
    );
  }
});
