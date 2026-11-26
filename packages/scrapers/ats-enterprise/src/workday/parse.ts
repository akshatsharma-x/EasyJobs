import type { CompanyTarget, RawJob } from "@easyjobs/contract";
import { dateOnlyToIso, parseRelativePosted, toIso } from "../lib/dates";
import { cleanText, normalizeDescriptionHtml } from "../lib/html";
import { compact, isPlaceholderLocation, levelFromWorkerType, mapEmploymentType, mapWorkMode, uniqStrings } from "../lib/mapping";
import { targetBase } from "../lib/run";
import type { WorkdayDetail, WorkdayPosting } from "./schema";
import type { WorkdaySite } from "./token";

/** Labels collected from the facet partition a posting was listed under. */
export interface WorkdayAnnotations {
  workerSubType?: string;
  /** Other partition facets: descriptor → value ("Job Category" → "Engineering"). */
  facets?: Record<string, string>;
}

export interface WorkdayListed {
  posting: WorkdayPosting;
  annotations: WorkdayAnnotations;
}

/** Last path segment's suffix after "_" → stable posting key ("…_JR2013016" → "JR2013016", "…_JR2027958-1"). */
export function postingKey(externalPath: string): string {
  const last = externalPath.split("?")[0]?.split("/").filter(Boolean).pop() ?? externalPath;
  const i = last.lastIndexOf("_");
  const key = i >= 0 && i < last.length - 1 ? last.slice(i + 1) : last;
  return key.trim();
}

/** sourceJobId: tenant-scoped so ids never collide across companies; identical for every site of a tenant. */
export const workdayJobId = (tenant: string, externalPath: string): string => `${tenant}:${postingKey(externalPath)}`;

const REQ_ID = /^(?:[A-Z]{1,6}[-_]?)?\d{3,}(?:[-_][A-Za-z0-9]+)?$/;

/** Requisition id from bulletFields (not always first: Intel sends ["Spotlight Job", "JR0289475"]). */
export function reqIdFromList(p: WorkdayPosting): string | null {
  for (const b of p.bulletFields ?? []) {
    const s = b.trim();
    if (REQ_ID.test(s)) return s;
  }
  const key = postingKey(p.externalPath).replace(/-\d{1,2}$/, "");
  return REQ_ID.test(key) ? key : null;
}

/** "/job/US-CA-Santa-Clara/…" → "US CA Santa Clara" (only used when the list says "3 Locations"). */
export function locationFromPath(externalPath: string): string | null {
  const segs = externalPath.split("/").filter(Boolean);
  const i = segs.indexOf("job");
  const raw = i >= 0 && segs.length > i + 2 ? segs[i + 1] : undefined;
  if (!raw) return null;
  const s = decodeURIComponent(raw).replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
  return s.length >= 2 ? s : null;
}

export function listLocations(p: WorkdayPosting, allowPathGuess: boolean): string[] {
  const text = cleanText(p.locationsText ?? "");
  if (text && !isPlaceholderLocation(text)) return [text];
  if (!allowPathGuess) return [];
  const guess = locationFromPath(p.externalPath);
  return guess ? [guess] : [];
}

export function publicUrl(site: WorkdaySite, externalPath: string): string {
  return `${site.publicBase}${externalPath.startsWith("/") ? "" : "/"}${externalPath}`;
}

function hints(annotations: WorkdayAnnotations, timeType: string | null | undefined): Partial<RawJob> {
  const jobType = mapEmploymentType(annotations.workerSubType, timeType);
  const experienceLevel = levelFromWorkerType(annotations.workerSubType);
  const raw = uniqStrings([annotations.workerSubType, timeType]).join(", ");
  const dept = Object.entries(annotations.facets ?? {}).find(([k]) => /job (?:category|family)|department|function|team/i.test(k))?.[1];
  return compact({
    jobType,
    experienceLevel,
    employmentTypeRaw: raw || undefined,
    department: dept,
  });
}

/**
 * Light record from list data only. `allowPathGuess` is false for known jobs: their stored
 * locations are better than a path-derived guess (locations are unioned on merge).
 */
export function lightJob(site: WorkdaySite, target: CompanyTarget, listed: WorkdayListed, now: Date, allowPathGuess: boolean): RawJob {
  const { posting, annotations } = listed;
  const url = publicUrl(site, posting.externalPath);
  const rel = parseRelativePosted(posting.postedOn, now);
  const workMode = mapWorkMode(posting.remoteType);
  return compact({
    source: "workday",
    sourceKind: "ats",
    sourceJobId: workdayJobId(site.tenant, posting.externalPath),
    sourceUrl: url,
    applyUrl: url,
    title: cleanText(posting.title),
    ...targetBase(target),
    locations: listLocations(posting, allowPathGuess),
    descriptionHtml: null,
    postedAt: rel?.iso ?? null,
    ...hints(annotations, undefined),
    ...(workMode ? { workMode, isRemote: workMode === "remote" } : {}),
    extra: {
      workday: compact({
        tenant: site.tenant,
        site: site.site,
        reqId: reqIdFromList(posting) ?? undefined,
        postedOn: posting.postedOn ?? undefined,
        postedAtApproximate: rel?.approximate || undefined,
        workerSubType: annotations.workerSubType,
        facets: annotations.facets,
        detail: false,
      }),
    },
  } satisfies RawJob);
}

/** Full record: list item + jobPostingInfo. */
export function fullJob(site: WorkdaySite, target: CompanyTarget, listed: WorkdayListed, detail: WorkdayDetail, now: Date): RawJob {
  const info = detail.jobPostingInfo;
  const { posting, annotations } = listed;
  const url = info.externalUrl && /^https?:\/\//i.test(info.externalUrl) ? info.externalUrl : publicUrl(site, posting.externalPath);
  const countryCode = info.jobRequisitionLocation?.country?.alpha2Code ?? info.country?.alpha2Code ?? null;
  const countryName = info.jobRequisitionLocation?.country?.descriptor ?? info.country?.descriptor ?? null;
  const primary = cleanText(info.location ?? "");
  // Append the country when the tenant's location label omits it ("Yokneam" → "Yokneam, Israel").
  const primaryWithCountry =
    primary && countryName && countryCode && !new RegExp(`\\b(?:${escapeRe(countryCode)}|${escapeRe(countryName)})\\b`, "i").test(primary)
      ? `${primary}, ${countryName}`
      : primary;
  const locations = uniqStrings([primaryWithCountry, ...(info.additionalLocations ?? [])]).filter((l) => !isPlaceholderLocation(l));
  const fallbackLocations = locations.length > 0 ? locations : listLocations(posting, true);
  const posted = (info.startDate ? dateOnlyToIso(info.startDate, now) ?? toIso(info.startDate, now) : null) ?? parseRelativePosted(info.postedOn ?? posting.postedOn, now)?.iso ?? null;
  const remote = mapWorkMode(info.remoteType ?? posting.remoteType);
  const allRemote = fallbackLocations.length > 0 && fallbackLocations.every((l) => /\bremote\b/i.test(l));
  const workMode = remote ?? (allRemote ? "remote" : undefined);
  return compact({
    source: "workday",
    sourceKind: "ats",
    sourceJobId: workdayJobId(site.tenant, posting.externalPath),
    sourceUrl: url,
    applyUrl: url,
    title: cleanText(info.title || posting.title),
    ...targetBase(target),
    locations: fallbackLocations,
    descriptionHtml: normalizeDescriptionHtml(info.jobDescription),
    postedAt: posted,
    validThrough: info.endDate ? toIso(info.endDate, now) : undefined,
    ...hints(annotations, info.timeType),
    ...(workMode ? { workMode, isRemote: workMode === "remote" } : {}),
    extra: {
      workday: compact({
        tenant: site.tenant,
        site: site.site,
        reqId: info.jobReqId ?? reqIdFromList(posting) ?? undefined,
        jobPostingId: info.jobPostingId ?? undefined,
        postingId: info.id ?? undefined,
        timeType: info.timeType ?? undefined,
        remoteType: info.remoteType ?? undefined,
        country: countryCode ?? undefined,
        workerSubType: annotations.workerSubType,
        facets: annotations.facets,
        canApply: info.canApply ?? undefined,
        legalEntity: detail.hiringOrganization?.name || undefined,
        detail: true,
      }),
    },
  } satisfies RawJob);
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
