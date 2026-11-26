# Uber (`uber`)

**Status:** DISABLED (`isEnabled → false`) · **Reason:** Cloudflare managed challenge for bots · **Interval:** 60 min

## What was checked (2026-11-26, EasyJobsBot UA, via the contract HTTP client and curl)

| URL | Result |
|---|---|
| `POST www.uber.com/api/loadSearchJobsResults` (old careers RPC) | 404 `Missing RPC handler` — gone; `www.uber.com/robots.txt` also has `disallow: */api/` |
| `www.uber.com/global/en/careers/list/…` | 301 → `jobs.uber.com/en/jobs/…` (careers moved to a Next.js site) |
| `GET jobs.uber.com/api/jobs/search/?location=…&page=…` (what the page calls; shape `{ jobs, totalJobs, totalPages, page, pageSize }`) | **403 `cf-mitigated: challenge`** ("Just a moment...") |
| `jobs.uber.com/en/jobs/?location=IND`, `/en/jobs/{id}/` | **403 challenge** (one bare `/en/jobs/` request passed once; consistent challenges otherwise) |
| `jobs.uber.com/robots.txt` | `Allow: /` |
| `jobs.uber.com/en/jobs/sitemap.xml` | 200 — ~856 bare job URLs, no titles/locations/dates |
| Public ATS boards | Greenhouse `uber`/`ubercareers` 404, Lever 404, Ashby 404, SmartRecruiters `Uber` = one 2021 test posting |

robots.txt allows crawling, but the site actively challenges our declared bot on every page that has job data. We do not work around bot challenges (no browser automation in production, no UA spoofing), so the scraper is registered but off. The sitemap alone can't produce useful RawJobs (no title, location or description).

**Revisit when:** Uber publishes a feed/ATS board, or the challenge is lifted for declared bots. The module (`src/sites/uber.ts`) keeps the company info and refuses to run (`list()` throws) so nothing is requested while disabled.
