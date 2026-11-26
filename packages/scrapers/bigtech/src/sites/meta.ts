/**
 * Meta — DISABLED, permanently (isEnabled → false); this module never contacts metacareers.com.
 *
 * metacareers.com/robots.txt opens with:
 *   "Notice: Collection of data on Facebook through automated means is prohibited unless you have
 *    express written permission from Facebook and may only be conducted for the limited purpose
 *    contained in said permission. See: http://www.facebook.com/apps/site_scraping_tos_terms.php"
 * and the job search is a GraphQL endpoint that needs per-session lsd / fb_dtsg tokens (anti-CSRF /
 * anti-bot). Both rule it out under the project's etiquette (§0.8): no anti-bot workarounds and no
 * collection against the site's stated terms. Meta roles can still arrive through other official
 * channels if Meta ever publishes a public feed or board; until then there is no Meta source.
 */
import { defineCareerSite, type CompanyInfo } from "../lib";

export const META: CompanyInfo = {
  slug: "meta",
  name: "Meta",
  domain: "meta.com",
  careersUrl: "https://www.metacareers.com/jobs",
};

export const META_DISABLED_REASON =
  'metacareers.com robots.txt: "Collection of data on Facebook through automated means is prohibited unless you have express written permission from Facebook" ' +
  "(facebook.com/apps/site_scraping_tos_terms.php); job search is a GraphQL API that requires per-session lsd/fb_dtsg tokens.";

export const meta = defineCareerSite<never>({
  company: META,
  name: "Meta Careers",
  intervalMinutes: 60,
  endpointType: "none — disabled (terms prohibit automated collection; GraphQL needs session tokens)",
  disabledReason: META_DISABLED_REASON,
  // Intentionally empty: even if called directly, this scraper makes no requests.
  async *list() {},
  idOf: () => null,
  toRawJob: () => null,
});
