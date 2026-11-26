# Flipkart — `flipkart`

- **Status:** disabled (`isEnabled → false`) · **Endpoint type:** none usable
- **Careers page:** https://www.flipkartcareers.com/ → jobs on TurboHire: https://flipkart.turbohire.co/careerpage/4d757ba0-3d57-448a-b82c-238ed87ac90f

## Findings (2026-11-26)
- flipkartcareers.com is a static Bootstrap landing site (its robots.txt 301s to the home page, i.e. no rules). It has
  no job data; all job links go to TurboHire, an Indian ATS not covered by P07/P08.
- `flipkart.turbohire.co/robots.txt`: `User-agent: *` → `Disallow: /`; only Googlebot is allowed on `/job/`,
  `/jobdescription/`, `/careerpage/` and the Google jobs sitemap.
- The TurboHire page's API (`thapi.azurewebsites.net/api/...`) is called with a bearer JWT that the page mints per
  session via `GET /api/token/noauth` — a harvested session token.

**Decision:** disabled; we neither crawl a robots-disallowed host nor reuse session tokens. Re-check if Flipkart moves to
an open ATS board or publishes a feed.
