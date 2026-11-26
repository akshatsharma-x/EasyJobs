import { decodeEntities } from "./html";

export interface SitemapEntry {
  loc: string;
  lastmod: string | null;
}

export interface ParsedSitemap {
  kind: "index" | "urlset" | "text" | "unknown";
  entries: SitemapEntry[];
}

const unwrap = (s: string): string =>
  decodeEntities(s.replace(/^\s*<!\[CDATA\[/, "").replace(/\]\]>\s*$/, "").trim());

/**
 * Parse a sitemap index, urlset, or plain-text sitemap. Tolerates namespaces/prefixes (`<ns:loc>`),
 * CDATA and XML entities (`&amp;` in RMK sitemaps).
 */
export function parseSitemap(body: string): ParsedSitemap {
  const isIndex = /<(?:[a-z0-9]+:)?sitemapindex\b/i.test(body);
  const isUrlset = /<(?:[a-z0-9]+:)?urlset\b/i.test(body);
  if (isIndex || isUrlset) {
    const block = isIndex ? "sitemap" : "url";
    const re = new RegExp(`<(?:[a-z0-9]+:)?${block}\\b[^>]*>([\\s\\S]*?)</(?:[a-z0-9]+:)?${block}>`, "gi");
    const entries: SitemapEntry[] = [];
    for (const m of body.matchAll(re)) {
      const inner = m[1] ?? "";
      const loc = /<(?:[a-z0-9]+:)?loc\b[^>]*>([\s\S]*?)<\/(?:[a-z0-9]+:)?loc>/i.exec(inner)?.[1];
      if (!loc) continue;
      const lastmod = /<(?:[a-z0-9]+:)?lastmod\b[^>]*>([\s\S]*?)<\/(?:[a-z0-9]+:)?lastmod>/i.exec(inner)?.[1];
      const url = unwrap(loc);
      if (/^https?:\/\//i.test(url)) entries.push({ loc: url, lastmod: lastmod ? unwrap(lastmod) : null });
    }
    return { kind: isIndex ? "index" : "urlset", entries };
  }
  if (!/^\s*</.test(body)) {
    const entries = body
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => /^https?:\/\/\S+$/i.test(l))
      .map((loc) => ({ loc, lastmod: null }));
    if (entries.length > 0) return { kind: "text", entries };
  }
  return { kind: "unknown", entries: [] };
}

/** `Sitemap:` lines from robots.txt. */
export function sitemapsFromRobots(robotsTxt: string): string[] {
  const out: string[] = [];
  for (const line of robotsTxt.split(/\r?\n/)) {
    const m = /^\s*sitemap\s*:\s*(\S+)/i.exec(line);
    if (m?.[1] && /^https?:\/\//i.test(m[1])) out.push(m[1]);
  }
  return [...new Set(out)];
}

/** Heuristic: does this URL look like a sitemap? */
export const isSitemapUrl = (url: string): boolean => /sitemap|\.xml(?:\.gz)?(?:$|\?)/i.test(url);
