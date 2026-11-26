/** Post sources: WP REST (preferred), RSS feed, HTML (sitemap + page). All yield newest-first batches of post refs. */
import { HttpError, RobotsDisallowedError, type HttpClient, type Logger } from "@easyjobs/contract/node";
import type { JsonStore } from "../util/store";
import { fetchConditional, type ConditionalEntry } from "../util/conditional";
import { RestUnavailableError, WpRestClient } from "./rest";
import { parseFeed } from "./rss";
import { extractArticle, parseSitemap, type SitemapEntry } from "./html";
import type { SourceStrategy } from "./config";
import type { WpPost, WpPostRef, WpTerm } from "./types";

export interface ListWindow {
  /** "full": everything published after `from`. "incremental": everything modified after `from`. */
  mode: "full" | "incremental";
  from: Date;
}

export interface PostSource {
  kind: SourceStrategy;
  /** Newest-first batches of refs inside the window. */
  list(window: ListWindow): AsyncGenerator<WpPostRef[]>;
  /** Full posts (with content) for refs; missing ones are omitted. */
  fetch(refs: WpPostRef[]): Promise<WpPost[]>;
}

export interface SourceDeps {
  http: HttpClient;
  log: Logger;
  signal?: AbortSignal;
  baseUrl: string;
  feedUrl: string;
  terms: JsonStore<WpTerm>;
  conditional: JsonStore<ConditionalEntry>;
}

/** Errors meaning "this strategy can't be used here" (→ try the next one). */
export function isUnavailable(e: unknown): boolean {
  return (
    e instanceof RestUnavailableError ||
    e instanceof RobotsDisallowedError ||
    (e instanceof HttpError && [401, 403, 404, 405, 410, 451, 501].includes(e.status))
  );
}

/* ───────────── REST ───────────── */

/** WP may interpret `after`/`modified_after` in site-local time; ask generously and filter exactly by *_gmt locally. */
const SERVER_SLACK_MS = 15 * 3_600_000;

export async function openRestSource(d: SourceDeps): Promise<PostSource> {
  const client = new WpRestClient({ http: d.http, baseUrl: d.baseUrl, log: d.log, signal: d.signal, terms: d.terms });
  await client.probe();
  return {
    kind: "rest",
    async *list(w) {
      const query =
        w.mode === "incremental"
          ? { modifiedAfter: new Date(w.from.getTime() - SERVER_SLACK_MS), orderby: "modified" as const }
          : { after: new Date(w.from.getTime() - SERVER_SLACK_MS), orderby: "date" as const };
      for await (const page of client.list(query)) {
        const key = w.mode === "incremental" ? "modifiedGmt" : "dateGmt";
        const inWindow = page.refs.filter((r) => Date.parse(r[key]) >= w.from.getTime());
        if (inWindow.length > 0) yield inWindow;
        if (inWindow.length < page.refs.length) return; // sorted desc → rest is older
      }
    },
    fetch: (refs) => client.fetchPosts(refs.map((r) => r.id)),
  };
}

/* ───────────── RSS ───────────── */

export async function openRssSource(d: SourceDeps): Promise<PostSource> {
  // Probe page 1 (conditional GET keeps repeat polls at a 304).
  const first = await fetchConditional(d.http, d.feedUrl, d.conditional, { signal: d.signal });
  const firstItems = parseFeed(first.body);
  if (firstItems.length === 0 && !first.notModified) throw new RestUnavailableError(`feed has no items: ${d.feedUrl}`);
  const content = new Map<number, string>();
  return {
    kind: "rss",
    async *list(w) {
      for (let page = 1; page <= 20; page++) {
        const url = page === 1 ? d.feedUrl : `${d.feedUrl}${d.feedUrl.includes("?") ? "&" : "?"}paged=${page}`;
        let items;
        try {
          items = page === 1 ? firstItems : parseFeed((await fetchConditional(d.http, url, d.conditional, { signal: d.signal })).body);
        } catch (e) {
          if (e instanceof HttpError && e.status === 404) return; // past the last page
          throw e;
        }
        if (items.length === 0) return;
        for (const it of items) if (it.contentHtml) content.set(it.ref.id, it.contentHtml);
        const inWindow = items.map((i) => i.ref).filter((r) => Date.parse(r.dateGmt) >= w.from.getTime());
        if (inWindow.length > 0) yield inWindow;
        if (inWindow.length < items.length) return;
      }
    },
    async fetch(refs) {
      const out: WpPost[] = [];
      for (const ref of refs) {
        const html = content.get(ref.id);
        if (html) {
          out.push({ ...ref, contentHtml: html });
          continue;
        }
        const page = await fetchPage(d, ref.link, ref);
        if (page) out.push({ ...page, id: ref.id, title: ref.title || page.title, categories: ref.categories.length > 0 ? ref.categories : page.categories });
      }
      return out;
    },
  };
}

async function fetchPage(d: SourceDeps, url: string, ref?: WpPostRef): Promise<WpPost | null> {
  try {
    const html = await d.http.text(url, { signal: d.signal, headers: { accept: "text/html" } });
    return extractArticle(html, url, ref ? { dateGmt: ref.dateGmt, modifiedGmt: ref.modifiedGmt } : undefined);
  } catch (e) {
    if (isUnavailable(e)) {
      d.log.debug(`page unavailable ${url}`, { error: e instanceof Error ? e.message : String(e) });
      return null;
    }
    throw e;
  }
}

/* ───────────── HTML (sitemaps + pages) ───────────── */

const SITEMAP_CANDIDATES = ["/sitemap_index.xml", "/sitemap.xml", "/wp-sitemap.xml"];

export async function openHtmlSource(d: SourceDeps): Promise<PostSource> {
  const origin = d.baseUrl.replace(/\/+$/, "");
  let index: { sitemaps: SitemapEntry[]; urls: SitemapEntry[] } | null = null;
  for (const path of SITEMAP_CANDIDATES) {
    try {
      index = parseSitemap((await fetchConditional(d.http, `${origin}${path}`, d.conditional, { signal: d.signal })).body);
      if (index.sitemaps.length > 0 || index.urls.length > 0) break;
    } catch (e) {
      if (!isUnavailable(e)) throw e;
    }
  }
  if (!index) throw new RestUnavailableError("no sitemap found");
  const postSitemaps = index.sitemaps.filter((s) => /post-sitemap|posts-post|sitemap-posts/i.test(s.loc));
  return {
    kind: "html",
    async *list(w) {
      const entries: SitemapEntry[] = [...index!.urls];
      const maps = (postSitemaps.length > 0 ? postSitemaps : index!.sitemaps).filter((s) => !s.lastmod || Date.parse(s.lastmod) >= w.from.getTime());
      for (const sm of maps.slice(0, 10)) {
        try {
          entries.push(...parseSitemap((await fetchConditional(d.http, sm.loc, d.conditional, { signal: d.signal })).body).urls);
        } catch (e) {
          if (!isUnavailable(e)) throw e;
        }
      }
      const fresh = entries
        .filter((e) => e.lastmod && Date.parse(e.lastmod) >= w.from.getTime())
        .sort((a, b) => Date.parse(b.lastmod!) - Date.parse(a.lastmod!));
      for (let i = 0; i < fresh.length; i += 25) {
        yield fresh.slice(i, i + 25).map((e) => refFromUrl(e));
      }
    },
    async fetch(refs) {
      const out: WpPost[] = [];
      for (const ref of refs) {
        const page = await fetchPage(d, ref.link, ref);
        if (page) out.push(page);
      }
      return out;
    },
  };
}

/** Partial ref from a sitemap URL: category from the first path segment, title from the slug. */
function refFromUrl(e: SitemapEntry): WpPostRef {
  const u = new URL(e.loc);
  const parts = u.pathname.split("/").filter(Boolean);
  const slug = parts[parts.length - 1] ?? "";
  const cat = parts.length > 1 ? parts[0]! : "";
  return {
    id: 0,
    link: e.loc,
    title: slug.replace(/-/g, " "),
    dateGmt: e.lastmod!,
    modifiedGmt: e.lastmod!,
    categories: cat ? [{ id: -1, slug: cat, name: cat }] : [],
    tags: [],
    partial: true,
  };
}

export async function openSource(strategy: SourceStrategy, d: SourceDeps): Promise<PostSource> {
  if (strategy === "rest") return openRestSource(d);
  if (strategy === "rss") return openRssSource(d);
  return openHtmlSource(d);
}
