/**
 * NTT DATA — careers.nttdata.com (Phenom People career site; no plain ATS board behind most jobs).
 *
 * robots.txt (User-agent: *) only disallows apply/jobcart/chatbot/auth/widget paths; the search and
 * job pages used here are allowed. Both pages embed their data as `phApp.ddo = {…};`:
 *  - List:   GET https://careers.nttdata.com/global/en/search-results?qcountry=India&from={n}
 *            → ddo.eagerLoadRefineSearch { totalHits, data.jobs[10]: { jobId, title, location, multi_location,
 *              type, category, postedDate "2025-08-05T00:00:00.000+0000", externalApply, ml_skills, … } }
 *            (qcountry is the country facet; adding `s=1` drops the facet, so it isn't used.)
 *  - Detail: GET https://careers.nttdata.com/global/en/job/{jobId}/{slug}
 *            → ddo.jobDetail.data.job { description, jobRequirements (HTML), experienceLevel, remoteType,
 *              companyName, source/ats, applyUrl (subsidiary ATS when externalApply), … }
 * The portal also aggregates NTT-group subsidiaries (source/ats "BRIGHTDATA", e.g. Niveus, NTT DATA
 * Business Solutions): those apply on the subsidiary's own ATS, so applyUrl points there (utm_* removed).
 */
import type { RawJob } from "@easyjobs/contract";
import {
  buildRawJob, defineCareerSite, detectJobType, detectWorkMode, htmlToText, isOpenToIndia, joinSections, levelFromCategory,
  maxPagesFrom, postedAtFrom, uniqueStrings, urlSlug, type CompanyInfo, type SiteContext,
} from "../lib";

export const NTT_DATA: CompanyInfo = {
  slug: "ntt-data",
  name: "NTT DATA",
  domain: "nttdata.com",
  careersUrl: "https://careers.nttdata.com/global/en/search-results?qcountry=India",
};

const BASE = "https://careers.nttdata.com/global/en";

export interface PhenomLocation {
  location?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
}

export interface NttDataJob {
  jobId: string;
  reqId?: string | null;
  jobSeqNo?: string | null;
  title: string;
  location?: string | null;
  country?: string | null;
  multi_location?: (string | PhenomLocation)[] | null;
  type?: string | null;
  category?: string | null;
  postedDate?: string | null;
  dateCreated?: string | null;
  externalApply?: boolean | null;
  experience?: string | null;
  ml_skills?: string[] | null;
  descriptionTeaser?: string | null;
}

export interface NttDataJobDetail extends NttDataJob {
  description?: string | null;
  jobRequirements?: string | null;
  experienceLevel?: string | null;
  remoteType?: string | null;
  companyName?: string | null;
  source?: string | null;
  ats?: string | null;
  applyUrl?: string | null;
}

/** Parses the JSON object assigned to `phApp.ddo` (balanced braces, string-aware). */
export function extractPhenomDdo(html: string): Record<string, unknown> | null {
  const marker = /phApp\.ddo\s*=\s*\{/.exec(html);
  if (!marker) return null;
  const start = marker.index + marker[0].length - 1;
  let depth = 0;
  let inString = false;
  for (let i = start; i < html.length; i++) {
    const c = html[i];
    if (inString) {
      if (c === "\\") i++;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') inString = true;
    else if (c === "{") depth++;
    else if (c === "}" && --depth === 0) {
      try {
        return JSON.parse(html.slice(start, i + 1)) as Record<string, unknown>;
      } catch {
        return null;
      }
    }
  }
  return null;
}

export function nttSearchUrl(from: number): string {
  return `${BASE}/search-results?qcountry=India&from=${from}`;
}

export function nttJobUrl(job: Pick<NttDataJob, "jobId" | "title">): string {
  return `${BASE}/job/${encodeURIComponent(job.jobId)}/${urlSlug(job.title) || "job"}`;
}

export function parseNttSearch(html: string): { jobs: NttDataJob[]; total: number | null } {
  const ddo = extractPhenomDdo(html);
  const ers = (ddo?.eagerLoadRefineSearch ?? null) as { totalHits?: number; data?: { jobs?: NttDataJob[] } } | null;
  if (!ers) throw new Error("NTT DATA search page without phApp.ddo.eagerLoadRefineSearch");
  return { jobs: (ers.data?.jobs ?? []).filter((j) => j && j.jobId), total: typeof ers.totalHits === "number" ? ers.totalHits : null };
}

export function parseNttJob(html: string): NttDataJobDetail | null {
  const ddo = extractPhenomDdo(html) as { jobDetail?: { data?: { job?: NttDataJobDetail } } } | null;
  return ddo?.jobDetail?.data?.job ?? null;
}

/** Listing titles that are template leftovers rather than job titles. */
export function isJunkTitle(title: string | null | undefined): boolean {
  const t = (title ?? "").trim();
  return t.length < 3 || /^(job description|job title|jd|description)\s*:?$/i.test(t);
}

export function phenomLocations(job: Pick<NttDataJob, "multi_location" | "location">): string[] {
  const multi = (job.multi_location ?? []).map((l) => (typeof l === "string" ? l : (l?.location ?? null)));
  return uniqueStrings(multi.length > 0 ? multi : [job.location]);
}

function withoutTracking(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    for (const k of [...u.searchParams.keys()]) if (/^utm_/i.test(k)) u.searchParams.delete(k);
    return u.toString();
  } catch {
    return null;
  }
}

export function mapNttJob(job: NttDataJob, detail: NttDataJobDetail | null): RawJob {
  const d = detail ?? job;
  const title = (detail && !isJunkTitle(detail.title) ? detail.title : job.title).trim();
  const sourceUrl = nttJobUrl(job);
  const external = detail?.externalApply ?? job.externalApply ?? false;
  const desc = detail?.description ?? null;
  const req = detail?.jobRequirements ?? null;
  const norm = (s: string | null): string => (s ?? "").replace(/\s+/g, " ").trim().toLowerCase();
  const reqText = norm(htmlToText(req));
  const addReq = reqText.length > 40 && !norm(htmlToText(desc)).includes(reqText.slice(0, 80));
  const companyName = detail?.companyName?.trim();
  const jobType = detectJobType({ title, employmentType: d.type });
  return buildRawJob(NTT_DATA, {
    sourceJobId: job.jobId,
    title,
    company: companyName && !/^ntt data$/i.test(companyName) ? companyName : undefined,
    sourceUrl,
    applyUrl: external ? (withoutTracking(detail?.applyUrl) ?? sourceUrl) : sourceUrl,
    locations: phenomLocations(d),
    descriptionHtml: joinSections([{ body: desc }, { title: "Requirements", body: addReq ? req : null }]),
    postedAt: postedAtFrom(d.postedDate) ?? postedAtFrom(d.dateCreated),
    department: d.category && !/^other$/i.test(d.category) ? d.category : null,
    employmentTypeRaw: d.type || null,
    jobType,
    experienceLevel: jobType === "internship" ? "intern" : levelFromCategory(detail?.experienceLevel ?? job.experience),
    workMode: detectWorkMode(detail?.remoteType, ...phenomLocations(d)),
    skills: (d.ml_skills ?? []).slice(0, 12),
    extra: {
      reqId: d.reqId,
      sourceAts: detail?.ats || detail?.source || undefined,
      externalApply: external || undefined,
      subsidiary: companyName && !/^ntt data$/i.test(companyName) ? companyName : undefined,
    },
  });
}

export const nttData = defineCareerSite<NttDataJob, NttDataJobDetail>({
  company: NTT_DATA,
  name: "NTT DATA Careers",
  intervalMinutes: 60,
  endpointType: "html + embedded JSON (Phenom phApp.ddo)",
  async *list(ctx: SiteContext) {
    const maxPages = maxPagesFrom(ctx.env, 150);
    const seen = new Set<string>();
    let from = 0;
    for (let page = 0; page < maxPages; page++) {
      if (ctx.signal.aborted) return;
      const { jobs, total } = parseNttSearch(await ctx.http.text(nttSearchUrl(from)));
      if (total !== null) ctx.reportTotal(total);
      let fresh = 0;
      for (const j of jobs) {
        if (seen.has(j.jobId)) continue;
        seen.add(j.jobId);
        fresh++;
        yield j;
      }
      if (jobs.length === 0 || fresh === 0) return;
      from += jobs.length;
      if (total !== null && from >= total) return;
    }
    ctx.markIncomplete?.(`listing truncated at maxPages=${maxPages}`);
  },
  idOf: (j) => j.jobId,
  keep: (j) => !isJunkTitle(j.title) && isOpenToIndia([...phenomLocations(j), j.country], true),
  detail: async (j, ctx) => parseNttJob(await ctx.http.text(nttJobUrl(j))),
  toRawJob: (j, d) => mapNttJob(j, d),
});
