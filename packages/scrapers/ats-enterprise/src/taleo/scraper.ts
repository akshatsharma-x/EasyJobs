import type { CompanyTarget, RawJob } from "@easyjobs/contract";
import type { Scraper } from "@easyjobs/contract/node";
import { z } from "zod";
import { toIso } from "../lib/dates";
import { createDetailBudget, resolveDetails, samplingDone, type Listed } from "../lib/details";
import { envInt } from "../lib/env";
import { attr, cleanText, normalizeDescriptionHtml } from "../lib/html";
import { compact, uniqStrings } from "../lib/mapping";
import { overflowPolicy, runTargets, targetBase, type TargetContext } from "../lib/run";
import { pageHttp, scrapeByPages } from "../jsonld/scraper";

/**
 * Oracle Taleo Enterprise career sections. Best-effort: uses the REST call the jobsearch.ftl page
 * makes itself; no live Taleo section was reachable during verification (see README).
 */
export interface TaleoSection {
  origin: string;
  section: string;
  lang: string;
}

export function parseTaleoToken(token: string): TaleoSection {
  const u = new URL(token);
  const m = /\/careersection\/([^/]+)\//i.exec(u.pathname);
  if (!m?.[1]) throw new Error(`taleo: expected …/careersection/{section}/jobsearch.ftl, got "${token}"`);
  return { origin: u.origin, section: decodeURIComponent(m[1]), lang: u.searchParams.get("lang") ?? "en" };
}

/** The jobsearch.ftl page embeds its portal number (needed by the REST search). */
export function findPortalNumber(html: string): string | null {
  return /[?&;]portal=(\d{5,})/i.exec(html)?.[1] ?? /["']?portal(?:No|Number|Id)?["']?\s*[:=]\s*["']?(\d{5,})/i.exec(html)?.[1] ?? null;
}

const Requisition = z.object({
  jobId: z.union([z.string(), z.number()]).transform(String),
  contestNo: z.union([z.string(), z.number()]).transform(String).nullish(),
  column: z.array(z.union([z.string(), z.number(), z.null()])).nullish(),
});
type Requisition = z.infer<typeof Requisition>;
const SearchResponse = z.object({
  requisitionList: z.array(z.unknown()).nullish(),
  pagingData: z.object({ totalCount: z.number().nullish(), pageSize: z.number().nullish() }).nullish(),
});

export function searchBody(pageNo: number): Record<string, unknown> {
  const filters = (ids: string[]): { searchFilterSelections: { id: string; selectedValues: string[] }[] } => ({
    searchFilterSelections: ids.map((id) => ({ id, selectedValues: [] })),
  });
  return {
    multilineEnabled: false,
    sortingSelection: { sortBySelectionParam: "3", ascendingSortingOrder: "false" },
    fieldData: { fields: { KEYWORD: "", LOCATION: "" }, valid: true },
    filterSelectionParam: filters(["POSTING_DATE", "LOCATION", "JOB_FIELD"]),
    advancedSearchFiltersSelectionParam: filters(["ORGANIZATION", "LOCATION", "JOB_FIELD", "JOB_NUMBER", "URGENT_JOB", "EMPLOYEE_STATUS", "STUDY_LEVEL", "WILL_TRAVEL", "JOB_SHIFT"]),
    pageNo,
  };
}

export interface TaleoRow {
  id: string;
  contestNo: string;
  title: string;
  location: string | null;
  date: string | null;
}

/** column[] order is configurable per section: title first, a date-looking cell, a location-looking cell. */
export function rowFromRequisition(r: Requisition): TaleoRow | null {
  const cells = (r.column ?? []).map((c) => cleanText(String(c ?? "").replace(/^\[|\]$/g, "").replace(/^"|"$/g, "")));
  const title = cells[0] ?? "";
  if (!title) return null;
  const date = cells.find((c) => /\b\d{4}\b/.test(c) && !Number.isNaN(Date.parse(c))) ?? null;
  const location = cells.slice(1).find((c) => c && c !== date && /[A-Za-z]/.test(c) && /,|-/.test(c)) ?? null;
  return { id: r.jobId, contestNo: r.contestNo ?? r.jobId, title, location, date };
}

/** jobdetail.ftl keeps the posting in <input id="initialHistory" value="…!|!…"> with %-encoded HTML pieces. */
export function taleoDescription(html: string): string | null {
  const tag = /<input\b[^>]*id=["']initialHistory["'][^>]*>/i.exec(html)?.[0];
  const raw = tag ? attr(tag, "value") : null;
  if (!raw) return null;
  const pieces = raw.split("!|!").map((p) => {
    try {
      return decodeURIComponent(p.replace(/\+/g, " "));
    } catch {
      return p;
    }
  });
  const htmlPieces = pieces.filter((p) => /<(?:p|div|ul|li|br|strong|b)\b/i.test(p)).sort((a, b) => b.length - a.length);
  return normalizeDescriptionHtml(htmlPieces.slice(0, 2).join("\n") || null);
}

export const taleoJobUrl = (s: TaleoSection, contestNo: string): string =>
  `${s.origin}/careersection/${encodeURIComponent(s.section)}/jobdetail.ftl?job=${encodeURIComponent(contestNo)}&lang=${s.lang}`;

export function taleoToRawJob(s: TaleoSection, target: CompanyTarget, row: TaleoRow, description: string | null, now: Date): RawJob {
  const url = taleoJobUrl(s, row.contestNo);
  return compact({
    source: "taleo",
    sourceKind: "ats",
    sourceJobId: `${new URL(s.origin).hostname}:${row.contestNo}`,
    sourceUrl: url,
    applyUrl: url,
    title: row.title,
    ...targetBase(target),
    locations: row.location ? uniqStrings(row.location.split(/\s*;\s*/)) : [],
    descriptionHtml: description,
    postedAt: toIso(row.date, now),
    extra: { taleo: { section: s.section, jobId: row.id, detail: description !== null } },
  } satisfies RawJob);
}

export async function* scrapeTaleoTarget(tctx: TargetContext): AsyncGenerator<RawJob> {
  const { target, env, log, stats } = tctx;
  const section = parseTaleoToken(target.token);
  const http = pageHttp(tctx, section.origin, "TALEO");
  const landing = await http.text(target.token);
  const portal = findPortalNumber(landing);
  if (!portal) {
    log.warn("taleo: no portal number on jobsearch.ftl — crawling sitemap.jss instead");
    yield* scrapeByPages(tctx, "taleo", "TALEO", `${section.origin}/careersection/sitemap.jss?portalCode=${encodeURIComponent(section.section)}&lang=${section.lang}`);
    return;
  }
  const maxDetails = envInt(env, "TALEO_MAX_DETAILS", 150);
  const budget = createDetailBudget(tctx.limit !== undefined ? Math.min(maxDetails, tctx.limit) : maxDetails, overflowPolicy(env, "TALEO_OVERFLOW"), 1);
  const seen = new Set<string>();
  for (let pageNo = 1; pageNo <= 400; pageNo++) {
    const raw = await http.json<unknown>(`${section.origin}/careersection/rest/jobboard/searchjobs?lang=${section.lang}&portal=${portal}`, {
      body: searchBody(pageNo),
      headers: { "x-requested-with": "XMLHttpRequest" },
    });
    stats.pages++;
    const parsed = SearchResponse.safeParse(raw);
    if (!parsed.success) throw new Error("taleo: unexpected searchjobs response");
    const entries: Listed<TaleoRow>[] = [];
    for (const item of parsed.data.requisitionList ?? []) {
      const r = Requisition.safeParse(item);
      const row = r.success ? rowFromRequisition(r.data) : null;
      if (!row) {
        stats.invalidItems++;
        tctx.drift("taleo requisition", r.success ? "no title column" : r.error);
        continue;
      }
      const id = `${new URL(section.origin).hostname}:${row.contestNo}`;
      if (seen.has(id)) continue;
      seen.add(id);
      entries.push({ id, item: row });
    }
    stats.listed += entries.length;
    if (entries.length === 0) break;
    yield* resolveDetails(tctx, entries, budget, {
      fetchDetail: (row) => http.text(taleoJobUrl(section, row.contestNo), { throttleWaitsMs: [] }),
      toFull: (row, html) => {
        const description = taleoDescription(html);
        if (!description) {
          tctx.drift("taleo job page", "no initialHistory description");
          return null;
        }
        return taleoToRawJob(section, target, row, description, tctx.now);
      },
      toLight: (row) => taleoToRawJob(section, target, row, null, tctx.now),
    });
    const total = parsed.data.pagingData?.totalCount ?? null;
    const size = parsed.data.pagingData?.pageSize ?? 25;
    if ((total !== null && pageNo * size >= total) || samplingDone(tctx, budget)) break;
  }
}

export const taleoScraper: Scraper = {
  id: "taleo",
  name: "Oracle Taleo career section",
  kind: "ats",
  intervalMinutes: 240,
  handlesAts: ["taleo"],
  scrape: (ctx) => runTargets(ctx, { scraperId: "taleo", handlesAts: ["taleo"] }, scrapeTaleoTarget),
};
