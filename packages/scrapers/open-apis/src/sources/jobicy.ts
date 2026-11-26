import type { RawJob } from "@easyjobs/contract";
import type { ScrapeContext, Scraper } from "@easyjobs/contract/node";
import { htmlToPlain, stripInline } from "../lib/html";
import { fetchJson } from "../lib/http";
import { assessRemote, remoteHints } from "../lib/region";
import { makeSalary } from "../lib/salary";
import { jobTypeFrom, levelFrom } from "../lib/taxonomy";
import { cleanList, envInt, envList, httpUrl, isDisabledByEnv, pause, prune, reachedLimit, textOrNull, toIso } from "../lib/util";

export interface JobicyJob {
  id: number;
  url?: string;
  jobSlug?: string;
  jobTitle?: string;
  companyName?: string;
  companyLogo?: string | null;
  jobIndustry?: string[] | string;
  jobType?: string[] | string;
  jobGeo?: string;
  jobLevel?: string;
  jobExcerpt?: string;
  jobDescription?: string;
  pubDate?: string;
  salaryMin?: number | null;
  salaryMax?: number | null;
  salaryCurrency?: string | null;
  salaryPeriod?: string | null;
  /** v2 field names, kept for compatibility. */
  annualSalaryMin?: number | null;
  annualSalaryMax?: number | null;
}

export interface JobicyResponse {
  jobCount?: number;
  nextCursor?: string | null;
  hasMore?: boolean;
  jobs?: JobicyJob[];
}

/** Jobicy: credit Jobicy with a direct link; Apply buttons must go to the job URL in the feed. */
export const JOBICY_TERMS = { linkBackRequired: true, creditRequired: true, applyUrlUnchanged: true };

const asList = (v: string[] | string | undefined): string[] => cleanList(Array.isArray(v) ? v : v ? [v] : []).map(stripInline);

/** One Jobicy job → RawJob, or null when it is not open to India/anywhere. */
export function mapJobicyJob(j: JobicyJob): RawJob | null {
  const title = stripInline(j.jobTitle ?? "");
  const company = stripInline(j.companyName ?? "");
  const url = httpUrl(j.url);
  if (!j.id || !title || !company || !url) return null;
  const geo = stripInline(j.jobGeo ?? "");
  const verdict = assessRemote({
    locations: geo.split(",").map((s) => s.trim()),
    title,
    descriptionText: j.jobDescription ? htmlToPlain(j.jobDescription) : null,
  });
  if (!verdict.eligible) return null;
  const types = asList(j.jobType);
  const salary =
    makeSalary({ min: j.salaryMin, max: j.salaryMax, currency: j.salaryCurrency, period: j.salaryPeriod }) ??
    makeSalary({ min: j.annualSalaryMin, max: j.annualSalaryMax, currency: j.salaryCurrency ?? "USD", period: "year" });
  return prune<RawJob>({
    source: "jobicy",
    sourceKind: "job_board",
    sourceJobId: String(j.id),
    sourceUrl: url,
    target: null,
    // Terms: application buttons must use the job URL from the feed.
    applyUrl: url,
    title,
    company,
    descriptionHtml: textOrNull(j.jobDescription) ? (j.jobDescription as string) : null,
    postedAt: toIso(j.pubDate),
    companyLogoUrl: httpUrl(j.companyLogo),
    department: asList(j.jobIndustry)[0] ?? null,
    employmentTypeRaw: types.join(", ") || null,
    experienceRaw: textOrNull(j.jobLevel),
    salaryRaw: salary?.raw ?? null,
    jobType: jobTypeFrom(types[0]),
    experienceLevel: levelFrom(j.jobLevel),
    salary,
    ...remoteHints(verdict.scope, geo),
    extra: prune({ remoteScope: verdict.scope, jobGeo: geo || null, industries: asList(j.jobIndustry), terms: JOBICY_TERMS }),
  });
}

export function jobicyUrl(geo: string, count: number, cursor?: string | null): string {
  const params = new URLSearchParams({ count: String(count), geo });
  if (cursor) params.set("cursor", cursor);
  return `https://jobicy.com/api/jobs?${params.toString()}`;
}

async function* scrapeJobicy(ctx: ScrapeContext): AsyncGenerator<RawJob> {
  // No "india" geo exists; "anywhere" + "apac" cover roles open to India. The feed is a 7-day window.
  const geos = envList(ctx.env, "JOBICY_GEOS", ["anywhere", "apac"]);
  const maxPages = envInt(ctx.env, "JOBICY_MAX_PAGES", 5, 1, 50);
  const sinceMs = ctx.since?.getTime() ?? null;
  const seen = new Set<string>();
  let emitted = 0;
  let calls = 0;
  for (const geo of geos) {
    let cursor: string | null | undefined;
    for (let page = 0; page < maxPages; page++) {
      // Documented limit: at least 1 s between requests, including cursor pages.
      if (calls++ > 0) await pause(ctx, 1200);
      const body = await fetchJson<JobicyResponse>(ctx, "jobicy", jobicyUrl(geo, 100, cursor));
      const rows = body.jobs ?? [];
      for (const row of rows) {
        const job = mapJobicyJob(row);
        if (!job || seen.has(job.sourceJobId)) continue;
        seen.add(job.sourceJobId);
        yield job;
        if (reachedLimit(ctx, ++emitted)) return;
      }
      cursor = body.nextCursor;
      const newest = Math.max(0, ...rows.map((r) => Date.parse(r.pubDate ?? "") || 0));
      if (!cursor || rows.length === 0 || (sinceMs !== null && newest < sinceMs)) break;
    }
  }
}

export const jobicyScraper: Scraper = {
  id: "jobicy",
  name: "Jobicy",
  kind: "job_board",
  // New listings appear 3 h after publication; a few runs a day are plenty.
  intervalMinutes: 180,
  attribution: "Jobs via Jobicy (https://jobicy.com)",
  isEnabled: (env) => !isDisabledByEnv(env, "jobicy"),
  scrape: scrapeJobicy,
};
