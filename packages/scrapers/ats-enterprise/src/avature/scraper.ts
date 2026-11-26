import type { CompanyTarget, RawJob } from "@easyjobs/contract";
import type { Scraper } from "@easyjobs/contract/node";
import { toIso } from "../lib/dates";
import { createDetailBudget, resolveDetails, samplingDone, type Listed } from "../lib/details";
import { envInt } from "../lib/env";
import { absoluteUrl, cleanText, normalizeDescriptionHtml } from "../lib/html";
import { jobIdFromUrl } from "../lib/joburl";
import { compact, isPlaceholderLocation, mapEmploymentType, mapWorkMode, uniqStrings } from "../lib/mapping";
import { innerHtmlAt } from "../lib/microdata";
import { extraString, overflowPolicy, runTargets, targetBase, type TargetContext } from "../lib/run";
import { pageToRawJob, parseJobPage } from "../jsonld/page";
import { pageHttp, scrapeByPages } from "../jsonld/scraper";

export interface AvatureCard {
  url: string;
  title: string;
  location: string | null;
}

/** Avature portal base ("…/careers"): everything before /SearchJobs or /JobDetail. */
export function avatureBase(token: string): string {
  const u = new URL(token);
  const path = u.pathname.replace(/\/(?:SearchJobs|JobDetail)\b.*$/i, "").replace(/\/+$/, "");
  return `${u.origin}${path || "/careers"}`;
}

/**
 * Card location: the dedicated span (Bloomberg) or the last subtitle span that is not the
 * employer name ("Deloitte US | Deloitte Tax LLP | Multiple Locations"). Placeholders → null.
 */
function cardLocation(body: string): string | null {
  const dedicated = /<span[^>]*class="[^"]*list-item-location[^"]*"[^>]*>([\s\S]*?)<\/span>/i.exec(body)?.[1];
  let loc = dedicated ? cleanText(dedicated) : "";
  if (!loc) {
    const subtitle = /<div[^>]*class="[^"]*article__header__text__subtitle[^"]*"[^>]*>([\s\S]*?)<\/div>/i.exec(body)?.[1] ?? "";
    const spans = [...subtitle.matchAll(/<span\b[^>]*>([\s\S]*?)<\/span>/gi)].map((m) => cleanText(m[1] ?? "")).filter(Boolean);
    loc = spans.length > 1 ? (spans[spans.length - 1] ?? "") : "";
  }
  return loc && !isPlaceholderLocation(loc) ? loc : null;
}

/** SearchJobs page → cards + total ("315 results"). */
export function parseAvatureList(html: string, base: string): { cards: AvatureCard[]; total: number | null } {
  const cards: AvatureCard[] = [];
  const seen = new Set<string>();
  for (const m of html.matchAll(/<article\b[^>]*class="[^"]*article--result[^"]*"[^>]*>([\s\S]*?)<\/article>/gi)) {
    const body = m[1] ?? "";
    const a = /<a\b[^>]*href="([^"]*JobDetail[^"]*)"[^>]*>([\s\S]*?)<\/a>/i.exec(body);
    const url = a ? absoluteUrl(a[1] ?? "", base) : null;
    if (!url || seen.has(url)) continue;
    const title = cleanText(a?.[2] ?? "");
    if (!title) continue;
    seen.add(url);
    cards.push({ url, title, location: cardLocation(body) });
  }
  if (cards.length === 0) {
    // Older Avature templates: plain links.
    for (const m of html.matchAll(/<a\b[^>]*href="([^"]*\/JobDetail\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)) {
      const url = absoluteUrl(m[1] ?? "", base);
      const title = cleanText(m[2] ?? "");
      if (url && title && !seen.has(url) && !/^(?:apply|save|share)$/i.test(title)) {
        seen.add(url);
        cards.push({ url, title, location: null });
      }
    }
  }
  const t = /(\d[\d,.]*)\s*(?:results?|jobs?|openings?)\b/i.exec(cleanText(html.replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")));
  const total = t?.[1] ? Number(t[1].replace(/[^\d]/g, "")) : null;
  return { cards, total: total !== null && Number.isFinite(total) && total > 0 ? total : null };
}

export interface AvatureDetail {
  fields: Record<string, string>;
  descriptionHtml: string | null;
}

/** JobDetail page: labelled fields ("Location", "Business Area", "Ref #") + rich-text description blocks. */
export function parseAvatureDetail(html: string): AvatureDetail {
  const fields: Record<string, string> = {};
  const rich: string[] = [];
  const re = /<div\b[^>]*class="(article__content__view__field\b[^"]*)"[^>]*>/gi;
  for (const m of html.matchAll(re)) {
    const cls = m[1] ?? "";
    if (/__(?:label|value)\b/.test(cls)) continue;
    const inner = innerHtmlAt(html, m.index ?? 0) ?? "";
    const labelHtml = /<div\b[^>]*class="[^"]*article__content__view__field__label[^"]*"[^>]*>([\s\S]*?)<\/div>/i.exec(inner)?.[1];
    const valueStart = /<div\b[^>]*class="[^"]*article__content__view__field__value[^"]*"[^>]*>/i.exec(inner);
    const valueHtml = valueStart ? innerHtmlAt(inner, valueStart.index) ?? "" : inner;
    const label = labelHtml ? cleanText(labelHtml).replace(/:$/, "") : "";
    if (label && label.length <= 60) {
      const v = cleanText(valueHtml);
      if (v) fields[label] = v.slice(0, 500);
    } else if (/field--rich-text/.test(cls)) {
      const h = normalizeDescriptionHtml(valueHtml);
      if (h) rich.push(h);
    }
  }
  return { fields, descriptionHtml: rich.length > 0 ? rich.join("\n") : null };
}

const pick = (fields: Record<string, string>, re: RegExp): string | undefined => Object.entries(fields).find(([k]) => re.test(k))?.[1];

export function avatureToRawJob(target: CompanyTarget, card: AvatureCard, detail: AvatureDetail | null, now: Date): RawJob {
  const f = detail?.fields ?? {};
  const location = pick(f, /^(?:location|locations|city|work location|office)s?$/i) ?? card.location ?? "";
  const employment = pick(f, /employment type|job type|contract type|position type|schedule|time type/i);
  const mode = mapWorkMode(pick(f, /work arrangement|workplace|remote|work model|work type/i) ?? null);
  return compact({
    source: "avature",
    sourceKind: "ats",
    sourceJobId: jobIdFromUrl(card.url),
    sourceUrl: card.url,
    applyUrl: card.url,
    title: card.title,
    ...targetBase(target),
    locations: uniqStrings(location.split(/\s*[;|]\s*/)),
    descriptionHtml: detail ? detail.descriptionHtml : null,
    postedAt: toIso(pick(f, /posted|posting date|date published|publish/i) ?? null, now),
    department: pick(f, /business area|department|team|function|division|category/i),
    employmentTypeRaw: employment,
    jobType: mapEmploymentType(employment),
    experienceRaw: pick(f, /experience/i),
    ...(mode ? { workMode: mode, isRemote: mode === "remote" } : {}),
    extra: { avature: compact({ ref: pick(f, /ref|requisition|job id|job number/i), detail: Boolean(detail) }) },
  } satisfies RawJob);
}

export async function* scrapeAvatureTarget(tctx: TargetContext): AsyncGenerator<RawJob> {
  const { target, env, log, stats } = tctx;
  const base = extraString(target, "avatureBase") ?? avatureBase(target.token);
  const http = pageHttp(tctx, base, "AVATURE");
  const maxDetails = envInt(env, "AVATURE_MAX_DETAILS", 200);
  const budget = createDetailBudget(tctx.limit !== undefined ? Math.min(maxDetails, tctx.limit) : maxDetails, overflowPolicy(env, "AVATURE_OVERFLOW"), 1);
  const perPage = envInt(env, "AVATURE_PAGE_SIZE", 50, 6);
  const seen = new Set<string>();
  let offset = 0;
  for (;;) {
    const html = await http.text(`${base}/SearchJobs/?jobRecordsPerPage=${perPage}&jobOffset=${offset}`);
    stats.pages++;
    const { cards, total } = parseAvatureList(html, base);
    if (cards.length === 0 && offset === 0) {
      log.warn("avature: no job cards on SearchJobs — crawling the sitemap instead");
      yield* scrapeByPages(tctx, "avature", "AVATURE", target.token);
      return;
    }
    const entries: Listed<AvatureCard>[] = [];
    for (const c of cards) {
      const id = jobIdFromUrl(c.url);
      if (seen.has(id)) continue;
      seen.add(id);
      entries.push({ id, item: c });
    }
    stats.listed += entries.length;
    if (entries.length === 0) break; // the portal ignored jobOffset and repeated a page
    yield* resolveDetails(tctx, entries, budget, {
      fetchDetail: (c) => http.text(c.url, { throttleWaitsMs: [] }),
      toFull: (c, detailHtml) => {
        const ld = parseJobPage(detailHtml, c.url, tctx.now);
        if (ld) {
          const job = pageToRawJob("avature", target, c.url, ld);
          return { ...job, title: c.title || job.title, locations: job.locations.length > 0 ? job.locations : c.location ? [c.location] : [] };
        }
        const d = parseAvatureDetail(detailHtml);
        if (!d.descriptionHtml && Object.keys(d.fields).length === 0) {
          tctx.drift("avature job page", "no JSON-LD or field blocks");
          return null;
        }
        return avatureToRawJob(target, c, d, tctx.now);
      },
      toLight: (c) => avatureToRawJob(target, c, null, tctx.now),
    });
    offset += cards.length;
    if (cards.length === 0 || (total !== null && offset >= total) || samplingDone(tctx, budget)) break;
  }
}

export const avatureScraper: Scraper = {
  id: "avature",
  name: "Avature career site",
  kind: "ats",
  intervalMinutes: 180,
  handlesAts: ["avature"],
  scrape: (ctx) => runTargets(ctx, { scraperId: "avature", handlesAts: ["avature"] }, scrapeAvatureTarget),
};
