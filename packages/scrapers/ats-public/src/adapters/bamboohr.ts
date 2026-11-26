/**
 * BambooHR careers JSON (the public endpoints behind every {company}.bamboohr.com/careers page):
 *   List:   GET https://{company}.bamboohr.com/careers/list
 *   Detail: GET https://{company}.bamboohr.com/careers/{id}/detail
 * Not a formally documented API, so robots.txt is respected (it allows everything today).
 * An unknown subdomain answers 302 → www.bamboohr.com, treated as "board not found".
 * The list has no date or description: details are fetched for unknown postings within ATS_MAX_DETAILS;
 * known postings are emitted as light records. locationType: "0" on-site, "1" remote, "2" hybrid.
 * employmentStatusLabel is free text defined by each company ("A - Full Time", "Contractor / Full-Time").
 */
import type { CompanyTarget, RawJob, WorkMode } from "@easyjobs/contract";
import { UnexpectedResponseError } from "../core/errors";
import { DetailBudget } from "../core/details";
import { getBoardJson, getDetailJson } from "../core/http";
import { buildJob } from "../core/job";
import { maxDetails } from "../core/run";
import type { AtsAdapter } from "../core/types";
import { jobTypeFromLabel, levelFromLabel } from "../lib/hints";
import { joinLocation } from "../lib/location";
import { parseSalaryText } from "../lib/salary";
import { clean, extraOf } from "../lib/text";
import { careersOrigin } from "../lib/tokens";

export interface BambooLocation {
  city?: string | null;
  state?: string | null;
  province?: string | null;
  country?: string | null;
  addressCountry?: string | null;
  postalCode?: string | null;
}

export interface BambooListItem {
  id: string | number;
  jobOpeningName?: string | null;
  departmentId?: string | null;
  departmentLabel?: string | null;
  employmentStatusLabel?: string | null;
  employmentType?: string | null;
  location?: BambooLocation | null;
  atsLocation?: BambooLocation | null;
  isRemote?: boolean | null;
  locationType?: string | number | null;
}

export interface BambooDetail extends Omit<BambooListItem, "id"> {
  jobOpeningShareUrl?: string | null;
  jobOpeningStatus?: string | null;
  description?: string | null;
  compensation?: string | null;
  datePosted?: string | null;
  minimumExperience?: string | null;
}

export interface BambooList {
  meta?: { totalCount?: number };
  result?: BambooListItem[];
}

export interface BambooDetailResponse {
  result?: { jobOpening?: BambooDetail | null } | null;
}

export const bambooOrigin = (token: string): string => careersOrigin(token, "bamboohr.com");
export const bambooListUrl = (origin: string): string => `${origin}/careers/list`;
export const bambooDetailUrl = (origin: string, id: string): string => `${origin}/careers/${encodeURIComponent(id)}/detail`;

/** robots: true (company careers host) + redirect handling for dead subdomains. */
const OPTS = { robots: true, redirectIsNotFound: true } as const;

const LOCATION_TYPE: Record<string, WorkMode> = { "0": "onsite", "1": "remote", "2": "hybrid" };

export function bambooLocation(p: Pick<BambooListItem, "location" | "atsLocation">): string | null {
  const ats = p.atsLocation ?? {};
  const loc = p.location ?? {};
  return joinLocation([
    ats.city ?? loc.city,
    ats.state ?? ats.province ?? loc.state ?? loc.province,
    ats.country ?? loc.addressCountry ?? loc.country,
  ]);
}

export function mapBambooJob(item: BambooListItem, detail: BambooDetail | null, target: CompanyTarget, origin: string): RawJob | null {
  const p: BambooDetail & { id: string } = { ...item, ...(detail ?? {}), id: String(item.id) };
  const title = clean(p.jobOpeningName);
  const workMode = LOCATION_TYPE[clean(p.locationType) ?? ""];
  const location = bambooLocation(p);
  const compensation = clean(detail?.compensation);
  const country = p.atsLocation?.country ?? p.location?.addressCountry ?? null;
  const experience = clean(detail?.minimumExperience);
  return buildJob("bamboohr", target, {
    sourceJobId: p.id,
    title,
    url: clean(detail?.jobOpeningShareUrl) ?? `${origin}/careers/${encodeURIComponent(p.id)}`,
    locations: [location ?? (workMode === "remote" ? "Remote" : null)],
    descriptionHtml: detail?.description ?? null,
    postedAt: detail?.datePosted,
    department: p.departmentLabel,
    jobType: jobTypeFromLabel(p.employmentStatusLabel) ?? jobTypeFromLabel(p.employmentType),
    employmentTypeRaw: p.employmentStatusLabel ?? p.employmentType,
    experienceLevel: levelFromLabel(experience, title),
    experienceRaw: experience,
    workMode,
    isRemote: typeof p.isRemote === "boolean" ? p.isRemote : workMode ? workMode === "remote" : undefined,
    salary: compensation ? parseSalaryText(compensation, country) : null,
    salaryRaw: compensation,
    extra: extraOf({ departmentId: clean(p.departmentId), status: clean(detail?.jobOpeningStatus), detail: detail ? "full" : "light" }),
  });
}

export const bamboohr: AtsAdapter = {
  id: "bamboohr",
  name: "BambooHR",
  ats: "bamboohr",
  endpoint: "https://{company}.bamboohr.com/careers/list + /careers/{id}/detail",
  async *scrapeTarget(ctx) {
    const origin = bambooOrigin(ctx.target.token);
    const url = bambooListUrl(origin);
    const list = await getBoardJson<BambooList>(ctx, url, OPTS);
    if (!Array.isArray(list?.result)) throw new UnexpectedResponseError(url, "expected { result: [...] }");
    const budget = new DetailBudget(maxDetails(ctx.env), ctx.log);
    for (const item of list.result) {
      const id = clean(item.id);
      if (!id) {
        ctx.skip("missing id");
        continue;
      }
      if (ctx.isKnown(id)) {
        const light = mapBambooJob(item, null, ctx.target, origin);
        if (light) yield light;
        else ctx.skip("missing id/title");
        continue;
      }
      if (!budget.take()) continue;
      let detail: BambooDetail | null;
      try {
        const res = await getDetailJson<BambooDetailResponse>(ctx, bambooDetailUrl(origin, id), OPTS);
        detail = res?.result?.jobOpening ?? null;
        budget.succeeded();
      } catch (error) {
        if (ctx.signal.aborted) throw error;
        budget.failedWith(error);
        continue;
      }
      if (!detail || (detail.jobOpeningStatus && !/^open$/i.test(detail.jobOpeningStatus))) {
        ctx.skip("closed before detail fetch");
        continue;
      }
      const raw = mapBambooJob(item, detail, ctx.target, origin);
      if (raw) yield raw;
      else ctx.skip("missing id/title");
    }
    budget.report();
  },
};
