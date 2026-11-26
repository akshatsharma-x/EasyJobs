import type { RawJob } from "@easyjobs/contract";
import type { ScrapeContext, Scraper } from "@easyjobs/contract/node";
import { htmlToPlain, stripInline } from "../lib/html";
import { fetchJson } from "../lib/http";
import { assessRemote, remoteHints } from "../lib/region";
import { makeSalary } from "../lib/salary";
import { jobTypeFrom, levelFrom, lowestLevel } from "../lib/taxonomy";
import { cleanList, envInt, envStr, httpUrl, isDisabledByEnv, pause, prune, reachedLimit, textOrNull, toIso } from "../lib/util";

export interface HimalayasJob {
  title?: string;
  excerpt?: string;
  companyName?: string;
  companySlug?: string;
  companyLogo?: string | null;
  employmentType?: string;
  minSalary?: number | null;
  maxSalary?: number | null;
  salaryPeriod?: string | null;
  currency?: string | null;
  seniority?: string[];
  locationRestrictions?: string[];
  timezoneRestrictions?: number[];
  categories?: string[];
  parentCategories?: string[];
  description?: string;
  pubDate?: number;
  expiryDate?: number;
  applicationLink?: string;
  guid?: string;
}

export interface HimalayasResponse {
  totalCount?: number;
  limit?: number;
  jobs?: HimalayasJob[];
}

/** Himalayas API terms: Apply = applicationLink unchanged, visible link to Himalayas, no Google Jobs / JobPosting re-syndication, drop expired jobs. */
export const HIMALAYAS_TERMS = { linkBackRequired: true, applyUrlUnchanged: true, noJobPostingSchema: true, noThirdPartySyndication: true, removeWhenExpired: true };

/** Stable id from the guid ("…/companies/acme/jobs/backend-engineer" → "acme/jobs/backend-engineer"). */
export function himalayasId(guid: string): string {
  try {
    return new URL(guid).pathname.replace(/^\/companies\//, "").replace(/\/+$/, "") || guid;
  } catch {
    return guid;
  }
}

/** One Himalayas job → RawJob, or null when it is not open to India/anywhere. */
export function mapHimalayasJob(j: HimalayasJob): RawJob | null {
  const title = stripInline(j.title ?? "");
  const company = stripInline(j.companyName ?? "");
  const sourceUrl = httpUrl(j.guid);
  const applyUrl = httpUrl(j.applicationLink) ?? sourceUrl;
  if (!title || !company || !sourceUrl || !j.guid) return null;
  const restrictions = cleanList(j.locationRestrictions, 500);
  // An empty restriction list means worldwide on Himalayas.
  const verdict = assessRemote({
    locations: restrictions.length > 0 ? restrictions : ["Worldwide"],
    title,
    descriptionText: j.description ? htmlToPlain(j.description) : null,
  });
  if (!verdict.eligible) return null;
  const salary = makeSalary({ min: j.minSalary, max: j.maxSalary, currency: j.currency, period: j.salaryPeriod });
  const seniority = cleanList(j.seniority);
  return prune<RawJob>({
    source: "himalayas",
    sourceKind: "job_board",
    sourceJobId: himalayasId(j.guid),
    sourceUrl,
    target: null,
    // Terms: "Use the applicationLink for every Apply button, unchanged."
    applyUrl,
    title,
    company,
    descriptionHtml: textOrNull(j.description) ? (j.description as string) : null,
    postedAt: toIso(j.pubDate),
    companyLogoUrl: httpUrl(j.companyLogo),
    validThrough: toIso(j.expiryDate),
    department: textOrNull(j.parentCategories?.[0]),
    employmentTypeRaw: textOrNull(j.employmentType),
    salaryRaw: salary?.raw ?? null,
    jobType: jobTypeFrom(j.employmentType),
    experienceLevel: lowestLevel(seniority.map(levelFrom)),
    salary,
    ...remoteHints(verdict.scope),
    extra: prune({
      remoteScope: verdict.scope,
      seniority,
      categories: cleanList(j.categories),
      locationRestrictions: restrictions.length <= 12 ? restrictions : undefined,
      locationRestrictionCount: restrictions.length > 12 ? restrictions.length : undefined,
      timezoneRestrictions: j.timezoneRestrictions?.length ? j.timezoneRestrictions : undefined,
      companySlug: textOrNull(j.companySlug) ?? undefined,
      terms: HIMALAYAS_TERMS,
    }),
  });
}

export function himalayasSearchUrl(page: number, country: string): string {
  return `https://himalayas.app/jobs/api/search?country=${encodeURIComponent(country)}&sort=recent&page=${page}`;
}

async function* scrapeHimalayas(ctx: ScrapeContext): AsyncGenerator<RawJob> {
  const apiKey = envStr(ctx.env, "HIMALAYAS_API_KEY");
  const maxPages = envInt(ctx.env, "HIMALAYAS_MAX_PAGES", 10, 1, 400);
  const country = envStr(ctx.env, "HIMALAYAS_COUNTRY") ?? "IN";
  const headers: Record<string, string> = apiKey ? { authorization: `Bearer ${apiKey}` } : {};
  const sinceSec = ctx.since ? ctx.since.getTime() / 1000 : null;
  const seen = new Set<string>();
  let emitted = 0;
  for (let page = 1; page <= maxPages; page++) {
    if (page > 1) await pause(ctx, apiKey ? 1100 : 2000);
    // Search paging is documented ("keep requesting the next page"), though robots.txt pattern-blocks ?page= for crawlers.
    const body = await fetchJson<HimalayasResponse>(ctx, "himalayas", himalayasSearchUrl(page, country), { robots: false, headers }, { secrets: [apiKey] });
    const rows = body.jobs ?? [];
    for (const row of rows) {
      const job = mapHimalayasJob(row);
      if (!job || seen.has(job.sourceJobId)) continue;
      seen.add(job.sourceJobId);
      yield job;
      if (reachedLimit(ctx, ++emitted)) return;
    }
    // sort=recent (a few promoted jobs are pinned on top): stop once no job on the page is newer than the cutoff.
    const newest = Math.max(0, ...rows.map((r) => r.pubDate ?? 0));
    if (rows.length === 0 || (sinceSec !== null && newest < sinceSec)) break;
  }
}

export const himalayasScraper: Scraper = {
  id: "himalayas",
  name: "Himalayas",
  kind: "job_board",
  // "Responses are cached for an hour or more, so polling more often gains nothing."
  intervalMinutes: 180,
  attribution: "Jobs via Himalayas (https://himalayas.app)",
  isEnabled: (env) => !isDisabledByEnv(env, "himalayas"),
  scrape: scrapeHimalayas,
};
