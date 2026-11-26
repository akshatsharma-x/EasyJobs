# @easyjobs/scraper-ats-enterprise

Official jobs from the enterprise ATSs most large MNCs run their career sites on. One `Scraper` per
platform (`kind: "ats"`, `handlesAts` set), driven by `ctx.targets` with the token formats of
prompts.md §0.6. Every endpoint below was verified live on 2026-11-25/26 (UTC).

| Scraper id | Handles | Token (§0.6) | Verified fixture targets |
|---|---|---|---|
| `workday` | `workday` | `https://{tenant}.wd{N}.myworkdayjobs.com/{site}` (optional `/{locale}`; `wd{N}.myworkdaysite.com/recruiting/{tenant}/{site}` too) | NVIDIA, Salesforce (India-only), Intel, Workday, Analog Devices, Mastercard |
| `oracle` | `oracle` | `https://{pod}.fa.{region}.oraclecloud.com/hcmUI/CandidateExperience/{lang}/sites/{siteNumber}` **or a vanity URL** (`https://careers.ti.com/en/sites/CX`) | Oracle, JPMorgan Chase, Texas Instruments (vanity), Honeywell (vanity, India-only) |
| `eightfold` | `eightfold` | `https://{host}\|{domain}` | Netflix (legacy v2 API), PayPal (PCSX API, India-only) |
| `jsonld` | `jsonld` | careers site URL **or** sitemap URL | Boeing, Citi (India URLs only), Adobe (sitemap token) |
| `successfactors` | `successfactors` | careers site URL (RMK) | EY |
| `phenom` | `phenom` | career site URL with locale (`https://jobs.thermofisher.com/global/en`) | Thermo Fisher, Philips |
| `avature` | `avature` | portal URL (`https://bloomberg.avature.net/careers`) | Bloomberg, Deloitte US |
| `icims` | `icims` | portal URL (`https://careers-{co}.icims.com`) | — best-effort, see *Known gaps* |
| `taleo` | `taleo` | `https://{co}.taleo.net/careersection/{section}/jobsearch.ftl` | — best-effort, see *Known gaps* |

```bash
pnpm --filter @easyjobs/scraper-ats-enterprise scrape --scraper oracle --limit 40     # all oracle fixture targets
pnpm --filter @easyjobs/scraper-ats-enterprise scrape --scraper workday --target nvidia --limit 20
pnpm --filter @easyjobs/scraper-ats-enterprise test                                     # offline (fixtures)
LIVE=1 pnpm --filter @easyjobs/scraper-ats-enterprise test -- live                       # live smoke, 3 jobs per platform
```

With several targets, the CLI's `--limit` is split evenly (`ceil(limit / targets)`) so every fixture
target is sampled. The worker passes one target per call, so the split never matters there.

---

## How every adapter behaves

- **Listing is always complete.** `ctx.since` is *not* used to stop paging: the worker sweeps after
  every complete run (prompts.md P05), so a listing cut short by `since` would close live jobs.
- **Details only for unknown jobs** (`ctx.isKnown`), within a per-run budget (`*_MAX_DETAILS`). Known
  jobs are emitted as *light records* (list data, `descriptionHtml: null`) so they stay "seen";
  the DB never overwrites non-null fields with null.
- **Over-budget unknown jobs are deferred** (not emitted) by default: they were never stored, so the
  sweep is unaffected, and they are picked up *with* a description on the next run.
  `*_OVERFLOW=light` emits them as light records instead (visible sooner, but then known → no detail later).
- **Never sweep-unsafe.** If listing fails midway, a sitemap is unreadable, a crawl is stopped by
  throttling, or a known job could neither be fetched nor recalled, the generator yields what it has
  and then throws `IncompleteRunError`, so the worker skips the sweep. A 404/410/422 on the *first*
  list page means the board is gone: logged once, 0 jobs, normal finish (as P07 does).
- **Schema drift:** every list item and detail is `zod.safeParse`d on its own; bad items are skipped and
  counted (`invalidItems`, first 3 logged per target). Only identity fields are strict; others are
  loose (Phenom sends `multi_location` as strings in lists and objects on job pages).
- **Politeness:** a process-wide limiter per source on top of the contract client: ≤ 2 in flight,
  ≥ 400 ms between starts per tenant (defaults are slower where the platform asked for it — below).
  Retries happen in this package (`retries: 0` is passed to the contract client) so that 429/503
  back-off pauses *all* requests to the source, honours `Retry-After`, and never retries a challenge.
- **Anti-bot challenges are never bypassed.** A Cloudflare managed challenge (`cf-mitigated:
  challenge`, "Enable JavaScript and cookies to continue") or CAPTCHA page raises `BlockedError`: the
  source is paused, detail fetching stops at once, the run ends as incomplete, and the worker's
  back-off / circuit breaker takes over. No UA/TLS changes, no proxies, no cookies.
- **Timeouts:** per request (`*_TIMEOUT_MS`), plus a per-target wall-clock budget
  (`ATS_ENTERPRISE_TARGET_BUDGET_MIN`, default 25 min; Eightfold 30) that ends the run as incomplete.
- **Test postings** some tenants publish ("DO NOT APPLY - TEST REQ", "SA TEST OCT 15") are dropped
  (narrow pattern; "Test Engineer" passes).
- **No personal data:** recruiter names/e-mails present in Phenom and Oracle payloads are never copied.
- `RawJob`: `source` = scraper id, `sourceKind: "ats"`, `target` = registry slug, `company` = registry
  name, `companySlug`/`companyDomain` from the target, `applyUrl` = the official posting URL. Only
  *structured* hints are set (employment type, worker type → intern/new-grad level, workplace type,
  salary from structured fields); title/description keyword inference is left to `@easyjobs/normalize`.

---

## Workday

**List** — `POST https://{host}/wday/cxs/{tenant}/{site}/jobs`

```json
{ "appliedFacets": {}, "limit": 20, "offset": 0, "searchText": "" }
```
```json
{ "total": 2000,
  "jobPostings": [{ "title": "…", "externalPath": "/job/US-CA-Santa-Clara/Title_JR2013016",
                    "locationsText": "US, CA, Santa Clara" | "3 Locations", "postedOn": "Posted Today",
                    "bulletFields": ["JR2013016"] }],
  "facets": [{ "facetParameter": "jobFamilyGroup", "descriptor": "Job Category", "values": [{ "descriptor": "Engineering", "id": "0c40…", "count": 1613 }] },
             { "facetParameter": "locationMainGroup", "values": [{ "facetParameter": "locationHierarchy1", "descriptor": "Locations", "values": [{ "descriptor": "India", "id": "2fcb…", "count": 231 }] }] }] }
```

**Detail** — `GET https://{host}/wday/cxs/{tenant}/{site}{externalPath}` →
`jobPostingInfo { id, title, jobDescription (HTML), location, additionalLocations[], postedOn,
startDate "2026-11-25", timeType, jobReqId, jobPostingId, remoteType?, externalUrl, canApply,
country{descriptor,alpha2Code}, jobRequisitionLocation{descriptor,country{alpha2Code}} }`,
`hiringOrganization{name}` (a legal entity like "2100 NVIDIA USA" — not used as company).

**What changed / what we found live**
- `limit` > 20 → **HTTP 400**. Page size is fixed at 20.
- `total` is returned only on the first page by some tenants (later pages say `0`), on every page by
  others. We keep the max seen and stop on an empty/short page when it is unknown.
- **Result cap:** NVIDIA reports `total: 2000` although its facets add up to 2,629, and offsets ≥ 2000
  silently return page 1 again. Micron (2,898) pages past 2000 normally. The adapter detects a capped
  segment (total ≥ 2000 and a single-valued facet sums higher), splits it by the best covering facet
  (`jobFamilyGroup` for NVIDIA, every bucket < 2000, recursively up to depth 3) and stops on wrap-around
  (a page of already-seen postings).
- **Worker-type partition:** when a tenant has a complete "Job Type" facet (`workerSubType` — Regular
  Employee / Intern (Fixed Term) / New College Graduate / …; Σ counts = total) the listing is
  partitioned by it, early-career buckets first. Each job then carries a structured hint
  (`jobType: internship`, `experienceLevel: intern|fresher`) at the cost of a few extra first-page calls.
- `bulletFields[0]` is not always the req id (Intel: `["Spotlight Job", "JR0289475"]`).
- Multi-location postings show `"3 Locations"` in lists; the detail has `location` + `additionalLocations`.
  Light records for *unknown* jobs fall back to the externalPath segment ("US CA Santa Clara").
- `startDate` is the posting date in the tenant's time zone (matches "Posted N Days Ago").
- **India-only mode** (`extra.workdayCountry: "IN"` or `"India"`): facet names differ per tenant —
  `locationCountry` (ADI, Adobe), `Location_Country` (Workday), `locationHierarchy1` (NVIDIA),
  a custom `CF_-_REC_-_LRV_-_Job_Posting_Anchor_-_Country_from_Job_Posting_Location_Extended`
  (Salesforce) — or no country facet at all (Intel, Micron, Mastercard), where every site-level
  `locations` value mentioning India ("India, Bangalore", "Ahmedabad - MIB, India") is applied (OR).
- **Cloudflare managed challenge for Node.js:** after ~10 requests in ~8 s (≈1.3 req/s, 2 in flight)
  Workday's edge started answering our Node client with `429` + `cf-mitigated: challenge` on **every**
  `*.myworkdayjobs.com` tenant — and kept doing so even after 75 quiet minutes — while `curl` from the
  same IP kept getting 200. It keys on the client profile + IP reputation, not just rate. See
  docs/status/P08.md for the timeline; the adapter never tries to get around it. Hence a single **zone-wide** gate for all
  Workday tenants, 1 in flight, 3 s between requests by default, and an immediate stop on a challenge.
- `sourceJobId` = `{tenant}:{externalPath suffix}` (`nvidia:JR2013016`, `nvidia:JR2027958-1` for a
  second posting of a req) — stable, derivable before any detail call, identical across a tenant's sites.
- robots.txt (e.g. `Allow: /NVIDIAExternalCareerSite/`) does not disallow `/wday/cxs/`; robots stays on.

## Oracle Recruiting Cloud

**List** — `GET {apiBase}/hcmRestApi/resources/latest/recruitingCEJobRequisitions?onlyData=true&expand=requisitionList.secondaryLocations&finder=findReqs;siteNumber={siteNumber},limit=25,offset={n},sortBy=POSTING_DATES_DESC`
(+ `,selectedLocationsFacet={Id}` in country mode)

```json
{ "items": [{ "TotalJobsCount": 2859, "requisitionList": [{ "Id": "348884", "Title": "…", "PostedDate": "2026-11-25",
  "PostingEndDate": null, "PrimaryLocation": "Seattle, WA, United States", "PrimaryLocationCountry": "US",
  "secondaryLocations": [{ "Name": "United States", "CountryCode": "US" }], "WorkplaceTypeCode": null,
  "JobFamily": null, "JobFunction": null, "ShortDescriptionStr": "…", "HotJobFlag": true }],
  "locationsFacet": [{ "Id": 300000000289738, "Name": "United States", "TotalCount": 5004 }] }],
  "count": 1, "hasMore": false }
```
`TotalJobsCount` lives in `items[0]`; the top-level `hasMore` describes the search wrapper, not the jobs.

**Detail** — `GET …/recruitingCEJobRequisitionDetails?expand=all&onlyData=true&finder=ById;Id="{id}",siteNumber={siteNumber}` →
`items[0] { ExternalPostedStartDate "2026-11-25T21:09:16+00:00", ExternalPostedEndDate,
ExternalDescriptionStr, ExternalResponsibilitiesStr, ExternalQualificationsStr, CorporateDescriptionStr,
Category, JobFunction, JobSchedule, WorkerType, StudyLevel, WorkplaceTypeCode (ORA_REMOTE/ORA_HYBRID/ORA_ON_SITE),
requisitionFlexFields[{Prompt,Value}], skills[{Skill}], workLocation[{TownOrCity,Region2,Country}], secondaryLocations }`.

**Public URL** — `{publicBase}/job/{id}`; `sourceJobId` = `{pod}:{Id}` (`eeho:348884`).

**What we found live**
- Works as documented on oraclecloud hosts (Oracle 2,859 jobs, JPMC 6,792, Honeywell 1,339, TI 921).
- **Vanity domains**: careers.ti.com and careers.honeywell.com serve the CX app themselves. The page
  declares `data-apibaseurl="https://edbz.fa.us2.oraclecloud.com:443" data-sitenumber="CX"
  data-vanitybaseurl="https://careers.ti.com/"`; Honeywell's vanity code `Honeywell` ≠ its real
  `siteNumber` `CX_1`. The adapter resolves this once per process; public URLs use the vanity domain.
  `extra.oracleApiBase` / `extra.oracleSiteNumber` skip the lookup.
- Flex fields carry useful data: `"Years": "3 to 5+ years"` → `experienceRaw`; JPMC's
  `"Base Pay/Salary": "New York,NY $26.49-$33.17"` → `salaryRaw` (only when it contains a number and a currency).
- JPMC's `/robots.txt` is itself blocked by its WAF (403 for every UA) while the API answers 200; per the
  robots convention a 4xx robots file means "no restrictions", which is also what the contract client does.
- Country mode: `extra.country: "IN"` → the site's `locationsFacet` entry named India.

## Eightfold

Two API generations now coexist; tenants answer the *other* one with a 403 that names it:

| | Legacy v2 (Netflix) | PCSX (PayPal, Qualcomm) |
|---|---|---|
| List | `GET /api/apply/v2/jobs?domain={d}&start={n}&num=10&sort_by=timestamp[&location=India]` → `{ count, positions[] }` | `GET /api/pcsx/search?domain={d}&query=&location={loc}&start={n}&sort_by=timestamp` → `{ status, data: { count, positions[] } }` |
| Detail | `GET /api/apply/v2/jobs/{id}?domain={d}` → position + `job_description`, `custom_JD.data_fields` | `GET /api/pcsx/position_details?position_id={id}&domain={d}&hl=en` → `{ data: position + jobDescription, publicUrl, efcustomTextTimeType[] }` |
| Position | `id, name, locations ["Hyderabad,India"], t_create (epoch s), department, business_unit, ats_job_id, work_location_option, canonicalPositionUrl` | `id, name, locations, standardizedLocations ["Bengaluru, KA, IN"], postedTs, creationTs, department, workLocationOption, atsJobId, positionUrl` |
| Wrong generation | `403 {"message": "PCSX is not enabled for this user."}` | `403 {"message": "Not authorized for PCSX"}` |

The adapter asks v2 first, switches on that 403 hint and caches the answer per host
(`extra.eightfoldApi: "v2" | "pcsx"` forces one). Both cap `num` at **10**; list pages have no
descriptions. Responses were slow when cold (6–27 s), and 429s (no `Retry-After`) appeared after a
dozen quick requests — apparently per client across tenants. So Eightfold shares **one** gate for all
tenants: 1 in flight, 2.5 s apart, 60 s timeouts, 5 s → 30 s → 90 s back-off. `extra.country: "IN"` →
`location=India` (PayPal: 369 → 28 jobs). `sourceJobId` = `{domain}:{positionId}`.
robots.txt on Eightfold hosts allows exactly `/careers`, `/api/apply`, `/api/pcsx`.

## JSON-LD (generic career sites) — also the fallback engine

1. **Discover** job URLs: token is a sitemap → crawl it; token is a site → robots.txt `Sitemap:` lines,
   else `/sitemap.xml` and `/sitemap_index.xml` (site root and token path). Indexes are followed
   job-ish first (`/job|career|position|posting|vacanc|…/` in the *path* — hosts like `jobs.citi.com`
   are ignored for this), non-job sitemaps (blog, image, news, category…) skipped. No sitemap → the
   listing page and its `rel=next` / "Next" links. URLs are classified by path heuristics
   (`/job/…/{id}`, `/jobs/{slug}`, `?jobId=`; not `/search`, `/category`, `/locations`, `/apply`…);
   `extra.jobUrlPattern` / `extra.jobUrlExclude` (regex) override, `extra.jobHosts` adds hosts.
2. **Fetch** pages newest-first by `lastmod`, robots.txt respected, **≤ 1 request/second per host**,
   at most `JSONLD_MAX_PAGES` (200) per run.
3. **Extract** `<script type="application/ld+json">`: `@graph`, arrays, nested `mainEntity`/`ItemList`,
   `@type` arrays / `schema:` prefixes; lenient JSON (comments/CDATA, trailing `;`, raw newlines,
   invalid `\'` escapes, trailing commas, several concatenated objects). Falls back to schema.org
   **microdata** (SuccessFactors RMK pages). Entity-escaped (even double-escaped) descriptions are decoded.
4. **Map**: title, datePosted, validThrough (expired postings dropped), employmentType (string/array),
   hiringOrganization (+logo), jobLocation.address (numeric/one-letter region codes dropped, alpha-2
   countries expanded), jobLocationType `TELECOMMUTE` + applicantLocationRequirements → "Remote - India",
   baseSalary (MonetaryAmount/QuantitativeValue; HOUR/MONTH/YEAR, WEEK×52 and DAY×260 → year;
   placeholders like Radancy's empty `currency`/`unitText` and unit-less values never become a salary),
   experienceRequirements (text or `monthsOfExperience`), educationRequirements (text or
   `credentialCategory`), skills, occupationalCategory → department, identifier, url.
5. **Known jobs without list data**: sitemaps carry no titles, so a small page index
   (`.cache/state/{scraper}-{target}.json`, or `ATS_ENTERPRISE_STATE_DIR`; `off` disables) remembers
   title/locations/dates per URL. Known + remembered → light record without a request; a newer
   `lastmod` triggers a refetch; non-job pages are re-checked after 7 days. A known URL that can be
   neither fetched (cap/errors) nor recalled makes the run incomplete — never a wrongful sweep.
6. **Zero discovered URLs is an error**, not "all jobs closed".

`sourceJobId` = `{host}:{id-like path segment or id query param}` (`jobs.boeing.com:95642229872`,
`careers.adobe.com:R172284`), else `{host}:{path}`.

Live: Boeing (Radancy, 1,173 job URLs among category pages; no `Sitemap:` line), Citi (3,195 → 660
with the India `jobUrlPattern`), Adobe (Phenom sitemap, escaped descriptions). EY (RMK) pages use microdata.

## SuccessFactors (RMK career sites)

List: `GET {origin}/search/?q=&sortColumn=referencedate&sortDirection=desc&startrow={n}` (25 rows per page;
`<tr class="data-row">` → `a.jobTitle-link`, `span.jobLocation` without the "+80 more…" `<small>`,
`span.jobDate`/`jobDepartment` when the site shows them; "Results 1 – 25 of **9713**"). Sites whose
robots.txt disallows keyword searches (`/*?q=`, e.g. jobs.sap.com) get the same listing without `q=`;
no rows at all → sitemap crawl (job pages carry microdata). Detail = the job page → microdata
(`itemprop` title / datePosted "Thu Nov 12 02:00:00 UTC 2026" / address parts / description).
Listing every row as a light record keeps EY's 9,713 jobs sweep-safe without fetching 9,713 pages.

## Phenom

Search pages embed the data the app renders: `GET {base}/search-results?from={n}&s=1` →
`phApp.ddo = { eagerLoadRefineSearch: { totalHits, hits: 10, data: { jobs: [ { jobId, reqId, jobSeqNo,
title, type, experienceLevel, category, multi_location[], postedDate "2026-11-09T00:00:00.000+0000",
applyUrl, ml_skills[], descriptionTeaser } ] } } }`. Job page `{base}/job/{jobId}/{Title-Slug}` →
`phApp.ddo.jobDetail.data.job` (+ JobPosting JSON-LD). `applyUrl` points at the ATS behind Phenom
(Adobe → its Workday posting; Philips → Workday) and is used as `applyUrl`, which also lets the
fingerprint merge the Phenom record with the Workday one. Recruiter fields (`talentCoordinator*`,
`hiringLastName`, `emailWork`) are ignored. Thermo Fisher's first results are internal test reqs
(dropped). No search blob → sitemap crawl.

## Avature

`GET {base}/SearchJobs/?jobRecordsPerPage={50}&jobOffset={n}` → `<article class="article--result">` cards
(`h3 a[href*=JobDetail]`, `span.list-item-location` or the last subtitle span — Deloitte's
"Deloitte US | Deloitte Tax LLP | Multiple Locations"; placeholders ignored) and "315 results".
Job page `{base}/JobDetail/{slug}/{id}`: JSON-LD when present (Deloitte — but with an all-blank
address), else labelled field blocks (`article__content__view__field__label/__value`: Location,
Business Area, Ref #) + rich-text sections (Bloomberg).

## iCIMS · Taleo (best-effort, not live-verified)

- **iCIMS**: `GET {portal}/jobs/search?ss=1&in_iframe=1&pr={page}` → links `/jobs/{id}/{slug}/job`;
  job pages `…/job?in_iframe=1` → JSON-LD, else the `iCIMS_JobContent` block; no links → sitemap crawl.
- **Taleo Enterprise**: the portal number from `jobsearch.ftl`, then the page's own REST call
  `POST /careersection/rest/jobboard/searchjobs?lang=en&portal={n}` (`{pageNo, sortingSelection,
  fieldData, filterSelectionParam…}` → `requisitionList[{jobId, contestNo, column[]}]`,
  `pagingData.totalCount`); detail `jobdetail.ftl?job={contestNo}` → `<input id="initialHistory">`
  `!|!`-separated, %-encoded HTML. No portal number → `sitemap.jss?portalCode={section}` crawl.

---

## Target `extra` options

| key | adapter | meaning |
|---|---|---|
| `workdayCountry` | workday | `"IN"` / `"India"` → list only that country via the tenant's location facet |
| `country` | workday, oracle, eightfold | same idea (alias for Workday): Oracle location facet / Eightfold `location=` |
| `oracleApiBase`, `oracleSiteNumber` | oracle | skip vanity-page resolution |
| `eightfoldApi` | eightfold | force `"v2"` or `"pcsx"` |
| `jobUrlPattern`, `jobUrlExclude`, `jobHosts` | jsonld & page fallbacks | override URL heuristics |
| `phenomBase`, `avatureBase` | phenom, avature | explicit site base |

## Environment variables

See `.env.example`. All optional.

| Var | Default | |
|---|---|---|
| `WORKDAY_MAX_DETAILS` | 300 | detail calls per target per run |
| `WORKDAY_OVERFLOW` | `defer` | `light` = emit over-budget unknown jobs without description |
| `WORKDAY_DELAY_MS` / `WORKDAY_CONCURRENCY` | 3000 / 1 | zone-wide (all tenants); floor 400 ms, max 2 |
| `WORKDAY_TIMEOUT_MS` | 25000 | |
| `ORACLE_MAX_DETAILS` / `ORACLE_OVERFLOW` / `ORACLE_DELAY_MS` / `ORACLE_TIMEOUT_MS` | 300 / defer / 600 / 30000 | per REST host |
| `EIGHTFOLD_MAX_DETAILS` / `EIGHTFOLD_OVERFLOW` / `EIGHTFOLD_DELAY_MS` / `EIGHTFOLD_TIMEOUT_MS` | 100 / defer / 2500 / 60000 | one gate for all tenants |
| `JSONLD_MAX_PAGES` / `JSONLD_MAX_SITEMAPS` / `JSONLD_MAX_LISTING_PAGES` / `JSONLD_DELAY_MS` | 200 / 40 / 10 / 1000 | ≤ 1 rps per host |
| `SUCCESSFACTORS_*`, `PHENOM_*`, `AVATURE_*`, `ICIMS_*`, `TALEO_*` | `_MAX_DETAILS` 200 (Taleo 150), `_DELAY_MS` 1000 | HTML sources, ≤ 1 rps |
| `ATS_ENTERPRISE_TARGET_BUDGET_MIN` | 25 | wall-clock budget per target |
| `ATS_ENTERPRISE_STATE_DIR` | `.cache/state` | page index for sitemap sources; `off` disables |
| `ATS_ENTERPRISE_CACHE` / `_CACHE_DIR` / `_CACHE_TTL_MIN` | off / `.cache/http` / 360 | dev-only response cache |
| `SCRAPER_USER_AGENT` | contract default | identification (contract) |

## Layout

```
src/lib/        env · limiter (+orderedMap) · http (politeness, back-off, challenge detection) · cache · run (per-target driver, stats)
                details (budget/known/defer pipeline) · html · dates · mapping · jsonld · microdata · sitemap · joburl · page-index
src/workday/    token · schema · facets (flatten, hint/country/partition) · parse · scraper
src/oracle/     token (vanity resolution) · schema · parse · scraper
src/eightfold/  schema · parse · scraper (v2/PCSX detection)
src/jsonld/     discover (sitemaps/listing) · page (JSON-LD/microdata → RawJob) · engine (page crawl + index) · scraper
src/{successfactors,phenom,avature,icims,taleo}/scraper.ts
src/fixtures/targets.ts   verified fixture targets
test/           offline suites on trimmed real responses (test/fixtures) + LIVE=1 smoke
```
