# @easyjobs/db

Drizzle schema + migrations, the Postgres/PGlite driver, ingest (validation, sanitising, merging), freshness
rules and search for EasyJobs. Only `apps/api` (and the seed CLI) use it.

```bash
pnpm --filter @easyjobs/db seed [-- --count 2000 --seed 42 --reset --via-api]   # synthetic data through the real upsert path
pnpm --filter @easyjobs/db migrate                                              # apply migrations (also automatic on API start)
pnpm --filter @easyjobs/db test                                                 # vitest on in-memory PGlite
TEST_DATABASE_URL=postgres://localhost:5432/postgres pnpm --filter @easyjobs/db test   # same suite on a real server
pnpm --filter @easyjobs/db db:generate                                          # new migration from src/schema.ts
```

## Driver

`createDatabase()` → **postgres.js** when `DATABASE_URL` is set, otherwise **PGlite** (`@electric-sql/pglite` + `pg_trgm`)
persisted at `<repo>/.data/pglite`. Same schema, migrations, SQL and tests for both. PGlite is single-process: a pid lock
file (`.data/pglite.lock`) turns a second opener into a clear error (the seed CLI then falls back to POSTing through the
running API). Every connection gets `TimeZone=UTC`, `jit=off`, `random_page_cost=1.1`, `max_parallel_workers_per_gather=0`
and the pg_trgm thresholds.

## Schema (`src/schema.ts`, `drizzle/`)

| table | notes |
|---|---|
| `jobs` | id = 11-char base36 hash of the fingerprint (stable across rebuilds), unique `fingerprint`, every JobInput field, derived `cities[]`/`countries[]`, `source_ids[]`, denormalised `sources` (JobSourceRef[]), `best_source_kind`, `is_official`, `status`, `closed_reason`, first/last seen, `field_prio` (merge provenance), `search` + `search_head` tsvectors, `rank_base` |
| `job_sources` | one row per (source, source_job_id) (UNIQUE), `removed_at` set by sweeps |
| `companies` | upserted from jobs; `open_jobs` maintained on every write; optional enrichment from @easyjobs/registry |
| `sources` | scraper id → display name/kind (facet labels, stats) |
| `scrape_runs` | RunReports, unique per (run_id, source, target) |
| `search_terms` | title/company/skill vocabulary for typo correction (trigram index) |

Migrations:
* `0000_extensions` (custom): pg_trgm
* `0001_schema` (generated)
* `0002_search` (custom): `ej_search_norm`, the `jobs_search_refresh` trigger, relevance/salary sort indexes, fillfactor
* `0003_storage` (custom): TOAST/storage tuning
* `0004_run_stats` (generated): `scrape_runs.complete` and `scrape_runs.stats`

* **Search vector** — title A · company A · skills B ('simple') · meta C (cities, states, remote/hybrid, type & level
  words, department, tags, batches, plus 'english' title stems) · description D ('english'). Maintained by a trigger that
  only recomputes when its inputs change. `search_head` (= everything but the description) is small and stays inline,
  so ranking never detoasts descriptions.
* **rank_base** = `posted_epoch / τ + ln(official boost) + ln(quality boost)` (τ = 14.4 days, half-life 10 days). Ordering by
  it equals ordering by `exp(-age/τ) × boosts` at every moment, so relevance without `q` is a plain index scan.
* **Indexes** — everything §P02 lists (GIN search; trigram GIN on lower(title)/lower(company); (status, posted_at desc);
  GIN cities/skills/batches/tags/company_tags/source_ids (+countries); btree level/type/mode/category/company_slug/
  salary max) plus partial sort indexes for relevance and salary.
* **Storage** — hot columns (status, dates, rank, enums, arrays) come first in the row and stay inline; descriptions, the
  full vector and display JSON move to TOAST (`toast_tuple_target=128`). Heap ≈ 1.4 KB/row → facet scans touch few pages.

## Ingest semantics (§0.4)

`repo.upsertJobs(items)` validates every item with `jobInputSchema` (declared `z.ZodType<JobInput>` **and** checked for
exact type equality at compile time), rejects bad items one by one, re-sanitises `descriptionHtml` (sanitize-html
allow-list; entity-escaped HTML is decoded), then merges inside a serialised transaction (in-process mutex +
`pg_advisory_xact_lock` on Postgres):

* sources unioned by (source, sourceJobId); a pair that now maps to another fingerprint is moved and its old job re-evaluated
* scalar groups come from the highest `SOURCE_KIND_PRIORITY` source with a value; non-empty values are never replaced by
  null/empty (per-group provenance in `field_prio`; `category: "other"` counts as empty)
* arrays unioned (skills ≤ 12, higher-priority source first); earliest `postedAt`/`firstSeenAt`; max `qualityScore`;
  `applyUrl` from the most official source
* any sighting re-opens the job, then the freshness rules apply (so a sighting can't resurrect an expired posting)
* unchanged re-sightings don't rewrite the row (only `last_seen_at`, at most hourly → HOT update)
* light records (`extra.light === true`, i.e. re-sightings emitted without a description) never update
  description-derived fields (level, experience range, category, summary, description)
* companies, sources and the typo vocabulary are upserted; "job created" events are emitted after commit for new open rows

Freshness: `sweep(source, target, seen)` removes unseen source rows (target `null`/`""` = target-less postings) and closes
jobs with no active source; `expireStale()` closes `validThrough` < now, and board/aggregator-only jobs unseen for 21 days
or posted > 45 days ago. Closed jobs resolve by id but never appear in search.

## Search (`src/search/*`)

* Text: websearch-style parsing ("phrases", -negation, OR), synonym groups (sde/swe ↔ software engineer/developer,
  ml ↔ machine learning, frontend ↔ front end, fresher ↔ new grad, intern ↔ internship/trainee, wfh ↔ remote,
  bangalore ↔ bengaluru, …), prefix match on the last token, every term matched as 'simple' lexeme and 'english' stem.
  If nothing matches: typo correction from the vocabulary (`amazn` → amazon), then a trigram fallback on title/company.
* Filters are declared once with SQL **and** a JS predicate (`matchesFilters`), so search, facets and the SSE stream share
  semantics (parity is tested). Values are canonicalised (`bangalore` → Bengaluru, `react` → React, `MNC` → mnc).
* Facet engines:
  * **Default (`FACET_ENGINE=memory`, `search/facet-index.ts`):** an in-memory columnar index of open jobs computes
    disjunctive facets, the total and the page order in one pass. It is kept fresh by an overlay of local and
    NOTIFY-announced changes plus periodic rebuilds.
  * **SQL reference and fallback:** parallel statements, where scalar facets without their own active filter share one
    GROUPING SETS scan and every other facet gets its own statement (WHERE without its own filter). `total` comes from
    the `type` facet.
  * **Parity:** both engines must return identical facets, totals and page ids (tested).
* Text-conditioned statements run with seq/index scans disabled (`SET LOCAL` via `set_config`): the GIN bitmap answers
  `@@` without detoasting vectors — the planner can't see detoast cost and otherwise picks a seq scan.
* Relevance = `ln(ts_rank(search_head) + 0.03) + rank_base` (text rank × freshness decay × boosts); sorts newest / salary
  (coalesce(max, min) desc, nulls last).
