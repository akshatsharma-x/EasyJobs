# @easyjobs/scraper-portals

LinkedIn (public guest job listings) and Naukri (public search pages) as two `job_board` scrapers. Both are **off by default** and run only with `ENABLE_LINKEDIN=1` / `ENABLE_NAUKRI=1`. They are built for best-effort, low-volume coverage: about one request every 4–6 s, a small cap per run, and backoff measured in hours whenever a site pushes back.

> **Status (2026-11-26): both portals are blocked for this project's rules, with evidence below.**
> - **LinkedIn**: `robots.txt` disallows every path for our user agent, and `/jobs-guest/` for *every* agent, search engines included. The scraper reads robots.txt, logs the matching rule and stops after that one request. It re-checks once a day.
> - **Naukri**: the Akamai edge answers `403 Access Denied` to plain HTTP (robots.txt, search page, search API) and to vanilla headless Chromium, with or without our bot token. The scraper backs off 2 h → 4 h → 8 h … (capped at 7 days) after a single denied request.
>
> Both are fully implemented and tested offline against fixtures: parsers, hint mapping, pacing, caps, rotation and backoff. If either site's stance changes, they start working without code changes. `pnpm --filter @easyjobs/scraper-portals probe --browser` re-checks in ≤ 4 requests.

| | LinkedIn | Naukri |
|---|---|---|
| id / kind / interval | `linkedin` / `job_board` / 60 min | `naukri` / `job_board` / 60 min |
| flag | `ENABLE_LINKEDIN=1` | `ENABLE_NAUKRI=1` |
| transport | shared contract HTTP client (`ctx.http`) | vanilla headless Chromium (Playwright, optional dependency) |
| live result | `robots_disallowed` after 1 request | `blocked` (HTTP 403, Akamai) after 1 request |

## Evidence

All requests below used the project's honest identity, `EasyJobsBot/1.0 (+https://easyjobs.example/bot)`: no cookies, no accounts, no proxies and no stealth. Times are UTC. The raw captures are in `.cache/live/` (git-ignored). The denial pages and a reduced robots.txt are saved as test fixtures (`test/fixtures/naukri/access-denied-*.html`, `test/fixtures/linkedin/robots.txt`).

### LinkedIn — robots.txt forbids it

`GET https://www.linkedin.com/robots.txt` → **200** (120,235 bytes, 4,865 lines, 2026-11-25 21:52, re-checked 22:29 and 22:30):

```text
# Notice: The use of robots or other automated means to access LinkedIn without
# the express permission of LinkedIn is strictly prohibited.
...
User-agent: Googlebot          (and 40 other named search-engine groups)
...
Disallow: /jobs-guest/
...
User-agent: *
Disallow: /
```

- Our UA matches no named group, so the `*` group applies: `Disallow: /`. That covers `/jobs-guest/jobs/api/seeMoreJobPostings/search?…` and `/jobs-guest/jobs/api/jobPosting/{id}`.
- Even the whitelisted crawlers' groups (Googlebot, bingbot, … 41 in total) carry `Disallow: /jobs-guest/`.
- prompts.md §0.8.6 says "HTML pages must obey robots.txt". The guest endpoints serve HTML, and they aren't a documented public JSON API, so `robots: false` isn't permitted. **No request was ever sent to a `/jobs-guest/` URL**, during development or otherwise. The LinkedIn fixtures are therefore *reconstructed* from the publicly documented markup (see [Fixtures](#fixtures)).
- LinkedIn's own route is written permission (`whitelist-crawl@linkedin.com`). This package deliberately has **no robots override**. Changing that policy would be a project-level decision, and it would also run against LinkedIn's User Agreement.

### Naukri — the Akamai edge denies automated clients

| # | UTC (2026-11-25) | Request | Client | Result |
|---|---|---|---|---|
| 1 | 21:53:03 | `GET /robots.txt` | plain HTTP | **403** `Server: AkamaiGHost`, "Access Denied", Reference #18.9fdc55b8.1795643583.e926b7f9 |
| 2 | 21:55:50 | `GET /software-engineer-jobs?experience=0` | plain HTTP, `Accept: text/html`, `Accept-Language: en-IN` | **403** Access Denied, #18.9fdc55b8.1795643750.e9278252 |
| 3 | 21:55:56 | `GET /jobapi/v3/search?…&keyword=software%20engineer&experience=0` | plain HTTP, static `appid: 109`, `systemid: Naukri` (no `nkparam` token, which we would never forge) | **403** Access Denied, #18.9fdc55b8.1795643756.e92789e8 |
| 4 | 21:57:34 | search page #2 | headless Chromium 159.0.8154.6 (Playwright 1.65.1, no stealth), UA `…HeadlessChrome/159.0.8154.6 Safari/537.36 EasyJobsBot/1.0 (+…)` | **403** title "Access Denied", #18.6e220f7a.1795643854.1faa9a6f — **0** `/jobapi/` calls made by the page |
| 5 | 21:58:26 | search page #2 | headless Chromium, its own default UA (no bot token) | **403** Access Denied, #18.6e220f7a.1795643906.1faaa3de — 0 `/jobapi/` calls |
| 6 | 22:29:26 | scraper run (CLI, `ENABLE_NAUKRI=1`) | headless Chromium → robots.txt | **403** #18.6e220f7a.1795645766.1fac725a → backoff 2.1 h, run ended after 1 request |
| 7 | 22:30:35 | `pnpm probe --browser` | plain HTTP ×2, Chromium ×1 | 403 / 403 / 403 (#…1795645824…, #…1795645829…, #…1795645835…) |

The prompt's decision path was: plain HTTP works → use it; needs generated tokens → headless Chromium; Chromium challenged too → ship disabled with evidence. The refusal comes before any token logic: the edge denies the request outright, robots.txt included. So the package ships **disabled** (the default) and **self-limiting** (one denied request → hours of backoff). Going further would mean disguising the client (a browser UA, a headed browser, stealth plugins, residential proxies), which the hard rules forbid.

Re-check at any time (≤ 4 requests, ≥ 5 s apart; writes `.cache/evidence/probe-*.json`):

```bash
pnpm --filter @easyjobs/scraper-portals probe            # LinkedIn robots + Naukri plain HTTP
pnpm --filter @easyjobs/scraper-portals probe --browser  # + one headless Chromium page load
```

## How to run

```bash
# both skip with "disabled by env/config" unless their flag is set
ENABLE_LINKEDIN=1 pnpm --filter @easyjobs/scraper-portals scrape --scraper linkedin --limit 30
ENABLE_NAUKRI=1   pnpm --filter @easyjobs/scraper-portals scrape --scraper naukri   --limit 30
# Naukri needs Chromium for Playwright once per machine:
pnpm --filter @easyjobs/scraper-portals exec playwright install chromium

pnpm --filter @easyjobs/scraper-portals replay      # offline: both scrapers end-to-end over the fixtures → out/*.fixtures.jsonl + fill rates
pnpm --filter @easyjobs/scraper-portals test        # offline (fixtures, fake clock/transport)
LIVE=1 pnpm --filter @easyjobs/scraper-portals test # + 1 live smoke run per portal (temp state dir)
pnpm --filter @easyjobs/scraper-portals typecheck
```

The CLI loads the repo-root `.env` if it exists. Output goes to `out/<id>.jsonl` (git-ignored).

## Environment

| Var | Default | Meaning |
|---|---|---|
| `ENABLE_LINKEDIN`, `ENABLE_NAUKRI` | `0` | `1`/`true`/`yes`/`on` enables the scraper (`isEnabled`) |
| `SCRAPER_USER_AGENT` | `EasyJobsBot/1.0 (+https://easyjobs.example/bot)` | identity on every request; Naukri appends it to Chromium's own UA |
| `LINKEDIN_MAX_REQ_PER_RUN` | `10` (1–60) | hard cap per run, robots.txt included |
| `LINKEDIN_MAX_DETAILS_PER_RUN` | `6` (0–50) | detail fetches per run (unknown ids only) |
| `LINKEDIN_QUERIES_PER_RUN` / `LINKEDIN_PAGES_PER_QUERY` | `2` / `1` | slice of the plan per run · pages per query |
| `LINKEDIN_KEYWORDS` | software engineer, developer, data analyst, data scientist, intern, fresher, graduate trainee, product manager, designer, marketing, sales, finance, HR | comma/semicolon/pipe separated |
| `LINKEDIN_EXPERIENCE` | `1,2` | f_E codes, **one query per code** (1 internship · 2 entry · 3 associate · 4 mid-senior · 5 director · 6 executive); `any` = no filter |
| `LINKEDIN_WORK_TYPES` | empty | f_WT codes applied together (1 on-site · 2 remote · 3 hybrid) |
| `LINKEDIN_LOCATION` / `LINKEDIN_TIME_POSTED` | `India` / `r86400` | `location` / `f_TPR` |
| `NAUKRI_MAX_REQ_PER_RUN` | `6` (1–40) | hard cap on page navigations per run, robots.txt included |
| `NAUKRI_MAX_DETAILS_PER_RUN` | `3` (0–30) | job pages per run (unknown ids only) |
| `NAUKRI_QUERIES_PER_RUN` / `NAUKRI_PAGES_PER_QUERY` | `2` / `1` | as above |
| `NAUKRI_KEYWORDS` | same 13 as LinkedIn | |
| `NAUKRI_EXPERIENCE` | `0,1` | `?experience=` years, one query per value (fresher-focused); `any` = no filter |
| `NAUKRI_NAV_TIMEOUT_MS` / `NAUKRI_API_WAIT_MS` | `45000` / `20000` | page load timeout · how long to wait for the page's own data request |
| `PORTALS_MIN_GAP_MS` / `PORTALS_MAX_GAP_MS` | `4000` / `6000` | random gap between requests; the floor of 4000 can't be lowered |
| `PORTALS_BACKOFF_BASE_HOURS` / `PORTALS_BACKOFF_MAX_HOURS` | `2` / `168` | backoff = base × 2^(strike−1), ≤ max, +0–10 % jitter; a longer `Retry-After` wins |
| `PORTALS_ROBOTS_RECHECK_HOURS` | `24` | wait before re-reading a robots.txt that disallowed us |
| `PORTALS_STATE_DIR` | `packages/scrapers/portals/.state` | where `linkedin.json` / `naukri.json` live (git-ignored) |

## How a run works

Every run goes through the same safety envelope (`src/shared/run-guard.ts`):

1. **Backoff check.** If `.state/<portal>.json` says `blockedUntil` is in the future, the run logs why and returns **without sending a single request**, and for Naukri without launching a browser.
2. **robots.txt gate** (`src/shared/robots.ts`). This is stricter than the contract client: a 2xx is parsed with the contract's `parseRobots`/`isPathAllowed`; another 4xx counts as "no robots" (RFC 9309); 5xx or a network error means "assume disallow" (1 h pause); a 403/429/999 or edge page counts as a block.
3. **Rotation.** The plan is keywords × filter values (26 queries by default). Each run takes the next `*_QUERIES_PER_RUN`, and the cursor is persisted. The cursor advances past every query that got a non-block answer (results, an empty page or an error), so a failing query can't stall the rotation. A query cut off by a block or the cap is retried on the next run.
4. **Requests.** One at a time, 4–6 s apart, measured from when the previous one *finished*. The pacer is process-wide per portal, so back-to-back runs stay paced too. There's a hard cap per run, and `retries: 0`, so a 429 is never retried within seconds.
5. **Details** are fetched only for ids that `ctx.isKnown` doesn't know, within the detail cap. The budget for the remaining planned listing pages is always kept in reserve.
6. **Blocks.** HTTP 429 → `rate_limited`; 401/403/999 or an edge "Access Denied" page → `denied`; a redirect to `/authwall`, `/checkpoint`, a login page, a CAPTCHA, or Akamai or Cloudflare bot pages → `challenge`. Any of these sets `strike += 1` and `blockedUntil = now + 2h × 2^(strike−1)` (≤ 7 d; a longer `Retry-After` wins) and logs one clear `BLOCKED …` line. Jobs already fetched are still emitted, then the generator **returns normally**.
7. A run that got real content without being blocked resets `strike` to 0. 5xx errors and timeouts are noted, not counted as blocks; three in one run stop it as `partial`.

**Graceful returns don't trigger sweeps.** Every portal job has `target: null`, because a search window is never a complete listing. A sweep would wrongly close jobs, so freshness relies on §0.4's 21-day/45-day job-board expiry instead.

Example log lines (real runs):

```text
WARN [cli:linkedin] linkedin: robots.txt disallows us — rule "Disallow: /" matches /jobs-guest/jobs/api/seeMoreJobPostings/search?keywords=software+engineer&location=India&f_TPR=r86400&f_E=1&sortBy=DD&start=0 for user-agent "EasyJobsBot/1.0 (+https://easyjobs.example/bot)". Not fetching anything (prompts.md §0.8.6: HTML pages obey robots.txt). Re-checking robots.txt after 2026-11-26T22:29:15.464Z.
WARN [cli:naukri] naukri: BLOCKED (denied) — HTTP 403 — Akamai edge 'Access Denied' (Reference #18.6e220f7a.1795645766.1fac725a) on https://www.naukri.com/robots.txt. Backing off 2.1 h (strike 1) until 2026-11-26T00:35:02.571Z; ending this run gracefully after 1 request(s).
INFO [cli:naukri] naukri: backing off until 2026-11-26T00:35:02.571Z (2.1 h left) after denied: HTTP 403 — … — skipping this run without sending any request
```

To force an immediate retry, delete `.state/<portal>.json`. There is intentionally no env switch that ignores the backoff.

## LinkedIn

- **Search**: `https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?keywords={kw}&location=India&f_TPR=r86400[&f_E=…][&f_WT=…]&sortBy=DD&start={n}`. Pages advance by however many cards came back, and an empty fragment means the end. Paging stops early once every card is older than `ctx.since`.
- **Detail**: `https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/{id}`, only for unknown ids, capped. Closed postings ("No longer accepting applications") are dropped.
- **Parsing** (`parse-listing.ts`, `parse-detail.ts`, cheerio with selector fallbacks): the id comes from `data-entity-urn="urn:li:jobPosting:{id}"` or the `/jobs/view/…-{id}` link. The parser also reads title, company and company page, location, `time[datetime]` plus its label, salary text, the "Actively Hiring" style benefits and the real logo (ghost placeholders are dropped). From the detail it takes the description HTML, the criteria (seniority, employment type, job function, industries), salary, and the off-site apply URL decoded from `code#applyUrl`. The poster / "Meet the hiring team" block is **never** read.

| RawJob | from |
|---|---|
| `sourceUrl` | `https://www.linkedin.com/jobs/view/{id}` |
| `applyUrl` | the company/ATS URL behind "Apply" when the detail exposes one, otherwise the view URL (see Decisions) |
| `postedAt` | the relative label for sub-day posts ("3 hours ago"), else `time[datetime]`; never in the future |
| `jobType` | Employment type: Full-time / Part-time / Contract / Temporary / Internship (Volunteer/Other → none) |
| `experienceLevel` | Seniority: Internship → intern, Entry level → entry, Director/Executive → executive; Associate and Mid-Senior → none (ambiguous). Without a detail: the query's single f_E code. Internship employment always → intern |
| `workMode` / `isRemote` | only when the query used exactly one f_WT code |
| `department`, `employmentTypeRaw`, `salaryRaw` | Job function, Employment type, salary text |
| `extra.linkedin` | query, seniority, industries, company page, benefits, `offsiteApplyUrl`, `detailFetched` |

## Naukri

- **How the page loads results.** The search page (`https://www.naukri.com/{keyword-slug}-jobs[-{page}]?experience={0|1}`) is a client-side app. Its results arrive from `/jobapi/v3/search`, and job pages get theirs from `/jobapi/v4/job/{jobId}`. Public descriptions of the site say those calls require a generated `nkparam` header; I couldn't confirm that, because the edge refused before any token logic ran. Either way, the scraper never calls the API itself: it opens the public page in headless Chromium and reads **the response the page itself receives**, so no token is ever forged by us. Images, fonts and media are not loaded; each run uses a fresh context, with no cookies carried in and nothing persisted.
- **What is unverified.** The JSON shapes come from public descriptions of the site and could not be verified live, since every attempt got a 403. The parser is defensive (unknown keys ignored, garbage tolerated). The first successful live run should be compared against `test/fixtures/naukri/*.json`.

| RawJob | from |
|---|---|
| `sourceJobId`, `title`, `company` | `jobId`, `title`, `companyName` |
| `sourceUrl` | `jdURL`, made absolute, tracking params removed |
| `applyUrl` | the company site (`applyRedirectUrl`) when the job redirects off Naukri, else `jdURL` |
| `locations` | `placeholders[type=location]`, split on commas |
| `experienceRaw`, `experienceMin/Max` | `placeholders[type=experience]` ("0-1 Yrs"); detail `minimumExperience/maximumExperience` |
| `salaryRaw`, `salary` | `placeholders[type=salary]`; `salaryDetail` (annual CTC in INR) only when visible and ≥ ₹10,000 — never invented |
| `skills` | detail key skills + `tagsAndSkills` |
| `postedAt` | `createdDate` (epoch ms), else `footerPlaceholderLabel` ("1 Day Ago", "Few Hours Ago", "Just Now") |
| `companyLogoUrl` | `logoPathV3` / `logoPath` |
| `descriptionHtml` | detail description, followed by the page's Role / Industry / Department / Employment type / Education facts; listing-only jobs get the teaser as `descriptionText` |
| `jobType`, `department`, `tags` | employment type ("Full Time, Permanent" → full_time …), functional area, `walk-in` |

Recruiter names, emails and phone numbers in the payload are ignored.

## Fixtures

| file | origin |
|---|---|
| `test/fixtures/naukri/access-denied-http.html`, `access-denied-jobapi.html` | **real** captures (plain HTTP, 2026-11-25) |
| `test/fixtures/naukri/access-denied-headless.html` | **real** capture (headless Chromium DOM) |
| `test/fixtures/linkedin/robots.txt` | **real**, reduced: every `User-agent` line, the first 3 rules per group, every `/jobs` rule, the full `*` group |
| `test/fixtures/linkedin/search-page.html`, `job-posting-*.html`, `authwall.html` | **reconstructed** from LinkedIn's publicly documented guest-fragment markup (robots.txt forbids fetching them); fictional companies |
| `test/fixtures/naukri/search-v3.json`, `job-v4.json` | **reconstructed** (live access denied); fictional companies |

Parser output is pinned by snapshots in `test/__snapshots__/`.

## Decisions

- **robots.txt wins over the endpoint list.** The P11 prompt names LinkedIn's guest endpoints, but §0.8.6 (HTML obeys robots.txt) and the "documented as blocked" outcome both apply. The code is complete; the runtime refuses.
- **Prefer the official apply URL.** When LinkedIn or Naukri expose the company/ATS link, it becomes `applyUrl` (the contract says "the official company/ATS URL whenever known"), so §0.4 rule 1 can merge the job with its official record. The portal URL is always `sourceUrl`, and the discovered URL is also kept in `extra`. To get the prompt's literal behaviour instead, it's a one-line change in each `map.ts`.
- **Graceful means no throw.** Blocks end the generator normally after emitting what was fetched, and `target: null` keeps the worker from sweeping. A blocked run still shows as `outcome: "blocked"` in the state file and the log. The contract can't report it to the worker yet; that's raised in `docs/contract-requests/P11.md`.
- **Playwright is an optional dependency**, loaded with a dynamic import only when Naukri runs. If it's missing, the run pauses with an install hint (`unavailable`, no strike).
- **Conservative hints**: only unambiguous seniority mappings, and Naukri's structured salary only when visible and plausible.

## Known gaps

- Neither portal yields jobs today (see the evidence above). The parsers have never seen live LinkedIn guest or Naukri API markup, so expect selector or field fixes on the first successful live run.
- Naukri: page-2 URLs (`-jobs-2`) and the `/jobapi/v\d+/(search|job)` URL patterns are assumptions.
- The concurrency guard is per process. A CLI run and a worker run at the same moment would each pace themselves but not each other. The shared state file still records blocks for both.
