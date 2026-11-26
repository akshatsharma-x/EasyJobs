import type { CompanyTarget, RawJob } from "@easyjobs/contract";
import type { Scraper } from "@easyjobs/contract/node";
import { createDetailBudget, resolveDetails, samplingDone, type Listed } from "../lib/details";
import { envInt } from "../lib/env";
import { absoluteUrl, cleanText, normalizeDescriptionHtml } from "../lib/html";
import { compact, uniqStrings } from "../lib/mapping";
import { innerHtmlAt } from "../lib/microdata";
import { overflowPolicy, runTargets, targetBase, type TargetContext } from "../lib/run";
import { pageToRawJob, parseJobPage } from "../jsonld/page";
import { pageHttp, scrapeByPages } from "../jsonld/scraper";

/**
 * iCIMS career portals (careers-{company}.icims.com). Best-effort: built on iCIMS' public portal
 * layout; no live iCIMS portal was reachable during verification (see README).
 */
export interface IcimsRow {
  id: string;
  url: string;
  title: string;
  location: string | null;
}

const JOB_LINK = /<a\b[^>]*href="([^"]*\/jobs\/(\d+)\/[^"]*\/job[^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;

/** /jobs/search page → job rows (title from the link or its heading, location from the row). */
export function parseIcimsSearch(html: string, base: string): IcimsRow[] {
  const rows = new Map<string, IcimsRow>();
  for (const m of html.matchAll(JOB_LINK)) {
    const id = m[2] ?? "";
    const href = absoluteUrl(m[1] ?? "", base);
    if (!id || !href) continue;
    const url = href.replace(/[?&]in_iframe=1/, "").replace(/\?$/, "");
    const linkText = cleanText((m[3] ?? "").replace(/<span[^>]*class="[^"]*sr-only[^"]*"[^>]*>[\s\S]*?<\/span>/gi, " "));
    const title = linkText.replace(/^Title\s*/i, "").trim();
    if (!title || /^(?:apply|view|more)/i.test(title)) continue;
    // The location usually sits in the same row, labelled "Location" / "Job Locations".
    const rowHtml = html.slice(m.index ?? 0, (m.index ?? 0) + 2500);
    const loc = /(?:Job\s+)?Locations?\s*<\/[^>]+>\s*(?:<[^>]+>\s*)*([^<]{2,120})</i.exec(rowHtml)?.[1];
    const existing = rows.get(id);
    if (!existing || existing.title.length < title.length) rows.set(id, { id, url, title, location: loc ? cleanText(loc) || null : existing?.location ?? null });
  }
  return [...rows.values()];
}

export function icimsJobId(base: string, id: string): string {
  return `${new URL(base).hostname.toLowerCase()}:${id}`;
}

export function icimsLight(target: CompanyTarget, base: string, row: IcimsRow): RawJob {
  return compact({
    source: "icims",
    sourceKind: "ats",
    sourceJobId: icimsJobId(base, row.id),
    sourceUrl: row.url,
    applyUrl: row.url,
    title: row.title,
    ...targetBase(target),
    locations: row.location ? uniqStrings(row.location.split(/\s*\|\s*/)) : [],
    descriptionHtml: null,
    postedAt: null,
    extra: { icims: { id: row.id, detail: false } },
  } satisfies RawJob);
}

/** Job page without JSON-LD: the iCIMS job content block. */
export function icimsDescription(html: string): string | null {
  const m = /<div\b[^>]*class="[^"]*iCIMS_JobContent[^"]*"[^>]*>/i.exec(html);
  if (!m) return null;
  return normalizeDescriptionHtml(innerHtmlAt(html, m.index));
}

export async function* scrapeIcimsTarget(tctx: TargetContext): AsyncGenerator<RawJob> {
  const { target, env, log, stats } = tctx;
  const base = new URL(target.token).origin;
  const http = pageHttp(tctx, base, "ICIMS");
  const maxDetails = envInt(env, "ICIMS_MAX_DETAILS", 200);
  const budget = createDetailBudget(tctx.limit !== undefined ? Math.min(maxDetails, tctx.limit) : maxDetails, overflowPolicy(env, "ICIMS_OVERFLOW"), 1);
  const maxPages = envInt(env, "ICIMS_MAX_LIST_PAGES", 100, 1);
  const seen = new Set<string>();
  for (let pr = 0; pr < maxPages; pr++) {
    const html = await http.text(`${base}/jobs/search?ss=1&in_iframe=1&pr=${pr}`);
    stats.pages++;
    const rows = parseIcimsSearch(html, base);
    if (rows.length === 0 && pr === 0) {
      log.warn("icims: no job links on /jobs/search — crawling the sitemap instead");
      yield* scrapeByPages(tctx, "icims", "ICIMS", target.token);
      return;
    }
    const entries: Listed<IcimsRow>[] = [];
    for (const row of rows) {
      const id = icimsJobId(base, row.id);
      if (seen.has(id)) continue;
      seen.add(id);
      entries.push({ id, item: row });
    }
    stats.listed += entries.length;
    if (entries.length === 0) break; // past the last page iCIMS repeats or returns nothing new
    yield* resolveDetails(tctx, entries, budget, {
      fetchDetail: (row) => http.text(`${row.url}${row.url.includes("?") ? "&" : "?"}in_iframe=1`, { throttleWaitsMs: [] }),
      toFull: (row, html) => {
        const ld = parseJobPage(html, row.url, tctx.now);
        if (ld) return { ...pageToRawJob("icims", target, row.url, ld), sourceJobId: icimsJobId(base, row.id) };
        const description = icimsDescription(html);
        if (!description) {
          tctx.drift("icims job page", "no JSON-LD or iCIMS_JobContent");
          return null;
        }
        return { ...icimsLight(target, base, row), descriptionHtml: description, extra: { icims: { id: row.id, detail: true } } };
      },
      toLight: (row) => icimsLight(target, base, row),
    });
    if (samplingDone(tctx, budget)) break;
  }
}

export const icimsScraper: Scraper = {
  id: "icims",
  name: "iCIMS career portal",
  kind: "ats",
  intervalMinutes: 180,
  handlesAts: ["icims"],
  scrape: (ctx) => runTargets(ctx, { scraperId: "icims", handlesAts: ["icims"] }, scrapeIcimsTarget),
};
