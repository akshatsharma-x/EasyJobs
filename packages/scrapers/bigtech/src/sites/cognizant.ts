/**
 * Cognizant — careers.cognizant.com. DISABLED.
 *
 * robots.txt allows everything, but the search page (/global-en/jobs/, /india-en/jobs/) and every job
 * page (/{locale}/jobs/{id}/{slug}/) answer our bot UA with a Cloudflare "Just a moment…" challenge
 * (HTTP 403). The listing is server-rendered (no JSON XHR to use instead). Only /sitemap.xml is served
 * (~43k URLs, ~16k job URLs across locales, with lastmod). It has no titles, locations or descriptions,
 * and the same ~2.4k job set appears under every locale (india-en = us-en = uki-en), so it can't
 * even be India-filtered. Applications go to Cognizant's own portal (talent.cognizant.com/4681/
 * ?RRID={id}&TenantID=1…, CAPTCHA-protected), not a plain public ATS board, so there is no
 * registry fallback either.
 */
import type { RawJob } from "@easyjobs/contract";
import { defineCareerSite, type CompanyInfo } from "../lib";

export const COGNIZANT: CompanyInfo = {
  slug: "cognizant",
  name: "Cognizant",
  domain: "cognizant.com",
  careersUrl: "https://careers.cognizant.com/india-en/jobs/",
};

export const COGNIZANT_DISABLED_REASON =
  "careers.cognizant.com serves a Cloudflare bot challenge (403 \"Just a moment…\") to our honest bot UA on the job search " +
  "and job pages; only the sitemap (URLs without job data) is reachable, and applications run on talent.cognizant.com " +
  "(CAPTCHA), not a public ATS board. We don't bypass anti-bot challenges.";

export const cognizant = defineCareerSite<never>({
  company: COGNIZANT,
  name: "Cognizant Careers",
  intervalMinutes: 60,
  endpointType: "html (Cloudflare-challenged)",
  disabledReason: COGNIZANT_DISABLED_REASON,
  // eslint-disable-next-line require-yield
  async *list() {
    throw new Error(`cognizant is disabled: ${COGNIZANT_DISABLED_REASON}`);
  },
  idOf: () => null,
  toRawJob: (): RawJob | null => null,
});
