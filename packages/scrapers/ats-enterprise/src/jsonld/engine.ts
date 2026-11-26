import type { RawJob } from "@easyjobs/contract";
import { RobotsDisallowedError } from "@easyjobs/contract/node";
import { isPast } from "../lib/dates";
import { describeError, isBlocked, isGone, isThrottled, type SourceHttp } from "../lib/http";
import { canonicalPageUrl, jobIdFromUrl } from "../lib/joburl";
import { NOT_JOB_TTL_MS, PageIndex } from "../lib/page-index";
import { IncompleteRunError, type TargetContext } from "../lib/run";
import type { SitemapEntry } from "../lib/sitemap";
import type { Discovery } from "./discover";
import { indexEntryFor, lightFromIndex, pageToRawJob, parseJobPage } from "./page";

export interface CrawlConfig {
  /** RawJob.source of emitted jobs ("jsonld", "successfactors", …). */
  source: string;
  /** Page fetches per run (JSONLD_MAX_PAGES etc.). */
  maxPages: number;
}

const ts = (s: string | null): number => {
  const n = s ? Date.parse(s) : Number.NaN;
  return Number.isFinite(n) ? n : 0;
};

/** Newest first by lastmod; undated entries keep their sitemap order after dated ones. */
export function orderByLastmod(urls: readonly SitemapEntry[]): SitemapEntry[] {
  return urls.map((u, i) => ({ u, i })).sort((a, b) => ts(b.u.lastmod) - ts(a.u.lastmod) || a.i - b.i).map((x) => x.u);
}

/**
 * Fetch job pages and emit RawJobs from their JSON-LD / microdata.
 * - known + remembered in the page index → light record, no request (keeps the job "seen")
 * - a sitemap lastmod newer than our fetch → refetch
 * - at most `maxPages` fetches per run; unknown overflow is simply picked up next run, but a known
 *   job we could neither fetch nor recall makes the run incomplete (no sweep)
 * - anti-bot challenge / throttling stops the crawl (no bypass)
 */
export async function* crawlJobPages(tctx: TargetContext, http: SourceHttp, discovery: Discovery, cfg: CrawlConfig): AsyncGenerator<RawJob> {
  const { target, stats, log } = tctx;
  const now = tctx.now;
  const index = PageIndex.forTarget(tctx.env, cfg.source, target.slug);
  const urls = orderByLastmod(discovery.urls);
  stats.listed += urls.length;
  let fetched = 0;
  let unrecalledKnown = 0;
  let stoppedBy: unknown = null;
  const listedKeys = new Set<string>();
  try {
    for (const entry of urls) {
      const key = canonicalPageUrl(entry.loc);
      listedKeys.add(key);
      const known = tctx.isKnown(jobIdFromUrl(entry.loc));
      const cached = index.get(key);
      const changed = Boolean(cached && entry.lastmod && ts(entry.lastmod) > cached.at);
      if (cached?.nj && !changed && now.getTime() - cached.at < NOT_JOB_TTL_MS) continue;
      if (known && cached && !cached.nj && !changed) {
        const light = lightFromIndex(cfg.source, target, entry.loc, cached);
        if (light) {
          stats.known++;
          yield light;
          continue;
        }
      }
      if (stoppedBy) continue; // no more requests after a challenge/throttle; recalled jobs above still count
      if (fetched >= cfg.maxPages) {
        if (known) unrecalledKnown++;
        else stats.deferred++;
        continue;
      }
      fetched++;
      let html: string;
      try {
        html = (await http.page(entry.loc)).text;
        stats.pages++;
      } catch (e) {
        if (tctx.signal.aborted) throw e;
        if (isGone(e)) {
          stats.gone++;
          continue;
        }
        if (e instanceof RobotsDisallowedError) {
          index.set(key, { at: now.getTime(), nj: true });
          stats.notJobPages++;
          continue;
        }
        if (isBlocked(e) || isThrottled(e)) {
          stoppedBy = e;
          log.warn(`${cfg.source}: stopping crawl — ${describeError(e)}`);
          continue;
        }
        stats.detailErrors++;
        if (known) unrecalledKnown++;
        if (stats.detailErrors <= 3) log.warn(`${cfg.source}: page fetch failed`, { url: entry.loc, error: describeError(e) });
        continue;
      }
      const parsed = parseJobPage(html, entry.loc, now);
      if (!parsed) {
        stats.notJobPages++;
        index.set(key, { at: now.getTime(), nj: true, lm: entry.lastmod });
        continue;
      }
      if (parsed.malformed > 0) stats.invalidItems += parsed.malformed;
      const job = pageToRawJob(cfg.source, target, entry.loc, parsed, entry.lastmod ? { lastmod: entry.lastmod } : {});
      if (isPast(job.validThrough, now)) {
        stats.gone++;
        index.set(key, { ...indexEntryFor(job, entry.lastmod, now), nj: true });
        continue;
      }
      index.set(key, indexEntryFor(job, entry.lastmod, now));
      yield job;
    }
  } finally {
    // Only prune when we saw the whole listing, otherwise we would forget pages we simply did not reach.
    if (discovery.complete && !stoppedBy) index.retainOnly(listedKeys);
    index.save();
  }
  if (stoppedBy) throw new IncompleteRunError(`${cfg.source}: crawl stopped early — ${describeError(stoppedBy)}`, { cause: stoppedBy });
  if (!discovery.complete) throw new IncompleteRunError(`${cfg.source}: job URL discovery was partial (unreadable sitemap or caps)`);
  if (unrecalledKnown > 0) {
    throw new IncompleteRunError(`${cfg.source}: ${unrecalledKnown} known job page(s) neither fetched nor in the page index (raise ${cfg.source.toUpperCase()}_MAX_PAGES) — skipping sweep`);
  }
}
