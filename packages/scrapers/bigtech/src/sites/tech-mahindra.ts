/**
 * Tech Mahindra — careers.techmahindra.com. DISABLED (see disabledReason / docs/sites/tech-mahindra.md).
 *
 * Findings (Nov 2026):
 *  - The portal is an ASP.NET WebForms app. CurrentOpportunity.aspx renders 12 job tiles
 *    (job code, IT/BPS, title, "Skill Set", "Experience : 4 - 7 Years", "Location : NAVI MUMBAI")
 *    and pages with `__doPostBack('…rptPager$ctl01$lnkPage','')`, i.e. a form POST that must replay
 *    the page's __VIEWSTATE / __EVENTVALIDATION state — page tokens we don't harvest.
 *  - There is no per-job public URL: "Apply/Shortlist" is a postback into Signin/Registration
 *    (login). Every job would share the listing URL, which would collapse them into a single
 *    fingerprint downstream (applyUrl-based dedupe).
 *  - No JSON/feed/sitemap (robots.txt 404, no .asmx/.ashx services), and no public ATS board
 *    (Greenhouse/Lever/Ashby 404, SmartRecruiters "TechMahindra" has 0 postings).
 * Re-check if the site adds job detail pages, a sitemap or JSON-LD.
 */
import { defineCareerSite, type CompanyInfo } from "../lib";

export const TECH_MAHINDRA: CompanyInfo = {
  slug: "tech-mahindra",
  name: "Tech Mahindra",
  domain: "techmahindra.com",
  careersUrl: "https://careers.techmahindra.com/CurrentOpportunity.aspx",
};

export const TECH_MAHINDRA_DISABLED_REASON =
  "careers.techmahindra.com is an ASP.NET WebForms portal: listing beyond the first 12 jobs needs __VIEWSTATE/__EVENTVALIDATION " +
  "postbacks, jobs have no public per-job URL (apply goes through login), and there is no JSON, feed, sitemap or public ATS board.";

export const techMahindra = defineCareerSite<never>({
  company: TECH_MAHINDRA,
  name: "Tech Mahindra Careers",
  intervalMinutes: 60,
  endpointType: "none (ASP.NET WebForms postbacks)",
  disabledReason: TECH_MAHINDRA_DISABLED_REASON,
  // eslint-disable-next-line require-yield
  async *list() {
    return;
  },
  idOf: () => null,
  toRawJob: () => null,
});
