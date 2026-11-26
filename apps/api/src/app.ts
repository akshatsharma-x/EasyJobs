/**
 * The EasyJobs HTTP API (§0.5) as a Hono app factory — no I/O at import time, so tests run it in-process.
 */
import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { Hono, type Context, type MiddlewareHandler } from "hono";
import { compress } from "hono/compress";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import { secureHeaders } from "hono/secure-headers";
import { Scalar } from "@scalar/hono-api-reference";
import {
  API_ROUTES,
  CONTRACT_VERSION,
  parseSearchQuery,
  type IngestResponse,
  type JobsSearchResponse,
  type SearchQuery,
  type SimilarJobsResponse,
} from "@easyjobs/contract";
import type { Logger } from "@easyjobs/contract/node";
import {
  MAX_JOBS_PER_REQUEST,
  MAX_PAGES,
  formatZodError,
  ingestEnvelopeSchema,
  runReportSchema,
  sweepSchema,
  totalFromFacets,
  type Repository,
} from "@easyjobs/db";
import { readJsonBody } from "./body";
import { TtlCache } from "./cache";
import { clientIp } from "./client-ip";
import type { ApiConfig } from "./config";
import { cachedJson, errorBody, HttpError, type CachedBody } from "./http";
import { silentLogger } from "./log";
import { RequestMetrics } from "./metrics";
import { buildOpenApi } from "./openapi";
import { createRateLimiter, type RateLimiter } from "./rate-limit";
import { StreamHub } from "./stream";

export interface AppOptions {
  repo: Repository;
  config: ApiConfig;
  log?: Logger;
}

export interface ApiApp {
  app: Hono;
  hub: StreamHub;
  /** Serialised response bodies (search, stats, suggest, details…). */
  bodies: TtlCache<CachedBody>;
  /** Intermediate search results (text match, facets) reused across pages/sorts. */
  data: TtlCache<unknown>;
  metrics: RequestMetrics;
  rateLimiter: RateLimiter | null;
  /** Stop timers and close SSE streams. */
  close(): void;
}

/* ─────────────── cache keys ─────────────── */

const normText = (q: string | undefined): string => (q ?? "").toLowerCase().replace(/\s+/g, " ").trim();

/** Stable key for a (canonicalised) query: list order and text case do not matter. */
export function searchKey(q: SearchQuery, omit: readonly (keyof SearchQuery)[] = []): string {
  const parts: string[] = [];
  for (const k of Object.keys(q).sort() as (keyof SearchQuery)[]) {
    const v = q[k];
    if (v === undefined || omit.includes(k)) continue;
    const s = Array.isArray(v) ? [...v].map(String).sort().join(",") : k === "q" ? normText(String(v)) : String(v);
    parts.push(`${k}=${s}`);
  }
  return parts.join("&");
}

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,119}$/;

function safeEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

const int = (raw: string | undefined, min: number, max: number, fallback: number): number => {
  const n = Number(raw);
  return raw !== undefined && raw !== "" && Number.isFinite(n) ? Math.min(max, Math.max(min, Math.floor(n))) : fallback;
};

export function createApp({ repo, config, log = silentLogger }: AppOptions): ApiApp {
  const app = new Hono();
  const bodies = new TtlCache<CachedBody>(config.cacheMaxEntries, config.cacheTtlMs);
  const data = new TtlCache<unknown>(config.cacheMaxEntries, config.cacheTtlMs);
  const metrics = new RequestMetrics(log);
  const memo = async <T>(key: string, fn: () => Promise<T>): Promise<T> =>
    data.enabled ? ((await data.getOrCompute(key, fn as () => Promise<unknown>)).value as T) : fn();

  const statsForStream = async () => {
    const s = await memo("stats:data", () => repo.stats());
    return { totalOpen: s.totalOpen, newLastHour: s.newLastHour, newLast24h: s.newLast24h, lastUpdatedAt: s.lastUpdatedAt };
  };
  const hub = new StreamHub({ ...config.sse, getStats: statsForStream, log: log.child("stream") });
  const ip = (c: Context): string => clientIp(c, config.trustProxy);

  /* ── middleware ── */
  app.use("*", async (c, next) => {
    const t0 = performance.now();
    const requestId = c.req.header("x-request-id")?.slice(0, 64) || randomUUID().slice(0, 12);
    c.header("X-Request-Id", requestId);
    await next();
    const ms = performance.now() - t0;
    c.header("Server-Timing", `app;dur=${ms.toFixed(1)}`);
    metrics.record(ms, c.res.status, c.res.headers.get("X-Cache") === "HIT");
    const line = `${c.req.method} ${c.req.path} ${c.res.status} ${ms.toFixed(1)}ms`;
    const meta = { requestId, ip: ip(c), cache: c.res.headers.get("X-Cache") ?? undefined };
    if (c.res.status >= 500) log.error(line, meta);
    else if (ms > 1000) log.warn(`slow: ${line}`, meta);
    else log.debug(line, meta);
  });
  app.use("*", secureHeaders({ crossOriginResourcePolicy: false, crossOriginOpenerPolicy: false }));
  const allowAll = config.webOrigins.includes("*");
  app.use(
    "*",
    cors({
      origin: (origin) => (allowAll ? origin || "*" : config.webOrigins.includes(origin) ? origin : null),
      allowMethods: ["GET", "HEAD", "POST", "OPTIONS"],
      allowHeaders: ["content-type", "content-encoding", "x-ingest-key", "if-none-match", "last-event-id", "x-request-id"],
      exposeHeaders: ["ETag", "Server-Timing", "X-Cache", "X-Request-Id", "X-Search-Corrected", "X-Search-Mode", "RateLimit-Limit", "RateLimit-Remaining", "Retry-After"],
      maxAge: 600,
    }),
  );
  const compressor = compress({ threshold: 1024 });
  app.use("*", (c, next) => (c.req.path === API_ROUTES.stream ? next() : compressor(c, next)));

  let rateLimiter: RateLimiter | null = null;
  if (config.rateLimit) {
    rateLimiter = createRateLimiter({ ...config.rateLimit, keyOf: ip });
    const limit = rateLimiter.middleware;
    app.use("/v1/*", (c, next) => (c.req.path.startsWith("/v1/ingest/") || c.req.method === "OPTIONS" ? next() : limit(c, next)));
  }

  const ingestAuth: MiddlewareHandler = async (c, next) => {
    const key = c.req.header("x-ingest-key");
    if (!key || !safeEqual(key, config.ingestKey)) throw new HttpError(401, "unauthorized", "Missing or invalid x-ingest-key header");
    await next();
  };
  app.use("/v1/ingest/*", ingestAuth);

  /* ── meta ── */
  app.get("/", (c) =>
    c.json({ name: "EasyJobs API", version: config.version, contract: CONTRACT_VERSION, docs: "/docs", openapi: "/openapi.json", health: API_ROUTES.health }),
  );
  app.get(API_ROUTES.health, async (c) => {
    const ok = await repo.ping();
    return c.json({ ok, db: ok ? repo.db.driver : "unreachable", version: config.version }, ok ? 200 : 503);
  });
  let openapi: Record<string, unknown> | null = null;
  app.get("/openapi.json", (c) => c.json((openapi ??= buildOpenApi(config.version))));
  app.get("/docs", Scalar({ url: "/openapi.json", pageTitle: "EasyJobs API" }));

  /* ── jobs ── */
  app.get(API_ROUTES.jobs, async (c) => {
    const q = await repo.normalizeQuery(parseSearchQuery(new URL(c.req.url).searchParams));
    return cachedJson(c, bodies, `jobs:${searchKey(q)}`, async () => {
      const t0 = performance.now();
      const now = new Date();
      const { page, facets, text } = await repo.search(q, now, memo);
      const total = totalFromFacets(facets, q);
      const value: JobsSearchResponse = {
        data: page,
        page: q.page,
        pageSize: q.pageSize,
        total,
        totalPages: Math.min(MAX_PAGES, Math.ceil(total / q.pageSize)),
        facets,
        tookMs: Math.round(performance.now() - t0),
      };
      const headers: Record<string, string> = {};
      if (text.mode === "fts" && Object.keys(text.corrections).length > 0) {
        value.corrections = { ...text.corrections }; // contract 1.1 (headers kept for 1.0 clients)
        headers["X-Search-Corrected"] = encodeURIComponent(Object.entries(text.corrections).map(([a, b]) => `${a}=${b}`).join(","));
      }
      if (text.mode === "trgm") {
        value.fuzzy = true;
        headers["X-Search-Mode"] = "fuzzy";
      }
      return { value, headers };
    });
  });

  app.get("/v1/jobs/:id", (c) => {
    const id = c.req.param("id");
    if (!ID_RE.test(id)) throw new HttpError(404, "not_found", `Job ${id} not found`);
    return cachedJson(c, bodies, `job:${id}`, async () => {
      const job = await repo.getJob(id);
      return job ? { value: job } : null;
    }, `Job ${id} not found`);
  });

  app.get("/v1/jobs/:id/similar", (c) => {
    const id = c.req.param("id");
    if (!ID_RE.test(id)) throw new HttpError(404, "not_found", `Job ${id} not found`);
    const limit = int(c.req.query("limit"), 1, 12, 6);
    return cachedJson(c, bodies, `similar:${id}:${limit}`, async () => {
      const items = await repo.similarJobs(id, limit);
      return items ? { value: { data: items } satisfies SimilarJobsResponse } : null;
    }, `Job ${id} not found`);
  });

  app.get(API_ROUTES.suggest, (c) => {
    const q = (c.req.query("q") ?? "").slice(0, 100);
    return cachedJson(c, bodies, `suggest:${normText(q)}`, async () => ({ value: await repo.suggest(q) }));
  });

  app.get(API_ROUTES.stats, (c) => cachedJson(c, bodies, "stats", async () => ({ value: await memo("stats:data", () => repo.stats()) })));

  /* ── companies ── */
  app.get(API_ROUTES.companies, (c) => {
    const q = c.req.query("q")?.trim().slice(0, 100) || undefined;
    const ctype = [...new Set(c.req.queries("ctype")?.flatMap((v) => v.split(",")).map((s) => s.trim()).filter(Boolean) ?? [])].sort();
    const page = int(c.req.query("page"), 1, MAX_PAGES, 1);
    const pageSize = int(c.req.query("pageSize"), 1, 100, 24);
    const key = `companies:${normText(q)}|${ctype.join(",")}|${page}|${pageSize}`;
    return cachedJson(c, bodies, key, async () => ({ value: await repo.listCompanies({ q, ctype: ctype.length ? ctype : undefined, page, pageSize }) }));
  });

  app.get("/v1/companies/:slug", (c) => {
    const slug = c.req.param("slug").toLowerCase();
    if (!SLUG_RE.test(slug)) throw new HttpError(404, "not_found", `Company ${slug} not found`);
    return cachedJson(c, bodies, `company:${slug}`, async () => {
      const company = await repo.getCompany(slug);
      return company ? { value: company } : null;
    }, `Company ${slug} not found`);
  });

  /* ── live stream ── */
  app.get(API_ROUTES.stream, async (c) => {
    const q = await repo.normalizeQuery(parseSearchQuery(new URL(c.req.url).searchParams));
    return hub.connect(q, ip(c), c.req.raw.signal);
  });

  /* ── ingest (x-ingest-key) ── */
  app.post(API_ROUTES.ingestJobs, async (c) => {
    const body = await readJsonBody(c, config.limits.ingestJobsBytes, config.limits.ingestInflatedBytes);
    const env = ingestEnvelopeSchema.safeParse(body);
    if (!env.success) throw new HttpError(400, "invalid_request", formatZodError(env.error));
    if (env.data.jobs.length > MAX_JOBS_PER_REQUEST) {
      throw new HttpError(413, "too_many_jobs", `At most ${MAX_JOBS_PER_REQUEST} jobs per request (got ${env.data.jobs.length})`);
    }
    const t0 = performance.now();
    const res = await repo.upsertJobs(env.data.jobs);
    log.info(
      `ingest ${env.data.source} run=${env.data.runId}: ${env.data.jobs.length} jobs → +${res.inserted} ~${res.updated} merged ${res.merged} rejected ${res.rejected.length} (${(performance.now() - t0).toFixed(0)} ms)`,
      res.rejected.length > 0 ? { firstRejection: res.rejected[0] } : undefined,
    );
    const out: IngestResponse = { inserted: res.inserted, updated: res.updated, merged: res.merged, rejected: res.rejected };
    return c.json(out);
  });

  app.post(API_ROUTES.ingestSweep, async (c) => {
    const parsed = sweepSchema.safeParse(await readJsonBody(c, config.limits.ingestOtherBytes, config.limits.ingestInflatedBytes));
    if (!parsed.success) throw new HttpError(400, "invalid_request", formatZodError(parsed.error));
    const res = await repo.sweep(parsed.data);
    log.info(`sweep ${parsed.data.source}/${parsed.data.target ?? "∅"}: seen ${parsed.data.seenSourceJobIds.length}, removed ${res.removed}, closed ${res.closed}`);
    return c.json({ closed: res.closed, removed: res.removed });
  });

  app.get(API_ROUTES.ingestKnown, async (c) => {
    const source = c.req.query("source")?.trim();
    if (!source) throw new HttpError(400, "invalid_request", "source is required");
    const target = c.req.query("target");
    return c.json({ ids: await repo.knownIds(source, target === undefined ? undefined : target) });
  });

  app.post(API_ROUTES.ingestRuns, async (c) => {
    const parsed = runReportSchema.safeParse(await readJsonBody(c, config.limits.ingestOtherBytes, config.limits.ingestInflatedBytes));
    if (!parsed.success) throw new HttpError(400, "invalid_request", formatZodError(parsed.error));
    await repo.recordRun(parsed.data);
    log.info(`run ${parsed.data.source}/${parsed.data.target ?? "∅"} ${parsed.data.status}: emitted ${parsed.data.emitted}, invalid ${parsed.data.invalid}`);
    return c.json({ ok: true as const });
  });

  /* ── errors ── */
  app.notFound((c) => c.json(errorBody("not_found", `No route for ${c.req.method} ${c.req.path}`), 404));
  app.onError((err, c) => {
    if (err instanceof HttpError) {
      for (const [k, v] of Object.entries(err.headers)) c.header(k, v);
      return c.json(errorBody(err.code, err.message), err.status);
    }
    if (err instanceof HTTPException) return c.json(errorBody("http_error", err.message), err.status);
    log.error(`unhandled error on ${c.req.method} ${c.req.path}`, { error: err instanceof Error ? err.message : String(err), stack: err instanceof Error ? err.stack?.split("\n").slice(0, 6).join(" | ") : undefined });
    return c.json(errorBody("internal", "Internal server error"), 500);
  });

  const sweeper = setInterval(() => rateLimiter?.sweep(), 60_000);
  sweeper.unref();

  return {
    app,
    hub,
    bodies,
    data,
    metrics,
    rateLimiter,
    close() {
      clearInterval(sweeper);
      metrics.stop();
      hub.close();
    },
  };
}
