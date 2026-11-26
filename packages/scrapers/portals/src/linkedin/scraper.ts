import type { RawJob } from "@easyjobs/contract";
import type { Scraper, ScrapeContext } from "@easyjobs/contract/node";
import { backoffPolicyFromEnv } from "../shared/backoff";
import { envFlag } from "../shared/env";
import type { Pacer } from "../shared/pacer";
import { guardedFetch, httpRobotsLoader, pacerFromEnv, resolveDeps, robotsGate, userAgentOf, type PortalDeps } from "../shared/portal";
import { robotsPath } from "../shared/robots";
import { advanceCursor, planKey, rotate } from "../shared/rotation";
import { RunGuard } from "../shared/run-guard";
import { LINKEDIN_ROBOTS_URL } from "./constants";
import { mapLinkedInJob } from "./map";
import { parseLinkedInDetail, type LinkedInDetail } from "./parse-detail";
import { parseLinkedInListing } from "./parse-listing";
import { linkedInConfigFromEnv, linkedInDetailUrl, linkedInSearchUrl } from "./plan";

const ACCEPT_HTML = "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8";

/**
 * LinkedIn public guest job listings. DISABLED unless ENABLE_LINKEDIN=1.
 * Every run: honour an active backoff (zero requests) → robots.txt gate → rotated slice of the keyword plan →
 * guest search fragments → capped detail fetches for unknown ids → RawJobs. Blocks end the run gracefully.
 */
export function createLinkedInScraper(partialDeps: Partial<PortalDeps> = {}): Scraper {
  const deps = resolveDeps(partialDeps);
  let pacer: Pacer | null = null;
  let running = false;

  async function* scrape(ctx: ScrapeContext): AsyncGenerator<RawJob> {
    if (running) {
      ctx.log.warn("linkedin: a run is already in progress in this process — skipping this one");
      return;
    }
    running = true;
    const cfg = linkedInConfigFromEnv(ctx.env);
    pacer ??= pacerFromEnv(ctx.env, deps);
    let guard: RunGuard | null = null;
    let emitted = 0;
    let covered = 0;
    let cursor = 0;
    const key = planKey(cfg.plan.map((q) => q.key));
    const queries: typeof cfg.plan = [];
    try {
      guard = await RunGuard.open({
        portal: "linkedin",
        store: deps.stateStore("linkedin", ctx.env),
        clock: deps.clock,
        random: deps.random,
        pacer,
        log: ctx.log,
        policy: backoffPolicyFromEnv(ctx.env),
        maxRequests: cfg.maxRequests,
        signal: ctx.signal,
      });
      const state = guard.snapshot;
      cursor = state.planKey === key ? state.rotationCursor : 0;
      queries.push(...rotate(cfg.plan, cursor, cfg.queriesPerRun));

      const skip = guard.activeBackoff();
      if (skip) {
        ctx.log.info(skip);
        guard.skip(skip);
        return;
      }
      const probeUrls = [queries[0] ? linkedInSearchUrl(queries[0], cfg, 0) : linkedInSearchUrl(cfg.plan[0]!, cfg, 0), linkedInDetailUrl("0")];
      // Our own strict robots.txt gate first; every later request is also robots-checked by the contract client.
      const robots = await robotsGate(ctx, guard, LINKEDIN_ROBOTS_URL, userAgentOf(ctx.env), probeUrls.map(robotsPath), httpRobotsLoader(ctx, LINKEDIN_ROBOTS_URL));
      if (robots === null) return;

      const now = (): Date => new Date(deps.clock.now());
      const limit = ctx.limit ?? Number.POSITIVE_INFINITY;
      const seen = new Set<string>();
      let detailsLeft = cfg.maxDetails;

      queryLoop: for (const [qi, q] of queries.entries()) {
        let start = 0;
        // Consumed once it got any non-block answer; a block or the cap leaves it for the next run.
        let answered = false;
        for (let page = 0; page < cfg.pagesPerQuery; page++) {
          const listingStillPlanned = (queries.length - qi - 1) * cfg.pagesPerQuery + (cfg.pagesPerQuery - page - 1);
          const url = linkedInSearchUrl(q, cfg, start);
          const res = await guardedFetch(ctx, guard, deps.clock, url, "listing", ACCEPT_HTML);
          if (res.kind === "stop") break queryLoop;
          answered = true;
          if (res.kind !== "ok") break;
          const cards = parseLinkedInListing(res.body, now());
          if (cards.length === 0) {
            // An empty 200 is LinkedIn's "no more results"; non-empty markup without cards means the layout changed.
            if (res.body.trim().length > 0 && !/<li[\s>]/i.test(res.body)) guard.noteError(`unrecognised listing markup at ${url}`);
            break;
          }
          guard.noteOk();
          for (const card of cards) {
            if (seen.has(card.id)) continue;
            seen.add(card.id);
            let detail: LinkedInDetail | null = null;
            const known = ctx.isKnown?.(card.id, null) ?? false;
            if (!known && detailsLeft > 0 && guard.remaining > listingStillPlanned) {
              detailsLeft--;
              const d = await guardedFetch(ctx, guard, deps.clock, linkedInDetailUrl(card.id), "detail", ACCEPT_HTML);
              if (d.kind === "ok") {
                detail = parseLinkedInDetail(d.body, now());
                guard.noteOk();
              }
            }
            if (detail?.closed) {
              ctx.log.debug(`linkedin: ${card.id} is no longer accepting applications — skipped`);
              continue;
            }
            yield mapLinkedInJob(card, detail, q);
            if (++emitted >= limit) break queryLoop;
          }
          const since = ctx.since?.getTime();
          if (since !== undefined && cards.every((c) => c.postedAt !== null && Date.parse(c.postedAt) < since)) break;
          if (guard.stopped) break queryLoop;
          start += cards.length;
        }
        if (answered) covered++;
        if (guard.stopped) break;
      }
    } catch (e) {
      if (ctx.signal.aborted) guard?.aborted("aborted by the caller");
      throw e;
    } finally {
      try {
        await guard?.finish({
          emitted,
          queries: queries.map((q) => q.key),
          rotationCursor: advanceCursor(cursor, covered, cfg.plan.length),
          planKey: key,
        });
      } finally {
        running = false;
      }
    }
  }

  return {
    id: "linkedin",
    name: "LinkedIn",
    kind: "job_board",
    intervalMinutes: 60,
    attribution: "Job listings from LinkedIn (public guest pages)",
    isEnabled: (env) => envFlag(env, "ENABLE_LINKEDIN"),
    scrape,
  };
}

export const linkedinScraper: Scraper = createLinkedInScraper();
