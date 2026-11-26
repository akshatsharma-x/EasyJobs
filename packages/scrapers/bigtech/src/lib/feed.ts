/**
 * Minimal RSS 2.0 / sitemap readers (no XML dependency). Handles CDATA sections and entities.
 */
import { decodeEntities } from "./html";

export interface RssItem {
  title: string | null;
  link: string | null;
  /** Raw HTML of <description> (CDATA unwrapped, entity-decoded when not CDATA). */
  description: string | null;
  guid: string | null;
  pubDate: string | null;
  categories: string[];
  /** Every simple child element by tag name (first occurrence), for feed-specific fields. */
  fields: Record<string, string>;
}

function unwrap(value: string): string {
  const cdata = /^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/.exec(value);
  return cdata ? (cdata[1] ?? "") : decodeEntities(value);
}

function tagValues(block: string, tag: string): string[] {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "gi");
  return [...block.matchAll(re)].map((m) => unwrap(m[1] ?? "").trim());
}

export function parseRssItems(xml: string): RssItem[] {
  const items: RssItem[] = [];
  for (const m of xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)) {
    const block = m[1] ?? "";
    const fields: Record<string, string> = {};
    for (const f of block.matchAll(/<([a-z][\w:.-]*)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/gi)) {
      const name = (f[1] ?? "").toLowerCase();
      if (!(name in fields)) fields[name] = unwrap(f[2] ?? "").trim();
    }
    const first = (tag: string): string | null => tagValues(block, tag)[0] || null;
    items.push({
      title: first("title"),
      link: first("link"),
      description: first("description"),
      guid: first("guid"),
      pubDate: first("pubDate"),
      categories: tagValues(block, "category").filter(Boolean),
      fields,
    });
  }
  return items;
}

/** <loc> URLs (+ <lastmod>) from a sitemap or sitemap index. */
export function parseSitemap(xml: string): { loc: string; lastmod: string | null }[] {
  const out: { loc: string; lastmod: string | null }[] = [];
  for (const m of xml.matchAll(/<(url|sitemap)\b[^>]*>([\s\S]*?)<\/\1>/gi)) {
    const block = m[2] ?? "";
    const loc = /<loc>([\s\S]*?)<\/loc>/i.exec(block)?.[1];
    if (!loc) continue;
    const lastmod = /<lastmod>([\s\S]*?)<\/lastmod>/i.exec(block)?.[1] ?? null;
    out.push({ loc: unwrap(loc).trim(), lastmod: lastmod ? lastmod.trim() : null });
  }
  return out;
}
