# @easyjobs/api

Hono on Node — the public search API and the worker's ingest API (prompts.md §0.5). Data layer: `@easyjobs/db`.

```bash
pnpm --filter @easyjobs/api dev          # tsx watch, port 4000, PGlite at .data/pglite unless DATABASE_URL is set
pnpm --filter @easyjobs/db seed          # ~2,000 synthetic jobs (works while the API runs: falls back to POST /v1/ingest/jobs)
pnpm --filter @easyjobs/api test
pnpm --filter @easyjobs/api bench -- --db postgres --url postgres://localhost:5432/easyjobs_bench   # or --db pglite
```

Docs: `GET /docs` (Scalar) and `GET /openapi.json`.

## Routes

| Route | Notes |
|---|---|
| `GET /v1/jobs` | `parseSearchQuery` params → `JobsSearchResponse`. Headers: `X-Search-Corrected: amazn=amazon` (typo correction), `X-Search-Mode: fuzzy` (trigram fallback) |
| `GET /v1/jobs/:id` | `JobDetail`, closed jobs too · 404 `ApiError` |
| `GET /v1/jobs/:id/similar?limit=1..12` | `SimilarJobsResponse` (default 6) · 404 |
| `GET /v1/suggest?q=` | `SuggestResponse`, ≤ 8 per list (in-memory index, refreshed every 60 s) |
| `GET /v1/stats` | `StatsResponse` |
| `GET /v1/companies?q=&ctype=&page=&pageSize=` | `CompaniesResponse` by openJobs desc (pageSize ≤ 100, default 24; without `q` only companies with open jobs) |
| `GET /v1/companies/:slug` | `CompanySummary` · 404 |
| `GET /v1/stream` | SSE; filter params of SearchQuery (q/sort/page ignored), filtered server-side; `event: job` / `event: stats` (on connect + every 30 s), `: ping` every 25 s |
| `POST /v1/ingest/jobs` | `IngestRequest` (≤ 500 jobs, gzip/deflate/br allowed) → `IngestResponse` |
| `POST /v1/ingest/sweep` | `SweepRequest` (target may be null/"" for target-less sources) → `{ closed, removed }` |
| `GET /v1/ingest/known?source=&target=` | `KnownIdsResponse` (omit target = all targets) |
| `POST /v1/ingest/runs` | `RunReport` → `{ ok: true }` |
| `GET /health` | `{ ok, db: "pglite" \| "postgres" \| "unreachable", version }` (503 when the DB is down) |

`/v1/ingest/*` requires `x-ingest-key` (constant-time compare) → 401 otherwise. Errors always use the `ApiError` shape.

## Behaviour

* **Caching** — 20 s in-memory LRU (single-flight, refresh-ahead) for search responses, text matches, facets (keyed by
  the filters each facet statement really applies, so toggling one filter reuses the others), stats, suggest and
  details; keys are normalised (`location=Pune,Bengaluru` ≡ `location=bengaluru,Pune`). Responses carry a weak `ETag`
  (304 on `If-None-Match`) and `Cache-Control: public, max-age=15, stale-while-revalidate=60`; `X-Cache: HIT|MISS|BYPASS`.
* **SSE** — an in-process bus fed by ingest after commit; with `DATABASE_URL` also `NOTIFY easyjobs_jobs` (ids only,
  chunked < 8 kB) so every instance's subscribers get jobs ingested elsewhere. Per-IP and global stream caps; slow
  consumers are dropped.
* **Security** — CORS allow-list (`WEB_ORIGIN`), per-IP token bucket on public routes (429 + Retry-After + RateLimit
  headers; ingest exempt), body limits with zip-bomb protection, secure headers, request ids, structured logs
  (`LOG_FORMAT=json`, per-minute p50/p95 summary), graceful shutdown (SSE streams closed, in-flight requests drained,
  PGlite flushed), hourly `expireStale` (advisory try-lock so one instance runs it).
* Optional: if `packages/registry/src/index.ts` exists, company hq/careers URL/tags are enriched from it every 6 h.

Env vars: see `.env.example` here and in `packages/db`.
