/**
 * TCS — iBegin "next" (https://ibegin.tcsapps.com/candidate/next/). DISABLED.
 *
 * The old hosts ibegin.tcs.com / nextstep.tcs.com no longer resolve (NXDOMAIN on public DNS);
 * tcs.com/careers/india now links to ibegin.tcsapps.com. Its Angular app calls
 *
 *   POST https://ibegin.tcsapps.com/candidate/next/api/en-IN/search/jobs
 *   {"includeRegularJob":true,"includeWalkIn":true,"searchTerms":[],"jobLocationFilters":[],"jobDomainFilters":[],
 *    "experienceLevelFilters":[],"skillFilters":[],"relevancySortOrder":null,"recentSortOrder":"desc",
 *    "lastDateToApplySortOrder":null,"page":1,"resultsPerPage":10}
 *   → { result, status, payload: { totalElements, totalPages, last, facets{locations,domains,experiences,skills},
 *        content: [{ id "376658J", title, location, domain, minimumExperienceInYears, maximumExperienceInYears,
 *                    applyBy, skills[], walkIn }] } }
 *
 * …but only with an F5 BIG-IP ASM bot-defence cookie (TS0194f401…) and a per-session
 * `next-xsrf-token` header set up by the app; without them the API answers 403 "You don't have
 * permission to access this resource." Harvesting session/anti-bot tokens is out of bounds, so the
 * scraper is disabled. The parser below is written against a response the page loaded in a real
 * browser during discovery, so it is ready if TCS ever exposes the search without those tokens.
 * (www.tcs.com/careers also returns 403 to the bot UA.)
 */
import type { RawJob } from "@easyjobs/contract";
import {
  buildRawJob, defineCareerSite, detectJobType, maxPagesFrom, pageSizeFrom, paginate, postJson, toIsoDate, uniqueStrings,
  titleCase, type CompanyInfo, type SiteContext
} from "../lib";

export interface TcsJob {
  id: string;
  title: string;
  location?: string | null;
  domain?: string | null;
  minimumExperienceInYears?: number | null;
  maximumExperienceInYears?: number | null;
  applyBy?: string | null;
  skills?: string[] | null;
  walkIn?: boolean | null;
}

export interface TcsSearchResponse {
  result: boolean;
  status: number;
  message?: string;
  payload?: { content: TcsJob[]; totalElements: number; totalPages: number; last: boolean } | null;
}

export const TCS: CompanyInfo = {
  slug: "tcs",
  name: "Tata Consultancy Services",
  domain: "tcs.com",
  careersUrl: "https://ibegin.tcsapps.com/candidate/next/",
};

export const TCS_DISABLED_REASON =
  "iBegin's job-search API (ibegin.tcsapps.com/candidate/next/api/…/search/jobs) requires an F5 BIG-IP ASM bot-defence cookie " +
  "and a per-session next-xsrf-token; without them it returns 403. We don't harvest session/anti-bot tokens. " +
  "The old ibegin.tcs.com / nextstep.tcs.com hosts are NXDOMAIN, and www.tcs.com/careers returns 403 to the bot UA.";

const API = "https://ibegin.tcsapps.com/candidate/next/api/en-IN/search/jobs";

export function tcsSearchBody(page: number, size: number): Record<string, unknown> {
  return {
    includeRegularJob: true, includeWalkIn: true, searchTerms: [], jobLocationFilters: [], jobDomainFilters: [],
    experienceLevelFilters: [], skillFilters: [], relevancySortOrder: null, recentSortOrder: "desc",
    lastDateToApplySortOrder: null, page, resultsPerPage: size,
  };
}

/** Job page per the app's route table (`:locale/jobs/:id`). */
export const tcsJobUrl = (id: string): string => `https://ibegin.tcsapps.com/candidate/next/en-IN/jobs/${encodeURIComponent(id)}`;


export function mapTcsJob(job: TcsJob): RawJob {
  const min = job.minimumExperienceInYears ?? null;
  const max = job.maximumExperienceInYears ?? null;
  const url = tcsJobUrl(job.id);
  return buildRawJob(TCS, {
    sourceJobId: job.id,
    title: job.title,
    sourceUrl: url,
    applyUrl: url,
    locations: job.location ? [`${job.location}, India`] : [],
    descriptionHtml: null,
    postedAt: null,
    validThrough: toIsoDate(job.applyBy),
    department: job.domain ? titleCase(job.domain) : null,
    jobType: detectJobType({ title: job.title }),
    experienceMin: min,
    experienceMax: max,
    experienceRaw: min !== null && max !== null ? `${min}-${max} years` : null,
    skills: uniqueStrings((job.skills ?? []).flatMap((s) => s.split(/\s*,\s*/))),
    tags: job.walkIn ? ["walk-in"] : [],
  });
}

export const tcs = defineCareerSite<TcsJob>({
  company: TCS,
  name: "TCS iBegin",
  intervalMinutes: 60,
  endpointType: "json (POST search/jobs) — needs session/anti-bot tokens",
  disabledReason: TCS_DISABLED_REASON,
  async *list(ctx: SiteContext) {
    const size = pageSizeFrom(ctx.env, 50, 50);
    yield* paginate<TcsJob>({
      onTruncated: (reason) => ctx.markIncomplete?.(reason),
      pageSize: size,
      maxPages: maxPagesFrom(ctx.env, 60),
      signal: ctx.signal,
      idOf: (j) => j.id,
      fetchPage: async (i) => {
        const res = await postJson<TcsSearchResponse>(ctx.http, API, tcsSearchBody(i + 1, size));
        if (!res.result || !res.payload) throw new Error(`search failed: ${res.status} ${res.message ?? ""}`);
        ctx.reportTotal(res.payload.totalElements);
        return { items: res.payload.content ?? [], total: res.payload.totalElements, hasMore: !res.payload.last };
      },
    });
  },
  idOf: (j) => j.id,
  toRawJob: (j) => mapTcsJob(j),
});
