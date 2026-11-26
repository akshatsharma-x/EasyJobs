# Integration (W1)

All 14 workspace packages now work as one system. A fresh clone runs with `pnpm install && cp .env.example .env && pnpm dev` plus `pnpm scrape:once`. During the smoke run on 2026-11-26 the site served **real jobs from 47 sources**: 50,021 open jobs from 3,174 companies. `pnpm check` (typecheck + test + lint) is green.

## 1. What changed

### Contract 1.1.0 (`packages/contract`)

Every addition is optional, so 1.0 producers and consumers keep compiling.

**`index.ts`**
- `KNOWN_TAGS` gains five tags: `part-time`, `ppo`, `unpaid`, `visa-sponsorship`, `test-posting` (P03 #6, P10 #5).
- New `DEGREES` canonical vocabulary and `Degree` type (P03 #2, P06 #4, P12 #5). Normalize now re-exports it from the contract.
- `RawJob` gains:
  - `light?: boolean` — a light record (P05 #4, P06 #2, P08 #3, P03 #1).
  - `applyUrlSpecific?: boolean` — fingerprint rule 1 only for job-specific official URLs (P03 #3a, P06 #3).
- `JobInput.extra` conventions are documented: `light`, `normalize.defaulted`, `terms`.
- `CompanyTarget.aliases?: string[]` (P04 #1).
- New `SourceTerms` type plus `JobSourceRef.attribution?` and `JobSourceRef.terms?` (P12 #1, legal display conditions).
- `JobsSearchResponse` gains `corrections?: Record<string,string>` and `fuzzy?: boolean` (P02 #3); the API previously sent these only as headers.
- `SweepRequest.target: string | null` and `SweepResponse.removed?` (P02 #1–2).
- `RunReport` gains `complete?` and `stats?` (P05 #5).

**`node.ts`**
- `HttpError` gains `headers` and a `blocked` getter (P08 #4).
- New `isBlockedResponse()` and an exported `SourceBlockedError` class (P12 #6).
- The HTTP client never retries 999, statuses ≥ 600, or `cf-mitigated: challenge` responses (P11 #3, P08 #4).
- robots.txt follows RFC 9309: a 5xx, 429 or network failure means disallow-all, re-checked after 10 minutes instead of being treated as allow-all (P11 #2).
- `ScrapeContext` gains typed hooks `markIncomplete`, `report` and `markSeen`. The docs now say `since` and `isKnown` may only be used to skip work, never to shrink a complete run (P05 #2–3, P07 #1, P08 #1, P09 #1–2, P10 #1, P11 #1).
- `Scraper.sweep?: boolean`.

**Deferred** (worked around today; see §4):
- `Salary.period` `week`/`day`: normalize converts weekly and daily pay to monthly.
- `remoteScope`; `ctx.state`; `applyFormUrl`; `locationParts`.
- `CompanyTarget.status` / `boards`; `FacetBucket` metadata.
- A report endpoint; `stats.byCategory`; a stream event for closed jobs.
- `JobInput.companyHq` / `careersUrl`: the API already enriches companies from the registry.
- A type-ahead `prefix` flag.

### Fixes and wiring per package

| Package | Change |
|---|---|
| root | `pnpm-workspace.yaml` gains `allowBuilds`, which is what pnpm 12 reads, so `pnpm install`/`add` stop exiting with ERR_PNPM_IGNORED_BUILDS. `packageManager` is pinned to `pnpm@12.23.0`. New root scripts: `dev`, `scrape:once`, `seed`, `reset`, `check`, `lint`, `build`, `worker`. Also a merged `.env.example` and README. |
| worker | Contract hooks are typed. `markSeen` feeds the sweep's seen set. A `SourceBlockedError` or an anti-bot `HttpError` becomes a graceful "blocked" stop (paused until `retryAt`, default 6 h) instead of backoff and breaker. New `WORKER_DISABLED_SOURCES=<ids>` kill switch for any scraper. `Scraper.attribution` is copied into `extra.attribution`. +4 tests. |
| db / api | `GET /v1/ingest/known` lists only ids stored **with a description**, so light/card-only jobs get their details (P07 #2, P08 #2, P10). `corrections`/`fuzzy` are in the JSON body. `job_sources.attribution`/`terms` (migration `0005_source_terms`) are surfaced on `JobSourceRef`. `test-posting` jobs are born closed. New `pnpm --filter @easyjobs/db reset`. +3 tests. |
| normalize | `DEGREES` comes from the contract. Reads `RawJob.applyUrlSpecific`. |
| web | Real API by default (`NEXT_PUBLIC_USE_MOCKS=0`, §0.7). Labels for the new tags; `suspicious`/`test-posting` are never shown as badges. "Showing results for …" from `corrections`. Source terms are honoured: credit line, followed link when `followLinkRequired`, no JobPosting JSON-LD or sitemap entry for restricted non-official listings. normalize's raw Google-favicon `logoUrl`s go through the `/logo/<domain>` proxy (no browser 404s, no blurry icons). +3 tests. |
| scraper-bigtech | **Bug:** listings cut off at `maxPages` looked complete and were swept, closing live jobs. All 13 listing paths now call `ctx.markIncomplete`. +2 tests. |
| scraper-ats-public | **Bug:** Ashby registry tokens that are already percent-encoded (`Flock%20Safety`) were double-encoded to `%2520` and read as dead boards. +2 tests. |
| scraper-ats-enterprise | **Bug:** the per-tenant limiter spaced *scheduled* slots, so when timers fired late (a busy event loop) two requests started back to back. It now spaces *actual* starts. |
| tests | Two CPU- and subprocess-heavy suites (normalize fuzz, worker CLI) timed out under a load average of 77. They now have explicit timeouts; nothing was skipped or loosened. |
| registry | A fixture page captured a third party's Mapbox token; it is redacted, and GitHub push protection flagged it. |

## 2. Smoke run (2026-11-26, PGlite, this machine)

- `pnpm worker list` discovered **63 scrapers from 7 packages**, plus the real `@easyjobs/normalize` and `@easyjobs/registry` (1,581 companies). The scheduler planned 860 tasks.
- `pnpm dev` → API (migrations applied), worker (starts once the API is healthy) and web.
- `pnpm scrape:once` → 65 tasks at `--limit 30` (2 boards per ATS). 0 % invalid for every source; the failures are dead or blocked boards (table below).
- **Jobs from each source appear:** 47 sources with open jobs. The scheduler ran full crawls alongside, hence the totals.
- **Facet counts match:** 73 sampled buckets across all 11 facet groups equal the `total` of the corresponding filtered query (0 mismatches). The level facet stays unchanged when level is selected (disjunctive). `stats.byLevel == facets.level` and `stats.totalOpen == total`. Check script: `node scripts/check-facets.mjs`.
- **Job pages render** (SSR + JSON-LD); `/jobs/<id>/<wrong-slug>` returns 308.
- **Live pill:** with `/jobs` open, a manual `pnpm worker once --source greenhouse --target aircall` (15 new jobs) plus the running scheduler gave "50 new jobs match your filters". Clicking it put the new jobs on top (`apps/web/scripts/live-pill-check.mjs`).
- **CourseJoiner ↔ official merge:** 17 blog posts merged with their official postings. Example: **"Student Researcher, 2027" at Google** (`/jobs/97qu03riizy`), one job with three sources:
  - `google` (career_site) — `https://www.google.com/about/careers/applications/jobs/results/125423735539671750-student-researcher` (`applyUrl`)
  - `coursejoiner` (aggregator) — `https://coursejoiner.com/internship/google-student-researcher-internship-4/`
  - `freshershunt` (aggregator) — `https://freshershunt.in/google-internship-2027/`

## 3. Per-source results

\* "Open jobs in DB" includes the scheduler's full crawls that ran during the smoke run, not only the `--limit 30` pass.

| Family | Source | Enabled | `scrape:once` tasks | Read | Invalid | Open jobs in DB* | Errors / notes |
|---|---|---|---|---|---|---|---|
| ats-enterprise | `avature` | yes | 2 | 30 | 0% | 282 | scrape failed: avature: 1/1 target(s) incomplete — mckinsey-and-company: HTTP 404 https:// |
| ats-enterprise | `eightfold` | yes | 2 | 60 | 0% | 459 | — |
| ats-enterprise | `icims` | yes | 2 | 30 | 0% | 30 | scrape failed: icims: 1/1 target(s) incomplete — seismic: icims: no job URLs discovered fr |
| ats-enterprise | `jsonld` | yes | 2 | 3 | 0% | 2 | blocked (reported by scraper): cognizant: jsonld: crawl stopped early — blocked by an anti |
| ats-enterprise | `oracle` | yes | 2 | 60 | 0% | 2,432 | — |
| ats-enterprise | `phenom` | yes | 2 | 60 | 0% | 314 | — |
| ats-enterprise | `successfactors` | yes | 2 | 60 | 0% | 817 | — |
| ats-enterprise | `taleo` | yes | 2 | 0 | — | 0 | scrape failed: taleo: 1/1 target(s) incomplete — societe-generale: taleo: no job URLs disc |
| ats-public | `ashby` | yes | 2 | 30 | 0% | 11,112 | — |
| ats-public | `bamboohr` | yes | 2 | 35 | 0% | 37 | — |
| ats-public | `greenhouse` | yes | 2 | 60 | 0% | 17,297 | — |
| ats-public | `lever` | yes | 2 | 41 | 0% | 658 | — |
| ats-public | `personio` | yes | 2 | 6 | 0% | 5 | — |
| ats-public | `recruitee` | yes | 2 | 38 | 0% | 38 | — |
| ats-public | `smartrecruiters` | yes | 2 | 31 | 0% | 713 | — |
| ats-public | `teamtailor` | yes | 2 | 5 | 0% | 5 | — |
| ats-public | `workable` | yes | 2 | 40 | 0% | 134 | — |
| bigtech | `accenture` | yes | 1 | 30 | 0% | 2,702 | — |
| bigtech | `amazon` | yes | 1 | 30 | 0% | 2,057 | — |
| bigtech | `apple` | yes | 1 | 30 | 0% | 182 | — |
| bigtech | `atlassian` | yes | 1 | 22 | 0% | 22 | — |
| bigtech | `axis-bank` | yes | 1 | 30 | 0% | 200 | — |
| bigtech | `capgemini` | yes | 1 | 30 | 0% | 809 | — |
| bigtech | `deloitte` | yes | 1 | 30 | 0% | 200 | — |
| bigtech | `ey` | yes | 1 | 30 | 0% | 200 | — |
| bigtech | `google` | yes | 1 | 30 | 0% | 253 | — |
| bigtech | `hcltech` | yes | 1 | 30 | 0% | 197 | — |
| bigtech | `hdfc-bank` | yes | 1 | 30 | 0% | 230 | — |
| bigtech | `ibm` | yes | 1 | 0 | — | 3,698 | scrape failed: ibm: Disallowed by robots.txt: https://www-api.ibm.com/search/api/v2 |
| bigtech | `ltimindtree` | yes | 1 | 30 | 0% | 30 | — |
| bigtech | `microsoft` | yes | 1 | 28 | 0% | 28 | scrape failed: microsoft: fetch failed |
| bigtech | `ntt-data` | yes | 1 | 30 | 0% | 223 | — |
| bigtech | `tata-elxsi` | yes | 1 | 30 | 0% | 30 | — |
| bigtech | `wipro` | yes | 1 | 30 | 0% | 30 | — |
| bigtech | `zoho` | yes | 1 | 9 | 0% | 9 | — |
| coursejoiner | `coursejoiner` | yes | 1 | 30 | 0% | 126 | — |
| coursejoiner | `fresheroffcampus` | yes | 1 | 30 | 0% | 219 | — |
| coursejoiner | `freshershunt` | yes | 1 | 30 | 0% | 199 | — |
| coursejoiner | `kickcharm` | yes | 1 | 30 | 0% | 115 | — |
| internshala | `internshala-internships` | yes | 1 | 30 | 0% | 933 | — |
| internshala | `internshala-jobs` | yes | 1 | 30 | 0% | 854 | — |
| open-apis | `arbeitnow` | yes | 1 | 13 | 0% | 13 | — |
| open-apis | `himalayas` | yes | 1 | 30 | 0% | 187 | — |
| open-apis | `hn-whoishiring` | yes | 1 | 30 | 0% | 277 | — |
| open-apis | `jobicy` | yes | 1 | 30 | 0% | 102 | — |
| open-apis | `remoteok` | yes | 1 | 5 | 0% | 5 | — |
| open-apis | `unstop` | yes | 1 | 30 | 0% | 1,636 | — |
| open-apis | `weworkremotely` | yes | 1 | 7 | 0% | 7 | — |
| ats-enterprise | `workday` | off here (`WORKER_DISABLED_SOURCES`; Cloudflare challenges this IP) | 0 | 0 | — | 0 | — |
| open-apis | `themuse` | off here (Cloudflare 403 from this network) | 0 | 0 | — | 0 | — |
| open-apis | `remotive` | off here (4 calls/day quota spent) | 0 | 0 | — | 0 | — |
| open-apis | `adzuna` | off (needs `ADZUNA_APP_ID`+`ADZUNA_APP_KEY`) | 0 | 0 | — | 0 | — |
| open-apis | `jooble` | off (needs `JOOBLE_API_KEY`) | 0 | 0 | — | 0 | — |
| portals | `linkedin` | off by default (`ENABLE_LINKEDIN`) | 0 | 0 | — | 0 | — |
| portals | `naukri` | off by default (`ENABLE_NAUKRI`) | 0 | 0 | — | 0 | — |
| bigtech | `meta` | off (P09: disabledReason) | 0 | 0 | — | 0 | — |
| bigtech | `uber` | off (P09) | 0 | 0 | — | 0 | — |
| bigtech | `flipkart` | off (P09) | 0 | 0 | — | 0 | — |
| bigtech | `tcs` | off (P09) | 0 | 0 | — | 0 | — |
| bigtech | `tech-mahindra` | off (P09) | 0 | 0 | — | 0 | — |
| bigtech | `cognizant` | off (P09) | 0 | 0 | — | 0 | — |
| bigtech | `infosys` | opt-in (`ENABLE_INFOSYS=1`) | 0 | 0 | — | 0 | — |
| ats-public | `breezy` | on (0 registry boards) | 0 | 0 | — | 0 | — |

## 4. Known issues, ranked by impact

1. **India relevance.** Global ATS boards (Greenhouse 17k, Ashby 11k) bring many non-India and even non-English postings; the default "relevance" sort put a Ukrainian blue-collar job first. The registry sets no country hints (`extra.country`), so ATS crawls are global (Bosch: 5,168 jobs, 687 in India). → **W2**: boost India and remote-India in `rank_base`, and set country hints for big global boards.
2. **Workday is blocked from this IP** (Cloudflare `429` + `cf-mitigated: challenge` to Node). It is disabled here via `WORKER_DISABLED_SOURCES`. 272 registry tenants are still unverified. Re-run `pnpm --filter @easyjobs/registry verify --only workday` from a clean IP and keep `WORKDAY_DELAY_MS ≥ 3000`, `WORKDAY_CONCURRENCY=1`.
3. **Salary and batch quality:**
   - ATS placeholder ranges ("USD 1–999,999") top the "Highest pay" sort.
   - Batches implied by the title are missed (Google "Student Researcher, 2027" → `batches: []`).
   - → **W2** normalize fixes.
4. **Dead or misconfigured registry boards:**
   - `icims:seismic` — no job URLs
   - `avature:mckinsey-and-company` — 404
   - `taleo:societe-generale` — no job URLs
   - `jsonld:cognizant` — anti-bot wall
   - darwinbox, keka, zoho_recruit, freshteam — 45 entries with no adapter
   - → registry cleanup with `verify`.
5. **Microsoft careers** allows about 5 requests/min per IP. A run takes about 16 minutes with 429 back-offs and still gets about 28 jobs per run.
6. **Six companies are not covered by P09** (`meta`, `uber`, `flipkart`, `tcs`, `tech-mahindra`, `cognizant` are disabled for policy or technical reasons). They are only reached through aggregators. `infosys` is opt-in.
7. **Sources off on this machine:** The Muse (Cloudflare 403) and Remotive (4 calls per day). Adzuna and Jooble need keys; LinkedIn and Naukri are off by default.
8. **Light-record markers differ** (`extra.light`, `extra.detail`, none). Normalize infers light from the missing description, which works. Scrapers can now move to `RawJob.light`.
9. **Double crawl:** `ntt-data` is both a registry `phenom` target and a P09 scraper. Fingerprints merge the results, but the work is done twice.
10. **IBM fails closed once in a while.** Its robots.txt redirects to the homepage. A transient fetch failure now means "disallow" for 10 minutes (RFC 9309), so one run in a while fails cleanly.
11. **PGlite is single-process:** `pnpm reset` needs `pnpm dev` stopped. Use Postgres for anything shared.
12. **`once` and `start` can overlap.** There is no lock between a manual `once` and the running scheduler; both stay polite per host but double the load briefly.
13. **Dev-only React warning** from next-themes' inline script on client-side 404 navigation.
14. **Leftover P02 benchmark artifacts:** `.data/pglite-bench` (1.8 GB) and an `easyjobs_bench` database on the local Homebrew Postgres. Both are safe to delete.
