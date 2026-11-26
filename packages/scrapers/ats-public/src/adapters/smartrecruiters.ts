/**
 * SmartRecruiters Posting API (public, documented: https://developers.smartrecruiters.com/docs/posting-api)
 *   List:   GET https://api.smartrecruiters.com/v1/companies/{id}/postings?limit=100&offset={n}[&country=xx]
 *   Detail: GET https://api.smartrecruiters.com/v1/companies/{id}/postings/{postingId}
 * The list is sorted newest first and capped at 100 per page; `totalFound` drives pagination.
 * NOTE: an unknown company id answers 200 with totalFound 0 — indistinguishable from an empty board.
 * Details (description, compensation, postingUrl) are fetched only for postings ctx.isKnown doesn't know,
 * within the per-run budget (ATS_MAX_DETAILS); known postings are emitted as light records.
 * Optional registry hint: target.extra.country = "in" restricts the board server-side (huge MNC boards).
 */
import type { CompanyTarget, ExperienceLevel, JobType, RawJob, WorkMode } from "@easyjobs/contract";
import { DetailBudget } from "../core/details";
import { UnexpectedResponseError } from "../core/errors";
import { getBoardJson, getDetailJson } from "../core/http";
import { buildJob } from "../core/job";
import { paginateOffset } from "../core/paginate";
import { maxDetails } from "../core/run";
import type { AtsAdapter } from "../core/types";
import { htmlSection, joinHtml } from "../lib/html";
import { jobTypeFromLabel, levelFromLabel } from "../lib/hints";
import { countryName, joinLocation, tidyLocation } from "../lib/location";
import { isPersonalField } from "../lib/privacy";
import { makeSalary, periodFromInterval } from "../lib/salary";
import { clean, extraOf, truncate } from "../lib/text";
import { bareToken, tokenUrl } from "../lib/tokens";

export interface SrLabel {
  id?: string | null;
  label?: string | null;
}

export interface SrLocation {
  city?: string | null;
  region?: string | null;
  country?: string | null;
  address?: string | null;
  remote?: boolean | null;
  hybrid?: boolean | null;
  fullLocation?: string | null;
}

export interface SrPosting {
  id: string;
  name?: string | null;
  uuid?: string | null;
  refNumber?: string | null;
  company?: { identifier?: string | null; name?: string | null } | null;
  releasedDate?: string | null;
  location?: SrLocation | null;
  industry?: SrLabel | null;
  department?: SrLabel | null;
  function?: SrLabel | null;
  typeOfEmployment?: SrLabel | null;
  experienceLevel?: SrLabel | null;
  customField?: { fieldLabel?: string | null; valueLabel?: string | null }[] | null;
  language?: { code?: string | null } | null;
}

export interface SrPostingDetail extends SrPosting {
  postingUrl?: string | null;
  applyUrl?: string | null;
  active?: boolean | null;
  compensation?: { min?: number | null; max?: number | null; currency?: string | null; period?: string | null } | null;
  jobAd?: {
    sections?: Record<string, { title?: string | null; text?: string | null } | null | undefined> | null;
  } | null;
}

export interface SrPage {
  offset?: number;
  limit?: number;
  totalFound?: number;
  content?: SrPosting[];
}

const API = "https://api.smartrecruiters.com/v1/companies";
export const SR_PAGE_SIZE = 100;

/** "Visa" | "https://jobs.smartrecruiters.com/Visa" | "https://careers.smartrecruiters.com/Visa/…" → "Visa". */
export function smartRecruitersToken(raw: string): string {
  const parsed = tokenUrl(raw, /(^|\.)smartrecruiters\.com$/i);
  if (!parsed) return bareToken(raw);
  const parts = parsed.parts[0] === "v1" && parsed.parts[1] === "companies" ? parsed.parts.slice(2) : parsed.parts;
  if (!parts[0]) throw new Error(`Cannot read a SmartRecruiters company id from "${raw}"`);
  return parts[0];
}

/** Optional server-side country filter from the registry entry (`extra.country`, ISO alpha-2). */
export function smartRecruitersCountry(target: CompanyTarget): string | null {
  const c = clean(target.extra?.country);
  return c && /^[a-z]{2}$/i.test(c) ? c.toLowerCase() : null;
}

export const srListUrl = (company: string, offset: number, country: string | null = null): string =>
  `${API}/${encodeURIComponent(company)}/postings?limit=${SR_PAGE_SIZE}&offset=${offset}${country ? `&country=${country}` : ""}`;

export const srDetailUrl = (company: string, id: string): string =>
  `${API}/${encodeURIComponent(company)}/postings/${encodeURIComponent(id)}`;

const EMPLOYMENT: Record<string, JobType> = {
  permanent: "full_time",
  full_time: "full_time",
  "full-time": "full_time",
  part_time: "part_time",
  "part-time": "part_time",
  contract: "contract",
  contractor: "contract",
  temporary: "temporary",
  seasonal: "temporary",
  intern: "internship",
  internship: "internship",
  freelance: "freelance",
  apprenticeship: "apprenticeship",
};

/** experienceLevel ids: internship, entry_level, associate, mid_senior_level, director, executive, not_applicable. */
export function srLevel(level: SrLabel | null | undefined, title: string | null): ExperienceLevel | undefined {
  const id = clean(level?.id)?.toLowerCase();
  switch (id) {
    case "internship":
      return "intern";
    case "entry_level":
    case "associate":
      return "entry";
    case "director":
    case "executive":
      return "executive";
    case "mid_senior_level":
      return levelFromLabel("Mid-Senior level", title);
    case "not_applicable":
    case undefined:
      return undefined;
    default:
      return levelFromLabel(level?.label, title);
  }
}

export function srLocationText(loc: SrLocation | null | undefined): string | null {
  if (!loc) return null;
  return tidyLocation(loc.fullLocation) ?? joinLocation([loc.city, loc.region, countryName(loc.country)]);
}

export function srWorkMode(loc: SrLocation | null | undefined): WorkMode | undefined {
  if (!loc) return undefined;
  if (loc.remote === true) return "remote";
  if (loc.hybrid === true) return "hybrid";
  if (loc.remote === false && loc.hybrid === false) return "onsite";
  return undefined;
}

const SECTION_ORDER = ["companyDescription", "jobDescription", "qualifications", "additionalInformation"];

export function srDescription(detail: SrPostingDetail): string | null {
  const sections = detail.jobAd?.sections ?? {};
  const keys = [...SECTION_ORDER, ...Object.keys(sections).filter((k) => !SECTION_ORDER.includes(k))];
  return joinHtml(keys.map((k) => sections[k]).map((s) => (s ? htmlSection(s.title, s.text) : null)));
}

/** List item (+ detail when fetched) → RawJob. Without a detail it is a light record (descriptionHtml null). */
export function mapSmartRecruitersPosting(
  item: SrPosting,
  detail: SrPostingDetail | null,
  target: CompanyTarget,
  company: string,
): RawJob | null {
  const p: SrPostingDetail = { ...item, ...(detail ?? {}) };
  const title = clean(p.name);
  const typeId = clean(p.typeOfEmployment?.id)?.toLowerCase() ?? "";
  let jobType = EMPLOYMENT[typeId] ?? jobTypeFromLabel(p.typeOfEmployment?.label);
  const experienceLevel = srLevel(p.experienceLevel, title);
  if (!jobType && experienceLevel === "intern") jobType = "internship";
  const comp = detail?.compensation;
  const salary = comp ? makeSalary({ min: comp.min, max: comp.max, currency: comp.currency, period: periodFromInterval(comp.period) }) : null;
  const department = [p.department?.label, p.function?.label].map((d) => clean(d)).find((d) => d && !/^other$/i.test(d));
  const url = clean(detail?.postingUrl) ?? `https://jobs.smartrecruiters.com/${encodeURIComponent(company)}/${encodeURIComponent(p.id)}`;
  const level = clean(p.experienceLevel?.id) === "not_applicable" ? null : clean(p.experienceLevel?.label);
  return buildJob("smartrecruiters", target, {
    sourceJobId: p.id,
    title,
    url,
    company: p.company?.name,
    locations: [srLocationText(p.location)],
    descriptionHtml: detail ? srDescription(detail) : null,
    postedAt: p.releasedDate,
    department,
    jobType,
    employmentTypeRaw: p.typeOfEmployment?.label,
    experienceLevel,
    experienceRaw: level,
    workMode: srWorkMode(p.location),
    isRemote: typeof p.location?.remote === "boolean" ? p.location.remote : undefined,
    salary,
    extra: extraOf({
      refNumber: clean(p.refNumber),
      uuid: clean(p.uuid),
      function: clean(p.function?.label),
      industry: clean(p.industry?.label),
      language: clean(p.language?.code),
      country: clean(p.location?.country)?.toUpperCase(),
      customFields: Object.fromEntries(
        (p.customField ?? [])
          .map((f) => [clean(f.fieldLabel), clean(f.valueLabel)] as const)
          .filter((pair): pair is readonly [string, string] => pair[0] !== null && pair[1] !== null && !isPersonalField(pair[0], pair[1]))
          .slice(0, 8)
          .map(([k, v]) => [truncate(k, 60), truncate(v, 120)]),
      ),
      applyFormUrl: clean(detail?.applyUrl),
      detail: detail ? "full" : "light",
    }),
  });
}

export const smartrecruiters: AtsAdapter = {
  id: "smartrecruiters",
  name: "SmartRecruiters",
  ats: "smartrecruiters",
  endpoint: `${API}/{id}/postings?limit=100&offset={n} + /postings/{postingId}`,
  async *scrapeTarget(ctx) {
    const company = smartRecruitersToken(ctx.target.token);
    const country = smartRecruitersCountry(ctx.target);
    const budget = new DetailBudget(maxDetails(ctx.env), ctx.log);
    let total: number | null = null;
    const postings = paginateOffset<SrPosting>({
      pageSize: SR_PAGE_SIZE,
      signal: ctx.signal,
      log: ctx.log,
      idOf: (p) => p.id,
      fetchPage: async (offset) => {
        const url = srListUrl(company, offset, country);
        const page = await getBoardJson<SrPage>(ctx, url);
        if (!Array.isArray(page?.content)) throw new UnexpectedResponseError(url, "expected { content: [...] }");
        total = typeof page.totalFound === "number" ? page.totalFound : null;
        const items = page.content.filter((p): p is SrPosting => clean(p?.id) !== null);
        return { items: items.map((p) => ({ ...p, id: String(p.id) })), total };
      },
    });
    for await (const item of postings) {
      if (ctx.isKnown(item.id)) {
        const light = mapSmartRecruitersPosting(item, null, ctx.target, company);
        if (light) yield light;
        else ctx.skip("missing id/title");
        continue;
      }
      if (!budget.take()) continue;
      let detail: SrPostingDetail | null;
      try {
        detail = await getDetailJson<SrPostingDetail>(ctx, srDetailUrl(company, item.id));
        budget.succeeded();
      } catch (error) {
        if (ctx.signal.aborted) throw error;
        budget.failedWith(error);
        continue;
      }
      if (!detail || detail.active === false) {
        ctx.skip("closed before detail fetch");
        continue;
      }
      const raw = mapSmartRecruitersPosting(item, detail, ctx.target, company);
      if (raw) yield raw;
      else ctx.skip("missing id/title");
    }
    if (total === 0) ctx.log.info(`board is empty (an unknown company id also looks like this: "${company}")`);
    budget.report();
  },
};
