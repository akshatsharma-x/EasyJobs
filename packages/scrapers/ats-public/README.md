# @easyjobs/scraper-ats-public

Official jobs from company job boards hosted on public ATS (applicant tracking system) APIs.
One contract `Scraper` per ATS (`kind: "ats"`, `handlesAts: [<ats>]`), driven by `ctx.targets` from
`@easyjobs/registry`. The worker passes one target per call; the CLI passes all fixture targets.

| Scraper id | Endpoint (verified live 2026-11-26) | Requests per board | robots.txt |
|---|---|---|---|
| `greenhouse` | `GET https://boards-api.greenhouse.io/v1/boards/{token}/jobs?content=true&pay_transparency=true` | 1 | skipped (documented API) |
| `lever` | `GET https://api.lever.co/v0/postings/{site}?mode=json&limit=100&skip={n}` — `eu:{site}` → `api.eu.lever.co` | ⌈n/100⌉ (+1 if n is a multiple of 100) | skipped |
| `ashby` | `GET https://api.ashbyhq.com/posting-api/job-board/{token}?includeCompensation=true` | 1 | skipped |
| `smartrecruiters` | `GET https://api.smartrecruiters.com/v1/companies/{id}/postings?limit=100&offset={n}` + `/postings/{postingId}` | ⌈n/100⌉ + one per **unknown** posting (≤ `ATS_MAX_DETAILS`) | skipped |
| `workable` | `GET https://apply.workable.com/api/v1/widget/accounts/{account}?details=true` | 1 | skipped |
| `recruitee` | `GET https://{company}.recruitee.com/api/offers/` | 1 | skipped |
| `bamboohr` | `GET https://{company}.bamboohr.com/careers/list` + `/careers/{id}/detail` | 1 + one per unknown posting (≤ `ATS_MAX_DETAILS`) | **respected** |
| `personio` | `GET https://{company}.jobs.personio.de/xml?language=en` (+ `/xml` when English text is missing) | 1–2 | **respected** |
| `breezy` | `GET https://{company}.breezy.hr/json?verbose=true` | 1 | **respected** |
| `teamtailor` | `GET https://{company}.teamtailor.com/jobs.rss?per_page=100&offset={n}` | ⌈n/100⌉ (+1 if n is a multiple of 100) | **respected** |

All requests go through the contract's polite `createHttpClient` (per-host concurrency 2, ≥ 750 ms between
request starts, retries with `Retry-After` on 429/5xx, timeouts) and carry the run's `AbortSignal`.

## Run

```bash
pnpm --filter @easyjobs/scraper-ats-public scrape --limit 30                      # every ATS, all fixture targets
pnpm --filter @easyjobs/scraper-ats-public scrape --scraper lever --limit all     # one ATS, full boards
pnpm --filter @easyjobs/scraper-ats-public scrape --scraper greenhouse --target groww
pnpm --filter @easyjobs/scraper-ats-public test                                   # offline, saved fixtures
LIVE=1 pnpm --filter @easyjobs/scraper-ats-public test:live                       # smoke test per ATS against live APIs
pnpm --filter @easyjobs/scraper-ats-public verify-targets [--write]               # board sizes of all fixture targets
pnpm --filter @easyjobs/scraper-ats-public report                                 # per-ATS counts + fill rates (out/report.md)
pnpm --filter @easyjobs/scraper-ats-public fixtures [ats]                         # re-capture test fixtures (cached in .cache/)
```

The CLI writes `out/<scraper>.jsonl` and logs fill rates. `--limit` is shared fairly across the targets
(each gets an equal share of what is left), so a small limit still exercises every target.

## Environment

| Var | Default | Meaning |
|---|---|---|
| `ATS_PUBLIC_DISABLED` | — | Comma-separated scraper ids to switch off (`workable,breezy`), or `all`. |
| `ATS_MAX_DETAILS` | `200` | Max detail requests per target per run (SmartRecruiters, BambooHR). |
| `SCRAPER_USER_AGENT` | contract default | Identifies the bot (contract HTTP client). |
| `LIVE` | — | `1` enables the live smoke tests. |

## Registry tokens (§0.6)

Bare tokens are the norm; full URLs are accepted too (`https://jobs.lever.co/paytm`, `https://apply.workable.com/covergo/`,
`https://boards.greenhouse.io/embed/job_board?for=airbnb`, custom career domains such as `https://jobs.lunar.app` for
Teamtailor or `https://careers.acme.com` for Recruitee). Optional registry hints:

- `extra.country: "in"` (SmartRecruiters) — server-side country filter. Bosch's board is 5,171 postings worldwide, 687 in India.
- `extra.logoUrl` — used as `companyLogoUrl` when the ATS has no logo (only Breezy returns one).

## Mapping

Every job: `source` = ATS id, `sourceKind: "ats"`, `sourceJobId` = ATS posting id, `target` = `target.slug`,
`company`/`companySlug`/`companyDomain` from the target, `sourceUrl` = `applyUrl` = the official posting page
(the ATS's separate application-form URL is kept in `extra.applyFormUrl`). Hints are only filled from structured
source fields, never guessed — the normalizer does keyword detection itself, and hints override it:

| | jobType | workMode / isRemote | experienceLevel | salary | postedAt |
|---|---|---|---|---|---|
| greenhouse | custom metadata (`Employment Type`, `Job Type`…) | metadata (`Working Model Eligibility`…) | metadata (`Job Level`, `Seniority`) | `pay_input_ranges` | `first_published` → `updated_at` |
| lever | `categories.commitment` | `workplaceType` | — | `salaryRange` | `createdAt` (ms) |
| ashby | `employmentType` | `workplaceType` (+ remote locations) | — | compensation `Salary` components | `publishedAt` |
| smartrecruiters | `typeOfEmployment` | `location.remote/hybrid` | `experienceLevel.id` | detail `compensation` | `releasedDate` |
| workable | `employment_type` (+ "Internship" experience) | `telecommuting` | `experience` | — | `published_on` |
| recruitee | `employment_type_code` | `remote/hybrid/on_site` | `experience_code` | `salary` | `published_at` |
| bamboohr | `employmentStatusLabel` (free text) | `locationType` 0/1/2 | detail `minimumExperience` | detail `compensation` (strict parse; else raw) | detail `datePosted` |
| personio | `employmentType` + `schedule` | — | `seniority`; years from `yearsOfExperience` | — | `createdAt` |
| breezy | `type.id` | `location.remote_details` | — | `salary` text (strict parse) | `published_date` |
| teamtailor | — | `remoteStatus` | — | — | `pubDate` |

Level hints are conservative: broad labels such as LinkedIn-style "Mid-Senior level" or "Experienced" become
`mid` only when the title has no seniority words (otherwise a "Senior Staff Engineer" would be forced to mid);
`not_applicable` and unknown labels give no hint. SmartRecruiters ids map `internship → intern`,
`entry_level`/`associate → entry`, `mid_senior_level → mid` (see above), `director`/`executive → executive`.

Salaries are never invented: 0–0 and placeholder ranges (MongoDB posts `USD 0.01`) are dropped, a period is set
only when the API states it or the magnitude is unambiguous (Greenhouse ranges have no interval field:
"…Annual Pay Range" → year, "…Monthly…" → month, ≤ $200 → hour, ≥ $10k → year, anything in between → `salary: null`
with `salaryRaw` kept). Every salary must be plausible for its period (USD-equivalent: hour 1–1,000, month
30–100k, year 500–10M) — Databricks labels some yearly ranges "Hourly Rate", and entry errors such as "USD 170–256"
exist. Greenhouse prefers an INR range when a job lists several currencies. Week/day intervals have no contract
period, so only `salaryRaw` is set.

## Robustness

- **Dead boards** — 404/410 (BambooHR: a 302 to its marketing site), or a careers host whose robots.txt forbids
  the feed, are logged once and the target finishes cleanly; the registry should drop the entry. The same error
  *after* jobs were emitted (a 404 on page 2) fails the target instead, so a partial run is never swept.
  SmartRecruiters answers 200 + `totalFound: 0` for unknown ids, so an empty board is logged as "may be an unknown
  company id".
- **Malformed 200s** (HTML instead of JSON, `{}` instead of `{ jobs: [...] }`) fail the target with
  `UnexpectedResponseError` — reading them as an empty board would let the worker close every stored job.
- **Other failures** fail the target. With one target (the worker) the original `HttpError` is rethrown; with
  several, the remaining targets still run and one aggregated error is thrown at the end, so the worker never
  sweeps after an incomplete run.
- **Pagination** is lazy (the next page is requested only when more jobs are needed, so `ctx.limit` costs no
  extra requests), drops postings repeated across pages, and stops on a short page, on `totalFound`, on a page
  with nothing new (an API that ignores the offset) or at a 500-page safety cap.
- **Known postings** (`ctx.isKnown`) skip detail requests and are emitted as light records (`descriptionHtml: null`).
- **Detail budget** — unknown postings beyond `ATS_MAX_DETAILS`, or after the API throttles (429/403 after the
  client's own retries) or fails 5 times in a row, are *deferred*: not emitted this run (they are not stored yet,
  so a sweep cannot close them) and fetched on the next run. SmartRecruiters lists newest first, so new postings
  get their details first.
- **`ctx.since` is ignored on purpose.** Each board costs one or a few requests either way, and the worker sweeps
  after complete runs, so every open job must be emitted every run or the sweep would close it.
- **Privacy** — only job-posting data is kept. SmartRecruiters `creator` (recruiter names) is never read, Greenhouse
  metadata is reduced to the fields we map (one board put an employee's email in a "Backfill ID" field), values
  that look like emails/phone numbers are dropped, and Personio "Contact" sections are removed from descriptions.

## Quirks found while verifying (the prompt's notes were partly outdated)

- **Greenhouse**: `pay_transparency=true` works on the list endpoint; `updated_at`/`first_published` carry offsets
  (converted to UTC); EU-hosted boards (e.g. Groww) are still served by `boards-api.greenhouse.io`, with
  `absolute_url` on `job-boards.eu.greenhouse.io`. Board `metadata` is free-form per company.
- **Lever**: `skip`/`limit` pagination is stable (305/305 ids, same order as the unpaged response). EU boards exist
  only on `api.eu.lever.co` (verified with Creatio, Cirrus, Efficio). `commitment` uses local terms ("On-roll",
  "Contractual", "Short Term").
- **Ashby**: `isRemote` is `true` for every Hybrid job (537/537 sampled) — it means "not fully on-site", so we derive
  `isRemote` ourselves. Some boards hide compensation (`shouldDisplayCompensationOnJobPostings: false`) — respected.
- **SmartRecruiters**: max page size 100; the list is sorted newest first; `country=xx` filters server-side.
- **Workable**: the widget API lists a job once **per location** (CoverGo: 187 entries = 67 jobs); grouped by
  shortcode it matches the v3 API total exactly on every account tested. v3 (`POST /api/v3/accounts/{a}/jobs`) has
  `workplace` (hybrid) but no description and pages of ~10, so it would cost 1 + n/10 + n requests per board.
- **Personio**: `language=en` returns only English description texts — a German board (1KOMMA5°) has 147 English
  vs 1,354 default-language sections — hence the fallback request.
- **Breezy**: descriptions only with `?verbose=true`; `$` salaries use the job's local dollar (CAD in Toronto).
- **Teamtailor**: `page` is ignored, `offset` works; links point at custom career domains; some career sites opt out
  via robots.txt (`polestar.teamtailor.com`: `Disallow: /`), which we respect.
- **BambooHR**: `employmentStatusLabel` is company-defined free text ("A - Full Time", "Active", "P - PRN").

## Layout

```
src/index.ts            scrapers[] (default export) — discovered by the worker
src/cli.ts              runScraperCli(scrapers, { targets })
src/fixtures/targets.ts 48 verified CompanyTargets (3–5 per ATS)
src/core/               runner (targets, limit, errors), HTTP helpers, pagination, detail budget, RawJob builder
src/adapters/           one file per ATS: types, URL builders, pure mappers, AtsAdapter
src/lib/                hints, salary, dates, html, location, privacy, tokens, xml helpers
scripts/                capture-fixtures, verify-targets, report
test/                   parser tests per ATS on saved fixtures, pagination, runner, helpers; live.test.ts (LIVE=1)
```
