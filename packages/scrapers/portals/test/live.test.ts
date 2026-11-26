/**
 * LIVE=1 only (prompts.md §0.8.7). Runs each real scraper once against the live site with a throw-away state dir.
 * Passing means "behaves correctly live": either it returns valid RawJobs, or it stops gracefully after a block /
 * robots refusal and records why. As of 2026-11-26 both portals end in the second branch after 1 request each.
 */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { validateRawJob } from "@easyjobs/contract";
import { createLogger, createScrapeContext } from "@easyjobs/contract/node";
import { afterAll, describe, expect, it } from "vitest";
import { createLinkedInScraper } from "../src/linkedin/scraper";
import { createNaukriScraper } from "../src/naukri/scraper";
import { createFileStateStore } from "../src/shared/state";
import { collect } from "./helpers";

const LIVE = process.env.LIVE === "1";
const dirs: string[] = [];
afterAll(async () => {
  await Promise.all(dirs.map((d) => rm(d, { recursive: true, force: true })));
});

describe.skipIf(!LIVE)("live smoke (LIVE=1)", () => {
  for (const [id, make] of [
    ["linkedin", createLinkedInScraper],
    ["naukri", createNaukriScraper],
  ] as const) {
    it(`${id}: valid jobs, or a graceful, recorded stop`, { timeout: 180_000 }, async () => {
      const dir = await mkdtemp(join(tmpdir(), `portals-live-${id}-`));
      dirs.push(dir);
      const store = createFileStateStore(join(dir, `${id}.json`));
      const scraper = make({ stateStore: () => store });
      const env = { ...process.env, LINKEDIN_MAX_REQ_PER_RUN: "3", NAUKRI_MAX_REQ_PER_RUN: "2", LINKEDIN_QUERIES_PER_RUN: "1", NAUKRI_QUERIES_PER_RUN: "1" };
      const ctx = createScrapeContext({ log: createLogger(`live:${id}`), env, limit: 10 });
      const jobs = await collect(scraper.scrape(ctx));
      const state = await store.load();
      console.info(`${id}: outcome=${state.lastRun?.outcome} requests=${state.lastRun?.requests} jobs=${jobs.length} block=${state.lastBlock?.detail ?? "-"}`);
      expect(state.lastRun).not.toBeNull();
      expect(state.lastRun!.requests).toBeLessThanOrEqual(3);
      if (jobs.length > 0) {
        for (const job of jobs) expect(validateRawJob(job)).toEqual([]);
      } else {
        expect(["blocked", "robots_disallowed", "unavailable", "partial"]).toContain(state.lastRun!.outcome);
        expect(state.blockedUntil === null || Date.parse(state.blockedUntil) > Date.now()).toBe(true);
      }
    });
  }
});
