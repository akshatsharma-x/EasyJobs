/**
 * Amazon — amazon.jobs public search JSON (the endpoint the search page itself calls).
 *
 *   GET https://www.amazon.jobs/en/search.json?offset={n}&result_limit=50&sort=recent&normalized_country_code[]=IND
 *   → { hits, jobs: [{ id_icims, title, job_path, posted_date "November 25, 2026", description,
 *       basic_qualifications, preferred_qualifications, job_schedule_type, business_category,
 *       job_category, job_family, team.label, company_name (legal entity), locations[] (JSON strings
 *       with type ONSITE|VIRTUAL), url_next_step, … }] }
 *
 * The list already carries the full description, so there is no detail call. robots.txt allows
 * /en/search.json for all agents. "IND" includes Amazon's India virtual (remote) roles.
 */
import type { ExperienceLevel, RawJob, WorkMode } from "@easyjobs/contract";
import {
  buildRawJob, defineCareerSite, detectJobType, joinSections, levelFromCategory, maxPagesFrom, pageSizeFrom,
  paginate, postedAtFrom, uniqueStrings, type CompanyInfo, type SiteContext,
} from "../lib";

export interface AmazonLocation {
  type?: string | null;
  normalizedCityName?: string | null;
  normalizedStateName?: string | null;
  normalizedCountryName?: string | null;
  normalizedLocation?: string | null;
  city?: string | null;
  location?: string | null;
}

export interface AmazonJob {
  id_icims: string;
  id?: string;
  title: string;
  job_path: string;
  posted_date?: string | null;
  updated_time?: string | null;
  description?: string | null;
  description_short?: string | null;
  basic_qualifications?: string | null;
  preferred_qualifications?: string | null;
  job_schedule_type?: string | null;
  business_category?: string | null;
  job_category?: string | null;
  job_family?: string | null;
  team?: { label?: string | null } | null;
  company_name?: string | null;
  normalized_location?: string | null;
  location?: string | null;
  locations?: string[] | null;
  is_intern?: boolean | null;
  is_manager?: boolean | null;
  university_job?: boolean | null;
  url_next_step?: string | null;
  primary_search_label?: string | null;
}

export interface AmazonSearchResponse {
  error?: unknown;
  hits: number;
  jobs: AmazonJob[];
}

export const AMAZON: CompanyInfo = {
  slug: "amazon",
  name: "Amazon",
  domain: "amazon.com",
  careersUrl: "https://www.amazon.jobs/en/locations/india",
};

const BASE = "https://www.amazon.jobs";

export function amazonSearchUrl(offset: number, limit: number): string {
  const p = new URLSearchParams({ offset: String(offset), result_limit: String(limit), sort: "recent" });
  p.append("normalized_country_code[]", "IND");
  return `${BASE}/en/search.json?${p.toString()}`;
}

export function parseAmazonLocations(job: AmazonJob): { locations: string[]; workMode: WorkMode | undefined } {
  const parsed: AmazonLocation[] = [];
  for (const raw of job.locations ?? []) {
    try {
      parsed.push(JSON.parse(raw) as AmazonLocation);
    } catch {
      /* tolerate drift: fall back to normalized_location below */
    }
  }
  const locations = uniqueStrings(
    parsed.map((l) => {
      const place = [l.normalizedCityName, l.normalizedStateName, l.normalizedCountryName].filter(Boolean).join(", ");
      const base = place || l.normalizedLocation || l.location || "";
      return l.type === "VIRTUAL" && base ? `Remote (Virtual) - ${base}` : base;
    }),
  );
  if (locations.length === 0) locations.push(...uniqueStrings([job.normalized_location, job.location]));
  const types = new Set(parsed.map((l) => (l.type ?? "").toUpperCase()).filter(Boolean));
  const workMode: WorkMode | undefined =
    types.size === 0 ? undefined : [...types].every((t) => t === "VIRTUAL" || t === "REMOTE") ? "remote" : types.has("HYBRID") ? "hybrid" : types.has("ONSITE") ? "onsite" : undefined;
  return { locations, workMode };
}

/** Highest "N+ years" among the basic (minimum) qualifications. */
export function amazonMinYears(basic: string | null | undefined): { min: number; raw: string } | null {
  if (!basic) return null;
  let best: { min: number; raw: string } | null = null;
  for (const m of basic.matchAll(/(\d{1,2})\+?\s*(?:years?|yrs?)\b[^<\n]*/gi)) {
    const n = Number(m[1]);
    if (n <= 30 && (!best || n > best.min)) best = { min: n, raw: m[0].trim() };
  }
  return best;
}

function amazonLevel(job: AmazonJob, isInternship: boolean): ExperienceLevel | undefined {
  if (isInternship || job.is_intern) return "intern";
  const cat = (job.business_category ?? "").toLowerCase();
  if (cat === "university" || cat === "studentprograms" || job.university_job) return "fresher";
  return levelFromCategory(job.job_family);
}

export function mapAmazonJob(job: AmazonJob): RawJob {
  const sourceUrl = new URL(job.job_path, BASE).toString();
  const { locations, workMode } = parseAmazonLocations(job);
  // Interns are listed with job_schedule_type "full-time"; the title is the reliable signal.
  const jobType = detectJobType({ title: job.title, employmentType: job.job_schedule_type });
  const years = amazonMinYears(job.basic_qualifications);
  return buildRawJob(AMAZON, {
    sourceJobId: job.id_icims,
    title: job.title,
    sourceUrl,
    applyUrl: sourceUrl,
    locations,
    descriptionHtml: joinSections([
      { body: job.description },
      { title: "Basic qualifications", body: job.basic_qualifications },
      { title: "Preferred qualifications", body: job.preferred_qualifications },
    ]),
    postedAt: postedAtFrom(job.posted_date, { dayFirst: false }),
    department: job.job_category ?? job.job_family ?? null,
    employmentTypeRaw: job.job_schedule_type ?? null,
    experienceRaw: years?.raw ?? null,
    experienceMin: years?.min ?? null,
    jobType,
    experienceLevel: amazonLevel(job, jobType === "internship"),
    workMode,
    extra: {
      legalEntity: job.company_name,
      jobFamily: job.job_family,
      businessCategory: job.business_category,
      team: job.team?.label,
      applyFlowUrl: job.url_next_step,
      updated: job.updated_time,
    },
  });
}

export const amazon = defineCareerSite<AmazonJob>({
  company: AMAZON,
  name: "Amazon Jobs",
  intervalMinutes: 30,
  endpointType: "json (search.json)",
  async *list(ctx: SiteContext) {
    const size = pageSizeFrom(ctx.env, 50, 100);
    yield* paginate<AmazonJob>({
      onTruncated: (reason) => ctx.markIncomplete?.(reason),
      pageSize: size,
      maxPages: maxPagesFrom(ctx.env, 100),
      signal: ctx.signal,
      idOf: (j) => j.id_icims,
      fetchPage: async (i) => {
        const res = await ctx.http.json<AmazonSearchResponse>(amazonSearchUrl(i * size, size));
        if (res.error) throw new Error(`amazon.jobs error: ${JSON.stringify(res.error).slice(0, 200)}`);
        ctx.reportTotal(res.hits);
        return { items: res.jobs ?? [], total: res.hits };
      },
    });
  },
  idOf: (j) => j.id_icims,
  toRawJob: (j) => mapAmazonJob(j),
});
