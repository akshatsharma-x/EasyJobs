/**
 * Accenture — the accenture.com careers search API (AEM front end; applications run on Workday).
 *
 *   POST https://www.accenture.com/api/accenture/elastic/findjobs   (multipart/form-data)
 *     startIndex, maxResultSize, jobKeyword, jobCountry=India, jobLanguage=en, countrySite=in-en,
 *     sortBy (0 relevancy · 1 newest · 2 proximity/latest), searchType=vectorSearch, enableQueryBoost,
 *     minScore, getFeedbackJudgmentEnabled, useCleanEmbedding, score, totalHits, debugQuery,
 *     jobFilters=[{fieldName:"yearsOfExperience.keyword"|"location.keyword", items:[…], multiSelect:false}]
 *   → { data: [AccentureJob], totalHits: { total ≤ 10000, overMaxHits }, aggregations: [{fieldName, items:[{term,count}]}] }
 *
 * No token is involved: on the public host the site's own JS sends an empty CSRF-Token header
 * (it only fetches one on the AEM author host). robots.txt disallows the HTML search page
 * (*\/careers/jobsearch?) but not /api/… or the /careers/jobdetails pages.
 *
 * Volume: ~25k India jobs and ~1,200 new postings a day, at ~13 KB per record. A full crawl
 * every hour would be ~340 MB, and a "newest N" window would let the worker's sweep close live
 * jobs within days. So the crawl is scoped by Accenture's own Experience facet and is complete
 * within that scope: default "0-2 years" (fresher/entry roles); ACCENTURE_EXPERIENCE="0-2,2-5" or
 * "all" widens it. A band at the 10k search window is split by city.
 */
import type { ExperienceLevel, RawJob } from "@easyjobs/contract";
import type { Env } from "@easyjobs/contract/node";
import {
  buildRawJob, defineCareerSite, detectJobType, detectWorkMode, joinSections, maxPagesFrom, pageSizeFrom, paginate,
  parseExperienceYears, postedAtFrom, uniqueStrings, type CompanyInfo, type SiteContext,
} from "../lib";

export interface AccentureJob {
  requisitionId?: string | null;
  guid?: string | null;
  title: string;
  jobDetailUrl?: string | null;
  country?: string | null;
  location?: string[] | null;
  updateDate?: string | null;
  postedDateText?: string | null;
  jobScheduleDescription?: string | null;
  employeeType?: string | null;
  jobTypeDescription?: string | null;
  careerLevel?: string | null;
  yearsOfExperience?: string | null;
  education?: string[] | null;
  jobFamilyGroup?: string[] | null;
  businessArea?: string | null;
  function?: string[] | null;
  areaOfInterest?: string[] | null;
  workdaySkill?: string[] | null;
  mustHaveSkills?: string[] | string | null;
  goodToHaveSkills?: string[] | string | null;
  jobDescription?: string | null;
  qualificationShort?: string | null;
  remoteType?: string | null;
  jobProfile?: string | null;
  azureopenaiSummary?: string | null;
}

export interface AccentureAggregation {
  fieldName: string;
  filterDisplayName?: string;
  items: { term: string; count: number }[];
}

export interface AccentureSearchResponse {
  data?: AccentureJob[] | null;
  totalHits?: { total: number; overMaxHits?: string | boolean } | null;
  aggregations?: AccentureAggregation[] | null;
  message?: string | null;
}

export interface AccentureFilter {
  fieldName: string;
  items: string[];
  multiSelect: false;
}

export const ACCENTURE: CompanyInfo = {
  slug: "accenture",
  name: "Accenture",
  domain: "accenture.com",
  careersUrl: "https://www.accenture.com/in-en/careers",
};

export const ACCENTURE_FINDJOBS_URL = "https://www.accenture.com/api/accenture/elastic/findjobs";
const COUNTRY_SITE = "in-en";
/** Elasticsearch result window of the API. */
const SEARCH_WINDOW = 10_000;
const BAND_FIELD = "yearsOfExperience.keyword";
const CITY_FIELD = "location.keyword";

/** The multipart body the careers page sends (sorted newest first). */
export function accentureForm(startIndex: number, size: number, filters: AccentureFilter[]): FormData {
  const f = new FormData();
  const fields: [string, string][] = [
    ["startIndex", String(startIndex)], ["maxResultSize", String(size)], ["jobKeyword", ""], ["jobCountry", "India"],
    ["jobLanguage", "en"], ["countrySite", COUNTRY_SITE], ["sortBy", "1"], ["searchType", "vectorSearch"],
    ["enableQueryBoost", "true"], ["minScore", "0.6"], ["getFeedbackJudgmentEnabled", "true"], ["useCleanEmbedding", "true"],
    ["score", "true"], ["totalHits", "true"], ["debugQuery", "false"], ["jobFilters", JSON.stringify(filters)],
  ];
  for (const [k, v] of fields) f.append(k, v);
  return f;
}

const filter = (fieldName: string, term: string): AccentureFilter => ({ fieldName, items: [term], multiSelect: false });

/** Experience bands to crawl: ACCENTURE_EXPERIENCE unset → ["0-2"], "all" → every band, else "0-2,2-5". */
export function accentureBands(env: Env): string[] | "all" {
  const raw = (env.ACCENTURE_EXPERIENCE ?? "").trim();
  if (raw.toLowerCase() === "all") return "all";
  const ranges = raw.split(",").map((s) => s.replace(/\s|years?/gi, "")).filter((s) => /^\d+(-\d+|\+)$/.test(s));
  return ranges.length > 0 ? ranges : ["0-2"];
}

export const bandLabel = (range: string): string => `Experience: ${range} years`;

/** Splits a list into search partitions (filter sets) that each fit the 10k search window. */
export function accenturePartitions(
  bands: string[] | "all",
  aggregations: AccentureAggregation[],
): AccentureFilter[][] {
  const bandAgg = aggregations.find((a) => a.fieldName === BAND_FIELD)?.items ?? [];
  const cities = aggregations.find((a) => a.fieldName === CITY_FIELD)?.items ?? [];
  const wanted = bands === "all" ? bandAgg.map((b) => b.term) : bands.map(bandLabel);
  const out: AccentureFilter[][] = [];
  for (const band of wanted) {
    const count = bandAgg.find((b) => b.term === band)?.count ?? 0;
    if (count >= SEARCH_WINDOW - 100 && cities.length > 0) {
      for (const c of cities) out.push([filter(BAND_FIELD, band), filter(CITY_FIELD, c.term)]);
    } else {
      out.push([filter(BAND_FIELD, band)]);
    }
  }
  return out;
}

function asList(v: string[] | string | null | undefined): string[] {
  if (!v) return [];
  return Array.isArray(v) ? v : v.split(/[,;|]/);
}

export function accentureJobUrl(job: AccentureJob): string | null {
  if (job.guid) return `https://www.accenture.com/${COUNTRY_SITE}/careers/jobdetails?id=${encodeURIComponent(job.guid)}`;
  if (job.jobDetailUrl) return job.jobDetailUrl.replace("{0}", COUNTRY_SITE);
  return null;
}

/** "Years of Experience: 0 to 1 years" in the description beats the coarse facet band. */
export function accentureYears(job: AccentureJob): { min: number | null; max: number | null; raw: string } | null {
  const m = /Years of Experience:\s*(?:<\/b>)?\s*([^<\n]{1,40})/i.exec(job.jobDescription ?? "");
  return (m ? parseExperienceYears(m[1]) : null) ?? parseExperienceYears(job.yearsOfExperience);
}

export function accentureLevel(job: AccentureJob, years: { min: number | null; max: number | null } | null): ExperienceLevel | undefined {
  const career = (job.careerLevel ?? "").toLowerCase();
  if (/\bintern/.test(job.title.toLowerCase())) return "intern";
  if (/director/.test(career)) return "executive";
  if (career === "new associate") return "fresher";
  // The contract lists "associate" under entry; Accenture's Associate band is 1–3 yrs.
  if (career === "associate") return "entry";
  const max = years?.max ?? null;
  const min = years?.min ?? null;
  if (max !== null) return max <= 2 ? "entry" : max <= 5 ? "mid" : max <= 10 ? "senior" : "lead";
  if (min !== null) return min < 2 ? "entry" : min < 5 ? "mid" : min < 8 ? "senior" : "lead";
  return undefined;
}

export function mapAccentureJob(job: AccentureJob): RawJob | null {
  const id = job.requisitionId ?? job.guid?.replace(/_[a-z]{2}$/i, "");
  const url = accentureJobUrl(job);
  if (!id || !url) return null;
  const years = accentureYears(job);
  const country = job.country ?? "India";
  const description = (job.jobDescription ?? "").replace(/\r?\n(\s*\r?\n)+/g, "<br><br>").replace(/\r?\n/g, "<br>");
  return buildRawJob(ACCENTURE, {
    sourceJobId: id,
    title: job.title,
    sourceUrl: url,
    applyUrl: url,
    locations: (job.location ?? []).map((c) => `${c}, ${country}`),
    descriptionHtml: joinSections([{ body: description }]),
    postedAt: postedAtFrom(job.updateDate),
    department: job.jobFamilyGroup?.[0] ?? job.businessArea ?? null,
    employmentTypeRaw: job.employeeType ?? job.jobScheduleDescription ?? null,
    jobType: detectJobType({ title: job.title, employmentType: job.employeeType ?? job.jobScheduleDescription }),
    experienceLevel: accentureLevel(job, years),
    experienceRaw: years?.raw ?? job.yearsOfExperience ?? null,
    experienceMin: years?.min ?? null,
    experienceMax: years?.max ?? null,
    workMode: detectWorkMode(job.remoteType),
    skills: uniqueStrings([...asList(job.workdaySkill), ...asList(job.mustHaveSkills), ...asList(job.goodToHaveSkills)]),
    degrees: job.education ?? [],
    extra: {
      careerLevel: job.careerLevel,
      careerStage: job.jobTypeDescription,
      experienceBand: job.yearsOfExperience,
      businessArea: job.businessArea,
      function: job.function,
      jobProfile: job.jobProfile,
      qualification: job.qualificationShort,
      postedText: job.postedDateText,
      summary: job.azureopenaiSummary,
    },
  });
}

async function search(ctx: SiteContext, startIndex: number, size: number, filters: AccentureFilter[]): Promise<AccentureSearchResponse> {
  const res = await ctx.http.json<AccentureSearchResponse>(ACCENTURE_FINDJOBS_URL, { method: "POST", body: accentureForm(startIndex, size, filters) });
  if (res.message && res.message !== "Success") throw new Error(`findjobs: ${res.message}`);
  return res;
}

export const accenture = defineCareerSite<AccentureJob>({
  company: ACCENTURE,
  name: "Accenture Careers",
  intervalMinutes: 60,
  endpointType: "json (multipart POST findjobs)",
  async *list(ctx: SiteContext) {
    const size = pageSizeFrom(ctx.env, 50, 50);
    const probe = await search(ctx, 0, 1, []);
    const aggs = probe.aggregations ?? [];
    const bandTotal = (aggs.find((a) => a.fieldName === BAND_FIELD)?.items ?? []).reduce((n, b) => n + b.count, 0);
    ctx.reportTotal(bandTotal || probe.totalHits?.total || 0);
    for (const filters of accenturePartitions(accentureBands(ctx.env), aggs)) {
      yield* paginate<AccentureJob>({
        onTruncated: (reason) => ctx.markIncomplete?.(reason),
        pageSize: size,
        maxPages: maxPagesFrom(ctx.env, Math.ceil(SEARCH_WINDOW / size)),
        signal: ctx.signal,
        idOf: (j) => j.requisitionId ?? j.guid ?? j.title,
        fetchPage: async (i) => {
          const res = await search(ctx, i * size, size, filters);
          return { items: res.data ?? [], total: res.totalHits?.total ?? null };
        },
      });
    }
  },
  idOf: (j) => j.requisitionId ?? j.guid?.replace(/_[a-z]{2}$/i, ""),
  toRawJob: (j) => mapAccentureJob(j),
});
