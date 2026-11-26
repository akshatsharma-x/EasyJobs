/**
 * Recruitee Careers Site API (public, documented: https://docs.recruitee.com/reference/offers)
 *   GET https://{company}.recruitee.com/api/offers/
 * One request returns every published offer. Unknown subdomain → 404 (HTML).
 * Timestamps look like "2026-11-16 14:54:20 UTC"; salary amounts are strings; all-null salary = absent.
 * Custom career domains work too: token "https://careers.acme.com" → https://careers.acme.com/api/offers/.
 */
import type { CompanyTarget, ExperienceLevel, JobType, RawJob, WorkMode } from "@easyjobs/contract";
import { UnexpectedResponseError } from "../core/errors";
import { getBoardJson } from "../core/http";
import { buildJob } from "../core/job";
import type { AtsAdapter } from "../core/types";
import { htmlSection, joinHtml } from "../lib/html";
import { jobTypeFromLabel, levelFromLabel } from "../lib/hints";
import { joinLocation, withCountry } from "../lib/location";
import { makeSalary, periodFromInterval } from "../lib/salary";
import { clean, extraOf, isRecord, uniqStrings } from "../lib/text";
import { careersOrigin } from "../lib/tokens";

export interface RecruiteeLocation {
  name?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  country_code?: string | null;
}

export interface RecruiteeOffer {
  id: number | string;
  slug?: string | null;
  title?: string | null;
  status?: string | null;
  description?: string | null;
  requirements?: string | null;
  location?: string | null;
  city?: string | null;
  country?: string | null;
  country_code?: string | null;
  locations?: RecruiteeLocation[] | null;
  remote?: boolean | null;
  hybrid?: boolean | null;
  on_site?: boolean | null;
  employment_type_code?: string | null;
  experience_code?: string | null;
  education_code?: string | null;
  category_code?: string | null;
  department?: string | { name?: string | null } | null;
  careers_url?: string | null;
  careers_apply_url?: string | null;
  company_name?: string | null;
  published_at?: string | null;
  created_at?: string | null;
  close_at?: string | null;
  salary?: { min?: string | number | null; max?: string | number | null; currency?: string | null; period?: string | null } | null;
  min_hours?: number | null;
  max_hours?: number | null;
  tags?: unknown[] | null;
}

export interface RecruiteeOffers {
  offers?: RecruiteeOffer[];
}

export const recruiteeOrigin = (token: string): string => careersOrigin(token, "recruitee.com");
export const recruiteeOffersUrl = (origin: string): string => `${origin}/api/offers/`;

/**
 * employment_type_code → JobType. Full-time fixed-term is mapped to "contract" (not permanent);
 * part-time stays "part_time" whether fixed-term or not. "volunteer" has no contract type.
 */
const EMPLOYMENT: Record<string, JobType | null> = {
  fulltime: "full_time",
  fulltime_permanent: "full_time",
  fulltime_fixed_term: "contract",
  parttime: "part_time",
  parttime_permanent: "part_time",
  parttime_fixed_term: "part_time",
  internship: "internship",
  traineeship: "internship",
  apprenticeship: "apprenticeship",
  contract: "contract",
  freelance: "freelance",
  temporary: "temporary",
  volunteer: null,
};

export function recruiteeLevel(code: unknown, jobType: JobType | undefined, title: string | null): ExperienceLevel | undefined {
  switch (clean(code)?.toLowerCase()) {
    case "student_high_school":
      return "intern";
    case "student_college":
      return !jobType || jobType === "internship" || jobType === "part_time" ? "intern" : "fresher";
    case "entry_level":
      return "entry";
    case "mid_level":
      return "mid";
    case "experienced":
      return levelFromLabel("experienced", title);
    case "manager":
    case "senior_manager":
      return "lead";
    case "executive":
      return "executive";
    default:
      return undefined;
  }
}

export function recruiteeWorkMode(o: RecruiteeOffer): WorkMode | undefined {
  if (o.hybrid === true || (o.remote === true && o.on_site === true)) return "hybrid";
  if (o.remote === true) return "remote";
  if (o.on_site === true) return "onsite";
  return undefined;
}

export function recruiteeLocations(o: RecruiteeOffer): string[] {
  const structured = uniqStrings((o.locations ?? []).map((l) => joinLocation([l.city ?? l.name, l.state, l.country])));
  if (structured.length > 0) return structured;
  const text = withCountry(clean(o.location) ?? clean(o.city), o.country ?? o.country_code);
  if (text) return [text];
  return o.remote === true ? ["Remote"] : [];
}

const humanize = (code: string | null): string | null => (code ? code.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase()) : null);

export function mapRecruiteeOffer(o: RecruiteeOffer, target: CompanyTarget, origin: string): RawJob | null {
  const title = clean(o.title);
  const typeCode = clean(o.employment_type_code)?.toLowerCase() ?? null;
  const mapped = typeCode !== null && typeCode in EMPLOYMENT ? EMPLOYMENT[typeCode] : undefined;
  const jobType = mapped === null ? undefined : (mapped ?? jobTypeFromLabel(typeCode));
  const s = o.salary;
  const salary = s ? makeSalary({ min: s.min, max: s.max, currency: s.currency, period: periodFromInterval(s.period) }) : null;
  const department = isRecord(o.department) ? clean(o.department.name) : clean(o.department);
  return buildJob("recruitee", target, {
    sourceJobId: o.id,
    title,
    url: clean(o.careers_url) ?? (o.slug ? `${origin}/o/${encodeURIComponent(o.slug)}` : null),
    company: o.company_name,
    locations: recruiteeLocations(o),
    descriptionHtml: joinHtml([o.description, htmlSection("Requirements", o.requirements)]),
    postedAt: o.published_at ?? o.created_at,
    validThrough: o.close_at,
    department,
    jobType,
    employmentTypeRaw: humanize(typeCode),
    experienceLevel: recruiteeLevel(o.experience_code, jobType, title),
    experienceRaw: humanize(clean(o.experience_code)),
    workMode: recruiteeWorkMode(o),
    isRemote: typeof o.remote === "boolean" ? o.remote : undefined,
    salary,
    extra: extraOf({
      category: clean(o.category_code),
      education: clean(o.education_code),
      employmentTypeCode: typeCode,
      experienceCode: clean(o.experience_code),
      countryCode: clean(o.country_code),
      applyFormUrl: clean(o.careers_apply_url),
      minHours: o.min_hours ?? undefined,
      maxHours: o.max_hours ?? undefined,
      tags: uniqStrings(o.tags ?? []),
    }),
  });
}

export const recruitee: AtsAdapter = {
  id: "recruitee",
  name: "Recruitee",
  ats: "recruitee",
  endpoint: "https://{company}.recruitee.com/api/offers/",
  async *scrapeTarget(ctx) {
    const origin = recruiteeOrigin(ctx.target.token);
    const url = recruiteeOffersUrl(origin);
    const data = await getBoardJson<RecruiteeOffers>(ctx, url);
    if (!Array.isArray(data?.offers)) throw new UnexpectedResponseError(url, "expected { offers: [...] }");
    for (const offer of data.offers) {
      if (offer.status && offer.status !== "published") {
        ctx.skip(`status ${offer.status}`);
        continue;
      }
      const raw = mapRecruiteeOffer(offer, ctx.target, origin);
      if (raw) yield raw;
      else ctx.skip("missing id/title/url");
    }
  },
};
