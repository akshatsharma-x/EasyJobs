/**
 * Shared adapter for career sites on RippleHire (an Indian ATS with no P07/P08 adapter), used by
 * big Indian banks: Axis Bank (axisbank.ripplehire.com) and HDFC Bank (hdfcbank.ripplehire.com).
 *
 * Every tenant's public career site is `https://{host}/candidate/?token={siteToken}&source=CAREERSITE`.
 * The token is the tenant's static career-site key published in the bank's own "Careers" links
 * (HDFC's /candidate/careers redirects every visitor to it) — not a session or anti-bot token.
 *
 * List:   POST https://{host}/candidate/candidatejobsearch   (application/x-www-form-urlencoded)
 *         careerSiteUrlParams={"page":N,"search":"*:*","token":…,"source":"CAREERSITE","pagesize":50}&lang=en
 *         → { totalJobCount, startJobIndex, jobVoList:[{ jobId, jobTitle, jobReqExp "1 - 3 Years",
 *              jobMinExp, jobMaxExp (years), locations "Dabhoi, Vadodara", jobCode, numOfOpening }] }
 * Detail: GET https://{host}/candidate/candidatejobdetail?token=…&jobSeq={id}&source=CAREERSITE&lang=en
 *         → { jobVO: { jobDesc (HTML, sometimes a whole DOCX-exported document), jobSkills,
 *              jobPostingDate "25-Nov-2026", publishDetails.CAREER_SITE (ISO), jobType "R",
 *              jobTypeCustom3 (tenant-specific: "Onsite" at Axis, "Permanent" at HDFC), bussinessUnit,
 *              jobMinExp/jobMaxExp (MONTHS here) } }  — companyVO contact fields are ignored.
 * robots.txt on RippleHire hosts redirects into an SSO login page (no rules served).
 *
 * Job pages are hash-routed (#detail/job/{id}). §0.4 fingerprinting drops URL fragments, so the
 * job URL also carries `jobSeq={id}` as a real query parameter to stay unique per job.
 */
import type { RawJob } from "@easyjobs/contract";
import {
  buildRawJob, defineCareerSite, detectJobType, detectWorkMode, htmlToText, joinSections, jobTypeFromEmployment, maxPagesFrom,
  pageSizeFrom, paginate, parseExperienceYears, postedAtFrom, readableIndiaLocation, uniqueStrings,
  type CareerSiteScraper, type CompanyInfo, type SiteContext,
} from "../lib";

export interface RippleHireSite {
  company: CompanyInfo;
  /** Display name, e.g. "Axis Bank Careers". */
  name: string;
  /** "axisbank.ripplehire.com" */
  host: string;
  /** Public career-site token from the bank's careers link. */
  token: string;
  intervalMinutes: number;
  /** Meaning of jobTypeCustom3 on this tenant. */
  custom3: "workMode" | "employmentType" | "ignore";
}

export interface RippleHireListJob {
  jobId: string;
  jobSeq?: string | null;
  jobTitle: string;
  jobReqExp?: string | null;
  jobMinExp?: number | null;
  jobMaxExp?: number | null;
  locations?: string | null;
  jobCode?: string | null;
  numOfOpening?: string | null;
}

export interface RippleHireSearchResponse {
  totalJobCount?: number | null;
  startJobIndex?: number | null;
  errorStatus?: string | null;
  jobVoList?: RippleHireListJob[] | null;
}

export interface RippleHireJobVO {
  jobSeq?: string | null;
  jobTitle?: string | null;
  jobDesc?: string | null;
  jobSkills?: string | null;
  jobLocation?: string | null;
  locations?: string | null;
  jobReqExp?: string | null;
  jobType?: string | null;
  jobTypeCustom3?: string | null;
  jobPostingDate?: string | null;
  bussinessUnit?: string | null;
  jobCode?: string | null;
  numOfOpening?: string | null;
  isHotJob?: string | null;
  jobStatus?: string | null;
  publishDetails?: Record<string, string> | null;
}

export interface RippleHireDetailResponse {
  jobVO?: RippleHireJobVO | null;
}

export function rippleHireSearchUrl(site: RippleHireSite): string {
  return `https://${site.host}/candidate/candidatejobsearch`;
}

export function rippleHireSearchBody(site: RippleHireSite, page: number, pageSize: number): string {
  const params = { page, search: "*:*", token: site.token, source: "CAREERSITE", pagesize: pageSize };
  return `careerSiteUrlParams=${encodeURIComponent(JSON.stringify(params))}&lang=en`;
}

export function rippleHireDetailUrl(site: RippleHireSite, jobId: string): string {
  const p = new URLSearchParams({ token: site.token, jobSeq: jobId, source: "CAREERSITE", lang: "en" });
  return `https://${site.host}/candidate/candidatejobdetail?${p.toString()}`;
}

/** Public job page (hash-routed SPA) with jobSeq as a real query param for unique canonical URLs. */
export function rippleHireJobUrl(site: RippleHireSite, jobId: string): string {
  return `https://${site.host}/candidate/?token=${site.token}&source=CAREERSITE&jobSeq=${encodeURIComponent(jobId)}#detail/job/${encodeURIComponent(jobId)}`;
}

/** Whole DOCX-exported HTML documents → their <body> content; styles/scripts/comments removed. */
export function cleanRippleHireHtml(html: string | null | undefined): string | null {
  if (!html) return null;
  let s = String(html);
  const body = /<body\b[^>]*>([\s\S]*?)<\/body>/i.exec(s);
  if (body) s = body[1] ?? "";
  s = s
    .replace(/<!DOCTYPE[^>]*>/gi, "")
    .replace(/<(style|script|head)\b[\s\S]*?<\/\1>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/\s(style|class)="[^"]*"/gi, "")
    .replace(/<p>\s*(&nbsp;|\s)*<\/p>/gi, "")
    .trim();
  return htmlToText(s) ? s : null;
}

/** "Dabhoi, Vadodara, Halol" → ["Dabhoi, India", "Vadodara, India", "Halol, India"]. */
export function rippleHireLocations(raw: string | null | undefined): string[] {
  return uniqueStrings((raw ?? "").split(/[,;|]/).map((c) => c.trim()).filter(Boolean).map((c) => readableIndiaLocation(c, null, "IN")));
}

const JOB_TYPE_CODES: Record<string, RawJob["jobType"]> = { R: "full_time", P: "full_time", C: "contract", T: "temporary", I: "internship" };

export function mapRippleHireJob(site: RippleHireSite, job: RippleHireListJob, detail: RippleHireJobVO | null): RawJob {
  const title = detail?.jobTitle?.trim() || job.jobTitle;
  const desc = cleanRippleHireHtml(detail?.jobDesc);
  const skillsHtml = cleanRippleHireHtml(detail?.jobSkills);
  const norm = (s: string | null): string => (s ?? "").replace(/\s+/g, " ").trim().toLowerCase();
  const skillsText = norm(htmlToText(skillsHtml));
  const descText = norm(htmlToText(desc));
  // Many tenants paste the description into jobSkills too, or a placeholder ("Refer to the Job Description").
  const addSkills = skillsText.length > 60 && !descText.includes(skillsText.slice(0, 80));
  const years =
    typeof job.jobMinExp === "number" && typeof job.jobMaxExp === "number" && job.jobMaxExp >= job.jobMinExp
      ? { min: job.jobMinExp, max: job.jobMaxExp }
      : parseExperienceYears(job.jobReqExp ?? detail?.jobReqExp);
  const custom3 = detail?.jobTypeCustom3?.trim() || null;
  const employmentRaw = site.custom3 === "employmentType" ? custom3 : null;
  const jobType =
    detectJobType({ title, employmentType: employmentRaw }) ??
    (detail?.jobType ? JOB_TYPE_CODES[detail.jobType.trim().toUpperCase()] : undefined) ??
    jobTypeFromEmployment(employmentRaw);
  const url = rippleHireJobUrl(site, job.jobId);
  return buildRawJob(site.company, {
    sourceJobId: job.jobId,
    title,
    sourceUrl: url,
    locations: rippleHireLocations(detail?.locations || job.locations || detail?.jobLocation),
    descriptionHtml: joinSections([{ body: desc }, { title: "Skills", body: addSkills ? skillsHtml : null }]),
    postedAt: postedAtFrom(detail?.publishDetails?.CAREER_SITE) ?? postedAtFrom(detail?.jobPostingDate),
    department: detail?.bussinessUnit?.trim() || null,
    employmentTypeRaw: employmentRaw ?? detail?.jobType ?? null,
    experienceRaw: job.jobReqExp ?? detail?.jobReqExp ?? null,
    experienceMin: years?.min ?? null,
    experienceMax: years?.max ?? null,
    jobType,
    experienceLevel: jobType === "internship" ? "intern" : undefined,
    workMode: site.custom3 === "workMode" ? detectWorkMode(custom3) : undefined,
    extra: {
      jobCode: job.jobCode ?? detail?.jobCode,
      openings: job.numOfOpening ? Number(job.numOfOpening) || undefined : undefined,
      hotJob: detail?.isHotJob === "Y" ? true : undefined,
    },
  });
}

export function createRippleHireScraper(site: RippleHireSite): CareerSiteScraper {
  return defineCareerSite<RippleHireListJob, RippleHireJobVO>({
    company: site.company,
    name: site.name,
    intervalMinutes: site.intervalMinutes,
    endpointType: "json (RippleHire career-site API)",
    async *list(ctx: SiteContext) {
      const size = pageSizeFrom(ctx.env, 50, 50);
      yield* paginate<RippleHireListJob>({
        onTruncated: (reason) => ctx.markIncomplete?.(reason),
        pageSize: size,
        maxPages: maxPagesFrom(ctx.env, 250),
        signal: ctx.signal,
        idOf: (j) => String(j.jobId),
        fetchPage: async (page) => {
          const res = await ctx.http.json<RippleHireSearchResponse>(rippleHireSearchUrl(site), {
            method: "POST",
            headers: { "content-type": "application/x-www-form-urlencoded; charset=UTF-8" },
            body: rippleHireSearchBody(site, page, size),
          });
          if (res.errorStatus && res.errorStatus !== "success") throw new Error(`RippleHire search error: ${res.errorStatus}`);
          if (typeof res.totalJobCount === "number") ctx.reportTotal(res.totalJobCount);
          return { items: (res.jobVoList ?? []).filter((j) => j && j.jobId), total: res.totalJobCount ?? null };
        },
      });
    },
    idOf: (j) => j.jobId,
    detail: async (j, ctx) => (await ctx.http.json<RippleHireDetailResponse>(rippleHireDetailUrl(site, String(j.jobId)))).jobVO ?? null,
    toRawJob: (j, d) => mapRippleHireJob(site, j, d),
  });
}
