/** HTML strategy helpers: article extraction from a WordPress post page and sitemap parsing (cheerio). */
import * as cheerio from "cheerio";
import { normalizeSpace } from "../util/text";
import { hashString } from "../util/text";
import { parseUrl } from "../util/url";
import type { WpPost, WpTerm } from "./types";

const CONTENT_SELECTORS = [
  ".entry-content", ".post-content", ".td-post-content", ".single-post-content", ".post-entry", ".article-content",
  "[itemprop='articleBody']", ".post-body", "article .content", ".content-inner", "article",
];

function slugFromHref(href: string, segment: string): string {
  const u = parseUrl(href);
  if (!u) return "";
  const parts = u.pathname.split("/").filter(Boolean);
  const i = parts.indexOf(segment);
  return (i >= 0 ? parts[i + 1] : parts[parts.length - 1]) ?? "";
}

function toIso(value: string | undefined): string | null {
  if (!value) return null;
  const t = Date.parse(value);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

/** Stable numeric id for pages whose WP post id can't be found (FNV hash of the URL path). */
export function syntheticPostId(url: string): number {
  return Number.parseInt(hashString(parseUrl(url)?.pathname ?? url), 16);
}

/** Extracts a normalized post from a rendered WordPress single-post page. Returns null if no article content is found. */
export function extractArticle(html: string, url: string, fallback?: { dateGmt?: string; modifiedGmt?: string }): WpPost | null {
  const $ = cheerio.load(html);
  let contentHtml = "";
  for (const sel of CONTENT_SELECTORS) {
    const el = $(sel).first();
    if (el.length > 0 && normalizeSpace(el.text()).length > 200) {
      contentHtml = el.html() ?? "";
      break;
    }
  }
  if (!contentHtml) return null;
  const title = normalizeSpace($("h1.entry-title").first().text() || $("meta[property='og:title']").attr("content") || $("title").text());
  const shortlink = $("link[rel='shortlink']").attr("href") ?? "";
  const bodyClass = $("body").attr("class") ?? "";
  const articleId = $("article[id^='post-']").attr("id") ?? "";
  const idMatch = /[?&]p=(\d+)/.exec(shortlink) ?? /\bpostid-(\d+)\b/.exec(bodyClass) ?? /^post-(\d+)$/.exec(articleId);
  const id = idMatch ? Number(idMatch[1]) : syntheticPostId(url);
  const dateGmt =
    toIso($("meta[property='article:published_time']").attr("content")) ?? toIso($("time.entry-date").attr("datetime")) ?? fallback?.dateGmt ?? null;
  const modifiedGmt = toIso($("meta[property='article:modified_time']").attr("content")) ?? toIso($("time.updated").attr("datetime")) ?? fallback?.modifiedGmt ?? dateGmt;
  if (!dateGmt || !modifiedGmt) return null;
  const terms = (rel: string, segment: string): WpTerm[] =>
    $(`a[rel~='${rel}']`)
      .toArray()
      .map((a, i) => ({ id: -(i + 1), slug: slugFromHref($(a).attr("href") ?? "", segment), name: normalizeSpace($(a).text()) }))
      .filter((t) => t.slug);
  // Themes without rel=category links still put "category-<slug> tag-<slug>" classes on <article> (post_class()).
  const articleClass = $("article[id^='post-']").attr("class") ?? $("article").first().attr("class") ?? "";
  const fromClass = (prefix: string): WpTerm[] =>
    [...articleClass.matchAll(new RegExp(`\\b${prefix}-([a-z0-9-]+)`, "g"))].map((m, i) => ({ id: -(i + 1), slug: m[1]!, name: m[1]!.replace(/-/g, " ") }));
  const categories = terms("category", "category");
  const tags = terms("tag", "tag");
  const canonical = $("link[rel='canonical']").attr("href") ?? url;
  return {
    id,
    link: canonical,
    title,
    dateGmt,
    modifiedGmt,
    categories: categories.length > 0 ? categories : fromClass("category"),
    tags: tags.length > 0 ? tags : fromClass("tag"),
    contentHtml,
  };
}

export interface SitemapEntry {
  loc: string;
  lastmod: string | null;
}

/** Parses a sitemap or sitemap index. */
export function parseSitemap(xml: string): { sitemaps: SitemapEntry[]; urls: SitemapEntry[] } {
  const $ = cheerio.load(xml, { xml: true });
  const read = (sel: string): SitemapEntry[] =>
    $(sel)
      .toArray()
      .map((el) => ({ loc: normalizeSpace($(el).find("loc").first().text()), lastmod: toIso($(el).find("lastmod").first().text() || undefined) }))
      .filter((e) => e.loc);
  return { sitemaps: read("sitemap"), urls: read("url") };
}
