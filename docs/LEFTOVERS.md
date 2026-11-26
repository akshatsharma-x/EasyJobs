# Leftovers

Status on 2026-11-26, when the session was closed:

| Phase | Status |
|---|---|
| **W1 · Integrate everything** | Done and pushed. |
| **W2 · End-to-end verification and data quality** | **Partly done** (this commit). Results are in [qa-report.md](qa-report.md). The open items are listed below. |
| **W3 · Visual polish and wow pass** | Not started. |
| **W4 · Production deploy prep** | Not started. **Deploy nothing and create no accounts without asking the owner first.** |

Work the phases in order: W2 → W3 → W4. Commit and push to `akshatsharma-x/EasyJobs` after each one.

## Before you start (this machine)

- **Ports.** Ports 3000 and 4000 are taken by other apps. Never kill them. The gitignored `.env` already sets:
  - `WEB_PORT=3010` and `API_PORT=4010`, plus the matching URLs;
  - `WORKER_DISABLED_SOURCES=workday,themuse,remotive`. Workday and The Muse send a Cloudflare challenge to this IP, and Remotive's daily quota runs out.
- **Run.** Start the stack with `pnpm dev`.
- **Single-process database.** PGlite allows only one process. Stop `pnpm dev` before running any of:
  - `pnpm reclassify`
  - `pnpm data-quality`
  - `pnpm sample-jobs`
  - `pnpm reset`
- **Leftover processes.** After stopping, check that nothing is still running:

  ```bash
  lsof -nP -iTCP:4010 -iTCP:4100 -sTCP:LISTEN
  ```

  An orphaned `tsx watch` worker from W1 kept running for 2 hours. It spooled batches made with an old normalizer and then replayed them (see qa-report §1).

## W2: what's left, in order

1. **Refresh IBM.** The "Professional → mid" scraper fix only reaches stored jobs on the next IBM run. IBM is still 87% `entry`.
   - With the API running: `pnpm worker once --source ibm`.
   - Then stop dev and run `pnpm data-quality`.
2. **Full 30-minute pipeline run.** The run in this session was stopped after 14 minutes.
   - Run `pnpm dev`, wait at least 30 minutes, then save `curl localhost:4100/status`.
   - Record runs, ok/error counts, jobs emitted, spooled, dead-lettered and paused in qa-report §1.
   - Stop dev, then run `pnpm data-quality`.
3. **Load test on an idle machine.** Command:

   ```bash
   pnpm --filter @easyjobs/api bench -- --db postgres --url postgres://localhost:5432/easyjobs_bench --jobs 97000
   ```

   - The target is `/v1/jobs` p95 ≤ 150 ms with the cache off at 10 connections.
   - It measured **171.5 ms** while the crawler loaded the machine. P02's idle baseline was 136 ms.
   - If it still misses, run `EXPLAIN ANALYZE` on the search query. Check whether migration `0006_india_rank` (`ej_rank_base()` and the `jobs_search_refresh()` trigger) slowed ranking.
4. **Web E2E against the real API.** The specs are written but haven't been run yet. Fix any selector mismatches.
   - With the API running and holding data:

     ```bash
     E2E_API_URL=http://localhost:4010 pnpm --filter @easyjobs/web e2e:real
     ```

     This builds with `NEXT_PUBLIC_USE_MOCKS=0` and serves on :3011.
   - It runs `e2e-real/real-api.spec.ts` plus every data-agnostic spec in `e2e/`:
     - every filter group checked against `/v1/jobs`;
     - tabs, shared URLs and back navigation, and smart chips;
     - JSON-LD validation, and the apply link opening the official URL;
     - save → tracker;
     - the live pill, via a real ingest that the test closes again afterwards;
     - axe in light and dark mode.
   - Don't run it while the worker is ingesting. The totals would move between the UI and the API checks.
5. **Lighthouse mobile ≥ 95** on `/`, `/jobs` and a job page.
   - Use a production build against the real API, served over HTTP/2 through `apps/web/scripts/h2-proxy.mjs`.
   - The method and P01's numbers are in `docs/status/P01.md`. Use Lighthouse 12.8 via npx, medians of 5 runs.
6. **API-kill drill on the real stack.** `pnpm resilience-drill` covers 500s, backoff, the breaker and a broken package with an isolated worker. The real-API version is still to do:
   1. Run the worker.
   2. Kill the API.
   3. Trigger a source: `curl -X POST localhost:4100/run/unstop`.
   4. Check that `/status` shows `delivery.spooled > 0`.
   5. Restart the API.
   6. Check that `replayed` grows, `spool.pending` returns to 0 and `deadLettered` stays 0.
7. **Registry hygiene.** These boards failed on every run. Each returned a 404, found no job URLs, or opened the breaker:
   - **avature:** bloomberg, delta-air-lines, epic-systems, mckinsey-and-company, sandisk, siemens, siemens-healthineers, totalenergies, two-sigma;
   - **successfactors:** basf, tata-electronics;
   - **jsonld:** 3i-infotech, qodo, xpressbees;
   - **icims:** seismic.

   Fix their tokens or URLs in `packages/registry`, or drop them.
8. **Finish `docs/qa-report.md`.** Fill in the sections marked *TODO* and keep `pnpm check` green. Typecheck, lint and the affected suites were run before this commit; see qa-report §6 for what wasn't.
9. **Commit and push** (W2 done).

Known source-data limits stay as they are; they're documented in qa-report §2:
- HDFC Bank's own API says "0 - 1 Years" on some Branch Manager postings.
- Aggregators sometimes claim "0 years".
- Many IBM and consulting descriptions state no years at all.

## W3: visual polish and wow pass (not started)

Change only `apps/web`, unless a data fix is required.

1. **Before screenshots.** Shoot every page at 1440×900 and 390×844, in light and dark, including empty, loading and error states. Save them to `apps/web/screenshots/before/`. There is a screenshot config: `pnpm --filter @easyjobs/web screenshots`.
2. **Design review.** Write the top 25 issues to `docs/design-review.md`, then fix them all.
3. **Signature moments:**
   - a live counter ticker in the hero, and the "just posted" feed animation;
   - layout-animated filter transitions, with number tickers on facet counts;
   - a delightful save interaction, and keyboard hints;
   - a crisp OG image template, a favicon, app icons and a PWA manifest.
4. **Real-data edge cases:**
   - very long titles and company names;
   - 10 or more locations;
   - missing logos;
   - no salary, and non-INR currencies;
   - HTML-heavy descriptions;
   - closed jobs: a banner plus similar jobs;
   - suspicious jobs: a warning callout.
5. **Performance:** zero CLS, LCP under 2 s on throttled mobile, a JS budget per route, logo caching and route prefetching.
6. **After screenshots.** Re-shoot into `apps/web/screenshots/after/`, compare side by side, and iterate.
7. **Commit and push.**

## W4: production deploy prep (not started)

> **Deploy nothing and create no accounts without asking the owner first.**

1. **Images and compose:**
   - Dockerfiles for the API and the worker: multi-stage, small, non-root.
   - The Next.js web app for Vercel, or as a standalone Docker image.
   - `docker-compose.prod.yml` with postgres, api, worker, web and Caddy (HTTPS).
2. **Database.** Production Postgres via `DATABASE_URL`, with migrations on deploy and daily backups.
3. **Operations.** Health checks, restart policies, structured logs, an optional Sentry hook and uptime checks.
4. **Scraper etiquette:**
   - a real contact URL in `SCRAPER_USER_AGENT`;
   - documented rate limits;
   - a kill switch per source (`WORKER_DISABLED_SOURCES` already exists).
5. **Legal pages.** Privacy, terms and takedown.
6. **`docs/DEPLOY.md`**, covering two setups:
   - a single VPS with docker compose;
   - Vercel + Railway or Fly.io + Neon.
7. **Commit and push.**

## Housekeeping

These are safe to delete when no longer needed:
- `/tmp/ej-fresh`, the copy used for the W1 fresh-clone test;
- `/tmp/ej-w2`, the logs from this session;
- `.data/pglite-bench` (1.8 GB) and the Postgres database `easyjobs_bench`. These are load-test datasets; keep them while load tests are still pending.
