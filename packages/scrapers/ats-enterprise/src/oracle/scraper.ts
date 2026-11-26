import type { RawJob } from "@easyjobs/contract";
import type { Scraper } from "@easyjobs/contract/node";
import { createDetailBudget, resolveDetails, samplingDone, type Listed } from "../lib/details";
import { envInt } from "../lib/env";
import { createSourceHttp, isGone, SourceError, type SourceHttp } from "../lib/http";
import { countryNames, isCountryLabel } from "../lib/mapping";
import { extraString, overflowPolicy, runTargets, type TargetContext } from "../lib/run";
import { fullJob, lightJob, oracleJobId } from "./parse";
import { OracleDetail, OracleDetailResponse, OracleListResponse, OracleLocationFacet, OracleRequisition } from "./schema";
import { parseOracleToken, siteFromCanonical, siteFromPage, type OracleSite } from "./token";

export const ORACLE_PAGE_SIZE = 25;
const MAX_OFFSET = 20_000;
const REST = "/hcmRestApi/resources/latest";

const siteCache = new Map<string, OracleSite>();

/** Token → site. Canonical oraclecloud URLs need no request; vanity domains are resolved from the page once per process. */
export async function resolveOracleSite(token: string, http: SourceHttp, overrides: { siteNumber?: string; apiBase?: string }): Promise<OracleSite> {
  const parts = parseOracleToken(token);
  if (overrides.apiBase && (overrides.siteNumber ?? parts.siteCode)) {
    const apiBase = new URL(overrides.apiBase).origin;
    const siteNumber = overrides.siteNumber ?? (parts.siteCode as string);
    const publicBase = parts.canonical
      ? `${apiBase}/hcmUI/CandidateExperience/${parts.lang}/sites/${siteNumber}`
      : `${parts.url.origin}/${parts.lang}/sites/${parts.siteCode ?? siteNumber}`;
    return { apiBase, siteNumber, lang: parts.lang, publicBase, pod: new URL(apiBase).hostname.split(".")[0] ?? "oracle" };
  }
  if (parts.canonical) return siteFromCanonical(parts);
  const cached = siteCache.get(token);
  if (cached) return cached;
  const page = await http.page(parts.url.toString());
  const site = siteFromPage(page.text, page.url, parts);
  if (!site) throw new SourceError(`oracle: ${token} is not an Oracle CX site (no data-apibaseurl on the page)`, token, page.status);
  siteCache.set(token, site);
  return site;
}

export const listUrl = (site: OracleSite, offset: number, locationFacetId?: string): string =>
  `${site.apiBase}${REST}/recruitingCEJobRequisitions?onlyData=true&expand=requisitionList.secondaryLocations` +
  `&finder=findReqs;siteNumber=${site.siteNumber},limit=${ORACLE_PAGE_SIZE},offset=${offset},sortBy=POSTING_DATES_DESC` +
  (locationFacetId ? `,selectedLocationsFacet=${locationFacetId}` : "");

export const detailUrl = (site: OracleSite, id: string): string =>
  `${site.apiBase}${REST}/recruitingCEJobRequisitionDetails?expand=all&onlyData=true&finder=ById;Id="${id}",siteNumber=${site.siteNumber}`;

interface OraclePage {
  total: number;
  requisitions: OracleRequisition[];
  locationFacets: { Id: string; Name: string; TotalCount?: number | null }[];
}

export async function* scrapeOracleTarget(tctx: TargetContext): AsyncGenerator<RawJob> {
  const { target, env, log, stats } = tctx;
  const http = createSourceHttp(tctx.http, {
    limiterKey: `oracle:${new URL(target.token).host}`,
    concurrency: 2,
    gapMs: Math.max(400, envInt(env, "ORACLE_DELAY_MS", 600)),
    timeoutMs: envInt(env, "ORACLE_TIMEOUT_MS", 30_000, 1000),
    robots: true,
    throttleWaitsMs: [20_000, 60_000],
    signal: tctx.signal,
    log,
    cache: tctx.cache,
  });
  const site = await resolveOracleSite(target.token, http, {
    siteNumber: extraString(target, "oracleSiteNumber"),
    apiBase: extraString(target, "oracleApiBase"),
  });
  // REST host may differ from the token host (vanity domains): give it its own politeness slot.
  const api = site.apiBase === new URL(target.token).origin
    ? http
    : createSourceHttp(tctx.http, {
        limiterKey: `oracle:${new URL(site.apiBase).host}`,
        concurrency: 2,
        gapMs: Math.max(400, envInt(env, "ORACLE_DELAY_MS", 600)),
        timeoutMs: envInt(env, "ORACLE_TIMEOUT_MS", 30_000, 1000),
        robots: true,
        throttleWaitsMs: [20_000, 60_000],
        signal: tctx.signal,
        log,
        cache: tctx.cache,
      });
  const maxDetails = envInt(env, "ORACLE_MAX_DETAILS", 300);
  const budget = createDetailBudget(tctx.limit !== undefined ? Math.min(maxDetails, tctx.limit) : maxDetails, overflowPolicy(env, "ORACLE_OVERFLOW"));

  const fetchPage = async (offset: number, facetId?: string): Promise<OraclePage> => {
    const raw = await api.json<unknown>(listUrl(site, offset, facetId));
    const parsed = OracleListResponse.safeParse(raw);
    if (!parsed.success) throw new SourceError(`oracle: unexpected list response for site ${site.siteNumber}`, listUrl(site, offset), 200);
    stats.pages++;
    const search = parsed.data.items?.[0];
    const requisitions: OracleRequisition[] = [];
    for (const item of search?.requisitionList ?? []) {
      const r = OracleRequisition.safeParse(item);
      if (r.success) requisitions.push(r.data);
      else {
        stats.invalidItems++;
        tctx.drift("requisition", r.error);
      }
    }
    const locationFacets = (search?.locationsFacet ?? []).flatMap((f) => {
      const p = OracleLocationFacet.safeParse(f);
      return p.success ? [p.data] : [];
    });
    return { total: search?.TotalJobsCount ?? 0, requisitions, locationFacets };
  };

  let first: OraclePage;
  try {
    first = await fetchPage(0);
  } catch (e) {
    if (isGone(e)) {
      log.warn("oracle: site not found — finishing with 0 jobs; check the registry token", { token: target.token });
      return;
    }
    throw e;
  }

  // Optional country mode (extra.country, e.g. "IN") through the site's location facet.
  let facetId: string | undefined;
  const country = extraString(target, "country") ?? extraString(target, "oracleCountry");
  if (country) {
    const c = countryNames(country);
    const hit = first.locationFacets.find((f) => isCountryLabel(f.Name, c));
    if (hit) {
      facetId = hit.Id;
      log.info(`oracle: country filter "${country}" → location facet ${hit.Name}`, { approxJobs: hit.TotalCount });
      first = await fetchPage(0, facetId);
    } else log.warn(`oracle: no location facet for "${country}" — listing all jobs`);
  }

  const seen = new Set<string>();
  let page = first;
  let offset = 0;
  let total = first.total;
  for (;;) {
    const entries: Listed<OracleRequisition>[] = [];
    for (const r of page.requisitions) {
      const id = oracleJobId(site, r.Id);
      if (seen.has(id)) continue;
      seen.add(id);
      entries.push({ id, item: r });
    }
    stats.listed += entries.length;
    yield* resolveDetails(tctx, entries, budget, {
      fetchDetail: (r) => api.json<unknown>(detailUrl(site, r.Id), { throttleWaitsMs: [] }),
      toFull: (r, raw) => {
        const env = OracleDetailResponse.safeParse(raw);
        const item = env.success ? env.data.items?.[0] : undefined;
        const d = OracleDetail.safeParse(item);
        if (!d.success) {
          tctx.drift("requisition detail", d.error);
          return null;
        }
        return fullJob(site, target, r, d.data, tctx.now);
      },
      toLight: (r) => lightJob(site, target, r, tctx.now),
    });
    offset += ORACLE_PAGE_SIZE;
    if (page.requisitions.length === 0 || offset >= total || offset >= MAX_OFFSET || samplingDone(tctx, budget)) break;
    page = await fetchPage(offset, facetId);
    total = Math.max(total, page.total);
  }
}

export const oracleScraper: Scraper = {
  id: "oracle",
  name: "Oracle Recruiting Cloud",
  kind: "ats",
  intervalMinutes: 60,
  handlesAts: ["oracle"],
  scrape: (ctx) => runTargets(ctx, { scraperId: "oracle", handlesAts: ["oracle"] }, scrapeOracleTarget),
};
