/**
 * Ashby Posting API (public, documented: https://developers.ashbyhq.com/docs/public-job-posting-api)
 *   GET https://api.ashbyhq.com/posting-api/job-board/{token}?includeCompensation=true
 * One request returns the whole board. Unknown board → 404 "Not Found" (text).
 * Unlisted jobs (isListed:false) are skipped. Compensation is used only when the company displays it
 * (shouldDisplayCompensationOnJobPostings) and only its "Salary" components (not equity/bonus).
 * Ashby's own `isRemote` is true for EVERY Hybrid job (537/537 sampled), i.e. it means "not fully on-site";
 * we emit isRemote only for workplaceType Remote or when a listed location itself says "Remote".
 */
import type { CompanyTarget, JobType, RawJob, Salary, WorkMode } from "@easyjobs/contract";
import { UnexpectedResponseError } from "../core/errors";
import { getBoardJson } from "../core/http";
import { buildJob } from "../core/job";
import type { AtsAdapter } from "../core/types";
import { jobTypeFromLabel } from "../lib/hints";
import { withCountry } from "../lib/location";
import { makeSalary, periodFromInterval } from "../lib/salary";
import { clean, extraOf } from "../lib/text";
import { bareToken, tokenUrl } from "../lib/tokens";

export interface AshbyAddress {
  postalAddress?: { addressLocality?: string | null; addressRegion?: string | null; addressCountry?: string | null } | null;
}

export interface AshbyCompComponent {
  compensationType?: string | null;
  interval?: string | null;
  currencyCode?: string | null;
  minValue?: number | null;
  maxValue?: number | null;
  summary?: string | null;
}

export interface AshbyJob {
  id: string;
  title?: string | null;
  department?: string | null;
  team?: string | null;
  employmentType?: string | null;
  location?: string | null;
  secondaryLocations?: { location?: string | null; address?: AshbyAddress | null }[] | null;
  address?: AshbyAddress | null;
  publishedAt?: string | null;
  isListed?: boolean | null;
  isRemote?: boolean | null;
  workplaceType?: string | null;
  jobUrl?: string | null;
  applyUrl?: string | null;
  descriptionHtml?: string | null;
  descriptionPlain?: string | null;
  shouldDisplayCompensationOnJobPostings?: boolean | null;
  compensation?: {
    compensationTierSummary?: string | null;
    scrapeableCompensationSalarySummary?: string | null;
    compensationTiers?: { components?: AshbyCompComponent[] | null }[] | null;
    summaryComponents?: AshbyCompComponent[] | null;
  } | null;
}

export interface AshbyBoard {
  apiVersion?: string;
  jobs?: AshbyJob[];
}

const API = "https://api.ashbyhq.com/posting-api/job-board";

/** "openai" | "https://jobs.ashbyhq.com/openai" | "https://jobs.ashbyhq.com/openai/<jobId>" → "openai". */
export function ashbyToken(raw: string): string {
  const parsed = tokenUrl(raw, /(^|\.)ashbyhq\.com$/i);
  if (!parsed) return bareToken(raw);
  const parts = parsed.parts[0] === "posting-api" ? parsed.parts.slice(2) : parsed.parts;
  if (!parts[0]) throw new Error(`Cannot read an Ashby board name from "${raw}"`);
  return parts[0];
}

/**
 * Registry tokens are URL path segments and some are already percent-encoded (`Flock%20Safety`, P04): decode once
 * before encoding so they are not double-encoded to `%2520` (which the API answers as an unknown board).
 */
export const encodeAshbyToken = (token: string): string => {
  let decoded = token;
  try {
    decoded = decodeURIComponent(token);
  } catch {
    /* malformed % sequence — encode as-is */
  }
  return encodeURIComponent(decoded);
};

export const ashbyBoardUrl = (token: string): string => `${API}/${encodeAshbyToken(token)}?includeCompensation=true`;

const EMPLOYMENT: Record<string, JobType> = {
  fulltime: "full_time",
  parttime: "part_time",
  intern: "internship",
  contract: "contract",
  temporary: "temporary",
};
const WORKPLACE: Record<string, WorkMode> = { onsite: "onsite", remote: "remote", hybrid: "hybrid" };
const key = (v: unknown): string => clean(v)?.toLowerCase().replace(/[^a-z]/g, "") ?? "";

const placeWithCountry = (text: unknown, address: AshbyAddress | null | undefined): string | null =>
  withCountry(clean(text), address?.postalAddress?.addressCountry);

/** Salary components only; tiers merged into one min–max when currency and interval agree. */
export function ashbySalary(job: AshbyJob): Salary | null {
  if (job.shouldDisplayCompensationOnJobPostings === false) return null;
  const comp = job.compensation;
  if (!comp) return null;
  const components = (comp.summaryComponents?.length ? comp.summaryComponents : (comp.compensationTiers ?? []).flatMap((t) => t.components ?? []))
    .filter((c) => c.compensationType === "Salary" && c.currencyCode && periodFromInterval(c.interval));
  const first = components[0];
  if (!first) return null;
  const same = components.filter((c) => c.currencyCode === first.currencyCode && c.interval === first.interval);
  const mins = same.map((c) => c.minValue).filter((n): n is number => typeof n === "number" && n > 0);
  const maxs = same.map((c) => c.maxValue).filter((n): n is number => typeof n === "number" && n > 0);
  return makeSalary({
    min: mins.length > 0 ? Math.min(...mins) : null,
    max: maxs.length > 0 ? Math.max(...maxs) : null,
    currency: first.currencyCode,
    period: periodFromInterval(first.interval),
    raw: clean(comp.scrapeableCompensationSalarySummary) ?? clean(comp.compensationTierSummary),
  });
}

/** true for Remote jobs or a remote-flagged location; false for on-site/hybrid ones; undefined when unknown. */
export function ashbyIsRemote(job: AshbyJob, workMode: WorkMode | undefined): boolean | undefined {
  const texts = [job.location, ...(job.secondaryLocations ?? []).map((s) => s.location)];
  if (workMode === "remote" || texts.some((t) => /\bremote\b/i.test(t ?? ""))) return true;
  return workMode ? false : undefined;
}

export function mapAshbyJob(job: AshbyJob, target: CompanyTarget, token: string): RawJob | null {
  const workMode = WORKPLACE[key(job.workplaceType)];
  const salary = ashbySalary(job);
  const employmentType = clean(job.employmentType);
  const locations = [
    placeWithCountry(job.location, job.address),
    ...(job.secondaryLocations ?? []).map((s) => placeWithCountry(s.location, s.address)),
  ];
  return buildJob("ashby", target, {
    sourceJobId: job.id,
    title: job.title,
    url: clean(job.jobUrl) ?? `https://jobs.ashbyhq.com/${encodeAshbyToken(token)}/${encodeURIComponent(job.id)}`,
    locations,
    descriptionHtml: job.descriptionHtml,
    descriptionText: job.descriptionPlain,
    postedAt: job.publishedAt,
    department: clean(job.department) ?? clean(job.team),
    jobType: EMPLOYMENT[key(employmentType)] ?? jobTypeFromLabel(employmentType),
    employmentTypeRaw: employmentType,
    workMode,
    isRemote: ashbyIsRemote(job, workMode),
    salary,
    salaryRaw:
      job.shouldDisplayCompensationOnJobPostings === false
        ? null
        : (salary?.raw ?? clean(job.compensation?.compensationTierSummary)),
    extra: extraOf({
      team: clean(job.team),
      workplaceType: clean(job.workplaceType),
      compensationSummary:
        job.shouldDisplayCompensationOnJobPostings === false ? undefined : clean(job.compensation?.compensationTierSummary),
      applyFormUrl: clean(job.applyUrl),
    }),
  });
}

export const ashby: AtsAdapter = {
  id: "ashby",
  name: "Ashby",
  ats: "ashby",
  endpoint: `${API}/{token}?includeCompensation=true`,
  async *scrapeTarget(ctx) {
    const token = ashbyToken(ctx.target.token);
    const url = ashbyBoardUrl(token);
    const board = await getBoardJson<AshbyBoard>(ctx, url);
    if (!Array.isArray(board?.jobs)) throw new UnexpectedResponseError(url, "expected { jobs: [...] }");
    for (const job of board.jobs) {
      if (job.isListed === false) {
        ctx.skip("unlisted");
        continue;
      }
      const raw = mapAshbyJob(job, ctx.target, token);
      if (raw) yield raw;
      else ctx.skip("missing id/title/url");
    }
  },
};
