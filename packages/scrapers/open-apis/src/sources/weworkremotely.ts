import type { RawJob } from "@easyjobs/contract";
import type { ScrapeContext, Scraper } from "@easyjobs/contract/node";
import { XMLParser } from "fast-xml-parser";
import { extractLinks, htmlToPlain, stripInline } from "../lib/html";
import { fetchText } from "../lib/http";
import { companyDomainOf } from "../lib/links";
import { assessRemote, classifyProse, remoteHints } from "../lib/region";
import { jobTypeFrom } from "../lib/taxonomy";
import { cleanList, cleanText, envList, httpUrl, isDisabledByEnv, pause, prune, reachedLimit, textOrNull, toIso } from "../lib/util";

export interface WwrItem {
  title?: string;
  region?: string;
  country?: string;
  state?: string;
  skills?: string;
  category?: string;
  type?: string;
  description?: string;
  pubDate?: string;
  expires_at?: string;
  guid?: string | { "#text"?: string };
  link?: string;
  "media:content"?: { "@_url"?: string };
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  parseTagValue: false,
  trimValues: true,
  isArray: (name) => name === "item",
});

const str = (v: unknown): string => (typeof v === "string" ? v : typeof v === "number" ? String(v) : "");

/** Parses the RSS document into items (empty array for an empty/odd feed). */
export function parseWwrFeed(xml: string): WwrItem[] {
  const doc = parser.parse(xml) as { rss?: { channel?: { item?: WwrItem[] } } };
  return doc.rss?.channel?.item ?? [];
}

const stripFlags = (s: string): string => cleanText(s.replace(/[\u{1F1E6}-\u{1F1FF}]/gu, " "));

/** WWR: a non-empty <country>/<state> narrows "Anywhere in the World" down to that place. */
export function wwrRegionStrings(item: WwrItem): string[] {
  const country = stripFlags(str(item.country));
  if (country) return [country];
  const state = stripFlags(str(item.state));
  if (state) return [`${state}, United States`];
  return [stripInline(str(item.region))];
}

/**
 * For ATS-imported posts the "Headquarters:" line is really the job's remote location ("United States - Remote",
 * "Americas Remote", "Remote (USA)") and is more specific than the default "Anywhere in the World".
 */
export function wwrLocationSignals(item: WwrItem, headquarters: string | undefined): string[] {
  const regions = wwrRegionStrings(item);
  if (headquarters && /\bremote\b/i.test(headquarters) && classifyProse(headquarters) !== "unknown") return [headquarters];
  return regions;
}

function slugOf(url: string): string {
  try {
    return new URL(url).pathname.split("/").filter(Boolean).pop() ?? url;
  } catch {
    return url;
  }
}

/** One RSS item → RawJob, or null when it is not open to India/anywhere. */
export function mapWwrItem(item: WwrItem): RawJob | null {
  const rawTitle = stripInline(str(item.title));
  const sep = /\s*:\s+/.exec(rawTitle);
  const company = sep ? rawTitle.slice(0, sep.index).trim() : "";
  const title = sep ? rawTitle.slice(sep.index + sep[0].length).trim() : rawTitle;
  const link = httpUrl(str(item.link)) ?? httpUrl(typeof item.guid === "string" ? item.guid : item.guid?.["#text"]);
  if (!company || !title || !link) return null;
  const html = str(item.description);
  const text = html ? htmlToPlain(html) : null;
  const hq = /Headquarters:\s*([^\n]+)/i.exec(text ?? "")?.[1]?.trim();
  const regions = wwrLocationSignals(item, hq);
  const verdict = assessRemote({ locations: regions, title, descriptionText: text });
  if (!verdict.eligible) return null;
  // Descriptions start with "<strong>URL:</strong> <a href=…>" — the employer's website (sometimes an ATS).
  const companyUrl = /URL:\s*(?:<\/strong>)?\s*(<a\b[^>]*>[\s\S]*?<\/a>)/i.exec(html)?.[1];
  const companyHref = companyUrl ? extractLinks(companyUrl)[0]?.href : undefined;
  const companyDomain = companyHref ? companyDomainOf(companyHref) : null;
  return prune<RawJob>({
    source: "weworkremotely",
    sourceKind: "job_board",
    sourceJobId: slugOf(link),
    sourceUrl: link,
    target: null,
    // The employer's apply link is behind a WWR sign-in, so the WWR page is the apply URL.
    applyUrl: link,
    title,
    company,
    descriptionHtml: html || null,
    postedAt: toIso(str(item.pubDate)),
    companyDomain,
    companyLogoUrl: httpUrl(item["media:content"]?.["@_url"]),
    validThrough: toIso(str(item.expires_at)),
    department: textOrNull(str(item.category)),
    employmentTypeRaw: textOrNull(str(item.type)),
    jobType: jobTypeFrom(str(item.type)),
    skills: cleanList(str(item.skills).split(/\s*,\s*|\s+and\s+/), 20),
    ...remoteHints(verdict.scope, regions[0]),
    extra: prune({ remoteScope: verdict.scope, region: textOrNull(str(item.region)) ?? undefined, headquarters: hq || undefined }),
  });
}

const DEFAULT_FEEDS = ["https://weworkremotely.com/remote-jobs.rss"];

async function* scrapeWwr(ctx: ScrapeContext): AsyncGenerator<RawJob> {
  const feeds = envList(ctx.env, "WWR_FEEDS", DEFAULT_FEEDS);
  const seen = new Set<string>();
  let emitted = 0;
  for (const [i, feed] of feeds.entries()) {
    if (i > 0) await pause(ctx, 1500);
    const xml = await fetchText(ctx, "weworkremotely", feed, { headers: { accept: "application/rss+xml, application/xml;q=0.9, */*;q=0.5" } });
    for (const item of parseWwrFeed(xml)) {
      const job = mapWwrItem(item);
      if (!job || seen.has(job.sourceJobId)) continue;
      seen.add(job.sourceJobId);
      yield job;
      if (reachedLimit(ctx, ++emitted)) return;
    }
  }
}

export const weworkremotelyScraper: Scraper = {
  id: "weworkremotely",
  name: "We Work Remotely",
  kind: "job_board",
  // Feed TTL is 60 min; the 100-item feed spans ~30 days of postings.
  intervalMinutes: 120,
  attribution: "Jobs via We Work Remotely (https://weworkremotely.com)",
  isEnabled: (env) => !isDisabledByEnv(env, "weworkremotely"),
  scrape: scrapeWwr,
};
