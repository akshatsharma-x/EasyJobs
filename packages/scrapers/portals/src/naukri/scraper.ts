import type { RawJob } from "@easyjobs/contract";
import { isPathAllowed, type Scraper, type ScrapeContext } from "@easyjobs/contract/node";
import { backoffPolicyFromEnv } from "../shared/backoff";
import { detectBlock } from "../shared/block";
import type { Clock } from "../shared/clock";
import { envFlag } from "../shared/env";
import type { Pacer } from "../shared/pacer";
import { pacerFromEnv, resolveDeps, robotsGate, userAgentOf, type PortalDeps } from "../shared/portal";
import { robotsPath } from "../shared/robots";
import { advanceCursor, planKey, rotate } from "../shared/rotation";
import { RunGuard, type RequestKind } from "../shared/run-guard";
import { errorMessage } from "../shared/text";
import { BrowserUnavailableError, createPlaywrightFetcher, type BrowserPage, type FetcherFactory, type NaukriFetcher } from "./browser";
import { mapNaukriJob } from "./map";
import { parseNaukriDetail, type NaukriDetail } from "./parse-detail";
import { isNaukriSearchPayload, parseNaukriSearch } from "./parse-search";
import { NAUKRI_DETAIL_API, NAUKRI_ROBOTS_URL, NAUKRI_SEARCH_API, naukriConfigFromEnv, naukriSearchUrl } from "./plan";

export interface NaukriDeps extends PortalDeps {
  /** Headless browser factory (tests inject a fake). */
  fetcherFactory: FetcherFactory;
}

type PageOutcome = { kind: "ok"; page: BrowserPage & { api: NonNullable<BrowserPage["api"]> } } | { kind: "gone" } | { kind: "error" } | { kind: "stop" };

/**
 * One paced, capped page navigation; checks the document AND the data request the page made for blocks.
 * `waitFor` is the API the page calls for its results (search) or details (job page).
 */
async function openPage(
  ctx: ScrapeContext,
  guard: RunGuard,
  clock: Clock,
  fetcher: NaukriFetcher,
  url: string,
  waitFor: RegExp,
  kind: RequestKind,
): Promise<PageOutcome> {
  if (!(await guard.acquire(kind))) return { kind: "stop" };
  let page: BrowserPage | undefined;
  let failure: unknown;
  try {
    page = await fetcher.open(url, waitFor, ctx.signal);
  } catch (e) {
    failure = e;
  } finally {
    guard.release();
  }
  if (!page) {
    if (ctx.signal.aborted) throw failure ?? ctx.signal.reason;
    guard.noteError(`page load failed for ${url}: ${errorMessage(failure)}`);
    return guard.stopped ? { kind: "stop" } : { kind: "error" };
  }
  const docBlock = page.status !== null ? detectBlock({ status: page.status, url: page.url, body: page.body }, clock.now()) : null;
  if (docBlock) {
    guard.block(docBlock, url);
    return { kind: "stop" };
  }
  if (page.status === 404 || page.status === 410) return { kind: "gone" };
  if (page.status === null || page.status >= 400) {
    guard.noteError(`HTTP ${page.status ?? "no response"} for ${url}`);
    return guard.stopped ? { kind: "stop" } : { kind: "error" };
  }
  const api = page.api;
  if (!api) {
    guard.noteError(`the page loaded but made no ${waitFor.source} request within the wait window (${url}) — layout change or silent bot check`);
    return guard.stopped ? { kind: "stop" } : { kind: "error" };
  }
  const apiBlock = detectBlock({ status: api.status, url: api.url, body: api.text }, clock.now());
  if (apiBlock) {
    guard.block(apiBlock, api.url);
    return { kind: "stop" };
  }
  if (api.status >= 400) {
    guard.noteError(`the page's data request returned HTTP ${api.status} (${api.url})`);
    return guard.stopped ? { kind: "stop" } : { kind: "error" };
  }
  return { kind: "ok", page: { ...page, api } };
}

/**
 * Naukri public search pages, read through vanilla headless Chromium (the site's own scripts make the data request,
 * so no anti-bot token is ever forged by us). DISABLED unless ENABLE_NAUKRI=1 — and, as of 2026-11-26, blocked:
 * Naukri's Akamai edge answers 403 "Access Denied" to plain HTTP and to headless Chromium (see README#evidence).
 * When blocked the run backs off for hours and ends gracefully; the browser isn't even launched during a backoff.
 */
export function createNaukriScraper(partialDeps: Partial<NaukriDeps> = {}): Scraper {
  const deps = resolveDeps(partialDeps);
  const fetcherFactory = partialDeps.fetcherFactory ?? createPlaywrightFetcher;
  let pacer: Pacer | null = null;
  let running = false;

  async function* scrape(ctx: ScrapeContext): AsyncGenerator<RawJob> {
    if (running) {
      ctx.log.warn("naukri: a run is already in progress in this process — skipping this one");
      return;
    }
    running = true;
    const cfg = naukriConfigFromEnv(ctx.env);
    pacer ??= pacerFromEnv(ctx.env, deps);
    let guard: RunGuard | null = null;
    let fetcher: NaukriFetcher | null = null;
    let emitted = 0;
    let covered = 0;
    let cursor = 0;
    const key = planKey(cfg.plan.map((q) => q.key));
    const queries: typeof cfg.plan = [];
    try {
      guard = await RunGuard.open({
        portal: "naukri",
        store: deps.stateStore("naukri", ctx.env),
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
      try {
        fetcher = await fetcherFactory({
          botUserAgent: userAgentOf(ctx.env),
          navigationTimeoutMs: cfg.navigationTimeoutMs,
          apiWaitMs: cfg.apiWaitMs,
          log: ctx.log,
        });
      } catch (e) {
        if (e instanceof BrowserUnavailableError) {
          guard.unavailable("headless-chromium", e.message);
          return;
        }
        throw e;
      }
      const browser = fetcher;
      const firstSearch = naukriSearchUrl(queries[0] ?? cfg.plan[0]!, 1);
      const rules = await robotsGate(ctx, guard, NAUKRI_ROBOTS_URL, browser.userAgent, [robotsPath(firstSearch)], async () => {
        const page = await browser.open(NAUKRI_ROBOTS_URL, null, ctx.signal);
        if (page.status === null) throw new Error("robots.txt navigation produced no response");
        return { status: page.status, url: page.url, body: page.body };
      });
      if (rules === null) return;

      const now = (): Date => new Date(deps.clock.now());
      const limit = ctx.limit ?? Number.POSITIVE_INFINITY;
      const seen = new Set<string>();
      let detailsLeft = cfg.maxDetails;

      queryLoop: for (const [qi, q] of queries.entries()) {
        // Consumed once it got any non-block answer; a block or the cap leaves it for the next run.
        let answered = false;
        for (let page = 1; page <= cfg.pagesPerQuery; page++) {
          const listingStillPlanned = (queries.length - qi - 1) * cfg.pagesPerQuery + (cfg.pagesPerQuery - page);
          const url = naukriSearchUrl(q, page);
          if (!isPathAllowed(rules, robotsPath(url))) {
            ctx.log.info(`naukri: robots.txt disallows ${robotsPath(url)} — skipping`);
            answered = true;
            break;
          }
          const res = await openPage(ctx, guard, deps.clock, browser, url, NAUKRI_SEARCH_API, "listing");
          if (res.kind === "stop") break queryLoop;
          answered = true;
          if (res.kind !== "ok") break;
          if (!isNaukriSearchPayload(res.page.api.json)) {
            guard.noteError(`search data request returned an unexpected payload (${res.page.api.url})`);
            break;
          }
          const { listings } = parseNaukriSearch(res.page.api.json, now());
          if (listings.length === 0) break;
          guard.noteOk();
          for (const listing of listings) {
            if (seen.has(listing.jobId)) continue;
            seen.add(listing.jobId);
            let detail: NaukriDetail | null = null;
            const known = ctx.isKnown?.(listing.jobId, null) ?? false;
            if (!known && detailsLeft > 0 && guard.remaining > listingStillPlanned && isPathAllowed(rules, robotsPath(listing.jdUrl))) {
              detailsLeft--;
              const d = await openPage(ctx, guard, deps.clock, browser, listing.jdUrl, NAUKRI_DETAIL_API, "detail");
              if (d.kind === "ok") {
                detail = parseNaukriDetail(d.page.api.json);
                if (detail) guard.noteOk();
              }
            }
            yield mapNaukriJob(listing, detail, q);
            if (++emitted >= limit) break queryLoop;
          }
          const since = ctx.since?.getTime();
          if (since !== undefined && listings.every((l) => l.postedAt !== null && Date.parse(l.postedAt) < since)) break;
          if (guard.stopped) break queryLoop;
        }
        if (answered) covered++;
        if (guard.stopped) break;
      }
    } catch (e) {
      if (ctx.signal.aborted) guard?.aborted("aborted by the caller");
      throw e;
    } finally {
      try {
        await fetcher?.close();
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
    id: "naukri",
    name: "Naukri",
    kind: "job_board",
    intervalMinutes: 60,
    attribution: "Job listings from Naukri.com (public search pages)",
    isEnabled: (env) => envFlag(env, "ENABLE_NAUKRI"),
    scrape,
  };
}

export const naukriScraper: Scraper = createNaukriScraper();
