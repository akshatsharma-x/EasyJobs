# @easyjobs/scraper-bigtech

Official jobs straight from the **custom-built career portals** of the highest-volume employers in India: Big Tech,
Indian IT services and consulting firms. There is **one `Scraper` per company**: `id` = registry company slug,
`kind: "career_site"`, no `handlesAts`, `intervalMinutes` 30–60. Plain ATS boards (Greenhouse, Lever, Workday,
Oracle, Eightfold v2, SmartRecruiters, Ashby) are *not* built here. They are listed under
[Registry notes](#registry-notes) for P04 and the P07/P08 adapters.

```bash
pnpm --filter @easyjobs/scraper-bigtech scrape --scraper amazon --limit 50     # one company → out/amazon.jsonl
pnpm --filter @easyjobs/scraper-bigtech scrape --limit 20                      # every enabled company
pnpm --filter @easyjobs/scraper-bigtech test                                   # offline (fixtures)
LIVE=1 pnpm --filter @easyjobs/scraper-bigtech test                            # + live smoke test per enabled company
pnpm --filter @easyjobs/scraper-bigtech typecheck
npx tsx scripts/report.ts --limit 50 [--only a,b] [--opt-in]                   # live coverage / fill-rate table (run inside the package)
```

## Companies

Status: ✅ working by default · 🟡 opt-in (off by default) · ⛔ disabled (`isEnabled` → false, reason in code and below).
Live numbers are in [`docs/status/P09.md`](../../../docs/status/P09.md); endpoint, robots and mapping details are in
`docs/sites/<id>.md`.

| id | Company | Status | Endpoint (what the careers page itself uses) | India scope |
|---|---|---|---|---|
| `amazon` | Amazon | ✅ | JSON `GET amazon.jobs/en/search.json` (full description in the list) | `normalized_country_code[]=IND` (incl. India "virtual" = remote roles) |
| `google` | Google | ✅ | XML feed `google.com/about/careers/applications/jobs/feed.xml` (one request) | jobs with an India location |
| `microsoft` | Microsoft | ✅ rate-limited | JSON, Eightfold **PCSX** `/api/pcsx/search` + `/api/pcsx/position_details` | `location=India`; 15 s gap, ≤ 30 details per run |
| `apple` | Apple | ✅ | HTML with embedded hydration JSON (search + detail pages) | `location=india-INDC` |
| `meta` | Meta | ⛔ | – | – |
| `ibm` | IBM | ✅ | JSON `POST www-api.ibm.com/search/api/v2` (list carries the full description) | `field_keyword_05 = India` |
| `atlassian` | Atlassian | ✅ | JSON `GET atlassian.com/endpoint/careers/listings` (one request, all jobs) | India locations or "Remote - APAC" |
| `uber` | Uber | ⛔ | – | – |
| `flipkart` | Flipkart | ⛔ | – | – |
| `zoho` | Zoho | ✅ | RSS `careers.zohocorp.com/jobs/Careers/rss` (Zoho Recruit) | all India |
| `tcs` | TCS | ⛔ | – (parser kept, tested on a captured response) | – |
| `infosys` | Infosys + Infosys BPM | 🟡 `ENABLE_INFOSYS=1` | JSON gateway `intapgateway.infosysapps.com/…/getCareerSearchJobs` | India sources 1, 21, 41 |
| `wipro` | Wipro | ✅ | `sitemap.xml` + job pages (SuccessFactors RMK) | ISO-3 country token in the job URL |
| `hcltech` | HCLTech | ✅ | `sitemap.xml` + job pages on careers.hcltech.com (SuccessFactors RMK) | job-page location |
| `tech-mahindra` | Tech Mahindra | ⛔ | – | – |
| `cognizant` | Cognizant | ⛔ | – | – |
| `capgemini` | Capgemini | ✅ | JSON `GET cg-jobstream-api.azurewebsites.net/api/job-search` | `country_code=in-en` |
| `accenture` | Accenture | ✅ | JSON multipart `POST accenture.com/api/accenture/elastic/findjobs` | `jobCountry=India`, experience band `0-2` by default (`ACCENTURE_EXPERIENCE`) |
| `deloitte` | Deloitte (USI = Deloitte's India offices) | ✅ | Avature search pages + JSON-LD job pages on usijobs.deloitte.com | India-only portal |
| `ltimindtree` | LTIMindtree (rebranded "LTM") | ✅ | RippleHire candidate JSON (India) + SuccessFactors RSS | India via RippleHire; India/remote from the RSS |
| `ey` | EY incl. GDS (extra) | ✅ | SuccessFactors RMK search pages + job-page microdata | `locationsearch=India` + country code `IN` |
| `ntt-data` | NTT DATA (extra) | ✅ | HTML with embedded Phenom JSON (`phApp.ddo`) — search + job pages | `qcountry=India` facet |
| `tata-elxsi` | Tata Elxsi (extra) | ✅ | HTML (company CMS job list + job pages) | India locations (abroad-only jobs dropped) |
| `axis-bank` | Axis Bank (extra) | ✅ | RippleHire career-site JSON (`/candidate/candidatejobsearch` + `candidatejobdetail`) | India-only portal |
| `hdfc-bank` | HDFC Bank (extra) | ✅ | RippleHire career-site JSON (shared `_ripplehire.ts`) | India-only portal |

### Disabled and opt-in, and why

| id | Reason (verified 2026-11-26) |
|---|---|
| `meta` | metacareers.com robots.txt: *"Collection of data on Facebook through automated means is prohibited unless you have express written permission"*; job search is GraphQL needing per-session `lsd`/`fb_dtsg` tokens. Nothing is ever fetched. |
| `uber` | jobs.uber.com (API, listings, job pages) answers bots with a Cloudflare managed challenge (403, `cf-mitigated: challenge`); the old www.uber.com careers API is gone and `*/api/` is robots-disallowed; no public ATS board. |
| `flipkart` | Jobs are only on TurboHire (flipkart.turbohire.co): robots.txt allows Googlebot only, and the job API needs a per-session token from `/api/token/noauth`. |
| `tcs` | iBegin's search API needs an F5 BIG-IP ASM bot-defence cookie plus a per-session `next-xsrf-token` (403 without them); the old ibegin.tcs.com / nextstep.tcs.com hosts are NXDOMAIN and www.tcs.com/careers 403s the bot UA. |
| `tech-mahindra` | careers.techmahindra.com is ASP.NET WebForms: paging past 12 jobs needs replayed `__VIEWSTATE`/`__EVENTVALIDATION` postbacks, jobs have no public per-job URL (apply needs login), and there's no JSON, feed, sitemap or public ATS board. |
| `cognizant` | careers.cognizant.com serves a Cloudflare bot challenge to the honest bot UA on search and job pages; the sitemap has no job data; applications run on a CAPTCHA-protected portal, not a public ATS board. |
| `infosys` 🟡 | career.infosys.com answers the bot UA with an Akamai 403 (even robots.txt). The JSON gateway the site calls is open (no token/login/robots), so the scraper works, but it ships **off by default** (LinkedIn/Naukri precedent). Set `ENABLE_INFOSYS=1` to enable. |

## Registry notes

**Use `ats: "custom"` for every P09 company** (slug = scraper id, token = careers URL) so the worker attaches registry
tags by `target` without an ATS adapter double-scraping them. Notably: `microsoft` (Eightfold PCSX: P08's v2 adapter
gets 403 "Not authorized for PCSX"), `accenture` (its Workday board caps at offset 2,000 ≈ 6% of India's jobs, and
indexing both would create unmergeable duplicates), `wipro`/`hcltech`/`ey` (SuccessFactors), `deloitte` (Avature),
`ltimindtree` (RippleHire), `atlassian` (iCIMS), `ibm` (Avature), `zoho` (Zoho Recruit, no P07/P08 adapter).

**For the registry: targets (and extras found on the way) that are plain ATS boards.** No scraper is built here; each
board endpoint was verified to return jobs on 2026-11-26.

| slug | name | ats | token | verified |
|---|---|---|---|---|
| `freshworks` | Freshworks | `smartrecruiters` | `Freshworks` | 120 postings (30 India) |
| `goldman-sachs` | Goldman Sachs | `oracle` | `https://hdpc.fa.us2.oraclecloud.com/hcmUI/CandidateExperience/en/sites/LateralHiring` | 953 (131 India); higher.gs.com's GraphQL has no posting dates. P08 should drop internal "Contingent Worker …" placeholders |
| `citi` | Citi | `workday` | `https://citi.wd5.myworkdayjobs.com/2` (`extra.workdayCountry: c4f78be1a8f14da0ab49ce1162348a5e`) | 954 India |
| `swiggy` | Swiggy | `smartrecruiters` | `SWIGGY` | 153 |
| `phonepe` | PhonePe | `smartrecruiters` | `PHONEPELIMITED` | 162 |
| `deutsche-bank` | Deutsche Bank | `workday` | `https://db.wd3.myworkdayjobs.com/DBWebsite` | 299 India |
| `barclays` | Barclays | `workday` | `https://barclays.wd3.myworkdayjobs.com/External_Career_Site_Barclays` | ~200 India (Pune 179, Chennai 24) |
| `hsbc` | HSBC | `eightfold` | `https://portal.careers.hsbc.com\|hsbc.com` | 189 India |
| `nagarro` | Nagarro | `smartrecruiters` | `Nagarro1` | 618 (199 India) |
| `paytm` | Paytm | `lever` | `paytm` | 192 |
| `meesho` | Meesho | `lever` | `meesho` | 48 |
| `cred` | CRED | `lever` | `cred` | 11 |
| `groww` | Groww | `greenhouse` | `groww` | 8 |

The Workday India facet id `c4f78be1a8f14da0ab49ce1162348a5e` (`locationCountry` / `Country_and_Jurisdiction`) is the
same on the Citi, Accenture and Deutsche Bank tenants. Candidates rejected while looking for extras (bot-blocked,
login/session, robots-disallowed, unreachable, or too few jobs) are listed in `docs/sites/extras-survey.md`, along
with SAP (403 to the bot UA), Mphasis (Radware bot challenge) and Persistent (unreachable).


## How a run works

All company scrapers are built with `defineCareerSite()` (`src/lib/site.ts`), so they share one set of semantics:

- **list → detail → map → validate.** `list()` yields the site's own records, using the site's India filter where one
  exists. `keep()` drops non-India jobs before any extra request; it keeps remote roles open to India (see
  `isOpenToIndia`). `detail()` runs only for ids that `ctx.isKnown()` doesn't know. Every RawJob passes
  `validateRawJob` before it is emitted; invalid ones are counted and logged.
- **Detail cap.** At most `BIGTECH_MAX_DETAILS` (default 200; some sites set less) detail fetches per run. Unknown
  jobs beyond the cap are **deferred**, not emitted half-empty, so they get a description on the next run. Known jobs
  are emitted as light records (no description) so the worker's sweep still sees them as open. The merge never
  overwrites stored values with null.
- **`ctx.since` never shrinks the emitted set.** The worker sweeps every job a complete run didn't emit, so dropping
  "old" jobs would close live postings. See `docs/contract-requests/P09.md`.
- **Errors.** A list/page failure fails the run (no sweep). Per-job detail or mapping failures are counted and the run
  continues. `ctx.limit` and `ctx.signal` are honoured everywhere.
- **Stats.** Every scraper exposes `lastRun` (`listed`, `emitted`, `skipped`, `invalid`, `details`, `deferred`,
  `siteTotal`, `ms`), which `scripts/report.ts` uses.

### Politeness and access rules

- All traffic goes through the contract `createHttpClient` (honest `SCRAPER_USER_AGENT`, robots.txt checked on every
  request, retries with back-off on 429/5xx). **No scraper passes `robots: false`** or sets its own user agent. Our
  `politeHttp` wrapper adds a per-host gap of **≥ 1 s (≤ 1 request/second)**. Sites can raise that floor (Microsoft:
  10 s) and the env var can only raise it further. Page sizes are ≤ 50.
- Only public endpoints the career page itself uses. No login, no cookies or session tokens, no CAPTCHA or bot-challenge
  solving, no proxies. Sites that need any of that are **disabled** with the reason in code (`disabledReason`) and
  below. A site that blocks bots on its website but leaves its data API open is **opt-in** (`ENABLE_<SITE>=1`),
  following the project's LinkedIn/Naukri precedent.
- Only job-posting data is collected; no personal data.

### RawJob conventions

| Field | Rule |
|---|---|
| `source`, `target`, `companySlug` | the company slug (= scraper id), so the worker can look up registry tags by target |
| `sourceKind` | `career_site` |
| `sourceJobId` | the site's stable job id |
| `sourceUrl` = `applyUrl` | the official public job page (login-gated apply flows go to `extra`) |
| `locations` | readable strings, e.g. `"Bengaluru, Karnataka, India"`, `"Remote (Virtual) - Bengaluru, Karnataka, India"` |
| `descriptionHtml` | the site's HTML (or text converted to HTML). Titled sections are joined with `<h3>` headings. `descriptionText` is derived from it |
| `postedAt` / `validThrough` | ISO-8601 UTC from the site's own dates (absolute, relative, RFC 2822/IST, Java `Date` strings, naive IST) |
| hints | `jobType` (title beats a generic "full-time" schedule), `experienceLevel` (only from the site's own categories, left unset when vague), `workMode`, `experienceMin/Max/Raw`, `skills`, `degrees`, `department`, `employmentTypeRaw` when the site gives them structurally |
| `extra` | useful site-specific fields: legal entity, requisition id, team, raw categories, … |

## Environment variables

All optional (see `.env.example`).

| Var | Default | Meaning |
|---|---|---|
| `SCRAPER_USER_AGENT` | `EasyJobsBot/1.0 (+https://easyjobs.example/bot)` | shared bot identity (contract) |
| `BIGTECH_DISABLE` | – | comma-separated scraper ids to switch off |
| `BIGTECH_MAX_DETAILS` | 200 | detail fetches per run (sites may set a lower cap) |
| `BIGTECH_MIN_GAP_MS` | 1000 | per-host gap; can only raise a site's floor; `0` = no throttling (offline tests) |
| `BIGTECH_MAX_PAGES` | per site | list-page safety cap |
| `BIGTECH_PAGE_SIZE` | per site | tests only (forces small pages) |
| `BIGTECH_DEV_CACHE`, `BIGTECH_DEV_CACHE_TTL_MIN` | 0, 360 | dev-only on-disk response cache in `.cache/http/` |
| `ENABLE_INFOSYS` | 0 | opt-in for Infosys (see below) |
| `ACCENTURE_EXPERIENCE` | `0-2` | Accenture experience bands to crawl (`0-2,2-5`, … or `all`) |
| `MICROSOFT_429_BACKOFF_MS` | 30000 | Microsoft's back-off step after HTTP 429 |

## Layout

```
src/index.ts          scrapers[] (ScraperModule) + careerSites (typed)
src/cli.ts            standard contract CLI (runScraperCli)
src/lib/              shared helpers: site factory, polite HTTP + dev cache, pagination, HTML→text, dates,
                      hint mappers, India/remote location filter, RSS/sitemap readers, RawJob builder
src/sites/<id>.ts     one module per company (endpoint notes at the top of each file)
docs/sites/<id>.md    per-company findings: endpoints, robots verdict, mapping, numbers, registry entries
test/                 offline vitest suites + fixtures; live.test.ts runs only with LIVE=1
scripts/capture.ts    dev: open a careers page in local Chrome and log the XHR/JSON it calls
scripts/try.ts        dev: run one site module through the CLI without registering it
scripts/report.ts     live coverage/fill-rate table for docs/status/P09.md
```

## Adding a company

1. Discover: `npx tsx scripts/capture.ts <careers search URL>` (local Chrome, dev only) and find the JSON the page
   itself calls. Check robots.txt and verify the endpoint with `curl -A "EasyJobsBot/1.0 (+https://easyjobs.example/bot)"`.
   If the jobs live on a plain ATS board, write a registry note instead of a scraper.
2. Create `src/sites/<slug>.ts` with `defineCareerSite({ company, name, intervalMinutes, endpointType, list, idOf,
   keep?, detail?, toRawJob })` and map fields with `buildRawJob`.
3. Save small fixtures under `test/fixtures/<slug>/`, write `test/<slug>.test.ts` with `fakeHttp` + `collect`, run
   `npx tsx scripts/try.ts src/sites/<slug>.ts --limit 50`, add the scraper to `src/index.ts`, and document it in
   `docs/sites/<slug>.md`.
