# QA report: W2 end-to-end verification and data quality

**Status: in progress.** The session was closed on 2026-11-26 before every W2 step was finished. The open items, with exact commands, are in [LEFTOVERS.md](LEFTOVERS.md). Sections still to complete are marked *TODO*.

## 1. Pipeline run

**Run length.** A fresh worker, using the current code and the real normalizer and registry, ran from **09:38 to 09:52 UTC: 14 minutes.** The target is at least 30 minutes, so this is *TODO*.

| Metric | Value |
|---|---|
| Scheduled tasks | 1,145 |
| Tasks that ran | 43 (41 ok, 2 errors) |
| Jobs emitted | 8,601 |
| Ingest batches delivered | 135 |
| Spooled / dead-lettered | 0 / 0 |
| Paused by the breaker | 2: `avature:siemens` and `icims:seismic` (no job URLs found) |

**Index afterwards:** **73,713 open jobs** from 47 sources ([data-quality.md](data-quality.md)).

**An unplanned outage drill happened first.** An orphaned `tsx watch` worker from the W1 smoke run (started 07:33 UTC) kept running while the API was down for reclassification work.
- It **spooled** its batches: 505 segments, 238 MB.
- When the API came back it **replayed** them: 829 on recovery, with 0 dropped and 0 dead-lettered.
- So nothing was lost, but those batches had been normalized by older classifier versions. `pnpm reclassify` was run again afterwards and fixed 893 levels.

**Registry boards that fail on every run** (404, or no job URLs): avature (bloomberg, delta-air-lines, epic-systems, mckinsey-and-company, sandisk, siemens, siemens-healthineers, totalenergies, two-sigma), successfactors (basf, tata-electronics), jsonld (3i-infotech, qodo, xpressbees) and icims (seismic). These are *TODO* in LEFTOVERS.

## 2. Data quality and classification

**Tools** (all at the repo root):
- `pnpm data-quality` writes [data-quality.md](data-quality.md):
  - per source: official apply URL, salary, location, levels, categories, merges, suspicious and stale counts;
  - overall: distributions, top companies, and freshness.
- `pnpm sample-jobs <level> 50 <seed>` gives a random sample for manual review.
- `pnpm reclassify` re-applies the current rules to stored jobs: level, job type, description years and non-job tags.

### Manual review

There were 5 rounds. Each round judged 50 random open jobs for each of the 7 levels; rounds 2 to 5 used seeds 0.77, 0.31, 0.53 and 0.97. Fixes and `pnpm reclassify` were applied between rounds.

| Round | intern | fresher | entry | mid | senior | lead | executive | Overall |
|---|---|---|---|---|---|---|---|---|
| 1 (first look) | 6 % (job type) | — | ≈ 12 % | — | 4 % | — | 6 % | — |
| 3 (seed 0.31) | 0 | 2 | 4 | 1 | 1 | 6 | 4 | ≈ 5 % |
| 5 (seed 0.97, final) | 0 | 1 | 0 | 0–2 | 0–1 | 0–1 | 1 | **≈ 1.4 %** (borderline counted as half) |

The final round meets the target of under 3 %. Every error it found has since been fixed. They were:
- months in a sales-cycle phrase read as experience;
- "0–3 years" classed by its top;
- "CIO audiences" read as an executive title;
- "GRC Manager";
- "Manager of …Architects".

### Root-cause fixes

Each fix has regression tests. Normalize grew from 909 to **1,003 tests**.

**Level classifier: titles and grades**
- **Bank grades.** "Vice President" is treated as a corporate grade, giving lead, in two cases: the title pairs it with an individual role ("Vice President, Full-Stack Engineer"), or the company is in a bank list (BNY, JPMorgan, HSBC, iCapital and others).
  - "Assistant/Associate Vice President" no longer matches executive.
  - RVP, GVP, CVP, DVP, and director words in other languages are executive.
- **Grades and IC titles:**
  - "Staff" plus any engineering, design or science role is lead.
  - The "Principle" misspelling, SAP's "Chief … Expert" and Teamleiter(in) are lead.
  - Oracle grades IC1–IC6 and "Level II" grades are read as grades.
- **Managers:**
  - Engineering managers are a strong lead.
  - "Senior *function* Manager" is senior; a bare "Senior Manager, X" is lead.
  - "Manager" inside a product name ("AMS Device Manager Product Engineer") is ignored.
  - GRC, programs and partner-development managers count as functional managers.
- **Not executives:**
  - Architects are weak unless qualified, so stated years decide.
  - Art Director is senior.
  - "Executive Assistant to VP", "Office of the CEO" and "CIO audiences" are not executive.
- **Executives.** Region, area, city and country heads, and Country Manager/Leader, are executive.
- **Sales ladder.** Enterprise and strategic AEs are senior (weak), and mid-market AEs are mid.

**Level classifier: hints, fresher signals and years**
- **Hints:**
  - An "executive" hint only counts when the title agrees. SmartRecruiters had 36 of 56 wrong and Workable 10 of 10.
  - Broad "Mid-Senior" hints, which arrive as `mid`, give way to stated years that point higher.
- **Fresher signals:**
  - Recruiter roles ("Talent Acquisition Specialist, Early Careers") aren't fresher jobs.
  - Negated phrases ("not looking for new grads") don't count.
  - Employer boilerplate ("Whether you're … or a recent graduate") is ignored.
- **Years:**
  - Exactly 1 year is entry.
  - A range at least 3 years wide is classed by its middle ("2–10" is senior, "0–3" is entry).
  - Underscores in titles no longer hide word boundaries.

**Experience parser**
- "200,000 years of audio" no longer reads as 0 years.
- "software development experience is not required" no longer means "no experience needed".
- A newline or bullet now always ends a clause.

**Job type and non-jobs**
- An "Intern" title beats a generic full-time, contract or temporary hint.
- General applications are detected in Italian, French, German, Spanish, Portuguese, Dutch, Swedish and Danish.

**Scrapers**
- IBM's "Professional" band (experienced hires) becomes `mid` unless the title states a level. 3,198 of 3,698 IBM jobs had defaulted to `entry`. Stored IBM jobs pick this up on the next IBM run (*TODO*).
- Capgemini's "Executives" grade is no longer an executive hint.

**Source-data limits.** These are not classifier bugs and stay as published:
- HDFC Bank's own detail API states "0 - 1 Years" for some Branch Manager and Product Manager postings.
- Aggregators sometimes claim "0 years".
- Many IBM, consulting and AI-lab descriptions state no years at all, so they default to `entry` with low confidence.

## 3. API

**Contract tests.** The new `apps/api/test/contract.test.ts` has 21 tests; the API suite now has **43, all passing**. They check that:
- the set of routes the app serves equals the OpenAPI document;
- every GET and ingest response parses with its strict zod schema (the same schemas OpenAPI publishes);
- 404, 400 and 401 bodies are `ApiError`s, and SSE frames parse as `StreamEvent`;
- **facet counts equal the filtered totals** for all 11 facet groups across 8 base queries (OR within a group, AND across groups), and stats agree with the facets;
- **pagination** is disjoint, complete and repeatable for 5 sort and filter combinations, and the same regardless of page size;
- **SSE latency:** a newly ingested job reaches an open stream in under 1 s (5 probes).

**Load test.** Postgres on localhost with 97,908 jobs, autocannon, exact p95 (`apps/api/bench`). **Caveat:** this ran while the crawler was loading the machine (load average about 10 on 18 cores).

| Scenario | p95 | Target | P02 baseline (idle) |
|---|---|---|---|
| `/v1/jobs`, cache off, 1 connection | 102 ms | 150 ms | 56.7 ms |
| `/v1/jobs`, cache off, 4 connections | 127 ms | 150 ms | 71.8 ms |
| `/v1/jobs`, cache off, 10 connections | **171.5 ms** ✗ | 150 ms | 136 ms |
| `/v1/suggest`, 10 connections | 1.7 ms ✓ | 50 ms | 1.7 ms |
| `/v1/jobs`, cache on, 10 connections | 9.7 ms | — | 9.1 ms |

*TODO:* re-run on an idle machine. If `/v1/jobs` still misses, profile migration `0006_india_rank`.

## 4. Web E2E against the real API: *TODO* (written, not yet run)

**The suite.** `pnpm --filter @easyjobs/web e2e:real` (`apps/web/playwright.real.config.ts`, `e2e-real/real-api.spec.ts`) builds the site with `NEXT_PUBLIC_USE_MOCKS=0`. On top of every data-agnostic spec in `e2e/`, it covers:
- **Search:**
  - every filter group, with the UI total checked against `GET /v1/jobs` for the same URL;
  - level tabs, shared URLs and back navigation;
  - smart chips.
- **Job page:**
  - JSON-LD validated as a `JobPosting`;
  - the apply link opening the official URL (external hosts are stubbed);
  - save → tracker.
- **Live pill:** the pill appears after a real ingest, and the probe job is closed afterwards by a sweep.
- **Accessibility:** axe finds no serious or critical violations on `/`, `/jobs`, a job page, `/companies` and `/saved`, in light and dark mode.

**Lighthouse** mobile ≥ 95 on `/`, `/jobs` and a job page is not re-run yet.

## 5. Resilience

**Isolated drill: `pnpm resilience-drill`, 8 of 8 checks pass.** The drill runs a real worker process against a stub API, with production thresholds and shortened timings.

| Check | Result |
|---|---|
| A source answering HTTP 500 is retried by the HTTP client | 4 requests per run |
| Task backoff doubles between failures | waits of 1.2 → 2.4 → 4.8 → 9.6 s |
| The breaker opens after 5 consecutive failures | yes; 0 upstream requests during the pause |
| Half-open probe after the pause | it fails again and the breaker re-opens |
| A package that throws at import | reported as `broken`, and the worker stays up |
| A healthy source alongside the failing one | keeps delivering |

**API outage with spool and replay.** This happened for real during this session (§1): a lot was spooled and all of it replayed, with nothing dead-lettered. A scripted kill-and-replay on the real stack is *TODO*.

## 6. Checks run for this commit

| Check | Result |
|---|---|
| `pnpm typecheck` | clean |
| `pnpm lint` | 14 packages clean |
| `@easyjobs/normalize` tests | 1,003 pass |
| `@easyjobs/scraper-bigtech` tests | 140 pass; 18 live-network tests skipped by default, as before |
| `@easyjobs/api` tests | 43 pass |

The other suites (db, worker, web, the other scrapers) had no code changes since their last green run earlier in W2. A full `pnpm check` at the end of W2 is *TODO*.
