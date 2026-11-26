/**
 * Uber — DISABLED (anti-bot challenge).
 *
 * Findings (verified 2026-11-26 with the EasyJobsBot UA through the contract HTTP client):
 *  - www.uber.com/api/loadSearchJobsResults (the old careers RPC) is gone ("Missing RPC handler"),
 *    and www.uber.com/robots.txt disallows *\/api/ anyway.
 *  - Careers moved to https://jobs.uber.com (Next.js). Its JSON search API
 *    (GET /api/jobs/search/?location=…&page=… → { jobs, totalJobs, totalPages, page, pageSize }), the
 *    listing pages (/en/jobs/?location=IND) and job pages (/en/jobs/{id}/) answer with a Cloudflare
 *    managed challenge (HTTP 403, `cf-mitigated: challenge`, "Just a moment...") for our client. Only
 *    robots.txt and the sitemaps are served (jobs sitemap: ~856 bare URLs, no titles or locations).
 *  - No public ATS board: Greenhouse/Lever/Ashby 404; SmartRecruiters "Uber" holds one 2021 test posting.
 * We do not work around bot challenges, so this scraper stays off. Revisit if Uber publishes a feed
 * or the challenge is lifted for declared bots.
 */
import { defineCareerSite, type CompanyInfo } from "../lib";

export const UBER: CompanyInfo = {
  slug: "uber",
  name: "Uber",
  domain: "uber.com",
  careersUrl: "https://jobs.uber.com/en/jobs/?location=IND",
};

export const UBER_DISABLED_REASON =
  "jobs.uber.com (search API, listings and job pages) answers bots with a Cloudflare managed challenge (403, cf-mitigated: challenge); the old www.uber.com careers API is gone and */api/ is robots-disallowed; no public ATS board.";

export const uber = defineCareerSite<never>({
  company: UBER,
  name: "Uber Careers",
  intervalMinutes: 60,
  endpointType: "json (Cloudflare-challenged) — disabled",
  disabledReason: UBER_DISABLED_REASON,
  // eslint-disable-next-line require-yield
  async *list() {
    throw new Error(`uber is disabled: ${UBER_DISABLED_REASON}`);
  },
  idOf: () => null,
  toRawJob: () => null,
});
