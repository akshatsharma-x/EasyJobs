import type { Logger } from "@easyjobs/contract/node";
import { attr, extractLinks } from "../lib/html";
import { describeError, isGone, type SourceHttp } from "../lib/http";
import { canonicalPageUrl, isLikelyJobUrl } from "../lib/joburl";
import { isSitemapUrl, parseSitemap, sitemapsFromRobots, type SitemapEntry } from "../lib/sitemap";

export interface DiscoveryOptions {
  include?: RegExp;
  exclude?: RegExp;
  /** Extra hosts whose URLs count as this site's job pages. */
  hosts?: string[];
  maxSitemaps: number;
  maxListingPages: number;
  log: Logger;
}

export interface Discovery {
  urls: SitemapEntry[];
  via: "sitemap" | "listing" | "none";
  /** false when some sitemap/listing page could not be read or caps cut the crawl short. */
  complete: boolean;
  sitemapsRead: number;
}

const JOBISH_SITEMAP = /job|career|position|posting|vacanc|requisition|opening|offre|stellen|empleo/i;
const NON_JOB_SITEMAP = /image|video|news|blog|press|article|post-sitemap|page-sitemap|category|tag|author|event|location|team|product|static|landing/i;

function hostOk(url: string, hosts: Set<string>): boolean {
  try {
    return hosts.has(new URL(url).hostname.toLowerCase().replace(/^www\./, ""));
  } catch {
    return false;
  }
}

/** Child sitemaps: job-ish first; obvious non-job sitemaps only if nothing else exists. */
export function orderChildSitemaps(entries: readonly SitemapEntry[]): SitemapEntry[] {
  // Classify by path + query only: hosts like "jobs.acme.com" would make every sitemap look job-ish.
  const where = (loc: string): string => {
    try {
      const u = new URL(loc);
      return `${u.pathname}${u.search}`;
    } catch {
      return loc;
    }
  };
  const isJobish = (e: SitemapEntry): boolean => JOBISH_SITEMAP.test(where(e.loc));
  const isNonJob = (e: SitemapEntry): boolean => NON_JOB_SITEMAP.test(where(e.loc));
  const jobish = entries.filter(isJobish);
  const neutral = entries.filter((e) => !isJobish(e) && !isNonJob(e));
  const rest = entries.filter((e) => !isJobish(e) && isNonJob(e));
  return jobish.length > 0 ? [...jobish, ...neutral] : neutral.length > 0 ? neutral : rest;
}

async function crawlSitemaps(http: SourceHttp, seeds: string[], hosts: Set<string>, opts: DiscoveryOptions, guesses: ReadonlySet<string> = new Set()): Promise<Discovery> {
  const queue = [...seeds];
  const visited = new Set<string>();
  const found = new Map<string, SitemapEntry>();
  let complete = true;
  let read = 0;
  while (queue.length > 0) {
    const sm = queue.shift() as string;
    if (visited.has(sm)) continue;
    if (visited.size >= opts.maxSitemaps) {
      complete = false;
      opts.log.warn(`jsonld: sitemap cap (${opts.maxSitemaps}) reached — ${queue.length + 1} sitemap(s) not read`);
      break;
    }
    visited.add(sm);
    let body: string;
    try {
      body = await http.text(sm);
    } catch (e) {
      if (!isGone(e)) {
        // A guessed location (/sitemap.xml) that fails is fine; a listed sitemap that fails makes the crawl partial.
        if (!guesses.has(sm)) complete = false;
        opts.log.debug(`jsonld: sitemap unreadable ${sm}`, { error: describeError(e) });
      }
      continue;
    }
    read++;
    const parsed = parseSitemap(body);
    if (parsed.kind === "index") {
      for (const child of orderChildSitemaps(parsed.entries)) if (!visited.has(child.loc)) queue.push(child.loc);
      continue;
    }
    for (const e of parsed.entries) {
      if (!hostOk(e.loc, hosts) || !isLikelyJobUrl(e.loc, opts.include, opts.exclude)) continue;
      const key = canonicalPageUrl(e.loc);
      if (!found.has(key)) found.set(key, { loc: e.loc, lastmod: e.lastmod });
    }
  }
  return { urls: [...found.values()], via: found.size > 0 ? "sitemap" : "none", complete, sitemapsRead: read };
}

/** Listing pages: job links + "next" pagination (rel=next, ?page=, "Next"), up to maxListingPages. */
async function crawlListing(http: SourceHttp, start: string, hosts: Set<string>, opts: DiscoveryOptions): Promise<Discovery> {
  const found = new Map<string, SitemapEntry>();
  const visited = new Set<string>();
  let next: string | null = start;
  let complete = true;
  while (next) {
    if (visited.size >= opts.maxListingPages) {
      complete = false;
      break;
    }
    const pageUrl: string = next;
    visited.add(pageUrl);
    next = null;
    let html: string;
    try {
      html = await http.text(pageUrl);
    } catch (e) {
      complete = false;
      opts.log.warn(`jsonld: listing page unreadable ${pageUrl}`, { error: describeError(e) });
      break;
    }
    const links = extractLinks(html, pageUrl);
    for (const l of links) {
      if (!hostOk(l.url, hosts) || !isLikelyJobUrl(l.url, opts.include, opts.exclude)) continue;
      const key = canonicalPageUrl(l.url);
      if (!found.has(key)) found.set(key, { loc: l.url, lastmod: null });
    }
    const relNext = /<(?:a|link)\b[^>]*\brel\s*=\s*["']?next["']?[^>]*>/i.exec(html)?.[0];
    const relHref = relNext ? attr(relNext, "href") : null;
    const textNext = links.find((l) => /^(?:next|next page|›|»|>)$/i.test(l.text) && hostOk(l.url, hosts))?.url;
    const candidate = relHref ? new URL(relHref, pageUrl).toString() : textNext;
    if (candidate && !visited.has(candidate)) next = candidate;
  }
  return { urls: [...found.values()], via: found.size > 0 ? "listing" : "none", complete, sitemapsRead: 0 };
}

/**
 * Token = sitemap URL → crawl it. Token = careers URL → robots.txt sitemaps, then /sitemap.xml and
 * /sitemap_index.xml (site root and token path), then the listing page itself.
 */
export async function discoverJobUrls(http: SourceHttp, token: string, opts: DiscoveryOptions): Promise<Discovery> {
  const tokenUrl = new URL(token);
  const hosts = new Set([tokenUrl.hostname.toLowerCase().replace(/^www\./, ""), ...(opts.hosts ?? []).map((h) => h.toLowerCase().replace(/^www\./, ""))]);
  if (isSitemapUrl(token) && /\.xml|sitemap/i.test(tokenUrl.pathname + tokenUrl.search)) {
    return crawlSitemaps(http, [token], hosts, opts);
  }
  const listed: string[] = [];
  try {
    const robots = await http.text(`${tokenUrl.origin}/robots.txt`, { robots: false });
    for (const sm of sitemapsFromRobots(robots)) {
      listed.push(sm);
      try {
        hosts.add(new URL(sm).hostname.toLowerCase().replace(/^www\./, ""));
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* no robots.txt */
  }
  const path = tokenUrl.pathname.replace(/\/+$/, "");
  const guesses = new Set<string>();
  if (path) guesses.add(`${tokenUrl.origin}${path}/sitemap.xml`);
  if (listed.length === 0) {
    guesses.add(`${tokenUrl.origin}/sitemap.xml`);
    guesses.add(`${tokenUrl.origin}/sitemap_index.xml`);
  }
  // Prefer sitemaps scoped to the token path (e.g. /us/en/sitemap.xml for a Phenom locale).
  const scoped = (u: string): number => Number(Boolean(path) && new URL(u).pathname.startsWith(path));
  const unique = [...new Set([...listed, ...guesses])].sort((a, b) => scoped(b) - scoped(a));
  const fromSitemaps = await crawlSitemaps(http, unique, hosts, opts, guesses);
  if (fromSitemaps.urls.length > 0) return fromSitemaps;
  opts.log.info("jsonld: no job URLs in sitemaps — falling back to the listing page");
  return crawlListing(http, token, hosts, opts);
}
