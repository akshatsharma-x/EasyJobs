import type { CompanyTarget, RawJob } from "@easyjobs/contract";
import { epochToIso } from "../lib/dates";
import { absoluteUrl, cleanText, normalizeDescriptionHtml } from "../lib/html";
import { compact, mapEmploymentType, mapWorkMode, uniqStrings } from "../lib/mapping";
import { targetBase } from "../lib/run";
import type { EfPcsxPosition, EfV2Position } from "./schema";

export type EightfoldApi = "v2" | "pcsx";

export interface EightfoldSite {
  /** https://{host} */
  origin: string;
  domain: string;
}

/** Token "https://{host}|{domain}" (§0.6). Without "|domain", target.domain is used. */
export function parseEightfoldToken(token: string, fallbackDomain: string | null): EightfoldSite {
  const [rawUrl, rawDomain] = token.split("|").map((x) => x.trim());
  let origin: string;
  try {
    origin = new URL(rawUrl ?? "").origin;
  } catch {
    throw new Error(`eightfold: token must be "https://{host}|{domain}", got "${token}"`);
  }
  const domain = rawDomain || fallbackDomain;
  if (!domain) throw new Error(`eightfold: no domain in token "${token}" and the target has no domain`);
  return { origin, domain };
}

/** API-independent view of one position. */
export interface EfPosition {
  api: EightfoldApi;
  id: string;
  title: string;
  locations: string[];
  /** epoch seconds */
  postedTs: number | null;
  department: string | null;
  businessUnit: string | null;
  workOption: string | null;
  flexibility: string | null;
  atsJobId: string | null;
  displayJobId: string | null;
  url: string;
  descriptionHtml: string | null;
  timeType: string[];
  customFields: Record<string, string>;
}

/** "Hyderabad,India" → "Hyderabad, India" */
const spaceCommas = (s: string): string => cleanText(s).replace(/\s*,\s*/g, ", ");

/** Stable public URL: keep the job path (and ?domain= when present), drop tracking-ish params like microsite. */
export function positionUrl(site: EightfoldSite, id: string, raw: string | null | undefined): string {
  const abs = absoluteUrl(raw ?? null, site.origin);
  if (abs) {
    const u = new URL(abs);
    const domain = u.searchParams.get("domain");
    return `${u.origin}${u.pathname}${domain ? `?domain=${encodeURIComponent(domain)}` : ""}`;
  }
  return `${site.origin}/careers/job/${encodeURIComponent(id)}`;
}

function customFields(p: EfV2Position): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(p.custom_JD?.data_fields ?? {})) {
    const values = (Array.isArray(v) ? v : [v]).filter((x): x is string | number => typeof x === "string" || typeof x === "number").map(String);
    const joined = uniqStrings(values).join(", ");
    if (joined && joined.length <= 300) out[k] = joined;
  }
  return out;
}

export function fromV2(site: EightfoldSite, p: EfV2Position): EfPosition {
  const custom = customFields(p);
  return {
    api: "v2",
    id: p.id,
    title: cleanText(p.posting_name || p.name),
    locations: uniqStrings((p.locations && p.locations.length > 0 ? p.locations : [p.location ?? ""]).map(spaceCommas)),
    postedTs: p.t_create ?? p.t_update ?? null,
    department: cleanText(p.department ?? "") || null,
    businessUnit: cleanText(p.business_unit ?? "") || null,
    workOption: p.work_location_option ?? null,
    flexibility: p.location_flexibility ?? null,
    atsJobId: p.ats_job_id ?? null,
    displayJobId: p.display_job_id ?? null,
    url: positionUrl(site, p.id, p.canonicalPositionUrl),
    descriptionHtml: normalizeDescriptionHtml(p.job_description),
    timeType: uniqStrings([custom.time_type ?? custom.employment_type ?? custom.job_type ?? ""]),
    customFields: custom,
  };
}

export function fromPcsx(site: EightfoldSite, p: EfPcsxPosition): EfPosition {
  const std = p.standardizedLocations ?? [];
  return {
    api: "pcsx",
    id: p.id,
    title: cleanText(p.name),
    locations: uniqStrings((std.length > 0 ? std : p.locations && p.locations.length > 0 ? p.locations : [p.location ?? ""]).map(spaceCommas)),
    postedTs: p.postedTs ?? p.creationTs ?? null,
    department: cleanText(p.department ?? "") || null,
    businessUnit: null,
    workOption: p.workLocationOption ?? null,
    flexibility: p.locationFlexibility ?? null,
    atsJobId: p.atsJobId ?? null,
    displayJobId: p.displayJobId ?? null,
    url: positionUrl(site, p.id, p.publicUrl ?? p.positionUrl),
    descriptionHtml: normalizeDescriptionHtml(p.jobDescription),
    timeType: uniqStrings(p.efcustomTextTimeType ?? []),
    customFields: {},
  };
}

export const eightfoldJobId = (site: EightfoldSite, id: string): string => `${site.domain}:${id}`;

/** List (light) or list+detail (full) → RawJob. Light records have descriptionHtml null. */
export function toRawJob(site: EightfoldSite, target: CompanyTarget, list: EfPosition, detail: EfPosition | null, now: Date): RawJob {
  const p = detail ?? list;
  // v2 details often null out work_location_option that the list had; custom_JD.work_type ("Onsite") is a last resort.
  const mode =
    mapWorkMode(p.workOption) ??
    mapWorkMode(list.workOption) ??
    mapWorkMode(p.flexibility ?? list.flexibility) ??
    mapWorkMode(p.customFields.work_type ?? p.customFields.workplace_type ?? p.customFields.location_type);
  const timeType = p.timeType.length > 0 ? p.timeType : list.timeType;
  return compact({
    source: "eightfold",
    sourceKind: "ats",
    sourceJobId: eightfoldJobId(site, list.id),
    // Same URL for light and full records (detail URLs may carry extra params).
    sourceUrl: list.url,
    applyUrl: list.url,
    title: p.title || list.title,
    ...targetBase(target),
    locations: p.locations.length > 0 ? p.locations : list.locations,
    descriptionHtml: detail ? detail.descriptionHtml : null,
    postedAt: epochToIso(list.postedTs ?? p.postedTs ?? Number.NaN, now),
    department: p.department ?? list.department ?? undefined,
    employmentTypeRaw: timeType.length > 0 ? timeType.join(", ") : undefined,
    jobType: mapEmploymentType(...timeType),
    ...(mode ? { workMode: mode, isRemote: mode === "remote" } : {}),
    extra: {
      eightfold: compact({
        api: list.api,
        domain: site.domain,
        positionId: list.id,
        atsJobId: p.atsJobId ?? list.atsJobId ?? undefined,
        displayJobId: p.displayJobId ?? list.displayJobId ?? undefined,
        businessUnit: p.businessUnit ?? list.businessUnit ?? undefined,
        locationFlexibility: p.flexibility ?? undefined,
        customFields: Object.keys(p.customFields).length > 0 ? p.customFields : undefined,
        detail: Boolean(detail),
      }),
    },
  } satisfies RawJob);
}
