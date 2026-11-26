import { load } from "cheerio";
import { decodeEntities } from "../shared/block";
import { parseRelativeTime } from "../shared/relative-time";
import { absoluteUrl, cleanText } from "../shared/text";
import { companyPageUrl } from "./parse-listing";

export interface LinkedInCriteria {
  /** "Internship" · "Entry level" · "Associate" · "Mid-Senior level" · "Director" · "Executive" · "Not Applicable" */
  seniority: string | null;
  /** "Full-time" · "Part-time" · "Contract" · "Temporary" · "Internship" · "Volunteer" · "Other" */
  employmentType: string | null;
  /** e.g. "Engineering and Information Technology" */
  jobFunction: string | null;
  /** e.g. "IT Services and IT Consulting" */
  industries: string | null;
}

/** Guest job-posting fragment (jobs-guest/jobs/api/jobPosting/{id}). Job data only — never the poster/hiring team. */
export interface LinkedInDetail {
  title: string | null;
  company: string | null;
  companyUrl: string | null;
  location: string | null;
  postedText: string | null;
  postedAt: string | null;
  descriptionHtml: string | null;
  criteria: LinkedInCriteria;
  salaryText: string | null;
  /** Company/ATS URL behind "Apply" (decoded from /jobs/view/externalApply/…?url=…); null for Easy Apply. */
  offsiteApplyUrl: string | null;
  /** "No longer accepting applications" */
  closed: boolean;
}

const CRITERIA_KEYS: Record<string, keyof LinkedInCriteria> = {
  "seniority level": "seniority",
  "employment type": "employmentType",
  "job function": "jobFunction",
  industries: "industries",
};

export function parseLinkedInDetail(html: string, now: Date): LinkedInDetail {
  const $ = load(html);
  const top = $(".top-card-layout, .topcard").first();
  // cheerio wraps fragments in <html><body>, so <body> is always there as the fallback scope.
  const scope = top.length > 0 ? top : $("body");

  const criteria: LinkedInCriteria = { seniority: null, employmentType: null, jobFunction: null, industries: null };
  $(".description__job-criteria-item").each((_, el) => {
    const item = $(el);
    const label = cleanText(item.find(".description__job-criteria-subheader, h3").first().text())?.toLowerCase();
    const value = cleanText(item.find(".description__job-criteria-text, span").first().text());
    const key = label ? CRITERIA_KEYS[label] : undefined;
    if (key && value) criteria[key] = value;
  });

  const descriptionEl = $(".show-more-less-html__markup").first();
  const description = (descriptionEl.length > 0 ? descriptionEl : $(".description__text").first()).html()?.trim() ?? "";
  const postedText = cleanText($(".posted-time-ago__text").first().text());
  const orgLink = scope.find("a.topcard__org-name-link, .topcard__flavor a[href*='/company/']").first();

  return {
    title: cleanText(scope.find(".top-card-layout__title, .topcard__title").first().text()) ?? cleanText($("h1, h2").first().text()),
    company: cleanText(orgLink.text()) ?? cleanText(scope.find(".topcard__flavor").first().text()),
    companyUrl: companyPageUrl(orgLink.attr("href")),
    location: cleanText(scope.find(".topcard__flavor--bullet").first().text()),
    postedText,
    postedAt: parseRelativeTime(postedText, now),
    descriptionHtml: description.length > 0 ? description : null,
    criteria,
    salaryText: cleanText($(".compensation__salary").first().text()),
    offsiteApplyUrl: offsiteApplyUrl($("code#applyUrl").first().html() ?? ""),
    closed: $(".closed-job").length > 0 || /no longer accepting applications/i.test(scope.text()),
  };
}

/**
 * LinkedIn hides the off-site apply link in `<code id="applyUrl"><!--"https://www.linkedin.com/jobs/view/externalApply/…?url=<encoded>"--></code>`.
 * Returns the decoded company/ATS URL, or null when it is missing or points back at LinkedIn.
 */
export function offsiteApplyUrl(codeHtml: string): string | null {
  const raw = /"(https?:\/\/[^"]+)"/.exec(codeHtml)?.[1];
  const abs = absoluteUrl(raw ? decodeEntities(raw) : null);
  if (!abs) return null;
  const u = new URL(abs);
  const isLinkedIn = (host: string): boolean => /(^|\.)linkedin\.com$|(^|\.)lnkd\.in$/i.test(host);
  if (isLinkedIn(u.hostname)) {
    const target = absoluteUrl(u.searchParams.get("url"));
    return target && !isLinkedIn(new URL(target).hostname) ? target : null;
  }
  return abs;
}
