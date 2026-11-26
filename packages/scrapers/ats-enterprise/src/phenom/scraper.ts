import type { CompanyTarget, ExperienceLevel, RawJob } from "@easyjobs/contract";
import type { Scraper } from "@easyjobs/contract/node";
import { z } from "zod";
import { toIso } from "../lib/dates";
import { createDetailBudget, resolveDetails, samplingDone, type Listed } from "../lib/details";
import { envInt } from "../lib/env";
import { absoluteUrl, cleanText, extractAssignedJson, normalizeDescriptionHtml } from "../lib/html";
import { compact, mapEmploymentType, mapWorkMode, uniqStrings } from "../lib/mapping";
import { extraString, overflowPolicy, runTargets, targetBase, type TargetContext } from "../lib/run";
import { pageHttp, scrapeByPages } from "../jsonld/scraper";
import { parseJobPage } from "../jsonld/page";

const s = z.string().nullish();

/** One job in phApp.ddo.eagerLoadRefineSearch.data.jobs (search page) or jobDetail.data.job (job page). */
export const PhenomJob = z.object({
  jobId: z.union([z.string().trim().min(1), z.number()]).transform(String),
  title: z.string().trim().min(1),
  reqId: s,
  jobSeqNo: s,
  type: s,
  employmentType: s,
  experienceLevel: s,
  category: s,
  jobFamily: s,
  location: s,
  // Strings on search pages, objects ({ location, latlong }) on job pages — normalized by locationsOf().
  multi_location: z.array(z.unknown()).nullish(),
  city: s,
  state: s,
  country: s,
  postedDate: s,
  dateCreated: s,
  jobPostingEndDate: s,
  applyUrl: s,
  descriptionTeaser: s,
  description: s,
  ml_skills: z.array(z.unknown()).nullish(),
  remote: z.unknown().optional(),
});
export type PhenomJob = z.infer<typeof PhenomJob>;

const SearchBlob = z.object({
  eagerLoadRefineSearch: z.object({
    totalHits: z.number().nullish(),
    hits: z.number().nullish(),
    data: z.object({ jobs: z.array(z.unknown()).nullish() }).nullish(),
  }),
});
const DetailBlob = z.object({ jobDetail: z.object({ data: z.object({ job: z.unknown() }) }) });

export interface PhenomSite {
  /** e.g. https://careers.adobe.com/us/en */
  base: string;
  host: string;
}

/** Phenom URLs are /{country}/{lang}/…; the token may omit the locale (the site redirects to it). */
export function phenomBaseFrom(url: string): string | null {
  const u = new URL(url);
  const segs = u.pathname.split("/").filter(Boolean);
  if (segs.length >= 2 && /^[a-z]{2,6}$/i.test(segs[0] ?? "") && /^[a-z]{2}(?:[_-][a-z]{2})?$/i.test(segs[1] ?? "")) return `${u.origin}/${segs[0]}/${segs[1]}`;
  return null;
}

export function parsePhenomSearch(html: string, tctx: Pick<TargetContext, "stats" | "drift">): { total: number; jobs: PhenomJob[] } | null {
  const blob = SearchBlob.safeParse(extractAssignedJson(html, "phApp.ddo"));
  if (!blob.success) return null;
  const jobs: PhenomJob[] = [];
  for (const item of blob.data.eagerLoadRefineSearch.data?.jobs ?? []) {
    const j = PhenomJob.safeParse(item);
    if (j.success) jobs.push(j.data);
    else {
      tctx.stats.invalidItems++;
      tctx.drift("phenom job", j.error);
    }
  }
  return { total: blob.data.eagerLoadRefineSearch.totalHits ?? 0, jobs };
}

export function parsePhenomDetail(html: string): PhenomJob | null {
  const blob = DetailBlob.safeParse(extractAssignedJson(html, "phApp.ddo"));
  if (!blob.success) return null;
  const j = PhenomJob.safeParse(blob.data.jobDetail.data.job);
  return j.success ? j.data : null;
}

const strOf = (v: unknown): string => {
  if (typeof v === "string") return v;
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    for (const k of ["location", "name", "cityStateCountry", "value"]) if (typeof o[k] === "string") return o[k] as string;
  }
  return "";
};

export function locationsOf(j: PhenomJob): string[] {
  const multi = uniqStrings((j.multi_location ?? []).map(strOf));
  return multi.length > 0 ? multi : uniqStrings([j.location ?? ""]);
}

/** Phenom job slugs: title with non-alphanumerics collapsed to "-". */
export const phenomJobUrl = (site: PhenomSite, j: PhenomJob): string =>
  `${site.base}/job/${encodeURIComponent(j.jobId)}/${j.title.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "")}`;

function levelHint(raw: string | null | undefined): ExperienceLevel | undefined {
  if (!raw) return undefined;
  if (/intern|student|co-?op|apprentice/i.test(raw)) return "intern";
  if (/graduate|new grad|campus|university|fresher|early career/i.test(raw)) return "fresher";
  if (/entry/i.test(raw)) return "entry";
  if (/executive|director|vice president|\bvp\b/i.test(raw)) return "executive";
  return undefined;
}

export const phenomJobId = (site: PhenomSite, jobId: string): string => `${site.host}:${jobId}`;

/** List item (+ optional detail) → RawJob. Recruiter names/emails present in Phenom data are never copied. */
export function phenomToRawJob(site: PhenomSite, target: CompanyTarget, list: PhenomJob, detail: PhenomJob | null, fallbackDescription: string | null, now: Date): RawJob {
  const j = detail ?? list;
  const url = phenomJobUrl(site, list);
  const apply = absoluteUrl(j.applyUrl ?? list.applyUrl ?? null, site.base) ?? url;
  const detailLocations = locationsOf(j);
  const locations = detailLocations.length > 0 ? detailLocations : locationsOf(list);
  const employment = uniqStrings([j.type ?? list.type, j.employmentType]);
  const remote = typeof j.remote === "boolean" ? (j.remote ? "remote" : undefined) : mapWorkMode(typeof j.remote === "string" ? j.remote : null);
  const skills = uniqStrings([...(list.ml_skills ?? []), ...(j.ml_skills ?? [])].map(strOf)).slice(0, 15);
  const description = detail ? normalizeDescriptionHtml(detail.description) ?? fallbackDescription : null;
  return compact({
    source: "phenom",
    sourceKind: "ats",
    sourceJobId: phenomJobId(site, list.jobId),
    sourceUrl: url,
    // Phenom fronts another ATS (Adobe → Workday): the underlying posting is the apply URL, which also dedupes.
    applyUrl: apply,
    title: cleanText(j.title || list.title),
    ...targetBase(target),
    locations,
    descriptionHtml: detail ? description : null,
    postedAt: toIso(list.postedDate ?? j.postedDate ?? list.dateCreated, now),
    validThrough: toIso(j.jobPostingEndDate ?? list.jobPostingEndDate, now) ?? undefined,
    department: cleanText(j.category ?? list.category ?? j.jobFamily ?? "") || undefined,
    employmentTypeRaw: employment.length > 0 ? employment.join(", ") : undefined,
    jobType: mapEmploymentType(...employment, j.experienceLevel ?? list.experienceLevel),
    experienceLevel: levelHint(j.experienceLevel ?? list.experienceLevel),
    experienceRaw: cleanText(j.experienceLevel ?? list.experienceLevel ?? "") || undefined,
    skills: skills.length > 0 ? skills : undefined,
    ...(remote ? { workMode: remote, isRemote: remote === "remote" } : {}),
    extra: {
      phenom: compact({
        jobId: list.jobId,
        reqId: list.reqId ?? undefined,
        jobSeqNo: list.jobSeqNo ?? undefined,
        teaser: list.descriptionTeaser ? cleanText(list.descriptionTeaser).slice(0, 300) : undefined,
        detail: Boolean(detail),
      }),
    },
  } satisfies RawJob);
}

export async function* scrapePhenomTarget(tctx: TargetContext): AsyncGenerator<RawJob> {
  const { target, env, log, stats } = tctx;
  const http = pageHttp(tctx, target.token, "PHENOM");
  let base = extraString(target, "phenomBase") ?? phenomBaseFrom(target.token);
  if (!base) {
    const landing = await http.page(target.token);
    base = phenomBaseFrom(landing.url);
  }
  if (!base) {
    log.warn("phenom: cannot find the /{country}/{lang} site base — using the sitemap crawl");
    yield* scrapeByPages(tctx, "phenom", "PHENOM", target.token);
    return;
  }
  const site: PhenomSite = { base, host: new URL(base).hostname.toLowerCase() };
  const maxDetails = envInt(env, "PHENOM_MAX_DETAILS", 200);
  const budget = createDetailBudget(tctx.limit !== undefined ? Math.min(maxDetails, tctx.limit) : maxDetails, overflowPolicy(env, "PHENOM_OVERFLOW"), 1);
  const seen = new Set<string>();
  let offset = 0;
  let total = Number.POSITIVE_INFINITY;
  for (;;) {
    const html = await http.text(`${site.base}/search-results?from=${offset}&s=1`);
    stats.pages++;
    const page = parsePhenomSearch(html, tctx);
    if (!page) {
      if (offset === 0) {
        log.warn("phenom: no phApp.ddo search data on the results page — using the sitemap crawl");
        yield* scrapeByPages(tctx, "phenom", "PHENOM", `${site.base}/sitemap.xml`);
        return;
      }
      throw new Error(`phenom: search data disappeared at offset ${offset}`);
    }
    total = page.total;
    const entries: Listed<PhenomJob>[] = [];
    for (const j of page.jobs) {
      const id = phenomJobId(site, j.jobId);
      if (seen.has(id)) continue;
      seen.add(id);
      entries.push({ id, item: j });
    }
    stats.listed += entries.length;
    yield* resolveDetails(tctx, entries, budget, {
      fetchDetail: (j) => http.text(phenomJobUrl(site, j), { throttleWaitsMs: [] }),
      toFull: (j, detailHtml) => {
        const detail = parsePhenomDetail(detailHtml);
        const ld = detail?.description ? null : parseJobPage(detailHtml, phenomJobUrl(site, j), tctx.now);
        if (!detail && !ld) {
          tctx.drift("phenom job page", "no jobDetail blob or JSON-LD");
          return null;
        }
        return phenomToRawJob(site, target, j, detail ?? j, ld?.fields.descriptionHtml ?? null, tctx.now);
      },
      toLight: (j) => phenomToRawJob(site, target, j, null, null, tctx.now),
    });
    offset += Math.max(1, page.jobs.length);
    if (page.jobs.length === 0 || offset >= total || samplingDone(tctx, budget)) break;
  }
}

export const phenomScraper: Scraper = {
  id: "phenom",
  name: "Phenom career site",
  kind: "ats",
  intervalMinutes: 120,
  handlesAts: ["phenom"],
  scrape: (ctx) => runTargets(ctx, { scraperId: "phenom", handlesAts: ["phenom"] }, scrapePhenomTarget),
};
