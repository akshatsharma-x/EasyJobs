import { load, type Cheerio, type CheerioAPI } from "cheerio";
import { isoFromDateAttr, parseRelativeTime } from "../shared/relative-time";
import { absoluteUrl, cleanText, uniqueCi } from "../shared/text";
import { linkedInViewUrl } from "./plan";

/** domhandler's AnyNode, derived from cheerio's own exports (domhandler isn't a direct dependency). */
export type CheerioNode = Parameters<(typeof import("cheerio"))["contains"]>[0];

/** One result card of the guest search fragment (seeMoreJobPostings/search). */
export interface LinkedInCard {
  /** Numeric job id from data-entity-urn="urn:li:jobPosting:{id}" (or the /jobs/view/… link). */
  id: string;
  title: string;
  company: string;
  /** https://www.linkedin.com/company/{slug} */
  companyUrl: string | null;
  companyLogoUrl: string | null;
  location: string | null;
  /** time[datetime] — a date, e.g. "2025-11-25" */
  listedDate: string | null;
  /** time text, e.g. "2 hours ago" */
  listedText: string | null;
  postedAt: string | null;
  /** time has the "--new" modifier (posted within ~24 h) */
  isNew: boolean;
  salaryText: string | null;
  /** "Actively Hiring", "Be an early applicant", … */
  benefits: string[];
  /** Canonical https://www.linkedin.com/jobs/view/{id} */
  url: string;
}

const URN_ID = /urn:li:jobPosting:(\d+)/;
const VIEW_ID = /\/jobs\/view\/(?:[^/?#]*-)?(\d{5,})(?:[/?#]|$)/;
const SUB_DAY = /\b(just now|now|moments?|seconds?|secs?|minutes?|mins?|hours?|hrs?)\b/i;

export function parseLinkedInListing(html: string, now: Date): LinkedInCard[] {
  const $ = load(html);
  let nodes = $("[data-entity-urn*='urn:li:jobPosting:']");
  if (nodes.length === 0) nodes = $("li").filter((_, li) => $(li).find("a[href*='/jobs/view/']").length > 0);
  const out: LinkedInCard[] = [];
  const seen = new Set<string>();
  nodes.each((_, el) => {
    const card = parseCard($, $(el), now);
    if (card && !seen.has(card.id)) {
      seen.add(card.id);
      out.push(card);
    }
  });
  return out;
}

function parseCard($: CheerioAPI, card: Cheerio<CheerioNode>, now: Date): LinkedInCard | null {
  const link = card.is("a[href]") ? card : card.find("a.base-card__full-link[href], a[href*='/jobs/view/']").first();
  const href = link.attr("href") ?? null;
  const id = URN_ID.exec(card.attr("data-entity-urn") ?? "")?.[1] ?? (href ? VIEW_ID.exec(href)?.[1] : undefined);
  if (!id) return null;

  const title = cleanText(card.find(".base-search-card__title").first().text()) ?? cleanText(link.find(".sr-only").first().text()) ?? cleanText(card.find("h3").first().text());
  const subtitle = card.find(".base-search-card__subtitle").first();
  const company = cleanText(subtitle.text()) ?? cleanText(card.find("h4").first().text());
  if (!title || !company) return null;

  const time = card.find("time").first();
  const listedDate = cleanText(time.attr("datetime"));
  const listedText = cleanText(time.text());

  return {
    id,
    title,
    company,
    companyUrl: companyPageUrl(subtitle.find("a[href]").first().attr("href")),
    companyLogoUrl: logoUrl(card.find("img.artdeco-entity-image, .search-entity-media img").first()),
    location: cleanText(card.find(".job-search-card__location").first().text()),
    listedDate,
    listedText,
    postedAt: postedAtFrom(listedDate, listedText, now),
    isNew: /listdate--new/.test(time.attr("class") ?? ""),
    salaryText: cleanText(card.find(".job-search-card__salary-info").first().text()),
    benefits: uniqueCi(
      card
        .find(".job-posting-benefits__text")
        .toArray()
        .map((b) => cleanText($(b).text()))
        .filter((b): b is string => b !== null),
    ),
    url: linkedInViewUrl(id),
  };
}

/**
 * Sub-day labels ("3 hours ago") are more precise than the date-only datetime attribute; otherwise
 * prefer the attribute. Never returns a time in the future (the attribute can be a day ahead in IST).
 */
export function postedAtFrom(dateAttr: string | null, text: string | null, now: Date): string | null {
  const relative = parseRelativeTime(text, now);
  const fromAttr = isoFromDateAttr(dateAttr);
  const best = relative && text && SUB_DAY.test(text) ? relative : (fromAttr ?? relative);
  if (!best) return null;
  return Date.parse(best) > now.getTime() ? now.toISOString() : best;
}

/** https://in.linkedin.com/company/acme?trk=… → https://www.linkedin.com/company/acme */
export function companyPageUrl(href: string | undefined): string | null {
  const abs = absoluteUrl(href, "https://www.linkedin.com");
  if (!abs) return null;
  const u = new URL(abs);
  const m = /^\/company\/([^/?#]+)/.exec(u.pathname);
  return /(^|\.)linkedin\.com$/.test(u.hostname) && m ? `https://www.linkedin.com/company/${m[1]}` : null;
}

/** Real logos live on media.licdn.com; static.licdn.com images and data: URIs are ghost placeholders. */
function logoUrl(img: Cheerio<CheerioNode>): string | null {
  for (const attr of ["data-delayed-url", "src"]) {
    const abs = absoluteUrl(img.attr(attr));
    if (abs && /(^|\.)media\.licdn\.com$/.test(new URL(abs).hostname)) return abs;
  }
  return null;
}
