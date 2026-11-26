# TCS — `tcs`

- **Status:** disabled (`isEnabled → false`) · **Endpoint type:** JSON (POST search) behind session/anti-bot tokens · **Interval:** 60 min
- **Careers page:** https://www.tcs.com/careers/india → https://ibegin.tcsapps.com/candidate/?geography=IN&language=EN

## What was tried
1. `ibegin.tcs.com` (old iBegin, incl. the old `POST /iBegin/api/v1/jobs/searchJ`) and `nextstep.tcs.com`: **NXDOMAIN**
   on the local resolver, 8.8.8.8, 1.1.1.1 and Google DoH (status 3). The hosts are gone.
2. `www.tcs.com/careers`: 403 to the bot UA (Chrome works). It links to the new portal `ibegin.tcsapps.com`.
3. `ibegin.tcsapps.com/robots.txt` 302-redirects to the SPA (no rules). The Angular app calls
   `POST https://ibegin.tcsapps.com/candidate/next/api/en-IN/search/jobs` with
   `{"includeRegularJob":true,"includeWalkIn":true,"searchTerms":[],"jobLocationFilters":[],"jobDomainFilters":[],"experienceLevelFilters":[],"skillFilters":[],"relevancySortOrder":null,"recentSortOrder":"desc","lastDateToApplySortOrder":null,"page":1,"resultsPerPage":10}`.
4. With the bot UA and no cookies that call returns **403 `{"message":"You don't have permission to access this resource."}`**.
   In Chrome it carries an **F5 BIG-IP ASM cookie (`TS0194f401…`) and a per-session `next-xsrf-token` header**.

**Reason disabled:** the only usable endpoint needs harvested session/anti-bot tokens. We don't work around that.

## Ready parser (if TCS ever opens the search)
Written against the response the page loaded in a real browser during discovery
(`test/fixtures/tcs/search-jobs-page1.json`): `payload{ totalElements 1482, totalPages, last, facets{locations,
domains, experiences (entry_level 819 = TCS "2-5 Years", middle_level 1439 = "5-14", senior_level 436 = "14-50"), skills},
content[{ id "376658J", title, location, domain, minimumExperienceInYears, maximumExperienceInYears, applyBy, skills[], walkIn }] }`.

| RawJob | Source |
|---|---|
| sourceJobId | `id` |
| sourceUrl / applyUrl | `https://ibegin.tcsapps.com/candidate/next/en-IN/jobs/{id}` (from the app's route table `:locale/jobs/:id`; unverified) |
| locations | "City, India" |
| validThrough | `applyBy` |
| experienceMin/Max/Raw | min/max years (TCS's "entry level" means 2–5 yrs, so the band isn't mapped to a level) |
| department | `domain` (title-cased) |
| skills | `skills[]` split on commas |
| tags | `walkIn` → "walk-in" |
| postedAt / descriptionHtml | not in the list (null) |

The list code is complete (1-based `page`, `resultsPerPage` 50, stop on `last`). Removing `disabledReason` is
pointless while the API needs the tokens.
