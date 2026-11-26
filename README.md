# EasyJobs

Real-time internship and job search for India (plus remote and global roles). EasyJobs reads the official career portals of MNCs, Indian IT companies and startups — Greenhouse, Lever, Ashby, Workday, Oracle, Eightfold, SuccessFactors and custom portals — plus **CourseJoiner** and other fresher job blogs, Internshala, Unstop and open job APIs. Everything is normalized, de-duplicated and served as one fast search with filters for internships, freshers, experience, batch, location, salary and company type.

```bash
corepack enable pnpm          # pnpm 12 (pinned in package.json)
pnpm install
cp .env.example .env
pnpm dev                      # API :4000 + worker :4100 + web :3000
pnpm scrape:once              # in a 2nd terminal: every enabled scraper once (--limit 30)
open http://localhost:3000
```

No Docker or Postgres needed: without `DATABASE_URL` the API runs embedded Postgres (PGlite) in `.data/pglite`, and migrations run automatically.

## Architecture

```
 SOURCES                          packages/scrapers/*          apps/worker                     apps/api + packages/db           apps/web
 ─────────────────────────        ──────────────────────       ─────────────────────────       ────────────────────────         ─────────────────────
 Company ATS boards         ─┐    one package per source       scheduler                      POST /v1/ingest/jobs             Next.js 16 (RSC)
 (Greenhouse, Lever, Ashby,  │    family; each exports         • 15 m / 1 h / 24 h by          • validate + sanitize            search + facets
  SmartRecruiters, Workday,  │    Scraper[] with               registry priority              • fingerprint merge (§0.4)       job pages (JSON-LD)
  Oracle, Eightfold, …)      ├──► scrape(ctx) ─ RawJob ──►     • backoff, circuit breaker  ─►  • sweep closed postings  ──►    companies, presets
 Custom portals (Amazon,     │                                  normalize (packages/normalize)  • freshness rules                saved-jobs tracker
  Google, Microsoft, TCS…)   │    registry (1,581 companies)   registry lookup (company tags)  Postgres / PGlite                ⌘K palette
 CourseJoiner & job blogs,   │    → one task per (ATS, board)  gzip batches · on-disk spool    GET /v1/jobs (facets, SSE)  ◄──  live “N new jobs” pill
 Internshala, Unstop, open  ─┘                                  sweep after complete runs       GET /v1/stream (SSE)
 job APIs (Remote OK, HN…)
```

| Path | Package | What it does |
|---|---|---|
| `packages/contract` | `@easyjobs/contract` | Shared types, enums, labels, `SearchQuery` (de)serialization, the polite HTTP client, the `Scraper` interface. **v1.1.0** |
| `packages/scrapers/*` | `@easyjobs/scraper-*` | 7 source families, 63 scrapers (see [Sources](#sources)) |
| `packages/registry` | `@easyjobs/registry` | 1,581 companies → ATS + board token, tags, priority |
| `packages/normalize` | `@easyjobs/normalize` | RawJob → JobInput: level, type, mode, batch, salary (INR/yr), locations, skills, category, fingerprint |
| `apps/worker` | `@easyjobs/worker` | Discovers scrapers, schedules them, normalizes, batches, spools, sweeps |
| `packages/db` + `apps/api` | `@easyjobs/db`, `@easyjobs/api` | Drizzle + Postgres/PGlite, merge/sweep/freshness, Hono HTTP API with disjunctive facets and SSE |
| `apps/web` | `@easyjobs/web` | The site |

## How it works

1. **Discover.** The worker imports every `packages/scrapers/*/src/index.ts`, the real normalizer and the registry at runtime (a broken package is reported, never fatal). `pnpm worker list` shows what it found.
2. **Schedule.** Feed scrapers (CourseJoiner, Internshala, Unstop…) run on their own interval; ATS scrapers run once per registry board, every 15 min / 1 h / 24 h by company priority, spread out and rate-limited per host.
3. **Scrape politely.** Every request goes through the contract's HTTP client: robots.txt (an unreachable robots.txt means *disallow*), per-host concurrency and spacing, retries with back-off, no retries on anti-bot answers (Cloudflare challenge, HTTP 999).
4. **Normalize.** `normalizeJob` classifies experience level (intern / fresher / entry / mid / senior / lead / executive), job type, work mode, batches, degrees and category, converts salary to INR per year, canonicalizes locations and computes the **fingerprint**: the official job URL's ATS key when the apply link points at a single official posting, else `company | title | city | type`.
5. **Ingest & merge.** The API merges records with the same fingerprint: a CourseJoiner post that links to the official Greenhouse posting becomes one job with both sources ("Also listed on"). Official sources win field by field.
6. **Freshness.** After a complete run, the worker *sweeps* the board: postings it no longer saw are closed. Job-board-only postings close after 21 days unseen or 45 days old; past `validThrough` closes too.
7. **Serve.** `GET /v1/jobs` does text search + every filter + disjunctive facets in a few ms; `GET /v1/stream` pushes new matching jobs to the browser (the "N new jobs" pill).

## Root scripts

| Script | What it does |
|---|---|
| `pnpm dev` | API + worker + web together (colored prefixes). Migrations run on API start; the worker starts once the API is healthy. |
| `pnpm scrape:once` | Every enabled scraper once with `--limit 30` (ATS: 2 boards each, `SCRAPE_MAX_TARGETS`) through the full pipeline. Needs the API. |
| `pnpm worker <cmd>` | Worker CLI: `list`, `once --source <id> [--target <slug>] [--limit n] [--dry-run]`, `start`, `replay` |
| `pnpm seed` | ~2,000 **synthetic** jobs through the real ingest path (UI work without scraping). |
| `pnpm reset` | Empty the database and the worker's schedule state/spool (stop `pnpm dev` first when using PGlite). |
| `pnpm check` | `typecheck` + `test` + `lint` (strict `tsc` rules) across all 14 packages. |
| `pnpm build` | Production build of the web app. |

Ports (§0.7): web **3000**, API **4000**, worker **4100**, Docker Postgres **5433** — all configurable in `.env` (`WEB_PORT`, `API_PORT`, `WORKER_PORT`; keep `API_URL`, `NEXT_PUBLIC_*` and `WEB_ORIGIN` in sync).

## Sources

| Family | Package | Scrapers (ids) | Kind | Default | Needs |
|---|---|---|---|---|---|
| Public ATS APIs | `scraper-ats-public` | `greenhouse`, `lever`, `ashby`, `smartrecruiters`, `workable`, `recruitee`, `bamboohr`, `personio`, `breezy`, `teamtailor` | official (ATS) | on — one task per registry board | — |
| Enterprise ATS | `scraper-ats-enterprise` | `workday`, `oracle`, `eightfold`, `successfactors`, `phenom`, `icims`, `avature`, `taleo`, `jsonld` | official (ATS) | on | — (Workday sits behind Cloudflare; see Troubleshooting) |
| Custom career portals | `scraper-bigtech` | `amazon`, `google`, `microsoft`, `apple`, `ibm`, `atlassian`, `zoho`, `wipro`, `hcltech`, `capgemini`, `accenture`, `deloitte`, `ltimindtree`, `ey`, `ntt-data`, `tata-elxsi`, `axis-bank`, `hdfc-bank` · opt-in `infosys` · off: `meta`, `uber`, `flipkart`, `tcs`, `tech-mahindra`, `cognizant` | official (career site) | on (18) | `ENABLE_INFOSYS=1` for Infosys |
| Fresher job blogs | `scraper-coursejoiner` | `coursejoiner`, `freshershunt`, `fresheroffcampus`, `kickcharm` | aggregator | on | optional `ANTHROPIC_API_KEY` (LLM extraction) |
| Internshala | `scraper-internshala` | `internshala-internships`, `internshala-jobs` | job board | on | — |
| Open APIs & feeds | `scraper-open-apis` | `unstop`, `remoteok`, `arbeitnow`, `himalayas`, `jobicy`, `weworkremotely`, `hn-whoishiring`, `remotive`, `themuse`, `adzuna`, `jooble` | job board / aggregator | on (Adzuna/Jooble need keys) | `ADZUNA_APP_ID`+`ADZUNA_APP_KEY`, `JOOBLE_API_KEY` |
| LinkedIn, Naukri | `scraper-portals` | `linkedin`, `naukri` | job board | **off** | `ENABLE_LINKEDIN=1` / `ENABLE_NAUKRI=1` |

Per-package kill switches: `ATS_PUBLIC_DISABLED`, `BIGTECH_DISABLE`, `OPEN_APIS_DISABLED`, `INTERNSHALA_ENABLED=0`, `ENABLE_COURSEJOINER=0`… and the worker-wide **`WORKER_DISABLED_SOURCES=<ids>`** for any scraper.

## Legal & etiquette

- **Robots and rate limits.** HTML pages obey robots.txt (RFC 9309: an unreachable robots.txt means disallow-all for a while). Every host gets bounded concurrency and spacing; multi-tenant platforms (Workday, Eightfold) get a source-wide gate on top. `429`/`503` back off; anti-bot answers are never retried or bypassed — the source is paused instead.
- **No logins, no CAPTCHA solving, no proxies or fingerprint spoofing.** Only job-posting data is collected — never personal data.
- **Identify yourself.** Set `SCRAPER_USER_AGENT` to a real contact URL before crawling from a server.
- **LinkedIn and Naukri** restrict automated access; their adapters are off by default and enabling them is your decision.
- **API terms.** Open APIs come with display conditions that the site honours automatically from each source's terms (contract `SourceTerms`): attribution and a link back (Remote OK without `nofollow`), the original apply URL, and no JobPosting structured data / sitemap syndication for Remotive and Himalayas listings unless an official source exists. Remotive's advisory limit is a few calls per day.
- **Always link to the original posting.** Apply buttons go to the official page whenever one exists; EasyJobs never hosts applications or charges candidates.

## Troubleshooting

- **Port already in use** — another app holds 3000/4000: set `WEB_PORT` / `API_PORT` (and the matching URLs) in `.env`.
- **`PGlite is locked`** — only one process may open `.data/pglite`. `pnpm seed` falls back to the running API; `pnpm reset` needs `pnpm dev` stopped. For anything shared use Postgres: `docker compose up -d db` + `DATABASE_URL`.
- **Workday / The Muse answer 429 or 403 with a Cloudflare challenge** — your IP is being challenged; the worker pauses the source automatically. Add `workday,themuse` to `WORKER_DISABLED_SOURCES` until it clears.
- **Nothing shows up** — `curl localhost:4000/health`, then `pnpm worker list` (are scrapers enabled?), then `curl localhost:4100/status`.

## More

- `docs/INTEGRATION.md` — what the integration changed (contract 1.1), per-source results, known issues.
- `docs/status/P01…P12.md` — per-package design notes, numbers and gaps; `prompts.md` — the original spec (§0 = shared contract).
