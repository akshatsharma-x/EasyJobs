/**
 * LTIMindtree (rebranded "LTM" in 2026; www.ltimindtree.com/careers → www.ltm.com/careers).
 *
 * ltm.com/careers sends India candidates to RippleHire and other regions to a SuccessFactors
 * board, so this scraper reads both official sources:
 *
 * 1. RippleHire (India) — the endpoints the candidate SPA itself calls, with the public
 *    career-site token that ltm.com links to (a static site id, not a session token):
 *      POST https://ltm.ripplehire.com/candidate/candidatejobsearch
 *           form: careerSiteUrlParams={"page":N,"search":"*:*","token":…,"source":"CAREERSITE","pagesize":50,"geo":"India"}&lang=en
 *           → { totalJobCount, jobVoList: [{ jobSeq, jobTitle, locations, jobReqExp, jobMinExp, jobMaxExp (years), jobCode, … }] }
 *      GET  https://ltm.ripplehire.com/candidate/candidatejobdetail?token=…&jobSeq={id}&source=CAREERSITE&lang=en
 *           → { jobVO: { jobDesc (HTML), jobSkills (HTML), jobPostingDate "24-Nov-2026",
 *               publishDetails.CAREER_SITE (ISO), jobTypeCustom3 "Permanent", … } }  (needs Accept: application/json)
 *    The public job page is a hash route (#detail/job/{id}); URL canonicalisation drops hashes, so
 *    applyUrl also carries `jobSeq={id}` as a query param (the SPA accepts it) to stay unique per job.
 *    ltm.ripplehire.com/robots.txt redirects to a login page (no rules published).
 *
 * 2. SuccessFactors RMK (careers.ltm.com) — its /sitemap.xml is actually an RSS feed with every
 *    posting (title "(City, ST, CC)", link, g:location, g:job_function, g:expiration_date and the
 *    full description). Almost all are outside India; the India ones are kept. One request per run.
 */
import type { RawJob } from "@easyjobs/contract";
import {
  buildRawJob, cleanInline, defineCareerSite, detectJobType, htmlToText, isIndiaLocation, isOpenToIndia, joinSections,
  maxPagesFrom, pageSizeFrom, paginate, parseRssItems, postedAtFrom, readableIndiaLocation, toIsoDate, uniqueStrings,
  unescapeHtmlIfEscaped, type CompanyInfo, type RssItem, type SiteContext,
} from "../lib";

export const LTIMINDTREE: CompanyInfo = {
  slug: "ltimindtree",
  name: "LTIMindtree",
  domain: "ltimindtree.com",
  careersUrl: "https://www.ltm.com/careers",
};

const RH = "https://ltm.ripplehire.com/candidate";
/** Public career-site token from the "India" link on www.ltm.com/careers. */
export const RIPPLEHIRE_TOKEN = "xviyQvbnyYZdGtozXoNm";
const SF_FEED = "https://careers.ltm.com/sitemap.xml";

export interface RippleJob {
  jobSeq: string;
  jobId?: string | null;
  jobTitle: string;
  jobLocation?: string | null;
  locations?: string | null;
  jobReqExp?: string | null;
  jobMinExp?: number | null;
  jobMaxExp?: number | null;
  jobCode?: string | null;
  numOfOpening?: string | null;
}

export interface RippleSearchResponse {
  totalJobCount: number;
  jobVoList: RippleJob[] | null;
  errorStatus?: unknown;
}

export interface RippleJobDetail {
  jobSeq: string;
  jobTitle?: string | null;
  jobDesc?: string | null;
  jobSkills?: string | null;
  jobPostingDate?: string | null;
  jobTypeCustom3?: string | null;
  jobType?: string | null;
  jobStatus?: string | null;
  publishDetails?: Record<string, string> | null;
  mobileReqJobExp?: string | null;
}

export type LtimItem = { kind: "rh"; job: RippleJob } | { kind: "sf"; item: RssItem };

export function rippleSearchBody(page: number, pageSize: number): URLSearchParams {
  const params = { page, search: "*:*", token: RIPPLEHIRE_TOKEN, source: "CAREERSITE", pagesize: pageSize, geo: "India" };
  return new URLSearchParams({ careerSiteUrlParams: JSON.stringify(params), lang: "en" });
}

export function rippleDetailUrl(jobSeq: string): string {
  return `${RH}/candidatejobdetail?${new URLSearchParams({ token: RIPPLEHIRE_TOKEN, jobSeq, source: "CAREERSITE", lang: "en" }).toString()}`;
}

/** Public job page; `jobSeq` is repeated as a query param so the URL is unique without its hash. */
export function rippleJobUrl(jobSeq: string): string {
  return `${RH}/?token=${RIPPLEHIRE_TOKEN}&lang=en&source=CAREERSITE&jobSeq=${encodeURIComponent(jobSeq)}#detail/job/${encodeURIComponent(jobSeq)}`;
}

/**
 * "Mumbai/Pune/Chennai" → ["Mumbai, India", …]; "Chennai - Tamilnadu" → ["Chennai, India"];
 * "India" / the "Select Location" placeholder → ["India"] (the search is filtered to geo=India).
 */
export function rippleLocations(raw: string | null | undefined): string[] {
  const s = cleanInline(raw);
  if (!s || /^select location$/i.test(s) || /^india$/i.test(s)) return ["India"];
  const out = uniqueStrings(
    s.split(/\s*[/,;|]\s*/).filter((part) => part && !/^select location$/i.test(part)).map((part) => {
      const city = part.split(/\s+-\s+/)[0]!.trim();
      const name = isIndiaLocation(city) ? city : part;
      return /\bindia\b/i.test(name) ? name : `${name}, India`;
    }),
  );
  return out.length > 0 ? out : ["India"];
}

function splitSkills(list: string): string[] {
  return list.split(/\s*[+,;]\s*|\.\s+(?=[A-Z])/).map((x) => cleanInline(x).replace(/\.$/, ""));
}

/**
 * "Mandatory Skills : Angular + SAP Spartacus" and "Mandatory Skills : MDG Functional
 * Good to Have Skills : SAP Signavio, SAP IP-Tools" → mandatory skills first, then good-to-have.
 */
export function rippleSkills(html: string | null | undefined): string[] {
  const text = cleanInline(htmlToText(html) ?? "");
  const mandatory = /(?:Mandatory|Primary)?\s*Skills?\s*:\s*(.+?)(?=\s*Good to Have Skills?\s*:|$)/i.exec(text)?.[1] ?? "";
  const good = /Good to Have Skills?\s*:\s*(.+)$/i.exec(text)?.[1] ?? "";
  return uniqueStrings([...splitSkills(mandatory), ...splitSkills(good)]).filter((x) => x.length >= 2 && x.length <= 60).slice(0, 12);
}

export function mapRippleJob(job: RippleJob, detail: RippleJobDetail | null): RawJob {
  const url = rippleJobUrl(job.jobSeq);
  const employment = cleanInline(detail?.jobTypeCustom3) || null;
  const published = detail?.publishDetails?.CAREER_SITE ?? null;
  const min = typeof job.jobMinExp === "number" ? job.jobMinExp : null;
  const max = typeof job.jobMaxExp === "number" ? job.jobMaxExp : null;
  return buildRawJob(LTIMINDTREE, {
    sourceJobId: job.jobSeq,
    title: job.jobTitle,
    sourceUrl: url,
    applyUrl: url,
    locations: rippleLocations(job.locations ?? job.jobLocation),
    descriptionHtml: detail ? joinSections([{ body: detail.jobDesc?.replace(/\r\n?/g, "\n") }, { title: "Skills", body: detail.jobSkills?.replace(/\r\n?/g, "\n") }]) : null,
    postedAt: detail ? (postedAtFrom(published) ?? postedAtFrom(detail.jobPostingDate)) : null,
    employmentTypeRaw: employment,
    jobType: detectJobType({ title: job.jobTitle, employmentType: employment }),
    experienceRaw: cleanInline(job.jobReqExp) || null,
    experienceMin: min,
    experienceMax: max !== null && min !== null && max >= min ? max : null,
    skills: rippleSkills(detail?.jobSkills),
    extra: {
      jobCode: job.jobCode,
      openings: job.numOfOpening ? Number(job.numOfOpening) || undefined : undefined,
      requisitionDate: detail?.jobPostingDate ? toIsoDate(detail.jobPostingDate) : undefined,
      board: "ripplehire",
    },
  });
}

/** "Specialist - Software Engineering (Chennai, TN, IN)" → "Specialist - Software Engineering". */
export function stripTitleLocation(title: string): string {
  return cleanInline(title.replace(/\s*\([^()]*\b[A-Z]{2}\)\s*$/, ""));
}

export function sfLocation(item: RssItem): string | null {
  const loc = item.fields["g:location"] ?? /\(([^()]*)\)\s*$/.exec(item.title ?? "")?.[1] ?? null;
  if (!loc) return null;
  const parts = loc.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2 && /^(IN|IND|India)$/i.test(parts.at(-1)!)) {
    return readableIndiaLocation(parts[0], parts.length >= 3 ? parts[1] : null, parts.at(-1));
  }
  return cleanInline(loc);
}

export function mapSfItem(item: RssItem): RawJob | null {
  const id = item.fields["g:id"] ?? item.guid;
  if (!id || !item.link || !item.title) return null;
  const title = stripTitleLocation(item.title);
  const location = sfLocation(item);
  return buildRawJob(LTIMINDTREE, {
    sourceJobId: `sf-${id}`,
    title,
    sourceUrl: item.link,
    applyUrl: item.link,
    locations: [location],
    descriptionHtml: item.description ? unescapeHtmlIfEscaped(item.description) : null,
    postedAt: null,
    validThrough: toIsoDate(item.fields["g:expiration_date"]),
    department: item.fields["g:job_function"] ?? null,
    jobType: detectJobType({ title }),
    extra: { employer: item.fields["g:employer"], board: "successfactors" },
  });
}

export const ltimindtree = defineCareerSite<LtimItem, RippleJobDetail>({
  company: LTIMINDTREE,
  name: "LTIMindtree (LTM) Careers",
  intervalMinutes: 60,
  endpointType: "json (RippleHire candidate API) + RSS (SuccessFactors feed)",
  async *list(ctx: SiteContext) {
    // SuccessFactors board first: its few India items need no detail call, and listing them first
    // keeps them from being deferred when the per-run detail budget is spent on RippleHire jobs.
    const xml = await ctx.http.text(SF_FEED, { headers: { accept: "application/rss+xml,application/xml;q=0.9,*/*;q=0.5" } });
    const india = parseRssItems(xml).filter((it) => isOpenToIndia([sfLocation(it)]));
    ctx.reportTotal(india.length);
    for (const item of india) yield { kind: "sf", item };

    const size = pageSizeFrom(ctx.env, 50, 50);
    for await (const job of paginate<RippleJob>({
      onTruncated: (reason) => ctx.markIncomplete?.(reason),
      pageSize: size,
      maxPages: maxPagesFrom(ctx.env, 60),
      signal: ctx.signal,
      idOf: (j) => j.jobSeq,
      fetchPage: async (i) => {
        const res = await ctx.http.json<RippleSearchResponse>(`${RH}/candidatejobsearch`, {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded; charset=UTF-8" },
          body: rippleSearchBody(i, size),
        });
        if (!Array.isArray(res.jobVoList) && i === 0) throw new Error(`unexpected RippleHire response: ${JSON.stringify(res).slice(0, 200)}`);
        if (typeof res.totalJobCount === "number") ctx.reportTotal(res.totalJobCount + india.length);
        return { items: res.jobVoList ?? [], total: res.totalJobCount };
      },
    })) {
      yield { kind: "rh", job };
    }
  },
  idOf: (it) => (it.kind === "rh" ? it.job.jobSeq : `sf-${it.item.fields["g:id"] ?? it.item.guid ?? ""}`),
  async detail(it, ctx) {
    if (it.kind !== "rh") return null;
    const res = await ctx.http.json<{ jobVO?: RippleJobDetail | null }>(rippleDetailUrl(it.job.jobSeq));
    return res.jobVO ?? null;
  },
  toRawJob(it, detail, ctx) {
    if (it.kind === "sf") return mapSfItem(it.item);
    if (detail && detail.jobStatus && detail.jobStatus !== "ACTIVE") return null;
    // Unknown RippleHire job whose detail failed: retry next run instead of storing it bare.
    if (!detail && !(ctx.isKnown?.(it.job.jobSeq, LTIMINDTREE.slug) ?? false)) return null;
    return mapRippleJob(it.job, detail);
  },
});
