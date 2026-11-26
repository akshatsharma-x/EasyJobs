import type { RawJob } from "@easyjobs/contract";
import type { Logger, Scraper } from "@easyjobs/contract/node";
import { createDetailBudget, resolveDetails, samplingDone, type Listed } from "../lib/details";
import { envInt } from "../lib/env";
import { createSourceHttp, isGone, SourceError, statusOf, type SourceHttp } from "../lib/http";
import { countryNames } from "../lib/mapping";
import { extraString, overflowPolicy, runTargets, type TargetContext } from "../lib/run";
import {
  WORKDAY_RESULT_CAP,
  estimateTotal,
  flattenFacets,
  orderHintValues,
  pickHintFacet,
  pickPartitionFacet,
  selectCountryFacet,
  type AppliedFacets,
  type FlatFacet,
} from "./facets";
import { fullJob, lightJob, workdayJobId, type WorkdayAnnotations, type WorkdayListed } from "./parse";
import { WorkdayDetail, WorkdayListResponse, WorkdayPosting } from "./schema";
import { parseWorkdayToken, type WorkdaySite } from "./token";

/** Workday's CXS API rejects limit > 20 with HTTP 400. */
export const WORKDAY_PAGE_SIZE = 20;
const MAX_OFFSET = 10_000;
const MAX_PARTITION_DEPTH = 3;

export interface WorkdayPage {
  total: number;
  postings: WorkdayPosting[];
  facets: FlatFacet[];
}

export type FetchWorkdayPage = (applied: AppliedFacets, offset: number) => Promise<WorkdayPage>;

export function createPageFetcher(http: SourceHttp, site: WorkdaySite, tctx: TargetContext): FetchWorkdayPage {
  return async (applied, offset) => {
    const raw = await http.json<unknown>(`${site.apiBase}/jobs`, {
      body: { appliedFacets: applied, limit: WORKDAY_PAGE_SIZE, offset, searchText: "" },
    });
    const parsed = WorkdayListResponse.safeParse(raw);
    if (!parsed.success) throw new SourceError(`workday: unexpected list response from ${site.apiBase}/jobs`, `${site.apiBase}/jobs`, 200);
    tctx.stats.pages++;
    const postings: WorkdayPosting[] = [];
    for (const item of parsed.data.jobPostings ?? []) {
      const p = WorkdayPosting.safeParse(item);
      if (p.success) postings.push(p.data);
      else {
        tctx.stats.invalidItems++;
        tctx.drift("job posting", p.error);
      }
    }
    return { total: parsed.data.total ?? 0, postings, facets: flattenFacets(parsed.data.facets) };
  };
}

/**
 * One listing segment (a set of applied facets), newest first. Handles the quirks seen live:
 * total only on the first page (0 afterwards) for some tenants, and a 2000-result cap where
 * offsets ≥ 2000 wrap to page 1 — capped segments are split by a facet, wrap-around stops paging.
 */
export async function* listSegment(
  fetchPage: FetchWorkdayPage,
  applied: AppliedFacets,
  annotations: WorkdayAnnotations,
  log: Logger,
  depth = 0,
  firstPage: WorkdayPage | null = null,
): AsyncGenerator<WorkdayListed[]> {
  const p0 = firstPage ?? (await fetchPage(applied, 0));
  const estimated = estimateTotal(p0.facets, p0.total);
  const capped = p0.total >= WORKDAY_RESULT_CAP && (estimated > p0.total || p0.total === WORKDAY_RESULT_CAP);
  if (capped && depth < MAX_PARTITION_DEPTH) {
    const part = pickPartitionFacet(p0.facets, applied, estimated);
    if (part) {
      log.debug(`workday: ${p0.total}+ results (≈${estimated}); splitting by ${part.param}`, { values: part.values.length });
      for (const v of part.values.filter((x) => x.count > 0)) {
        yield* listSegment(
          fetchPage,
          { ...applied, [part.param]: [v.id] },
          { ...annotations, facets: { ...annotations.facets, [part.descriptor || part.param]: v.descriptor } },
          log,
          depth + 1,
        );
      }
      return;
    }
    log.warn(`workday: result cap hit (≈${estimated} jobs) and no facet to split by — listing is truncated at ${WORKDAY_RESULT_CAP}`);
  }
  const seen = new Set<string>();
  let total = p0.total;
  let page = p0;
  let offset = 0;
  for (;;) {
    const fresh = page.postings.filter((p) => !seen.has(p.externalPath));
    if (page.postings.length > 0 && fresh.length === 0) break; // wrapped around past the cap
    for (const p of fresh) seen.add(p.externalPath);
    if (fresh.length > 0) yield fresh.map((posting) => ({ posting, annotations }));
    offset += WORKDAY_PAGE_SIZE;
    const knownTotal = total > 0;
    if (page.postings.length === 0 || offset >= MAX_OFFSET) break;
    if (knownTotal ? offset >= total : page.postings.length < WORKDAY_PAGE_SIZE) break;
    page = await fetchPage(applied, offset);
    total = Math.max(total, page.total);
  }
}

/**
 * Whole listing. When the tenant exposes a complete worker-type facet ("Job Type": Regular /
 * Intern (Fixed Term) / New College Graduate …) the listing is partitioned by it, which costs a
 * few extra first-page requests but tags every job with a structured internship/new-grad hint.
 */
export async function* listWorkday(fetchPage: FetchWorkdayPage, base: AppliedFacets, first: WorkdayPage, log: Logger): AsyncGenerator<WorkdayListed[]> {
  const hint = pickHintFacet(first.facets, first.total, base);
  if (!hint) {
    yield* listSegment(fetchPage, base, {}, log, 0, first);
    return;
  }
  for (const v of orderHintValues(hint.values)) {
    yield* listSegment(fetchPage, { ...base, [hint.param]: [v.id] }, { workerSubType: v.descriptor }, log, 1);
  }
}

export async function* scrapeWorkdayTarget(tctx: TargetContext): AsyncGenerator<RawJob> {
  const { target, env, log, stats } = tctx;
  const site = parseWorkdayToken(target.token);
  const http = createSourceHttp(tctx.http, {
    // One gate for ALL tenants: Workday's Cloudflare edge challenges per client IP across every
    // *.myworkdayjobs.com host (observed live), so per-tenant limits alone are not enough.
    limiterKey: "workday",
    concurrency: Math.min(2, envInt(env, "WORKDAY_CONCURRENCY", 1, 1)),
    gapMs: Math.max(400, envInt(env, "WORKDAY_DELAY_MS", 3000)),
    timeoutMs: envInt(env, "WORKDAY_TIMEOUT_MS", 25_000, 1000),
    robots: true,
    throttleWaitsMs: [30_000, 90_000],
    signal: tctx.signal,
    log,
    cache: tctx.cache,
  });
  const maxDetails = envInt(env, "WORKDAY_MAX_DETAILS", 300);
  const budget = createDetailBudget(tctx.limit !== undefined ? Math.min(maxDetails, tctx.limit) : maxDetails, overflowPolicy(env, "WORKDAY_OVERFLOW"));
  const fetchPage = createPageFetcher(http, site, tctx);

  let first: WorkdayPage;
  try {
    first = await fetchPage({}, 0);
  } catch (e) {
    const s = statusOf(e);
    if (isGone(e) || s === 422) {
      log.warn(`workday: career site not found (HTTP ${s}) — finishing with 0 jobs; check the registry token`, { token: target.token });
      return;
    }
    throw e;
  }

  let base: AppliedFacets = {};
  // extra.workdayCountry (prompt) or the generic extra.country used by the other adapters.
  const country = extraString(target, "workdayCountry") ?? extraString(target, "country");
  if (country) {
    const sel = selectCountryFacet(first.facets, countryNames(country));
    if (sel) {
      base = { [sel.param]: sel.ids };
      log.info(`workday: country filter "${country}" via ${sel.param}`, { values: sel.labels.slice(0, 8), approxJobs: sel.count });
      first = await fetchPage(base, 0);
    } else {
      log.warn(`workday: no location facet value matches "${country}" — listing all jobs`);
    }
  }

  const seen = new Set<string>();
  for await (const batch of listWorkday(fetchPage, base, first, log)) {
    const entries: Listed<WorkdayListed>[] = [];
    for (const item of batch) {
      const id = workdayJobId(site.tenant, item.posting.externalPath);
      if (seen.has(id)) continue;
      seen.add(id);
      entries.push({ id, item });
    }
    stats.listed += entries.length;
    yield* resolveDetails(tctx, entries, budget, {
      // Fail fast on throttling: the budget's circuit breaker defers the rest to the next run.
      fetchDetail: (item) => http.json<unknown>(`${site.apiBase}${item.posting.externalPath}`, { throttleWaitsMs: [] }),
      toFull: (item, raw) => {
        const d = WorkdayDetail.safeParse(raw);
        if (!d.success) {
          tctx.drift("job detail", d.error);
          return null;
        }
        return fullJob(site, target, item, d.data, tctx.now);
      },
      toLight: (item) => lightJob(site, target, item, tctx.now, !tctx.isKnown(workdayJobId(site.tenant, item.posting.externalPath))),
    });
    if (samplingDone(tctx, budget)) break;
  }
}

export const workdayScraper: Scraper = {
  id: "workday",
  name: "Workday",
  kind: "ats",
  intervalMinutes: 60,
  handlesAts: ["workday"],
  scrape: (ctx) => runTargets(ctx, { scraperId: "workday", handlesAts: ["workday"] }, scrapeWorkdayTarget),
};
