import type { RawJob } from "@easyjobs/contract";
import { RobotsDisallowedError, type ScrapeContext } from "@easyjobs/contract/node";
import type { ResolvedOptions } from "./config";
import { BlockedError, type PageFetcher } from "./fetch";
import { pageUrl, type FeedSpec } from "./feeds";
import { toRawJob } from "./map";
import { parseDetailPage } from "./parse/detail";
import { DETAIL_PATH_RE, parseListingPage } from "./parse/listing";
import type { DetailPage, InternshalaKind, ListingCard, ListingPage } from "./types";

export interface FeedStats {
  pages: number;
  cards: number;
  emitted: number;
  /** Cards of the other kind (an internship on a jobs feed or vice versa) — skipped. */
  wrongKind: number;
  stop: string;
}

export interface CrawlStats {
  feeds: Record<string, FeedStats>;
  emitted: number;
  details: number;
  detailErrors: number;
  /** Unknown jobs emitted from their card because the detail cap was reached or details were blocked. */
  overCap: number;
  /** Jobs whose detail page said they are no longer active (not emitted). */
  closed: number;
  refreshPages: number;
  listingErrors: number;
}

export interface CrawlConfig extends Pick<ResolvedOptions, "maxPages" | "maxDetails" | "refreshPages" | "stopAfterKnownPages" | "feeds" | "origin" | "now"> {
  source: string;
  kind: InternshalaKind;
  intervalMinutes: number;
}

const errMsg = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/** Stop signal shared by every feed of a run (blocked by the site, limit reached). */
class StopRun extends Error {}

/**
 * Crawl the configured feeds newest-first and yield one RawJob per new card id.
 *
 * Per feed: pages 1, 2, … until (a) a page made entirely of known ids — known to the store
 * (`ctx.isKnown`) or already emitted in this run — (b) the last page, (c) `maxPages`, or (d) an error.
 * Then, for `refresh` feeds in incremental mode, a few rotating deeper pages are revisited.
 * Detail pages are fetched only for unknown ids, at most `maxDetails` per run.
 */
export async function* crawlInternshala(
  ctx: ScrapeContext,
  cfg: CrawlConfig,
  fetchPage: PageFetcher,
  stats: CrawlStats = newStats(),
): AsyncGenerator<RawJob> {
  const log = ctx.log;
  const limit = ctx.limit ?? Number.POSITIVE_INFINITY;
  /** Ids handled in this run (emitted, or skipped as closed) — they count as known for the stop rule. */
  const emitted = new Set<string>();
  let count = 0;
  const isKnown = (id: string): boolean => ctx.isKnown?.(id, null) ?? false;
  let detailsLeft = cfg.maxDetails;
  let detailsBlocked = false;
  let anyListingOk = false;

  async function fetchListing(feed: FeedSpec, page: number): Promise<ListingPage | null> {
    const url = pageUrl(cfg.origin, feed, page);
    try {
      const res = await fetchPage(url, ctx.signal);
      anyListingOk = true;
      return parseListingPage(res.html);
    } catch (e) {
      if (ctx.signal.aborted) throw e;
      stats.listingErrors++;
      if (e instanceof BlockedError) {
        log.error(`${cfg.source}: blocked on listing — stopping the run`, { url, status: e.status });
        if (!anyListingOk) throw e;
        throw new StopRun(e.message);
      }
      if (e instanceof RobotsDisallowedError) {
        log.warn(`${cfg.source}: robots.txt disallows ${url} — skipping feed "${feed.id}"`);
        return null;
      }
      // The very first listing request failing means the source is down: let the worker record an error.
      if (!anyListingOk && emitted.size === 0) throw e;
      log.warn(`${cfg.source}: listing page failed — skipping rest of feed "${feed.id}"`, { url, error: errMsg(e) });
      return null;
    }
  }

  async function fetchDetail(card: ListingCard): Promise<DetailPage | null | "closed"> {
    stats.details++;
    try {
      const res = await fetchPage(card.url, ctx.signal);
      const detail = parseDetailPage(res.html);
      if (!detail) {
        stats.detailErrors++;
        log.debug(`${cfg.source}: no detail markup`, { id: card.id, url: card.url });
        return null;
      }
      if (detail.id && detail.id !== card.id) {
        stats.detailErrors++;
        log.warn(`${cfg.source}: detail id mismatch — using card only`, { card: card.id, detail: detail.id, url: res.url });
        return null;
      }
      if (detail.status && detail.status !== "active") return "closed";
      return detail;
    } catch (e) {
      if (ctx.signal.aborted) throw e;
      stats.detailErrors++;
      if (e instanceof BlockedError) {
        detailsBlocked = true;
        log.warn(`${cfg.source}: detail pages blocked (HTTP ${e.status}) — emitting cards only for the rest of this run`);
      } else {
        log.warn(`${cfg.source}: detail failed — using card only`, { id: card.id, url: card.url, error: errMsg(e) });
      }
      return null;
    }
  }

  /**
   * Emit every not-yet-emitted card of a page.
   * Returns whether every card of our kind was already known/emitted, and how many cards were of our kind.
   */
  async function* processPage(feed: FeedSpec, page: ListingPage, fs: FeedStats): AsyncGenerator<RawJob, { allKnown: boolean; ownKind: number }> {
    let allKnown = true;
    let ownKind = 0;
    for (const card of page.cards) {
      if (card.kind !== cfg.kind) {
        fs.wrongKind++;
        continue;
      }
      ownKind++;
      fs.cards++;
      if (emitted.has(card.id)) continue;
      const known = isKnown(card.id);
      if (!known) allKnown = false;
      let detail: DetailPage | null = null;
      if (!known && DETAIL_PATH_RE.test(card.path)) {
        if (detailsLeft > 0 && !detailsBlocked) {
          detailsLeft--;
          const d = await fetchDetail(card);
          if (d === "closed") {
            stats.closed++;
            emitted.add(card.id);
            continue;
          }
          detail = d;
        } else {
          stats.overCap++;
        }
      }
      const job = toRawJob(card, detail, { source: cfg.source, now: cfg.now(), feed: feed.id, feedTags: feed.tags, known });
      emitted.add(card.id);
      fs.emitted++;
      stats.emitted++;
      yield job;
      if (++count >= limit) {
        fs.stop = "limit";
        throw new StopRun("limit reached");
      }
    }
    return { allKnown, ownKind };
  }

  try {
    for (const feed of cfg.feeds) {
      const fs: FeedStats = { pages: 0, cards: 0, emitted: 0, wrongKind: 0, stop: "running" };
      stats.feeds[feed.id] = fs;
      const crawled = new Set<number>();
      let lastPage: number | null = null;
      let knownStreak = 0;
      let page = 1;
      try {
        for (; page <= cfg.maxPages; page++) {
          const listing = await fetchListing(feed, page);
          if (!listing) {
            fs.stop = "error";
            break;
          }
          fs.pages++;
          crawled.add(page);
          if (listing.page !== null && listing.page !== page) {
            fs.stop = `server returned page ${listing.page}`;
            break;
          }
          if (listing.cards.length === 0) {
            fs.stop = "empty page";
            break;
          }
          lastPage = listing.lastPage ?? lastPage;
          const { allKnown, ownKind } = yield* processPage(feed, listing, fs);
          // Job listings mix in internships-with-job-offer cards (and /jobs-for-women/ lists only those).
          // A first page without a single card of our kind means the feed is the wrong kind; deeper such pages
          // say nothing about the pages behind them, so they neither extend nor reset the known streak.
          if (ownKind === 0 && page === 1) {
            fs.stop = `wrong kind: ${listing.cards.length} cards are not ${cfg.kind}s`;
            log.warn(`${cfg.source}: feed "${feed.id}" (${feed.path}) lists no ${cfg.kind}s — skipping it`, { cards: listing.cards.length });
            break;
          }
          if (listing.isLastPage) {
            fs.stop = "last page";
            break;
          }
          if (ownKind > 0) {
            knownStreak = allKnown ? knownStreak + 1 : 0;
            if (knownStreak >= cfg.stopAfterKnownPages) {
              fs.stop = "all known";
              break;
            }
          }
        }
        if (fs.stop === "running") fs.stop = "max-pages";
        // Incremental runs only: revisit a rotating window of deeper pages so postings that stay open for
        // weeks are still seen (job-board jobs close after 21 days unseen).
        if (feed.refresh && ctx.isKnown && cfg.refreshPages > 0 && lastPage !== null) {
          const first = Math.max(...crawled, 0) + 1;
          const span = lastPage - first + 1;
          if (span > 0) {
            const slot = Math.floor(cfg.now().getTime() / (cfg.intervalMinutes * 60_000));
            const todo = new Set<number>();
            for (let j = 0; j < Math.min(cfg.refreshPages, span); j++) todo.add(first + ((slot * cfg.refreshPages + j) % span));
            for (const p of todo) {
              const listing = await fetchListing(feed, p);
              if (!listing || listing.page !== p) break;
              stats.refreshPages++;
              fs.pages++;
              yield* processPage(feed, listing, fs);
            }
          }
        }
      } finally {
        log.debug(`${cfg.source}: feed "${feed.id}" done`, { ...fs });
      }
    }
  } catch (e) {
    if (!(e instanceof StopRun)) throw e;
  } finally {
    log.info(`${cfg.source}: crawl finished`, {
      emitted: stats.emitted,
      details: stats.details,
      detailErrors: stats.detailErrors,
      overCap: stats.overCap,
      closed: stats.closed,
      refreshPages: stats.refreshPages,
      feeds: Object.fromEntries(
        Object.entries(stats.feeds).map(([k, v]) => [
          k,
          `${v.pages} page${v.pages === 1 ? "" : "s"}, ${v.emitted} emitted${v.wrongKind ? `, ${v.wrongKind} wrong kind` : ""}, ` +
            // "running" here means the consumer stopped iterating (e.g. the CLI reached --limit) mid-feed.
            `stop: ${v.stop === "running" ? "consumer stopped (limit)" : v.stop}`,
        ]),
      ),
    });
  }
}

export function newStats(): CrawlStats {
  return { feeds: {}, emitted: 0, details: 0, detailErrors: 0, overCap: 0, closed: 0, refreshPages: 0, listingErrors: 0 };
}
