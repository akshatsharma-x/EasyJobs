# @easyjobs/worker

The always-on process that keeps EasyJobs real-time. It discovers every scraper package, runs each one on a schedule, normalizes and dedupes the results, and ships batches to the API's ingest routes (prompts.md §0.5). If the API is down, it spools requests to disk and replays them in order later.

```
packages/scrapers/*/src/index.ts ──discover──► tasks ──schedule──► scrape(ctx) ─RawJob─► validateRawJob
packages/normalize (or fallback) ─────────────────────────────────► normalizeJob ─JobInput─► validateJobInput ─► dedupe
packages/registry  (or fixtures)  ──targets / company lookup──┘                                                │
                                                       POST /v1/ingest/jobs (gzip, 200/batch) ◄─────────────────┘
                                                       POST /v1/ingest/sweep (complete full runs only)
                                                       POST /v1/ingest/runs  (RunReport)
                                         API down? ──► .spool/*.jsonl ──► replayed in order when it is back
```

The worker imports nothing from sibling packages. Everything plugs in at runtime by discovery, and broken packages are skipped with a warning.

## Quick start

```bash
pnpm --filter @easyjobs/worker once --source demo --dry-run   # → apps/worker/out/demo.jsonl (no API needed)
pnpm --filter @easyjobs/worker fake-api                       # in-memory fake of the ingest API on :4000
pnpm --filter @easyjobs/worker start                          # scheduler + status server on :4100
curl localhost:4100/status
```

## CLI

| Command | What it does |
|---|---|
| `start` | Runs the scheduler plus the HTTP status server. SIGHUP triggers a re-scan (it also reloads `.env`). SIGINT/SIGTERM stops gracefully. |
| `once --source <id>[,<id>] [--target <slug>] [--limit n] [--dry-run]` | Runs one task, or several, through the full pipeline. Extra flags: `--all`, `--since <iso>`, `--max-targets n`, `--priority 1\|2\|3`, `--force` (ignore `isEnabled`). `once` never touches the schedule state. |
| `list [--json]` | Shows discovered scrapers, the chosen normalizer/registry, broken packages, and every task with its last and next run. Run it as `pnpm --filter @easyjobs/worker run list`, because `pnpm list` is a pnpm built-in. |
| `replay` | Delivers spooled requests now. |
| `fake-api [--port 4000]` | Starts the fake ingest API used by the tests. Debug counts at `GET /_fake/stats`. |
| `bench [--jobs 20000]` | Offline throughput numbers. |

`--dry-run` writes normalized `JobInput`s to `apps/worker/out/<source>.jsonl`, plus `<source>.report.json` with the RunReport and the sweeps that would have been sent.

## HTTP (WORKER_PORT, default 4100)

- `GET /health` → `{ ok, version, uptimeS, tasks, running, paused, disabled, api: { reachable, lastError… }, spool: { pending… }, normalizer, registry }`
- `GET /status[?source=&task=&status=ok|partial|error|paused|running|failing]`: per task: last run, duration, emitted, invalid, errors, next run, paused (with reason), consecutive failures. Also includes discovery details (packages, problems, warnings) and delivery stats.
- `POST /run/:source[?target=slug]` with `x-ingest-key: $INGEST_API_KEY` → 202 `{ queued, running, disabled }`. A manual run is always a full run and ignores a paused circuit. Returns 401 without the key, 404 for an unknown source, 409 when the source is disabled.

## Discovery

- **Scrapers.** Each `packages/scrapers/*/src/index.ts` is dynamic-imported, with a 30 s timeout. The module must export `scrapers` or a default `Scraper[]`; a single exported Scraper is also accepted. Every scraper's shape is validated: kebab-case `id`, `name`, `kind`, `intervalMinutes`, `scrape()`, plus optional `isEnabled` and `handlesAts`.
  - Packages that fail to import or export garbage are reported in `list`, `/status` and the logs, never thrown.
  - Duplicate ids: the first package (alphabetical) wins.
  - A package without `src/index.ts` is shown as "not ready".
- **Demo.** The internal `demo` scraper (synthetic jobs on the reserved `.example` TLD, one new job every 10 min) can always run via `once --source demo`. It is scheduled only when no real scraper exists (`WORKER_DEMO=auto`).
- **Normalizer.** `packages/normalize` `normalizeJob` is used when it loads **and** passes a smoke test, i.e. it turns a sample RawJob into a valid JobInput. Otherwise the worker uses `src/fallback-normalize.ts`: minimal but always valid, with the §0.4 fingerprint, naive level/type/category, and no invented salaries. Its output carries `extra.normalizedBy = "worker-fallback"`.
- **Registry.** `packages/registry` `companies` + `findCompany` are used when the package exports at least one valid company. Otherwise the worker uses `fixtures/companies.sample.json`: 10 real boards on greenhouse/lever/ashby/workday, verified live 2026-11-25.
- **Re-scan.** Discovery re-runs every `WORKER_RESCAN_MINUTES` and on SIGHUP. New, removed and changed packages are applied without a restart; unchanged packages are not re-imported. A changed entry module is re-evaluated, but modules it imports stay cached until restart.

## Scheduling

- **Tasks.** A scraper without `handlesAts` → one task, every `intervalMinutes` (minimum 5 min). An ATS scraper → one task per registry target of those ATSs; `custom` targets are never fed. Cadence comes from `target.priority`: 1 → 15 min, 2 → 60 min, 3 → 24 h. If two scrapers claim the same ATS, the first one owns its targets.
- **Spread.** Tasks with no history, or overdue after a restart, are spread evenly within their cadence group with jitter: task *i* of *n* starts at `now + (i + u·0.1)·window/n`.
  - ATS targets: window = min(interval, 60 min).
  - Feed scrapers: window = 5 min. They hit different hosts, so there is no herd to avoid.
  - Later runs: `start + interval × (1 ± 10 %)`.
- **Ordering.** Manual triggers first, then due time aged by priority (p2 +5 min, p3 +10 min). This is a strong preference without starvation.
- **Limits.**
  - Concurrency: `WORKER_CONCURRENCY` globally (default 6) and `WORKER_PER_SCRAPER_CONCURRENCY` per scraper (1–2). A task never overlaps itself.
  - Per-task timeout: an AbortSignal carries a `TaskTimeout` reason. A scraper that ignores its signal is detached.
  - One shared `createHttpClient` for every scraper, so per-host politeness applies across all of them.
- **Failures.** A run fails when it errors or times out with no valid job, or when every job was invalid. Backoff is `2 min × 2^(n−1)`, so 2, 4, 8, 16 min.
  - **Circuit breaker:** on the 5th consecutive failure the task pauses for 6 h, and the RunReport, `/status` and the logs say so. After the pause one trial run happens; a failure re-opens the circuit and a success closes it.
  - Partial runs and API outages do not count as failures.
- **State.** `apps/worker/.state/state.json` (atomic write, debounced) stores per task:
  - next run, last run/success/full success, failures, pause
  - the `since` cursor and the sweep-guard counts

  Restarts resume from it instead of re-hammering sources. A lock file prevents two schedulers on one state dir.

## Pipeline (per task)

1. **Known ids.** `GET /v1/ingest/known` is fetched once per run and backs `ctx.isKnown`. If it is unavailable, every job counts as new.
2. **Scrape.**
   - `ctx.since` = start of the last successful run − 10 min (`WORKER_SINCE_OVERLAP_MINUTES`).
   - A **full** run (no `since`) happens at least every `WORKER_FULL_REFRESH_MINUTES` (60), on the first run, and on manual triggers.
   - ATS tasks get `ctx.targets = [target]`.
3. **Validate.** `validateRawJob`; invalid jobs are dropped and counted, with a histogram of reasons in the RunReport.
   - Sloppy output is fixed up and warned about first: a wrong `source`, missing nullable fields, a null target on an ATS task.
4. **Normalize.** `normalizeJob(raw, { sourceName, company, now })`. The company comes from the task target, then `registry.get(raw.target|companySlug)`, then `registry.find(raw.company|domain)` (cached per run).
5. **Validate and dedupe.** `validateJobInput`, then dedupe by fingerprint within the run.
6. **Send.** `POST /v1/ingest/jobs` in batches of 200, streamed as they fill (backpressure), gzipped and retried.
   - 413 → the batch is split.
   - 415, or a JSON-parse 400 on a gzip body → plain JSON from then on.
7. **Sweep.** `POST /v1/ingest/sweep` per target, sending every listed id, valid or not. It only happens after a **complete full** run: no error, no limit, no `since`, no batch rejected.
   - **Safety guard:** if a target suddenly shows 0 jobs, or under 20 % of a previous ≥ 20, the sweep waits for the next complete run to confirm it.
8. **Report.** `POST /v1/ingest/runs` with the RunReport. `emitted` = valid unique jobs.

**Spool.** Network errors, timeouts, 5xx/429 after retries, and 401/403/404 all go to `.spool/*.jsonl`.
- Segments are per process, with offset sidecars, so a crash re-sends at most one item.
- While anything is spooled, new requests queue behind it (strict FIFO). One replayer drains the head with backoff.
- Segments left by dead processes are adopted at the next start.
- Other 4xx answers are dropped and reported in the run.
- **Poison guard:** a head item that fails 5 times in a row with a network error or 5xx while `GET /health` is OK (e.g. a payload that always 500s) moves to `.spool/dead-letter.jsonl` so the queue never blocks. Dead-lettered items are kept, never replayed. 401/403/404/429 never dead-letter: they are config or rate problems, so the items wait for the fix.

## Scraper extensions (beyond contract v1.0.0)

Several scraper sessions asked for these (P09, P10, P11). The worker supports them at runtime; they are proposed for the contract in `docs/contract-requests/P05.md`. Scrapers call them with optional chaining, so they are no-ops under other runners.

| Hook | Effect |
|---|---|
| `Scraper.sweep = false` | never sweep this scraper (incremental feeds, search results) |
| `ctx.markIncomplete?.(reason)` | this run saw only part of the listing → no sweep; status unaffected |
| `ctx.report?.("partial" \| "blocked", { reason, retryAt? })` | graceful stop → RunReport `partial`, no sweep, and the task is **not run again before `retryAt`**. "blocked" without `retryAt` counts as a failure (backoff, breaker). |
| `ctx.report?.({ siteTotal: 2054, … })` | numeric run stats → `GET /status` (`tasks[].stats`) and JSON logs |

## Environment

See `.env.example`. Apps load the repo-root `.env` (the shell environment wins).

| Var | Default | |
|---|---|---|
| `API_URL` | `http://localhost:4000` | ingest API base |
| `INGEST_API_KEY` | `dev-ingest-key` | sent as `x-ingest-key`; also guards `POST /run/:source` |
| `WORKER_PORT`, `WORKER_HOST` | `4100`, `127.0.0.1` | status server (`0.0.0.0` in containers) |
| `WORKER_CONCURRENCY` | `6` | global running tasks |
| `WORKER_PER_SCRAPER_CONCURRENCY` | `2` | 1–2 |
| `WORKER_TASK_TIMEOUT_MINUTES` | `30` | per-task timeout |
| `WORKER_PRIORITY_MINUTES` | `15,60,1440` | cadence for priority 1,2,3 |
| `WORKER_MIN_INTERVAL_MINUTES` | `5` | floor for scraper.intervalMinutes |
| `WORKER_INITIAL_SPREAD_MINUTES` | `60` | spread of first and overdue runs (ATS) |
| `WORKER_JITTER` | `0.1` | ± fraction on intervals and backoff |
| `WORKER_FULL_REFRESH_MINUTES` | `60` | max time between full (sweepable) runs; `0` = always full |
| `WORKER_SINCE_OVERLAP_MINUTES` | `10` | `ctx.since` overlap |
| `WORKER_BACKOFF_BASE_MINUTES` | `2` | first backoff step |
| `WORKER_BREAKER_THRESHOLD`, `WORKER_BREAKER_PAUSE_HOURS` | `5`, `6` | circuit breaker |
| `WORKER_BATCH_SIZE` | `200` | jobs per ingest POST (≤ 500) |
| `WORKER_GZIP` | `1` | gzip request bodies ≥ 1 KB |
| `WORKER_API_TIMEOUT_MS`, `WORKER_API_RETRIES` | `30000`, `3` | ingest HTTP |
| `WORKER_RESCAN_MINUTES` | `10` | discovery re-scan |
| `WORKER_DEMO` | `auto` | `auto` = only when no scrapers exist · `1` always · `0` never |
| `WORKER_DEMO_JOBS` | `30` | demo feed size |
| `WORKER_MAX_JOBS_PER_RUN` | `20000` | safety cap (a capped run never sweeps) |
| `WORKER_SPOOL_MAX_MB` | `1024` | oldest segments dropped beyond this |
| `WORKER_IMPORT_TIMEOUT_MS` | `30000` | per package import |
| `WORKER_SHUTDOWN_GRACE_MS` | `15000` | wait for running tasks on shutdown |
| `WORKER_REPO_ROOT`, `WORKER_STATE_DIR`, `WORKER_SPOOL_DIR`, `WORKER_OUT_DIR` | auto | overrides (tests, containers) |
| `LOG_LEVEL`, `LOG_FORMAT` | `info`, pretty | `json` for structured logs |

## Tests

`pnpm --filter @easyjobs/worker test` runs 62 tests offline in about 4 s. Coverage:
- discovery with temporary fake packages: syntax error, import-time throw, wrong shape, partially invalid, hanging import, duplicate ids, re-scan pickup
- normalizer and registry fallback
- scheduler on fake timers: ordering, aging, spread and jitter, backoff, breaker, concurrency, timeout, shutdown, restart, incremental vs full
- the pipeline against an in-test fake ingest server: batching, gzip, sweep rules, safety guard, isKnown, spool and in-order replay, crash adoption, dead-letter, 413 split, 415 fallback, rejected batches, aborts, scraper extensions
- the fallback normalizer, including a 1,000-case fuzz test
- the real `Worker` end to end, and the CLI
