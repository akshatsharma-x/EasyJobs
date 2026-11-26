/**
 * Capgemini — the "jobstream" API behind capgemini.com/in-en/careers/join-capgemini/job-search/.
 *
 *   GET https://cg-jobstream-api.azurewebsites.net/api/job-search?page={1..}&size=50&country_code=in-en
 *   → { total, count, data: [{ id "511685-en_US_SAPBTP", ref "511685-en_US", source "SAP_BTP", title,
 *       brand, contract_type, experience_level, professional_communities, sbu, location "Pune, Chennai (ex Madras)",
 *       description (HTML), indexed_at, updated_at, apply_job_url (careers.capgemini.com SuccessFactors RMK) }] }
 *   (GET /api/job-filters/?country_code=in-en returns the facet counts.)
 *
 * The list carries the full description, so there is no detail call. The API host has no robots.txt
 * (404); capgemini.com allows the public job pages (/in-en/jobs/{ref}+{source}). The underlying ATS is
 * SAP SuccessFactors, which isn't a plain public board, so it's built here.
 * Dates: updated_at is refreshed for every job by the daily feed; indexed_at (first indexed) is the
 * closest thing to a posting date.
 */
import type { ExperienceLevel, RawJob } from "@easyjobs/contract";
import {
  buildRawJob, defineCareerSite, detectJobType, levelFromCategory, maxPagesFrom, pageSizeFrom, paginate, postedAtFrom,
  uniqueStrings, type CompanyInfo, type SiteContext,
} from "../lib";

export interface CapgeminiJob {
  id: string;
  ref?: string | null;
  source?: string | null;
  title: string;
  brand?: string | null;
  contract_type?: string | null;
  experience_level?: string | null;
  education_level?: string | null;
  professional_communities?: string | null;
  sbu?: string | null;
  department?: string | null;
  location?: string | null;
  country_code?: string | null;
  description?: string | null;
  indexed_at?: string | null;
  updated_at?: string | null;
  deleted_at?: string | null;
  apply_job_url?: string | null;
}

export interface CapgeminiSearchResponse {
  total: number;
  count?: number;
  data: CapgeminiJob[] | null;
}

export const CAPGEMINI: CompanyInfo = {
  slug: "capgemini",
  name: "Capgemini",
  domain: "capgemini.com",
  careersUrl: "https://www.capgemini.com/in-en/careers/join-capgemini/job-search/",
};

const API = "https://cg-jobstream-api.azurewebsites.net/api/job-search";
const COUNTRY = "in-en";

export function capgeminiSearchUrl(page: number, size: number): string {
  return `${API}?${new URLSearchParams({ page: String(page), size: String(size), country_code: COUNTRY }).toString()}`;
}

/** Public job page: /in-en/jobs/{ref}+{source lowercased}, e.g. /in-en/jobs/511685-en_US+sap_btp */
export function capgeminiJobUrl(job: CapgeminiJob): string | null {
  const ref = job.ref ?? job.id.replace(/_[A-Z0-9]+$/, "");
  if (!ref) return null;
  const src = (job.source ?? "SAP_BTP").toLowerCase();
  return `https://www.capgemini.com/${COUNTRY}/jobs/${encodeURIComponent(ref)}+${encodeURIComponent(src)}`;
}

/** "Chennai (ex Madras), Mumbai (ex Bombay), Pune" → ["Chennai, India", "Mumbai, India", "Pune, India"] */
export function capgeminiLocations(location: string | null | undefined): string[] {
  return uniqueStrings(
    (location ?? "")
      .split(",")
      .map((c) => c.replace(/\(ex [^)]*\)/gi, "").trim())
      .filter(Boolean)
      .map((c) => `${c}, India`),
  );
}

export function capgeminiLevel(job: CapgeminiJob): ExperienceLevel | undefined {
  const cat = (job.experience_level ?? "").toLowerCase();
  // "Executives" is an employee *grade* (in Indian corporate grading a junior/mid individual contributor — W2 found
  // "Pyspark Developer" and "Senior Software Engineer" filed there), not leadership: give no hint, title/years decide.
  if (cat.startsWith("executive")) return undefined;
  if (cat === "experienced professionals") return undefined;
  return levelFromCategory(job.experience_level);
}

export function mapCapgeminiJob(job: CapgeminiJob): RawJob | null {
  const url = capgeminiJobUrl(job);
  if (!url || job.deleted_at) return null;
  return buildRawJob(CAPGEMINI, {
    sourceJobId: job.id,
    title: job.title,
    sourceUrl: url,
    applyUrl: url,
    locations: capgeminiLocations(job.location),
    descriptionHtml: job.description ?? null,
    postedAt: postedAtFrom(job.indexed_at) ?? postedAtFrom(job.updated_at),
    department: job.professional_communities || job.department || null,
    employmentTypeRaw: job.contract_type || null,
    jobType: detectJobType({ title: job.title, employmentType: job.contract_type }),
    experienceLevel: capgeminiLevel(job),
    degrees: job.education_level ? [job.education_level] : [],
    extra: {
      brand: job.brand,
      sbu: job.sbu,
      experienceCategory: job.experience_level,
      applyFlowUrl: job.apply_job_url,
      updatedAt: job.updated_at,
    },
  });
}

export const capgemini = defineCareerSite<CapgeminiJob>({
  company: CAPGEMINI,
  name: "Capgemini Careers",
  intervalMinutes: 60,
  endpointType: "json (jobstream API)",
  async *list(ctx: SiteContext) {
    const size = pageSizeFrom(ctx.env, 50, 50);
    yield* paginate<CapgeminiJob>({
      onTruncated: (reason) => ctx.markIncomplete?.(reason),
      pageSize: size,
      maxPages: maxPagesFrom(ctx.env, 100),
      signal: ctx.signal,
      idOf: (j) => j.id,
      fetchPage: async (i) => {
        const res = await ctx.http.json<CapgeminiSearchResponse>(capgeminiSearchUrl(i + 1, size));
        ctx.reportTotal(res.total);
        return { items: res.data ?? [], total: res.total };
      },
    });
  },
  idOf: (j) => j.id,
  toRawJob: (j) => mapCapgeminiJob(j),
});
