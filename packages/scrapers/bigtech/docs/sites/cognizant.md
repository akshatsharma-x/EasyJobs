# Cognizant — `cognizant`

- **Status:** disabled (`isEnabled → false`) · **Endpoint type:** server-rendered HTML behind a Cloudflare challenge · **Interval:** 60 min
- **Careers page:** https://careers.cognizant.com/india-en/jobs/

## Findings (2026-11-26)
- robots.txt: `User-agent: * / Allow: /`, `Sitemap: https://careers.cognizant.com/sitemap.xml`.
- `/global-en/jobs/`, `/india-en/jobs/` and every job page `/{locale}/jobs/{id}/{slug}/` return **403 with the
  Cloudflare "Just a moment…" challenge** to the bot UA. In Chrome they render server-side; the listing makes no
  JSON XHR we could use instead.
- `/sitemap.xml` *is* served (200, 7.3 MB): 43,506 URLs, 16,376 job URLs across locales, with `lastmod`. But it has no
  title, location or description. The same ~2.4k job set appears under every locale (`india-en` = `us-en` =
  `uki-en` = 2,461), so it can't even be India-filtered, and the job pages that would supply the data are challenged.
- The apply button goes to Cognizant's own candidate portal
  `https://talent.cognizant.com/4681/?RRID={id}&TenantID=1&STID=…` (Angular app with CAPTCHA). That isn't a plain
  public Workday/Oracle/Greenhouse/Lever/Eightfold board, so there's no registry fallback.

**Reason disabled:** anti-bot challenge on every page with job data; no token-free JSON alternative. We don't
bypass challenges or spoof browsers. The stub's `list()` throws if called and makes no requests.
