import type { CompanyTarget, RawJob } from "@easyjobs/contract";
import { RobotsDisallowedError, type Scraper } from "@easyjobs/contract/node";
import { toIso } from "../lib/dates";
import { createDetailBudget, resolveDetails, samplingDone, type Listed } from "../lib/details";
import { envInt } from "../lib/env";
import { absoluteUrl, attr, cleanText } from "../lib/html";
import { jobIdFromUrl } from "../lib/joburl";
import { compact } from "../lib/mapping";
import { overflowPolicy, runTargets, targetBase, type TargetContext } from "../lib/run";
import { pageToRawJob, parseJobPage } from "../jsonld/page";
import { pageHttp, scrapeByPages } from "../jsonld/scraper";

/** One row of an RMK search results table (`<tr class="data-row">`). */
export interface RmkRow {
  url: string;
  title: string;
  location: string | null;
  /** Raw date label ("Nov 25, 2026"), when the site shows the column. */
  date: string | null;
  department: string | null;
}

const PAGE_SIZE = 25;

function spanText(html: string, cls: string): string | null {
  const m = new RegExp(`<span[^>]*class="[^"]*\\b${cls}\\b[^"]*"[^>]*>([\\s\\S]*?)</span>`, "i").exec(html);
  if (!m) return null;
  // "+80 more…" lives in a <small> inside the location span.
  const v = cleanText((m[1] ?? "").replace(/<small[\s\S]*?<\/small>/gi, " "));
  return v || null;
}

/** Parse RMK search results: rows + "Results 1 – 25 of 9713". */
export function parseRmkSearch(html: string, base: string): { rows: RmkRow[]; total: number | null } {
  const rows: RmkRow[] = [];
  for (const m of html.matchAll(/<tr\b[^>]*class="[^"]*\bdata-row\b[^"]*"[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const tr = m[1] ?? "";
    const a = /<a\b[^>]*class="[^"]*\bjobTitle-link\b[^"]*"[^>]*>([\s\S]*?)<\/a>/i.exec(tr);
    if (!a) continue;
    const url = absoluteUrl(attr(a[0], "href"), base);
    const title = cleanText(a[1] ?? "");
    if (!url || !title) continue;
    rows.push({
      url,
      title,
      location: spanText(tr, "jobLocation"),
      date: spanText(tr, "jobDate"),
      department: spanText(tr, "jobDepartment") ?? spanText(tr, "jobFacility"),
    });
  }
  const label = /paginationLabel[^>]*>[\s\S]*?of\s*<b>\s*([\d,.\s]+)\s*<\/b>/i.exec(html);
  const total = label?.[1] ? Number(label[1].replace(/[^\d]/g, "")) : null;
  return { rows, total: total !== null && Number.isFinite(total) ? total : null };
}

export function rmkLight(target: CompanyTarget, row: RmkRow, now: Date): RawJob {
  return compact({
    source: "successfactors",
    sourceKind: "ats",
    sourceJobId: jobIdFromUrl(row.url),
    sourceUrl: row.url,
    applyUrl: row.url,
    title: row.title,
    ...targetBase(target),
    locations: row.location ? [row.location] : [],
    descriptionHtml: null,
    postedAt: toIso(row.date, now),
    department: row.department ?? undefined,
    extra: { successfactors: { via: "search", detail: false } },
  } satisfies RawJob);
}

/** RMK search URL. The q= variant is tried first; sites whose robots.txt disallows keyword searches get the plain listing. */
export const rmkSearchUrl = (origin: string, startrow: number, withQuery: boolean): string =>
  `${origin}/search/?${withQuery ? "q=&" : ""}sortColumn=referencedate&sortDirection=desc&startrow=${startrow}`;

export async function* scrapeSuccessFactorsTarget(tctx: TargetContext): AsyncGenerator<RawJob> {
  const { target, env, log, stats } = tctx;
  const origin = new URL(target.token).origin;
  const http = pageHttp(tctx, origin, "SUCCESSFACTORS");
  const maxDetails = envInt(env, "SUCCESSFACTORS_MAX_DETAILS", 200);
  const budget = createDetailBudget(tctx.limit !== undefined ? Math.min(maxDetails, tctx.limit) : maxDetails, overflowPolicy(env, "SUCCESSFACTORS_OVERFLOW"), 1);

  let withQuery = true;
  let first: { rows: RmkRow[]; total: number | null } | null = null;
  for (const q of [true, false]) {
    try {
      first = parseRmkSearch(await http.text(rmkSearchUrl(origin, 0, q)), origin);
      withQuery = q;
      if (first.rows.length > 0) break;
    } catch (e) {
      if (!(e instanceof RobotsDisallowedError)) throw e;
      log.debug(`successfactors: robots.txt disallows ${q ? "keyword" : "plain"} search URLs`);
    }
  }
  if (!first || first.rows.length === 0) {
    log.info("successfactors: no RMK search results — crawling the sitemap (microdata/JSON-LD job pages)");
    yield* scrapeByPages(tctx, "successfactors", "SUCCESSFACTORS", target.token);
    return;
  }

  const seen = new Set<string>();
  let page = first;
  let startrow = 0;
  const total = first.total;
  for (;;) {
    stats.pages++;
    const entries: Listed<RmkRow>[] = [];
    for (const row of page.rows) {
      const id = jobIdFromUrl(row.url);
      if (seen.has(id)) continue;
      seen.add(id);
      entries.push({ id, item: row });
    }
    stats.listed += entries.length;
    yield* resolveDetails(tctx, entries, budget, {
      fetchDetail: (row) => http.text(row.url, { throttleWaitsMs: [] }),
      toFull: (row, html) => {
        const parsed = parseJobPage(html, row.url, tctx.now);
        if (!parsed) {
          tctx.drift("RMK job page", "no microdata/JSON-LD JobPosting");
          return null;
        }
        const job = pageToRawJob("successfactors", target, row.url, parsed);
        // Search rows know the department even when the page microdata does not.
        return {
          ...job,
          locations: job.locations.length > 0 ? job.locations : row.location ? [row.location] : [],
          department: job.department ?? row.department ?? undefined,
          postedAt: job.postedAt ?? toIso(row.date, tctx.now),
        };
      },
      toLight: (row) => rmkLight(target, row, tctx.now),
    });
    startrow += PAGE_SIZE;
    if (page.rows.length === 0 || (total !== null ? startrow >= total : page.rows.length < PAGE_SIZE) || samplingDone(tctx, budget)) break;
    page = parseRmkSearch(await http.text(rmkSearchUrl(origin, startrow, withQuery)), origin);
  }
}

export const successFactorsScraper: Scraper = {
  id: "successfactors",
  name: "SAP SuccessFactors (RMK career site)",
  kind: "ats",
  intervalMinutes: 180,
  handlesAts: ["successfactors"],
  scrape: (ctx) => runTargets(ctx, { scraperId: "successfactors", handlesAts: ["successfactors"] }, scrapeSuccessFactorsTarget),
};
