/**
 * Flipkart — DISABLED.
 *
 * www.flipkartcareers.com is a static landing site; every "View jobs" link goes to TurboHire
 * (https://flipkart.turbohire.co/careerpage/4d757ba0-3d57-448a-b82c-238ed87ac90f), an ATS that no
 * other EasyJobs adapter covers. We don't collect it because:
 *  1. flipkart.turbohire.co/robots.txt says `User-agent: * / Disallow: /` and only allows Googlebot
 *     on /job/, /jobdescription/ and /careerpage/;
 *  2. the page's job API (thapi.azurewebsites.net) is called with a bearer JWT minted per session by
 *     GET /api/token/noauth — a harvested session token, which we don't use.
 * Re-check if Flipkart moves to an open board or publishes a feed (verified 2026-11-26).
 */
import { defineCareerSite, type CompanyInfo } from "../lib";

export const FLIPKART: CompanyInfo = {
  slug: "flipkart",
  name: "Flipkart",
  domain: "flipkart.com",
  careersUrl: "https://www.flipkartcareers.com/",
};

export const FLIPKART_DISABLED_REASON =
  "Jobs are only on TurboHire (flipkart.turbohire.co): robots.txt disallows all agents except Googlebot, and the job API needs a per-session token from /api/token/noauth.";

export const flipkart = defineCareerSite<never>({
  company: FLIPKART,
  name: "Flipkart Careers",
  intervalMinutes: 60,
  endpointType: "none (TurboHire; robots-disallowed + session token)",
  disabledReason: FLIPKART_DISABLED_REASON,
  // eslint-disable-next-line require-yield
  async *list() {
    return;
  },
  idOf: () => null,
  toRawJob: () => null,
});
