/**
 * Infosys — the unauthenticated job-search gateway the career.infosys.com Angular app calls.
 *
 *   GET https://intapgateway.infosysapps.com/careersci/search/intapjbsrch/getCareerSearchJobs?sourceId=1,21&searchText=ALL
 *   GET …/getCareerSearchJobs?sourceId=41&searchText=ALL                      (Infosys BPM)
 *   → [{ referenceCode "INFSYS-EXTERNAL-256886", postingTitle, roleDesignation, company, country,
 *        location "PUNE      ", functionalArea, unit, minExperienceLevel, maxExperienceLevel,
 *        educationalRequirement, technicalRequirement, preferredSkills "Domain->Sales->After Sales & Service,…",
 *        genericSkills, rolesResponsibilities (text), postingDescription, additionalResponsibility,
 *        createdOn (naive, IST), expiryDate, hotjob "Y"|"N", sourceId, … }]
 *   (…/getJobDesc?referenceCode=… returns the same fields for one job, so there is no detail call.)
 *
 * Source ids come from career.infosys.com/assets/json/sourcelist.json: 1 = Infosys Ltd India lateral,
 * 21 = Infosys Ltd India fresher, 41 = Infosys BPM India. The whole list comes back in one response.
 * Job pages: https://career.infosys.com/jobdesc?jobReferenceCode={code}&sourceId={id}.
 *
 * Access: career.infosys.com itself (HTML, even robots.txt) answers our bot UA with an Akamai
 * 403, so this scraper never requests that host; the gateway serves the bot UA, needs no token or
 * login, and has no robots.txt (404). Because the site's own front door blocks bots, the scraper is
 * OFF by default (opt in with ENABLE_INFOSYS=1, like ENABLE_LINKEDIN for P11). See docs/sites/infosys.md.
 */
import type { RawJob } from "@easyjobs/contract";
import {
  buildRawJob, defineCareerSite, detectJobType, joinSections, naiveToIso, postedAtFrom, titleCase, uniqueStrings, type CompanyInfo, type SiteContext,
} from "../lib";

export interface InfosysJob {
  referenceCode: string;
  postingTitle: string;
  roleDesignation?: string | null;
  company?: string | null;
  companyHiringTypeId?: number | null;
  country?: string | null;
  location?: string | null;
  functionalArea?: string | null;
  unit?: string | null;
  minExperienceLevel?: number | null;
  maxExperienceLevel?: number | null;
  educationalRequirement?: string | null;
  technicalRequirement?: string | null;
  preferredSkills?: string | null;
  genericSkills?: string | null;
  skills?: string | null;
  rolesResponsibilities?: string | null;
  postingDescription?: string | null;
  additionalResponsibility?: string | null;
  createdOn?: string | null;
  expiryDate?: string | null;
  hotjob?: string | null;
  sourceId?: number | null;
  requisitionId?: number | null;
  postingId?: number | null;
}

export const INFOSYS: CompanyInfo = {
  slug: "infosys",
  name: "Infosys",
  domain: "infosys.com",
  careersUrl: "https://career.infosys.com/joblist",
};

const GATEWAY = "https://intapgateway.infosysapps.com/careersci/search/intapjbsrch/getCareerSearchJobs";

/** Source groups requested per run: Infosys Ltd (lateral + fresher) and Infosys BPM. */
export const INFOSYS_SOURCES = ["1,21", "41"] as const;

const SOURCE_KIND: Record<number, string> = { 1: "lateral", 21: "fresher", 41: "bpm" };

export function infosysListUrl(sourceIds: string): string {
  return `${GATEWAY}?sourceId=${sourceIds}&searchText=ALL`;
}

export function infosysJobUrl(job: InfosysJob): string {
  const p = new URLSearchParams({ jobReferenceCode: job.referenceCode, sourceId: String(job.sourceId ?? 1) });
  return `https://career.infosys.com/jobdesc?${p.toString()}`;
}

/** Infosys timestamps carry no zone; the platform runs on IST. "2026-11-25T09:20:20.18" → UTC ISO. */
/** Infosys timestamps are naive IST wall-clock times (kept as a named export for tests/docs). */
export const istToIso = (value: string | null | undefined): string | null => naiveToIso(value, "+05:30");

/** "BANGALORE   " → "Bangalore, India"; "Kolkata(WB)" → "Kolkata, India". */
export function infosysLocations(job: InfosysJob): string[] {
  const country = job.country?.trim() || "India";
  return uniqueStrings(
    (job.location ?? "")
      .split(/[,/;]/)
      .map((c) => c.replace(/\([^)]*\)/g, "").trim())
      .filter(Boolean)
      .map((c) => `${/^[A-Z\s.-]+$/.test(c) ? titleCase(c) : c}, ${country}`),
  );
}

/** "Foundational->Process->Service Transition,Domain->Sales->After Sales & Service" → leaf skills (all skill fields use this taxonomy). */
export function infosysSkills(job: InfosysJob): string[] {
  const paths = [job.preferredSkills, job.genericSkills, job.skills].flatMap((s) => (s ?? "").split(/[,;]/));
  return uniqueStrings(paths.map((p) => p.split("->").pop()?.trim() ?? "")).filter((s) => s.length <= 60);
}

const list = (text: string | null | undefined): string | null => {
  const items = uniqueStrings((text ?? "").split(/[,;\n]/));
  return items.length > 1 ? items.map((i) => `- ${i}`).join("\n") : items[0] ?? null;
};

export function mapInfosysJob(job: InfosysJob): RawJob {
  const min = typeof job.minExperienceLevel === "number" ? job.minExperienceLevel : null;
  const max = typeof job.maxExperienceLevel === "number" ? job.maxExperienceLevel : null;
  const kind = SOURCE_KIND[job.sourceId ?? 1] ?? null;
  const url = infosysJobUrl(job);
  const isBpm = job.sourceId === 41 || /\bBPM\b/.test(job.company ?? "");
  return buildRawJob(INFOSYS, {
    sourceJobId: job.referenceCode,
    title: job.postingTitle,
    company: isBpm ? "Infosys BPM" : INFOSYS.name,
    sourceUrl: url,
    applyUrl: url,
    locations: infosysLocations(job),
    descriptionHtml: joinSections([
      { body: job.postingDescription },
      { title: "Roles and responsibilities", body: job.rolesResponsibilities },
      { title: "Additional responsibilities", body: job.additionalResponsibility },
      { title: "Technical requirements", body: job.technicalRequirement },
      { title: "Educational requirements", body: list(job.educationalRequirement) },
      { title: "Preferred skills", body: list(infosysSkills(job).join(",")) },
    ]),
    postedAt: postedAtFrom(istToIso(job.createdOn)),
    validThrough: istToIso(job.expiryDate),
    department: job.functionalArea ?? null,
    jobType: detectJobType({ title: job.postingTitle }),
    experienceLevel: kind === "fresher" ? "fresher" : /\bintern(ship)?\b/i.test(job.postingTitle) ? "intern" : undefined,
    experienceMin: min,
    experienceMax: max,
    experienceRaw: min !== null && max !== null ? `${min}-${max} years` : min !== null ? `${min}+ years` : max !== null ? `0-${max} years` : null,
    skills: infosysSkills(job),
    degrees: uniqueStrings((job.educationalRequirement ?? "").split(/[,;]/)),
    extra: {
      unit: job.unit,
      roleDesignation: job.roleDesignation,
      hiringType: kind,
      hotJob: job.hotjob === "Y" ? true : undefined,
      legalEntity: job.company,
      requisitionId: job.requisitionId,
    },
  });
}

/** Why Infosys is off by default (see docs/sites/infosys.md). */
export const INFOSYS_OPT_IN_REASON =
  "career.infosys.com answers our bot user agent with an Akamai 403 (even robots.txt), so Infosys signals it doesn't want bots; " +
  "the JSON gateway the site uses is open (no token, no robots.txt), but using it is left to the operator: set ENABLE_INFOSYS=1.";

export const infosys = defineCareerSite<InfosysJob>({
  company: INFOSYS,
  name: "Infosys Careers",
  intervalMinutes: 60,
  endpointType: "json (gateway, full list per source)",
  optIn: { env: "ENABLE_INFOSYS", reason: INFOSYS_OPT_IN_REASON },
  async *list(ctx: SiteContext) {
    let total = 0;
    for (const sources of INFOSYS_SOURCES) {
      const jobs = await ctx.http.json<InfosysJob[]>(infosysListUrl(sources), { timeoutMs: 60_000 });
      if (!Array.isArray(jobs)) throw new Error(`unexpected response for sourceId=${sources}`);
      total += jobs.length;
      ctx.reportTotal(total);
      yield* jobs;
    }
  },
  idOf: (j) => j.referenceCode,
  keep: (j) => !j.country || /india/i.test(j.country),
  toRawJob: (j) => mapInfosysJob(j),
});
