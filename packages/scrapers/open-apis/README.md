# @easyjobs/scraper-open-apis

Scrapers for open job APIs and feeds (prompts.md **P12**). One `Scraper` per source, exported from
`src/index.ts` as `scrapers` (and `default`), discovered automatically by the worker.

```bash
pnpm --filter @easyjobs/scraper-open-apis scrape --limit 30                 # every enabled source
pnpm --filter @easyjobs/scraper-open-apis scrape --scraper unstop --limit all
pnpm --filter @easyjobs/scraper-open-apis test                              # offline, fixture-based
LIVE=1 pnpm --filter @easyjobs/scraper-open-apis test                       # + live smoke tests
pnpm --filter @easyjobs/scraper-open-apis typecheck
```

The CLI writes `out/<id>.jsonl` (RawJob per line) and logs counts, invalid count and fill rates. It loads the
repo-root `.env` if present.

## Sources

| id | Source | Kind | Interval | Endpoint | Key | Terms we follow |
|---|---|---|---|---|---|---|
| `unstop` | Unstop jobs + internships | job_board | 120 min | `GET unstop.com/api/public/opportunity/search-result?opportunity=jobs\|internships&per_page=50&oppstatus=open` | – | robots.txt allows `/api/public/*`; ≥1 s between pages |
| `adzuna` | Adzuna India | aggregator | 120 min | `GET api.adzuna.com/v1/api/jobs/in/search/{page}?max_days_old=N&sort_by=date&results_per_page=50` | `ADZUNA_APP_ID`, `ADZUNA_APP_KEY` | Label ads "Adzuna" linked to adzuna.in → `attribution`; free tier ≈ 250 calls/day → 5 pages/run, 2.5 s apart |
| `jooble` | Jooble | aggregator | 180 min | `POST jooble.org/api/{JOOBLE_API_KEY}` `{keywords, location:"India", page}` | `JOOBLE_API_KEY` | `/desc/` and `/away/` are robots-disallowed → links are not resolved |
| `themuse` | The Muse | job_board | 360 min | `GET themuse.com/api/public/jobs?level=Internship&level=Entry Level&level=Mid Level&level=Senior Level&location=…` | optional `THEMUSE_API_KEY` | 500 req/h keyless |
| `remotive` | Remotive | job_board | 360 min | `GET remotive.com/api/remote-jobs` | – | ≤ 4 calls/day; link back to the Remotive URL and credit Remotive; **no re-syndication to Google Jobs etc.** |
| `remoteok` | Remote OK | job_board | 120 min | `GET remoteok.com/api` | – | Link back to the Remote OK URL **without `rel=nofollow`**, name "Remote OK"; don't use their logo |
| `arbeitnow` | Arbeitnow | job_board | 120 min | `GET arbeitnow.com/api/job-board-api?page=N` | – | 50 req/min; link back appreciated |
| `himalayas` | Himalayas | job_board | 180 min | `GET himalayas.app/jobs/api/search?country=IN&sort=recent&page=N` | optional `HIMALAYAS_API_KEY` | Apply button = `applicationLink` unchanged; visible link to Himalayas; **no JobPosting structured data / Google Jobs**; remove expired jobs |
| `jobicy` | Jobicy | job_board | 180 min | `GET jobicy.com/api/jobs?count=100&geo=anywhere\|apac&cursor=…` | – | ≥ 1 s between requests; credit Jobicy with a direct link; Apply = feed URL |
| `weworkremotely` | We Work Remotely | job_board | 120 min | `GET weworkremotely.com/remote-jobs.rss` | – | robots.txt honoured; apply link sits behind WWR sign-in → WWR URL |
| `hn-whoishiring` | HN "Ask HN: Who is hiring?" | job_board | 360 min | Algolia `search_by_date?tags=story,author_whoishiring` → `items/{id}` | – | Only job data: usernames are never stored; job-seeker posts and personal-name posts are skipped |

`attribution` is set on every scraper whose terms ask for credit; job-level terms are in `extra.terms`
(`linkBackRequired`, `followLinkRequired`, `applyUrlUnchanged`, `noJobPostingSchema`, …) so the web app can honour them.

## What each source maps

All sources fill the required RawJob fields; hints come from structured data only (never invented):

- **unstop** — `jobType` (internships → `internship`; `timing` → full/part-time/contract), `experienceLevel`
  (`intern`, or `fresher` when only freshers/students are eligible), `experienceMin/Max` (job detail or the
  eligibility experience list), `workMode`/`isRemote` (`in_office`/`wfh`/`hybrid`/`on_field`), `salary` (INR, month or
  year; unpaid/undisclosed → `null` + `salaryRaw`), **`batches`** (passout years of eligible sectors + per-course years),
  **`degrees`** (course codes → "B.E/B.Tech", "MBA", "Any graduate", …), `skills`, `department`, `validThrough`,
  logo, tags `wfh`/`unpaid`/`women`. Sweep targets `unstop:jobs` / `unstop:internships` when a kind was fully covered.
- **adzuna** — salary only when `salary_is_predicted` is 0 (estimates go to `extra.predictedSalary`), contract
  type/time → `jobType`, category → `department`, lat/lng → `extra.geo`.
- **jooble** — 64-bit ids kept as exact strings, `salaryRaw`, `type` → `jobType`, origin site → `extra.originalSource`.
- **themuse** — levels → `experienceLevel` (Internship→intern, Entry→entry, Mid→mid, Senior→senior), category →
  `department`; keeps India-located roles and remote roles with explicit India/anywhere wording.
- **remote boards** (remotive, remoteok, arbeitnow, himalayas, jobicy, weworkremotely) — kept only when open to
  **India or anywhere** (see below), tagged `remote`, `isRemote: true`, `workMode: "remote"`, location
  `"Remote (India)"`, `"Remote (Anywhere)"`, `"Remote (APAC)"` or `"Remote (Asia)"`; plus whatever each provides:
  salary (structured where available), seniority → `experienceLevel`, type → `jobType`, `validThrough`, logo, skills.
- **hn-whoishiring** — header `Company | Role | Location | REMOTE | type | $ | link` in any order: company (YC batch →
  `extra.ycBatch`), one job per role, office locations, remote regions, `workMode`, `jobType`, `salaryRaw`, visa
  notes, `companyDomain`; apply link = best ATS/careers link, shorteners/careers redirects resolved (cached).

### "Open to India or anywhere"

`src/lib/region.ts` classifies location strings into `india | anywhere | asia | restricted | unknown` (gazetteer in
`src/lib/places.ts`), then lets the **title** ("… - USA", "(PST)", "SEA …") and **description** ("must be authorized
to work in the US", "open to candidates who reside in Atlanta, Georgia; …") veto an "anywhere" label. WWR's
"Headquarters: United States - Remote" line overrides its default "Anywhere in the World" region. Unknown ⇒ dropped
(except Arbeitnow's generic "Remote", which is treated as anywhere for English-language postings).

### Apply URLs and redirect resolution

`applyUrl` is resolved to the final official URL only where that is both cheap and allowed: HN links (shorteners such
as `grnh.se`, careers pages that bounce to an ATS) are resolved with one HEAD request each through the shared polite
client and cached in `.cache/redirects.json` for 30 days (`OPEN_APIS_CACHE_DIR` to move, `off` to disable). Not
resolved, on purpose: Adzuna (`redirect_url` is a tracked click — a bot would generate fake clicks), Jooble
(robots-disallowed), Remotive / Remote OK / Himalayas / Jobicy (terms require their URL / `applicationLink`
unchanged), WWR (behind sign-in), Unstop (applications happen on Unstop).

Multi-role HN posts that share one generic link emit `applyUrl: null` (+ `extra.careersUrl`): the same URL on several
jobs would give them the same fingerprint (§0.4 rule 1) and merge them into one record.

### Sweeps (`target`)

`target` is non-null only for feeds whose run sees every open job: `remotive` → `"remotive"`, HN →
`"whoishiring"`, Unstop → `"unstop:jobs"` / `"unstop:internships"` (null if the page cap is below the last page).
Paged/windowed feeds emit `target: null` — they are not safe to sweep and rely on the 21-day/45-day freshness rule.

## Environment variables

See `.env.example`. All optional; keyed sources stay disabled without keys.

| Var | Default | Effect |
|---|---|---|
| `ADZUNA_APP_ID`, `ADZUNA_APP_KEY` | – | enable `adzuna` |
| `ADZUNA_MAX_PAGES` / `ADZUNA_MAX_DAYS_OLD` / `ADZUNA_WHAT` | 5 / 3 / – | pages per run, history without `since`, keyword filter |
| `JOOBLE_API_KEY` | – | enable `jooble` |
| `JOOBLE_KEYWORDS` / `JOOBLE_LOCATION` / `JOOBLE_MAX_PAGES` / `JOOBLE_PER_PAGE` | `internship,fresher,graduate trainee,software engineer` / India / 1 / 50 | queries per run |
| `THEMUSE_API_KEY`, `THEMUSE_LEVELS`, `THEMUSE_LOCATIONS`, `THEMUSE_MAX_PAGES` | –, 4 levels, India cities + "Flexible / Remote", 10 | |
| `HIMALAYAS_API_KEY`, `HIMALAYAS_MAX_PAGES`, `HIMALAYAS_COUNTRY` | –, 10, IN | key raises rate limits |
| `UNSTOP_MAX_PAGES`, `UNSTOP_PER_PAGE` | 40, 50 | per kind |
| `ARBEITNOW_MAX_PAGES` | 3 | |
| `JOBICY_GEOS`, `JOBICY_MAX_PAGES` | `anywhere,apac`, 5 | |
| `WWR_FEEDS` | main feed | comma list of RSS URLs |
| `HN_RESOLVE_LINKS`, `HN_RESOLVE_MAX`, `HN_PREVIOUS_THREAD_DAYS` | 1, 150, 7 | link resolution on/off, per-run budget, keep last month's thread for N days |
| `OPEN_APIS_DISABLED` | – | kill switch: `remoteok,jobicy` or `all` |
| `OPEN_APIS_CACHE_DIR` | `<package>/.cache` | redirect cache; `off` disables |
| `OPEN_APIS_HTTP_CACHE_MIN` | 0 | **dev only**: reuse GET responses for N minutes |
| `SCRAPER_USER_AGENT` | contract default | identifies the bot |

## Layout

```
src/index.ts, src/cli.ts
src/sources/<id>.ts          one Scraper + pure map*/parse* functions each
src/sources/hn/parse.ts      HN header/segment parser
src/lib/                     region (India/anywhere), places, html, http (errors, redaction), links, redirect, salary, taxonomy, util
test/*.test.ts               fixture tests per source, gating, LIVE=1 smoke (test/live.test.ts)
test/fixtures/               trimmed live captures (2026-11-26) + synthetic Adzuna/Jooble/Muse (see README there)
```
