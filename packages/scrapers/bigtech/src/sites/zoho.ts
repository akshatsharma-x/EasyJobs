/**
 * Zoho — careers.zohocorp.com (Zoho Recruit career site, Zoho's own ATS).
 *
 *   GET https://careers.zohocorp.com/jobs/Careers/rss   (robots: Allow /jobs/*)
 *   → RSS 2.0; each <item>: title, link (/jobs/Careers/<id>/<slug>?source=RSS), guid = job id,
 *     pubDate "Fri, 24 Jun 2022 12:00:00 IST", description = "Category: X<br><br>Location: Y<br>…"
 *     followed by the full job description HTML and a "Details" link.
 *
 * One request returns every published opening with its full description, so there is no detail
 * call. The landing page (/jobs/Careers) only embeds a couple of featured roles in a 1.8 MB page,
 * and job pages are ~1.7 MB of JS each — the feed is far lighter. Zoho posts evergreen roles
 * (pubDate can be years old); the hiring locations are named in the body text.
 */
import type { RawJob } from "@easyjobs/contract";
import {
  buildRawJob, cleanInline, defineCareerSite, detectJobType, detectWorkMode, isOpenToIndia, levelFromCategory,
  parseRssItems, postedAtFrom, type CompanyInfo, type RssItem,
} from "../lib";

export const ZOHO: CompanyInfo = {
  slug: "zoho",
  name: "Zoho",
  domain: "zoho.com",
  careersUrl: "https://careers.zohocorp.com/jobs/Careers",
};

export const ZOHO_RSS_URL = "https://careers.zohocorp.com/jobs/Careers/rss";

export interface ZohoItem {
  id: string;
  title: string;
  url: string;
  category: string | null;
  locationLine: string | null;
  cities: string[];
  descriptionHtml: string | null;
  pubDate: string | null;
}

/** "Tamil Nadu Tamil Nadu India" (City State Country, City = State) → "Tamil Nadu, India". */
export function zohoLocation(line: string | null | undefined): string | null {
  const s = cleanInline(line);
  if (!s) return null;
  const dup = /^(.+?) \1 (.+)$/.exec(s);
  return dup ? `${dup[1]}, ${dup[2]}` : s;
}

/** "…requirements for this role in Chennai, Salem, Coimbatore, Tirunelveli, and Madurai." → cities. */
export function zohoCities(text: string): string[] {
  const m = /requirements? for this role in ([^.<]+)/i.exec(text);
  if (!m) return [];
  return (m[1] ?? "")
    .split(/,|\band\b|&/i)
    .map((c) => cleanInline(c))
    .filter((c) => /^[A-Z][A-Za-z .-]{1,40}$/.test(c));
}

/** Drops the feed's header lines and "Details" link, inline styles and font <span>s. */
export function cleanZohoDescription(html: string): string | null {
  const body = html
    .replace(/^[\s\S]*?Location:[^<]*(<br\s*\/?>\s*)*/i, "")
    .replace(/<a\b[^>]*>\s*Details\s*<\/a>\s*$/i, "")
    .replace(/\s(style|class)="[^"]*"/gi, "")
    .replace(/<\/?span\b[^>]*>/gi, "")
    .replace(/(\s*<br\s*\/?>\s*)+$/i, "")
    .trim();
  return body.length > 0 ? body : null;
}

export function parseZohoItem(item: RssItem): ZohoItem | null {
  const url = item.link ? item.link.replace(/\?.*$/, "") : null;
  const id = item.guid ?? (url ? /\/jobs\/Careers\/(\d+)/.exec(url)?.[1] : null) ?? null;
  if (!id || !url || !item.title) return null;
  const desc = item.description ?? "";
  const header = desc.slice(0, 400);
  return {
    id,
    title: cleanInline(item.title),
    url,
    category: cleanInline(/Category:\s*([^<]+)/i.exec(header)?.[1]) || null,
    locationLine: zohoLocation(/Location:\s*([^<]+)/i.exec(header)?.[1]),
    cities: zohoCities(desc),
    descriptionHtml: cleanZohoDescription(desc),
    pubDate: item.pubDate,
  };
}

export function mapZohoItem(item: ZohoItem): RawJob {
  const country = item.locationLine?.split(",").pop()?.trim() || "India";
  const locations = item.cities.length > 0 ? item.cities.map((c) => `${c}, ${country}`) : [item.locationLine];
  const jobType = detectJobType({ title: item.title });
  return buildRawJob(ZOHO, {
    sourceJobId: item.id,
    title: item.title,
    sourceUrl: item.url,
    locations,
    descriptionHtml: item.descriptionHtml,
    postedAt: postedAtFrom(item.pubDate),
    department: item.category,
    jobType,
    experienceLevel: jobType === "internship" ? "intern" : levelFromCategory(item.title),
    workMode: detectWorkMode(item.title, item.locationLine),
    extra: { category: item.category, region: item.locationLine },
  });
}

export const zoho = defineCareerSite<ZohoItem>({
  company: ZOHO,
  name: "Zoho Careers",
  intervalMinutes: 60,
  endpointType: "rss (Zoho Recruit feed)",
  async *list(ctx) {
    const xml = await ctx.http.text(ZOHO_RSS_URL, { headers: { accept: "application/rss+xml, application/xml;q=0.9, */*;q=0.5" } });
    const items = parseRssItems(xml)
      .map(parseZohoItem)
      .filter((i): i is ZohoItem => i !== null);
    ctx.reportTotal(items.length);
    yield* items;
  },
  idOf: (i) => i.id,
  keep: (i) => isOpenToIndia([i.locationLine, ...i.cities], true),
  toRawJob: (i) => mapZohoItem(i),
});
