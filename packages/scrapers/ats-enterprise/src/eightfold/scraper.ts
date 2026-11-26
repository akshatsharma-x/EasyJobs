import type { RawJob } from "@easyjobs/contract";
import type { Scraper } from "@easyjobs/contract/node";
import { HttpError } from "@easyjobs/contract/node";
import { createDetailBudget, resolveDetails, samplingDone, type Listed } from "../lib/details";
import { envInt } from "../lib/env";
import { createSourceHttp, isGone, SourceError, statusOf, type SourceHttp } from "../lib/http";
import { countryNames } from "../lib/mapping";
import { extraString, overflowPolicy, runTargets, type TargetContext } from "../lib/run";
import { eightfoldJobId, fromPcsx, fromV2, parseEightfoldToken, toRawJob, type EfPosition, type EightfoldApi, type EightfoldSite } from "./parse";
import { EfPcsxDetail, EfPcsxList, EfPcsxPosition, EfV2List, EfV2Position } from "./schema";

/** Both API generations ignore num > 10. */
export const EIGHTFOLD_PAGE_SIZE = 10;
const MAX_START = 10_000;

/** Which API generation a host speaks — detected once per process. */
const apiCache = new Map<string, EightfoldApi>();

export const v2ListUrl = (site: EightfoldSite, start: number, location?: string): string =>
  `${site.origin}/api/apply/v2/jobs?domain=${encodeURIComponent(site.domain)}&start=${start}&num=${EIGHTFOLD_PAGE_SIZE}&sort_by=timestamp` +
  (location ? `&location=${encodeURIComponent(location)}` : "");
export const v2DetailUrl = (site: EightfoldSite, id: string): string =>
  `${site.origin}/api/apply/v2/jobs/${encodeURIComponent(id)}?domain=${encodeURIComponent(site.domain)}`;
export const pcsxListUrl = (site: EightfoldSite, start: number, location?: string): string =>
  `${site.origin}/api/pcsx/search?domain=${encodeURIComponent(site.domain)}&query=&location=${encodeURIComponent(location ?? "")}&start=${start}&sort_by=timestamp`;
export const pcsxDetailUrl = (site: EightfoldSite, id: string): string =>
  `${site.origin}/api/pcsx/position_details?position_id=${encodeURIComponent(id)}&domain=${encodeURIComponent(site.domain)}&hl=en`;

/** 403 bodies that tell which generation the tenant is on. */
export function apiHint(e: unknown): EightfoldApi | null {
  if (!(e instanceof HttpError) || e.status !== 403) return null;
  if (/not authorized for pcsx/i.test(e.body)) return "pcsx";
  if (/pcsx is not enabled/i.test(e.body)) return "v2";
  return null;
}

interface EfPage {
  count: number;
  positions: EfPosition[];
}

function parseList(api: EightfoldApi, site: EightfoldSite, raw: unknown, tctx: TargetContext): EfPage {
  const out: EfPosition[] = [];
  if (api === "v2") {
    const list = EfV2List.safeParse(raw);
    if (!list.success) throw new SourceError("eightfold: unexpected v2 list response", site.origin, 200);
    for (const item of list.data.positions ?? []) {
      const p = EfV2Position.safeParse(item);
      if (p.success) out.push(fromV2(site, p.data));
      else {
        tctx.stats.invalidItems++;
        tctx.drift("position", p.error);
      }
    }
    return { count: list.data.count ?? 0, positions: out };
  }
  const search = EfPcsxList.safeParse(raw);
  if (!search.success) throw new SourceError("eightfold: unexpected pcsx search response", site.origin, 200);
  for (const item of search.data.data.positions ?? []) {
    const p = EfPcsxPosition.safeParse(item);
    if (p.success) out.push(fromPcsx(site, p.data));
    else {
      tctx.stats.invalidItems++;
      tctx.drift("position", p.error);
    }
  }
  return { count: search.data.data.count ?? 0, positions: out };
}

/** First page + API generation: explicit extra.eightfoldApi → cached → try v2, switch on the 403 hint. */
async function firstPage(http: SourceHttp, site: EightfoldSite, tctx: TargetContext, location?: string): Promise<{ api: EightfoldApi; page: EfPage }> {
  const key = `${site.origin}|${site.domain}`;
  const forced = extraString(tctx.target, "eightfoldApi");
  const preferred: EightfoldApi = forced === "pcsx" || forced === "v2" ? forced : (apiCache.get(key) ?? "v2");
  const fetchAs = async (api: EightfoldApi): Promise<EfPage> =>
    parseList(api, site, await http.json<unknown>(api === "v2" ? v2ListUrl(site, 0, location) : pcsxListUrl(site, 0, location)), tctx);
  try {
    const page = await fetchAs(preferred);
    apiCache.set(key, preferred);
    return { api: preferred, page };
  } catch (e) {
    const hint = apiHint(e);
    if (!hint || hint === preferred) throw e;
    tctx.log.info(`eightfold: ${site.origin} uses the ${hint} API`);
    const page = await fetchAs(hint);
    apiCache.set(key, hint);
    return { api: hint, page };
  }
}

export async function* scrapeEightfoldTarget(tctx: TargetContext): AsyncGenerator<RawJob> {
  const { target, env, log, stats } = tctx;
  const site = parseEightfoldToken(target.token, target.domain);
  const http = createSourceHttp(tctx.http, {
    // Eightfold throttles per client across tenants (observed live), so all tenants share one gate.
    limiterKey: "eightfold",
    concurrency: 1,
    gapMs: Math.max(400, envInt(env, "EIGHTFOLD_DELAY_MS", 2500)),
    // Cold responses took 6–27 s when verified.
    timeoutMs: envInt(env, "EIGHTFOLD_TIMEOUT_MS", 60_000, 1000),
    robots: true,
    // Eightfold's 429s are often transient (seconds); escalate only if they persist.
    throttleWaitsMs: [5_000, 30_000, 90_000],
    signal: tctx.signal,
    log,
    cache: tctx.cache,
  });
  const maxDetails = envInt(env, "EIGHTFOLD_MAX_DETAILS", 100);
  const budget = createDetailBudget(tctx.limit !== undefined ? Math.min(maxDetails, tctx.limit) : maxDetails, overflowPolicy(env, "EIGHTFOLD_OVERFLOW"), 1);
  const countryRaw = extraString(target, "country") ?? extraString(target, "eightfoldLocation");
  const location = countryRaw ? (countryRaw.length === 2 ? (countryNames(countryRaw).names.find((n) => n.length > 3) ?? countryRaw) : countryRaw) : undefined;

  let api: EightfoldApi;
  let page: EfPage;
  try {
    ({ api, page } = await firstPage(http, site, tctx, location));
  } catch (e) {
    if (isGone(e)) {
      log.warn(`eightfold: no job board at ${site.origin} for ${site.domain} (HTTP ${statusOf(e)}) — finishing with 0 jobs`);
      return;
    }
    throw e;
  }
  if (location) log.info(`eightfold: location filter "${location}"`, { count: page.count });

  const fetchDetail = async (p: EfPosition): Promise<EfPosition | null> => {
    if (api === "v2") {
      const d = EfV2Position.safeParse(await http.json<unknown>(v2DetailUrl(site, p.id), { throttleWaitsMs: [5_000, 15_000] }));
      if (!d.success) {
        tctx.drift("position detail", d.error);
        return null;
      }
      return fromV2(site, d.data);
    }
    const wrapped = EfPcsxDetail.safeParse(await http.json<unknown>(pcsxDetailUrl(site, p.id), { throttleWaitsMs: [5_000, 15_000] }));
    const d = EfPcsxPosition.safeParse(wrapped.success ? wrapped.data.data : undefined);
    if (!d.success) {
      tctx.drift("position detail", d.error);
      return null;
    }
    return fromPcsx(site, d.data);
  };

  const seen = new Set<string>();
  let start = 0;
  let count = page.count;
  stats.pages++;
  for (;;) {
    const entries: Listed<EfPosition>[] = [];
    for (const p of page.positions) {
      const id = eightfoldJobId(site, p.id);
      if (seen.has(id)) continue;
      seen.add(id);
      entries.push({ id, item: p });
    }
    stats.listed += entries.length;
    yield* resolveDetails(tctx, entries, budget, {
      fetchDetail,
      toFull: (p, d) => (d ? toRawJob(site, target, p, d, tctx.now) : null),
      toLight: (p) => toRawJob(site, target, p, null, tctx.now),
    });
    start += EIGHTFOLD_PAGE_SIZE;
    if (page.positions.length === 0 || start >= count || start >= MAX_START || samplingDone(tctx, budget)) break;
    page = parseList(api, site, await http.json<unknown>(api === "v2" ? v2ListUrl(site, start, location) : pcsxListUrl(site, start, location)), tctx);
    stats.pages++;
    count = Math.max(count, page.count);
  }
}

export const eightfoldScraper: Scraper = {
  id: "eightfold",
  name: "Eightfold",
  kind: "ats",
  intervalMinutes: 60,
  handlesAts: ["eightfold"],
  scrape: (ctx) => runTargets(ctx, { scraperId: "eightfold", handlesAts: ["eightfold"], budgetMinutes: 30 }, scrapeEightfoldTarget),
};
