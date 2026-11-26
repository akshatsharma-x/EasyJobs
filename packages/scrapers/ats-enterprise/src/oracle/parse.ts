import type { CompanyTarget, RawJob } from "@easyjobs/contract";
import { toIso } from "../lib/dates";
import { cleanText, htmlToText, normalizeDescriptionHtml } from "../lib/html";
import { compact, mapEmploymentType, mapWorkMode, uniqStrings } from "../lib/mapping";
import { targetBase } from "../lib/run";
import type { OracleDetail, OracleRequisition } from "./schema";
import type { OracleSite } from "./token";

export const oracleJobId = (site: OracleSite, id: string): string => `${site.pod}:${id}`;
export const oracleJobUrl = (site: OracleSite, id: string): string => `${site.publicBase}/job/${encodeURIComponent(id)}`;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown): string => (typeof v === "string" ? cleanText(v) : "");

/** detail.workLocation / otherWorkLocations entries → "City, Region, Country". */
function workLocationStrings(list: readonly unknown[] | null | undefined): string[] {
  const out: string[] = [];
  for (const w of list ?? []) {
    if (!isObj(w)) continue;
    const parts = uniqStrings([str(w.TownOrCity ?? w.City), str(w.Region2 ?? w.Region1 ?? w.State), str(w.Country ?? w.CountryName)]);
    const label = parts.length > 0 ? parts.join(", ") : str(w.LocationName ?? w.Name);
    if (label) out.push(label);
  }
  return out;
}

/** Primary + work/secondary locations; the same city in two formats ("New York, NY, United States" / "New York, NY, US") is kept once. */
export function locations(primary: string | null | undefined, secondary: readonly { Name?: string | null }[] | null | undefined, extra: string[] = []): string[] {
  const cities = new Set<string>();
  return uniqStrings([primary ?? "", ...extra, ...(secondary ?? []).map((l) => l.Name ?? "")]).filter((loc) => {
    const parts = loc.split(",").map((p) => p.trim().toLowerCase());
    if (parts.length < 2) return true; // country-only secondary locations ("United States") stay
    const city = parts[0] ?? "";
    if (cities.has(city)) return false;
    cities.add(city);
    return true;
  });
}

/** Flex fields ("Years": "3 to 5+ years", "Job Type": "Regular Employee") → map. */
export function flexMap(detail: OracleDetail): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of detail.requisitionFlexFields ?? []) {
    const k = cleanText(f.Prompt ?? "");
    const v = cleanText(f.Value ?? "");
    if (k && v && k.length <= 120) out[k] = v.slice(0, 300);
  }
  return out;
}

/** Pay disclosed in a flex field ("Base Pay/Salary": "New York,NY $26.49-$33.17"); prose without numbers is ignored. */
export function salaryFromFlex(flex: Record<string, string>): string | undefined {
  const hit = Object.entries(flex).find(([k, v]) => /salary|pay|compensation|stipend|ctc/i.test(k) && /\d/.test(v) && /[$€£₹]|\b(?:USD|EUR|GBP|INR|CAD|AUD|SGD|LPA)\b/i.test(v));
  return hit?.[1];
}

function experienceFromFlex(flex: Record<string, string>): string | undefined {
  const hit = Object.entries(flex).find(([k, v]) => /\b(?:years?|experience)\b/i.test(k) && /\d|fresher|entry|graduate/i.test(v));
  return hit?.[1];
}

/** Description → responsibilities → qualifications → about the company, skipping empties and duplicates. */
export function composeDescription(d: OracleDetail): string | null {
  const sections: [string | null, string | null | undefined][] = [
    [null, d.ExternalDescriptionStr],
    ["Responsibilities", d.ExternalResponsibilitiesStr],
    ["Qualifications", d.ExternalQualificationsStr],
    ["About us", d.OrganizationDescriptionStr],
    ["About the company", d.CorporateDescriptionStr],
  ];
  const seen = new Set<string>();
  const parts: string[] = [];
  for (const [heading, html] of sections) {
    const clean = normalizeDescriptionHtml(html ?? null);
    if (!clean) continue;
    const key = htmlToText(clean).slice(0, 400).toLowerCase();
    if (!key || [...seen].some((k) => k === key || k.includes(key))) continue;
    seen.add(key);
    parts.push(heading ? `<h3>${heading}</h3>\n${clean}` : clean);
  }
  return parts.length > 0 ? parts.join("\n") : null;
}

function department(x: { Department?: string | null; Organization?: string | null; JobFamily?: string | null; Category?: string | null; JobFunction?: string | null }): string | undefined {
  const v = [x.Department, x.Organization, x.JobFamily, x.Category, x.JobFunction].map((s) => cleanText(s ?? "")).find(Boolean);
  return v || undefined;
}

function workMode(code: string | null | undefined, label: string | null | undefined): Pick<RawJob, "workMode" | "isRemote"> {
  const m = mapWorkMode(code) ?? mapWorkMode(label);
  return m ? { workMode: m, isRemote: m === "remote" } : {};
}

export function lightJob(site: OracleSite, target: CompanyTarget, r: OracleRequisition, now: Date): RawJob {
  const url = oracleJobUrl(site, r.Id);
  const employment = uniqStrings([r.JobSchedule, r.WorkerType, r.JobType, r.ContractType]);
  return compact({
    source: "oracle",
    sourceKind: "ats",
    sourceJobId: oracleJobId(site, r.Id),
    sourceUrl: url,
    applyUrl: url,
    title: cleanText(r.Title),
    ...targetBase(target),
    locations: locations(r.PrimaryLocation, r.secondaryLocations),
    descriptionHtml: null,
    postedAt: toIso(r.PostedDate, now),
    validThrough: r.PostingEndDate ? toIso(r.PostingEndDate, now) : undefined,
    department: department(r),
    employmentTypeRaw: employment.length > 0 ? employment.join(", ") : undefined,
    jobType: mapEmploymentType(...employment),
    ...workMode(r.WorkplaceTypeCode, r.WorkplaceType),
    extra: {
      oracle: compact({
        pod: site.pod,
        siteNumber: site.siteNumber,
        country: r.PrimaryLocationCountry ?? undefined,
        jobFunction: r.JobFunction ?? undefined,
        hotJob: r.HotJobFlag ?? undefined,
        shortDescription: r.ShortDescriptionStr ? cleanText(r.ShortDescriptionStr).slice(0, 400) : undefined,
        detail: false,
      }),
    },
  } satisfies RawJob);
}

export function fullJob(site: OracleSite, target: CompanyTarget, r: OracleRequisition, d: OracleDetail, now: Date): RawJob {
  const url = oracleJobUrl(site, r.Id);
  const flex = flexMap(d);
  const flexJobType = Object.entries(flex).find(([k]) => /job type|employment type|worker type|time type/i.test(k))?.[1];
  const employment = uniqStrings([d.JobSchedule ?? r.JobSchedule, d.WorkerType ?? r.WorkerType, d.JobType ?? r.JobType, d.ContractType ?? r.ContractType, flexJobType]);
  const skills = uniqStrings((d.skills ?? []).map((x) => x.Skill ?? "")).slice(0, 20);
  const studyLevel = cleanText(d.StudyLevel ?? r.StudyLevel ?? "");
  const extraLocations = [...workLocationStrings(d.workLocation), ...workLocationStrings(d.otherWorkLocations)];
  return compact({
    source: "oracle",
    sourceKind: "ats",
    sourceJobId: oracleJobId(site, r.Id),
    sourceUrl: url,
    applyUrl: url,
    title: cleanText(d.Title || r.Title),
    ...targetBase(target),
    locations: locations(d.PrimaryLocation ?? r.PrimaryLocation, d.secondaryLocations ?? r.secondaryLocations, extraLocations),
    descriptionHtml: composeDescription(d),
    postedAt: toIso(d.ExternalPostedStartDate, now) ?? toIso(r.PostedDate, now),
    validThrough: toIso(d.ExternalPostedEndDate ?? r.PostingEndDate, now) ?? undefined,
    department: department({ ...r, ...stripNulls(d) }),
    employmentTypeRaw: employment.length > 0 ? employment.join(", ") : undefined,
    jobType: mapEmploymentType(...employment, d.RequisitionType),
    experienceRaw: experienceFromFlex(flex),
    salaryRaw: salaryFromFlex(flex),
    skills: skills.length > 0 ? skills : undefined,
    degrees: studyLevel ? [studyLevel] : undefined,
    ...workMode(d.WorkplaceTypeCode ?? r.WorkplaceTypeCode, d.WorkplaceType ?? r.WorkplaceType),
    extra: {
      oracle: compact({
        pod: site.pod,
        siteNumber: site.siteNumber,
        country: d.PrimaryLocationCountry ?? r.PrimaryLocationCountry ?? undefined,
        category: d.Category ?? undefined,
        jobFunction: d.JobFunction ?? r.JobFunction ?? undefined,
        jobLevel: d.JobLevel ?? undefined,
        requisitionType: d.RequisitionType ?? undefined,
        openings: d.NumberOfOpenings ?? undefined,
        legalEmployer: d.LegalEmployer ?? undefined,
        hotJob: r.HotJobFlag ?? undefined,
        flex: Object.keys(flex).length > 0 ? flex : undefined,
        detail: true,
      }),
    },
  } satisfies RawJob);
}

function stripNulls<T extends Record<string, unknown>>(o: T): Partial<T> {
  const out: Partial<T> = {};
  for (const [k, v] of Object.entries(o)) if (v !== null && v !== undefined && v !== "") (out as Record<string, unknown>)[k] = v;
  return out;
}
