/**
 * Shared helpers for SAP SuccessFactors Recruiting Marketing (RMK / "jobs2web") career sites in
 * their "SearchResultsUnify" flavour (careers.wipro.com, careers.hcltech.com).
 *
 * On these sites the search page renders no jobs server-side; the browser loads them from
 * POST /services/recruiting/v1/jobs with a page-embedded CSRF token — and robots.txt says
 * `Disallow: /services/`. The robots-compliant path is therefore:
 *   1. GET /sitemap.xml — every open job as /job/<slug>/<postingId>/ (one request, ~1–3 MB)
 *   2. GET the job page (/job/…, allowed) only for ids we don't know yet.
 * Job pages are laid out as `<div class="joblayouttoken …">` blocks (optionally labelled with
 * `joblayouttoken-label`), the description lives in `<span itemprop="description">`, and a
 * closed posting renders `<p class="jobErrMsg">`.
 */
import { cleanInline, decodeEntities, htmlToText, parseSitemap, type SiteContext } from "../lib";

export interface RmkSitemapEntry {
  /** Absolute job page URL as listed in the sitemap. */
  url: string;
  /** Numeric posting id from the URL (stable per posting). */
  id: string;
  /** URL slug, percent- and entity-decoded ("Bengaluru-DEVELOPER-L3-IND-560035"). */
  slug: string;
}

function safeDecodeURIComponent(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/** Sitemap XML → job entries, newest posting ids first (ids grow over time). */
export function parseRmkSitemap(xml: string): RmkSitemapEntry[] {
  const out: RmkSitemapEntry[] = [];
  const seen = new Set<string>();
  for (const { loc } of parseSitemap(xml)) {
    const m = /^(https?:\/\/[^/]+)\/job\/([^/]+)\/(\d+)\/?$/.exec(loc);
    if (!m || seen.has(m[3]!)) continue;
    seen.add(m[3]!);
    out.push({ url: loc, id: m[3]!, slug: decodeEntities(safeDecodeURIComponent(m[2]!)) });
  }
  return out.sort((a, b) => (a.id.length !== b.id.length ? b.id.length - a.id.length : b.id < a.id ? -1 : b.id > a.id ? 1 : 0));
}

export async function fetchRmkSitemap(ctx: SiteContext, origin: string): Promise<RmkSitemapEntry[]> {
  const xml = await ctx.http.text(`${origin}/sitemap.xml`, { headers: { accept: "application/xml,text/xml;q=0.9,*/*;q=0.5" } });
  const entries = parseRmkSitemap(xml);
  if (entries.length === 0) throw new Error(`no job URLs in ${origin}/sitemap.xml (${xml.length} bytes) — layout changed?`);
  return entries;
}

/**
 * "SOLUTION-ARCHITECT-L1(CONTRACT)" → "SOLUTION ARCHITECT L1(CONTRACT)". RMK slugs write "." as
 * "_" ("React_js", "Sr_-Analyst"), so underscores become dots.
 */
export function slugWords(slug: string): string {
  return cleanInline(slug.replace(/_/g, ".").replace(/-+/g, " ").replace(/\s+\./g, "."));
}

/** Inner HTML of the element whose opening tag starts at `openIdx` (balanced on the same tag name). */
export function innerHtmlAt(html: string, openIdx: number): string | null {
  const open = /^<([a-z][a-z0-9]*)\b[^>]*>/i.exec(html.slice(openIdx));
  if (!open) return null;
  const tag = open[1]!.toLowerCase();
  const start = openIdx + open[0].length;
  const re = new RegExp(`<(/?)${tag}\\b[^>]*?(/?)>`, "gi");
  re.lastIndex = start;
  let depth = 1;
  for (let m = re.exec(html); m; m = re.exec(html)) {
    if (m[1] === "/") depth--;
    else if (m[2] !== "/") depth++;
    if (depth === 0) return html.slice(start, m.index);
  }
  return null;
}

export interface RmkToken {
  /** "City:" → "City" (null for unlabelled tokens). */
  label: string | null;
  /** Token body HTML (label removed). */
  html: string;
  /** Plain text of the body. */
  text: string;
}

export interface RmkJobPage {
  /** The posting no longer exists ("You can't view this job…"). */
  closed: boolean;
  title: string | null;
  tokens: RmkToken[];
  /** Labelled tokens by label ("Posting Start Date" → "11/9/26"). */
  fields: Record<string, string>;
  /** Inner HTML of every itemprop="description" element, in page order. */
  descriptions: string[];
  canonicalUrl: string | null;
}

export function parseRmkJobPage(html: string): RmkJobPage {
  const closed = /class="jobErrMsg"/.test(html);
  const titleMatch = /<[a-z0-9]+[^>]*itemprop="title"[^>]*>([\s\S]*?)<\/[a-z0-9]+>/i.exec(html);
  const title = titleMatch ? cleanInline(titleMatch[1]) || null : null;
  const canonicalUrl = /<link rel="canonical" href="([^"]+)"/i.exec(html)?.[1] ?? null;

  const tokens: RmkToken[] = [];
  const fields: Record<string, string> = {};
  const starts = [...html.matchAll(/<div class="joblayouttoken /g)].map((m) => m.index ?? 0);
  for (let i = 0; i < starts.length; i++) {
    const from = starts[i]!;
    let block = html.slice(from, starts[i + 1] ?? from + 60_000);
    const stop = block.search(/<div class="applylink|<script\b|<style\b/);
    if (stop > 0) block = block.slice(0, stop);
    const labelMatch = /<span[^>]*joblayouttoken-label[^>]*>([\s\S]*?)<\/span>/i.exec(block);
    const label = labelMatch ? cleanInline(labelMatch[1]).replace(/\s*:\s*$/, "") || null : null;
    const body = (labelMatch ? block.replace(labelMatch[0], "") : block).replace(/^<div class="joblayouttoken [^>]*>/, "");
    const text = (htmlToText(body) ?? "").trim();
    tokens.push({ label, html: body, text });
    if (label && !(label in fields)) fields[label] = cleanInline(text);
  }

  const descriptions: string[] = [];
  for (const m of html.matchAll(/<[a-z0-9]+[^>]*itemprop="description"[^>]*>/gi)) {
    const inner = innerHtmlAt(html, m.index ?? 0);
    if (inner && (htmlToText(inner) ?? "").length > 0) descriptions.push(inner.trim());
  }
  return { closed: closed || (!title && tokens.length === 0), title, tokens, fields, descriptions, canonicalUrl };
}

/** Moved to src/lib/memo.ts (now used by every detail-fetching site via the factory). */
export { SkipMemo } from "../lib/memo";
