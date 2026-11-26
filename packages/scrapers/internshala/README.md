# @easyjobs/scraper-internshala

Two `job_board` scrapers for [Internshala](https://internshala.com), India's largest internship and fresher-job board:

| Scraper id | Name | Feeds (crawled in this order) | Interval |
|---|---|---|---|
| `internshala-internships` | Internshala Internships | `/internships/` → `/internships/work-from-home-internships/` → `/internships-for-women/` | 20 min |
| `internshala-jobs` | Internshala Jobs | `/jobs/` → `/jobs/work-from-home/` → `/fresher-jobs/` | 20 min |

```bash
pnpm --filter @easyjobs/scraper-internshala scrape --limit 30                       # both scrapers, 30 jobs each → out/*.jsonl
pnpm --filter @easyjobs/scraper-internshala scrape --scraper internshala-jobs --limit all --pages 3
pnpm --filter @easyjobs/scraper-internshala scrape --limit all --pages all --details all   # full backfill (slow: ~1.5 s per page)
pnpm --filter @easyjobs/scraper-internshala scrape --limit 50 --cache                 # dev: cache raw HTML in .cache/http
pnpm --filter @easyjobs/scraper-internshala test                                      # offline, fixtures only
LIVE=1 pnpm --filter @easyjobs/scraper-internshala test                               # + live smoke test (~10 requests)
```

Applications happen on Internshala itself, so `applyUrl = sourceUrl =` the Internshala detail page.

---

## Discovery (checked live on 2026-11-25)

### robots.txt

`https://internshala.com/robots.txt` has a `User-Agent: *` group plus groups for named crawlers (search engines with
`Crawl-delay`, AI/LLM training bots that are blocked, and user-triggered AI agents that are allowed). Our
`EasyJobsBot/1.0` user agent matches none of the named groups, so the `*` group applies. Relevant rules:

| Rule | Effect for us |
|---|---|
| `Disallow: /*?*` (and `%3f`, `%3d` variants) | **No URL may have a query string.** Pagination and filters must be path-based; we strip `?utm_…` from every link. |
| `Disallow: /*,*` | No commas — rules out multi-filter URLs like `/internships/computer-science,marketing-internship/`. |
| `Disallow: /internship/details/`, `/job/details/` | The plural form is off-limits. Detail pages are the **singular** `/internship/detail/…` and `/job/detail/…`, which are allowed. |
| `Disallow: /internship/search/`, `/job/search/`, `/api/`, `/external-jobs/*`, `/student`, `/application/*`, … | Never requested. |
| *(no rule)* `/internships/`, `/jobs/`, `/fresher-jobs/`, `/internships-for-women/`, `/jobs-for-women/`, `…/page-N/`, `/company/…` | Allowed. |

Every request goes through the contract HTTP client, which enforces these rules at runtime (`RobotsDisallowedError`).
Redirects are followed manually so that each hop is robots-checked too. A unit test asserts that the crawler only ever
requests query-free listing and singular detail URLs.

### Listing URLs and pagination

- Page 1 is `/<feed>/`, page N is `/<feed>/page-N/` (e.g. `/internships/page-2/`, `/jobs/work-from-home/page-3/`).
- 40 cards per page; page 1 additionally has ~10 **pinned** (promoted) cards listed in the inline script variable
  `pinned_internship_ids`.
- `#pagination` (with `data-employment-type="internship|job"`) holds `.pagination_block[data-page]` links (first 6 + last)
  and a hidden `<input id="isLastPage" value="0|1">`; `<link rel="next">` is also present.
- An out-of-range page (e.g. `/internships/page-999/`) answers **200 with zero cards** (title "Page 999: …"); a missing
  detail page answers **404**.
- Sizes at discovery time: 6,080 internships (152 pages), 2,019 WFH internships (51), 3,074 internships for women (77),
  5,909 jobs (148), 1,103 WFH jobs (28), 3,199 fresher jobs (80).
- **Quirk:** `/jobs-for-women/` ("682 Jobs for Women", pagination says `job`) actually lists **internship** cards
  (`employment_type="internship"`, `/internship/detail/` links), so the jobs scraper does not use it. Job posts never carry
  the women-restart line either (0 of 100 job detail pages); they say "Female candidates preferred" in free text, which is
  left to the normalizer's tag detection. The crawler logs a warning and skips any feed whose page has no cards of its kind.
- Other path-based views exist and are allowed (`/internships/internship-in-<city>/`, `/internships/<category>-internship/`,
  `/internships/part-time-jobs/`, `/internships/ppo-true/`, `/internships/international-internship/`,
  `/jobs/jobs-in-<city>/`, `/jobs/<category>-jobs/`, `/jobs/part-time-jobs/`, `/fresher-jobs/jobs-in-<city>/`, …). We don't
  need them: every posting is also in the unfiltered feeds, and part-time/PPO/international are flags on the card.

**Order.** There is no sort control. The default order is roughly newest-first after the pinned block, with some
relevance mixing. Crucially, in-office postings rank first: page 1–2 of `/internships/` had 1 WFH card in 90, while
page 140 had 18 in 40. A brand-new WFH internship can therefore sit 100+ pages deep, so WFH is crawled as its own feed.

### Structured data

| Where | What |
|---|---|
| Listing card attributes | `internshipId="3334805"` (stable posting id), `employment_type="internship|job"`, `data-href='/internship/detail/…'` |
| Listing JSON-LD | `ItemList` with only name + URL per card (not used — the card HTML has much more) |
| Detail page script vars | `var internship_id = 3334805; var employment_type = 'internship';` |
| Detail JSON-LD | schema.org `JobPosting`: `title`, `description` (HTML with `<p>Heading:</p>` sections), `datePosted` (date), `validThrough` (`"2026-12-16 23:59:59"`, IST), `employmentType` (`"INTERN, PART_TIME"`, `"VOLUNTEER, …"` for unpaid), `industry`, `occupationalCategory`, `totalJobOpenings`, `jobLocation[]` (locality/region/country), `jobLocationType: "TELECOMMUTE"` + `applicantLocationRequirements: IN` for WFH, `hiringOrganization` (name, `sameAs` website, `logo`), `baseSalary` (MonetaryAmount → QuantitativeValue `minValue/maxValue` or `value`, `unitText` MONTH/YEAR/WEEK), `experienceRequirements.monthsOfExperience`, `skills`, `identifier` (`"2026"+id`). **Not always present** (one job in our sample had none) — so the HTML is the primary source and JSON-LD only enriches it. |

**The detail URL ends with a Unix timestamp.** `…-at-loadit-supply-services-pvt-ltd1794806827` → 1794806827 s =
2026-11-16 05:27 UTC. Across 50 cards it agreed with the "posted" label every time ("Few hours ago" = 5–12 h,
"1 day ago" = 32–40 h, "1 week ago" = 8–10 days). A repost gets a fresh timestamp **and a new URL but keeps its
`internshipId`** (id 3336005 was listed "Few hours ago" with a same-day timestamp) — so `sourceJobId` is the
`internshipId`, never the URL. We use the timestamp for a precise `postedAt` when it agrees with the label.

### Listing card (`#internship_list_container .individual_internship[internshipid]`)

| Field | Selector / rule |
|---|---|
| id, kind, detail URL | `internshipid`, `employment_type`, `data-href` (fallback `a.job-title-href`) |
| title | `.job-internship-name a.job-title-href` |
| company | `p.company-name` (fallback `.company_name` minus the "Actively hiring" badge). International postings append `(City, Country)` — split off into `extra.companyLocation`. |
| logo | `.internship_logo img[src]`, `null` when it is `/static/images/search/placeholder_logo.svg` |
| locations | `.locations a` — one `<a>` per city **or** one `<a>` with "Dombivli, Mumbai, Virar" (split on commas); `i.ic-16-home` + "Work from home" = WFH; a trailing ` (Hybrid)` text node + `[data-popover_content]` "1 day(s) in-office in a week" = hybrid |
| stipend / CTC | `.row-1-item` with `i.ic-16-money`: `span.stipend` (internships) or `span.mobile` ("₹ 4,00,000 - 4,50,000 /year"; the desktop span omits "/year") |
| duration (internships) | `i.ic-16-calendar` → "3 Months", "2 Weeks" |
| experience (jobs) | `i.ic-16-briefcase` → "1 year(s)", "No experience required" |
| posted | `.color-labels i.ic-16-reschedule` → "Few hours ago", "Today", "1 day ago", "2 weeks ago" |
| badges | `.actively-hiring-badge`, `.early_applicant_wrapper` ("Be an early applicant") |
| labels | `.gray-labels .status-li span` → "Part time", "Fresher Job", "International"; `.ppo_status` → "Job offer upto ₹ 3LPA post internship" / "Job offer post internship" |
| skills, preview | `.job_skills .job_skill`, `.about_job .text` (cut mid-word) |

Stipend variants seen: `₹ 10,000 - 12,000 /month`, `₹ 10,000 /month`, `₹ 300 /week`, `₹ 1,500 - 15,000 lump sum`,
`Unpaid`, `Performance Based`. Durations: `N Month(s)`, `N Week(s)`.

### Detail page (`.detail_view`)

Header items `.other_detail_item` (label in `.item_heading`): **Start Date** ("Immediately" or a date), **Duration**,
**Stipend** / **CTC (ANNUAL)**, **Experience** (jobs), **APPLY BY** ("16 Dec' 26"). Status chips in
`.tags_container_outer .status`: "Posted 1 week ago", "Internship"/"Job"/"Fresher Job", "Part time", PPO.
`.applications_message`: "56 applicants" or "Be an early applicant". Hidden `#status` = `active`.

Sections inside `.internship_details` — each `.section_heading` followed by its content (headings vary, so they are
classified by text): *About the internship / the job / the work from home job/internship / the Program* · *Skill(s)
required* (`.round_tabs`; the "Earn certifications" training block is skipped) · *Who can apply* (one `<p>` per line;
"Women wanting to start/restart their career can also apply." marks the "for women" listings) · *Other requirements* ·
*Salary* (jobs: `.salary_container p` — "Annual CTC: …", "Annual CTC breakup:", "1. Fixed pay: …", "2. Variable pay: …";
optional `.probation-salary-container` with duration and probation salary, hidden via `display: none` when unused) ·
*Rewards and incentives* · *Perks* (`.round_tabs`) · *Additional information* · *Number of openings* · *About &lt;Company&gt;*
(`.website_link a` — sometimes an Instagram page, `.about_company_text_container`, "Hiring since …", "N opportunities
posted"). The JSON-LD "Who can apply" occasionally lists extra lines hidden from the logged-out HTML (e.g. "are Computer
Science Engineering students"); we use whichever list is longer.

---

## Mapping to `RawJob`

| RawJob | Source |
|---|---|
| `source` / `sourceKind` / `target` | scraper id · `job_board` · `null` (see "Sweeps" below) |
| `sourceJobId` | card `internshipId` (stable across reposts) |
| `sourceUrl` = `applyUrl` | absolute detail URL, query stripped |
| `title`, `company` | card (detail/JSON-LD as fallback) |
| `locations` | card cities with "(Hybrid)" removed; WFH → `["Remote - India"]` (JSON-LD `jobLocation` of WFH posts is the employer's office, so it is ignored) |
| `workMode` / `isRemote` | WFH → `remote`/`true`; "(Hybrid)" → `hybrid`; otherwise `onsite` (Internshala says "in-office") |
| `jobType` | internships → `internship` (part-time internships stay internships + tag `part-time`); jobs → `part_time` if labelled, else `full_time` |
| `experienceLevel` | internships → `intern`; jobs: "No experience required"/"Fresher Job" → `fresher`, min 1 yr → `entry`, 2–4 → `mid`, 5–7 → `senior`, 8+ → `lead` |
| `experienceMin/Max`, `experienceRaw` | jobs: the minimum years (`max` = `null`, Internshala gives no upper bound) |
| `salary`, `salaryRaw` | stipend → `period: "month"`; CTC → `period: "year"`; `/week` × 52/12 → month; lump sum ÷ max(1, duration months) → month; **Unpaid → `{min: 0, max: 0}`** (+ tag `unpaid`); Performance Based / unreadable → `null` (never invented). `raw` keeps the original text. JSON-LD `baseSalary` is the fallback. |
| `postedAt` | URL timestamp if consistent with the label (−1 d/+2 d tolerance), else the middle of the label's range, else JSON-LD `datePosted` |
| `validThrough` | JSON-LD `validThrough` (IST) or "APPLY BY" date at 23:59:59 IST |
| `descriptionHtml` | detail sections in page order as clean `h3`/`p`/`ul`/`ol` HTML + a "Details" list (start date, duration, stipend/CTC, experience, apply by); `null` for light records |
| `descriptionText` | only for *new* jobs whose detail page was not fetched: the card preview, trimmed to a whole word + "…" |
| `companyLogoUrl`, `companyDomain` | card logo; domain from the "Website" link or JSON-LD `sameAs`, ignoring social/app-store/link-in-bio hosts |
| `department` | JSON-LD `occupationalCategory` (Internshala's profile, e.g. "Business Development (Sales)") |
| `skills` | card skills ∪ detail "Skill(s) required" |
| `tags` | `wfh`, `women` (internships: women feed or "Women wanting to start/restart…" on the detail page), `part-time`, `ppo`, `unpaid` |
| `extra` | `internshalaId`, `employmentType`, `feed`, `detail`, `pinned`, `activelyHiring`, `earlyApplicant`, `postedLabel`, `postedBasis`, `labels`, `partTime`, `international`, `companyLocation`, `hybridNote`, `duration`, `durationMonths`, `startDate`, `startsImmediately`, `applyBy`, `payKind`, `payPeriod`, `incentives`, `ppo`, `ppoInrYearly`, `openings`, `applicants`, `perks`, `whoCanApply`, `otherRequirements`, `ctc`, `ctcBreakup`, `probation`, `industry`, `category`, `ldEmploymentType`, `companyPageUrl`, `companyActivity` (empty values omitted) |

## Crawling

1. **Feeds, newest first.** For each feed: page 1, 2, … until a page made **entirely of known ids** (known to the store via
   `ctx.isKnown`, or already emitted earlier in this run — so overlapping feeds stop fast), the last/empty page, a page
   number mismatch, or `maxPages`. Every card on a crawled page is emitted (known ones as light records, which also keeps
   them "seen").
2. **Details** only for unknown ids, at most `maxDetails` per scraper run (default 100). Unknown jobs beyond the cap are
   emitted from their card (with the preview as `descriptionText`). A 404/unparsable detail → card-only record; a detail
   whose `#status` is not `active` → not emitted.
3. **Refresh rotation** (incremental runs only, `refresh` feeds = `main`): after the stop, also fetch `refreshPages`
   (default 2) deeper pages chosen by `floor(now / 20 min)`, cycling through the whole list (~1–2 days for 150 pages). This
   keeps postings that stay open for weeks from expiring under the job-board rule "closed after 21 days unseen".
4. **Politeness.** One process-wide throttle per host (both scrapers share it): **≥ 1.5 s between request starts**, on top
   of the contract client's per-host limit, retries with backoff and `Retry-After`. 403 or 429-after-retries on a listing
   stops the run; on a detail page it stops detail fetching for the rest of the run. No login, no cookies kept, no
   proxies, no CAPTCHA/anti-bot workarounds; only job-posting data is collected.

Measured steady-state cost per 20-minute run (live, with the previous run's ids known): 1 listing page per feed when
nothing is new, + 2 refresh pages, + one detail page per new posting — about 5 requests per scraper plus new details.

### Sweeps

Runs are incremental by design, so they never see every posting. `target` is therefore `null` and the scrapers rely on
the job-board freshness rules (§0.4: closed after 21 days unseen or 45 days old), `validThrough` (the apply-by date) and
the refresh rotation — not on `/v1/ingest/sweep`. See `docs/contract-requests/P10.md`.

## Configuration

All optional (see `.env.example`). CLI flags override env vars.

| Env var | CLI flag | Default | Meaning |
|---|---|---|---|
| `INTERNSHALA_ENABLED` | | on | `0`/`false` disables both scrapers |
| `INTERNSHALA_MAX_PAGES` | `--pages N\|all` | 10 | listing pages per feed per run (backfill: `all`) |
| `INTERNSHALA_MAX_DETAILS` | `--details N\|all` | 100 | detail pages per scraper run (`0` = cards only) |
| `INTERNSHALA_REFRESH_PAGES` | | 2 | rotating deep pages of the main feed per incremental run |
| `INTERNSHALA_STOP_AFTER_KNOWN_PAGES` | | 1 | consecutive all-known pages that end a feed |
| `INTERNSHALA_DELAY_MS` | | 1500 | gap between requests (values below 1500 are raised to 1500) |
| `INTERNSHALA_INTERNSHIP_FEEDS` | | `main,wfh,women` | feeds and order for internships |
| `INTERNSHALA_JOB_FEEDS` | | `main,wfh,fresher` | feeds and order for jobs |
| `INTERNSHALA_DEV_CACHE` | `--cache` | off | `1` = cache raw HTML in `.cache/http` (6 h), or a directory path. Development only. |
| `SCRAPER_USER_AGENT` | | contract default | user agent (contract) |

**First run / backfill:** the defaults pick up the newest ~400 postings per feed. For a full backfill run the worker once
with `INTERNSHALA_MAX_PAGES=all` (≈ 300 listing pages per scraper → ~8 min each at 1.5 s; details stay capped).

## Layout

```
src/index.ts          scrapers + public helpers          src/crawl.ts     feeds, stop rule, detail cap, refresh rotation
src/scrapers.ts       Scraper objects                    src/fetch.ts     robots-checked fetch, manual redirects, dev cache
src/config.ts         env + overrides                    src/throttle.ts  shared ≥ 1.5 s site throttle
src/feeds.ts          feed definitions                   src/map.ts       card + detail → RawJob
src/parse/listing.ts  listing cards                      src/parse/detail.ts   detail page (HTML + JSON-LD)
src/parse/money.ts    stipend / CTC                      src/parse/dates.ts    labels, URL timestamp, IST dates
src/parse/jsonld.ts   JobPosting JSON-LD                 src/parse/html.ts     fragment cleaning
scripts/fetch-pages.ts      polite page fetcher (dev)    scripts/capture-fixtures.ts  trim saved pages into fixtures
scripts/inspect.ts          run a parser on a file       scripts/stats.ts             summarise CLI output
```

## Tests and fixtures

`test/fixtures/` holds real pages captured on 2026-11-25, trimmed to the parts the parsers read (markup kept verbatim):
listings — internships p1 (pinned, multi-city, PPO, performance-based), internships p2, WFH internships (unpaid, lump
sum, weekly, part-time, PPO without amount, international), jobs (CTC, experience, fresher, hybrid), WFH jobs
(international + fresher + part-time); details — in-office internship, WFH unpaid part-time, lump sum, weekly,
performance-based programme, job with CTC, hybrid fresher job with CTC breakup, job **without** JSON-LD (probation).
To refresh: `tsx scripts/fetch-pages.ts name=/path …` then `tsx scripts/capture-fixtures.ts`, and review the snapshot diff.

## Known gaps

- Internshala has no newest-first sort; the default ranking is "mostly recent". A new posting ranked unusually deep can
  be missed by the incremental stop until the refresh rotation reaches its page (≤ ~2 days).
- Unknown jobs beyond the per-run detail cap stay light records (card data + preview) — they become "known" and their
  detail page is not fetched later. Raise `INTERNSHALA_MAX_DETAILS` for the first backfill if descriptions matter.
- The `women` tag (internships) is reliable for postings whose detail page was fetched or that were first seen in the
  women feed; light records first seen in another feed may miss it. Jobs have no structured women signal on Internshala.
- `experienceMax` is unknown (Internshala only states a minimum).
- Salary periods `week` and lump sums are converted to monthly figures (original text kept in `salary.raw`).
