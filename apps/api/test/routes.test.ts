import { gzipSync } from "node:zlib";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { API_ROUTES, type JobsSearchResponse } from "@easyjobs/contract";
import { makeJob, type TestDb } from "@easyjobs/db/testing";
import type { Repository } from "@easyjobs/db";
import {
  apiErrorSchema,
  companiesResponseSchema,
  companySummarySchema,
  healthSchema,
  ingestResponseSchema,
  jobDetailSchema,
  jobsSearchResponseSchema,
  knownIdsResponseSchema,
  okSchema,
  similarJobsResponseSchema,
  statsResponseSchema,
  suggestResponseSchema,
  sweepResponseSchema,
} from "../src/schemas";
import { ingestHeaders, seededRepo, startTestApi, testConfig, type TestApi } from "./helpers";

let t: TestDb;
let repo: Repository;
let api: TestApi;
let cached: TestApi;

beforeAll(async () => {
  ({ t, repo } = await seededRepo(400));
  api = await startTestApi(repo, testConfig());
  cached = await startTestApi(repo, testConfig({ cacheTtlMs: 20_000 }));
});
afterAll(async () => {
  await api.close();
  await cached.close();
  await t.cleanup();
});

const getJson = async (path: string, app: TestApi = api) => {
  const res = await app.request(path);
  return { res, body: (await res.json()) as unknown };
};

describe("public routes return the exact §0.5 shapes", () => {
  it("GET /health", async () => {
    const { res, body } = await getJson(API_ROUTES.health);
    expect(res.status).toBe(200);
    expect(healthSchema.parse(body)).toMatchObject({ ok: true, version: "0.1.0" });
  });

  it("GET /v1/jobs (filters, q, facets, pagination)", async () => {
    const { res, body } = await getJson(`${API_ROUTES.jobs}?q=engineer&level=entry,mid&location=Bengaluru&sort=newest&page=1&pageSize=5`);
    expect(res.status).toBe(200);
    const r = jobsSearchResponseSchema.parse(body);
    expect(r.data.length).toBeLessThanOrEqual(5);
    expect(r.pageSize).toBe(5);
    expect(r.totalPages).toBe(Math.ceil(r.total / 5));
    expect(r.data.every((j) => ["entry", "mid"].includes(j.experienceLevel))).toBe(true);
    expect(r.facets.level.length).toBeGreaterThan(2); // disjunctive: other levels still counted
  });

  it("GET /v1/jobs ignores unknown values and clamps numbers (parseSearchQuery)", async () => {
    const { body } = await getJson(`${API_ROUTES.jobs}?type=nope&pageSize=999&page=0&sort=weird`);
    const r = jobsSearchResponseSchema.parse(body);
    expect(r.pageSize).toBe(50);
    expect(r.page).toBe(1);
  });

  it("GET /v1/jobs/:id, /similar and 404s", async () => {
    const list = jobsSearchResponseSchema.parse((await getJson(`${API_ROUTES.jobs}?pageSize=1`)).body);
    const id = list.data[0]!.id;
    const detail = await getJson(API_ROUTES.job(id));
    expect(detail.res.status).toBe(200);
    expect(jobDetailSchema.parse(detail.body).id).toBe(id);
    const sim = similarJobsResponseSchema.parse((await getJson(`${API_ROUTES.similar(id)}?limit=3`)).body);
    expect(sim.data.length).toBe(3);
    expect(similarJobsResponseSchema.parse((await getJson(`${API_ROUTES.similar(id)}?limit=500`)).body).data.length).toBeLessThanOrEqual(12);
    for (const path of [API_ROUTES.job("nope"), API_ROUTES.similar("nope"), API_ROUTES.job("bad id!"), "/v1/unknown", API_ROUTES.company("no-such-co")]) {
      const { res, body } = await getJson(path);
      expect(res.status, path).toBe(404);
      expect(apiErrorSchema.parse(body).error.code).toBe("not_found");
    }
  });

  it("GET /v1/suggest, /v1/stats, /v1/companies, /v1/companies/:slug", async () => {
    const s = suggestResponseSchema.parse((await getJson(`${API_ROUTES.suggest}?q=data`)).body);
    expect(s.titles.length).toBeGreaterThan(0);
    const stats = statsResponseSchema.parse((await getJson(API_ROUTES.stats)).body);
    expect(stats.totalOpen).toBeGreaterThan(0);
    const companies = companiesResponseSchema.parse((await getJson(`${API_ROUTES.companies}?ctype=mnc&pageSize=5`)).body);
    expect(companies.data.length).toBe(5);
    expect(companies.data.map((c) => c.openJobs)).toEqual([...companies.data.map((c) => c.openJobs)].sort((a, b) => b - a));
    expect(companies.data.every((c) => c.tags.includes("mnc"))).toBe(true);
    const one = companySummarySchema.parse((await getJson(API_ROUTES.company(companies.data[0]!.slug))).body);
    expect(one.slug).toBe(companies.data[0]!.slug);
  });

  it("GET /openapi.json documents every route; /docs renders", async () => {
    const doc = (await getJson("/openapi.json")).body as { paths: Record<string, unknown> };
    for (const p of ["/v1/jobs", "/v1/jobs/{id}", "/v1/jobs/{id}/similar", "/v1/suggest", "/v1/stats", "/v1/companies", "/v1/companies/{slug}", "/v1/stream", "/v1/ingest/jobs", "/v1/ingest/sweep", "/v1/ingest/known", "/v1/ingest/runs", "/health"]) {
      expect(doc.paths[p], p).toBeDefined();
    }
    const docs = await api.request("/docs");
    expect(docs.status).toBe(200);
    expect(docs.headers.get("content-type")).toMatch(/text\/html/);
  });
});

describe("HTTP caching", () => {
  it("sends ETag + Cache-Control, answers If-None-Match with 304, serves repeats from cache", async () => {
    const path = `${API_ROUTES.jobs}?level=intern&location=Pune,Bengaluru`;
    const first = await cached.request(path);
    expect(first.headers.get("cache-control")).toBe("public, max-age=15, stale-while-revalidate=60");
    const etag = first.headers.get("etag")!;
    expect(etag).toMatch(/^W\/".+"$/);
    expect(first.headers.get("x-cache")).toBe("MISS");
    const again = await cached.request(`${API_ROUTES.jobs}?location=bengaluru,Pune&level=intern`); // normalised key
    expect(again.headers.get("x-cache")).toBe("HIT");
    expect(again.headers.get("etag")).toBe(etag);
    const notModified = await cached.request(path, { headers: { "if-none-match": etag } });
    expect(notModified.status).toBe(304);
    expect(await notModified.text()).toBe("");
    for (const p of [API_ROUTES.stats, `${API_ROUTES.suggest}?q=dat`]) {
      await cached.request(p);
      expect((await cached.request(p)).headers.get("x-cache")).toBe("HIT");
    }
  });

  it("pagination reuses the cached text match", async () => {
    const p1 = jobsSearchResponseSchema.parse(await (await cached.request(`${API_ROUTES.jobs}?q=engineer&page=1&pageSize=5`)).json());
    const hitsBefore = cached.api.data.hits;
    const p2 = jobsSearchResponseSchema.parse(await (await cached.request(`${API_ROUTES.jobs}?q=engineer&page=2&pageSize=5`)).json());
    expect(cached.api.data.hits).toBeGreaterThan(hitsBefore);
    expect(p2.facets).toEqual(p1.facets);
    expect(p2.data.map((d) => d.id)).not.toEqual(p1.data.map((d) => d.id));
  });
});

describe("ingest routes", () => {
  it("require x-ingest-key (401 without or with a wrong key)", async () => {
    for (const [method, path] of [["POST", API_ROUTES.ingestJobs], ["POST", API_ROUTES.ingestSweep], ["GET", `${API_ROUTES.ingestKnown}?source=x`], ["POST", API_ROUTES.ingestRuns]] as const) {
      for (const key of [undefined, "wrong"]) {
        const res = await api.request(path, { method, headers: key ? { "x-ingest-key": key } : {}, body: method === "POST" ? "{}" : undefined });
        expect(res.status, `${method} ${path} ${key}`).toBe(401);
        expect(apiErrorSchema.parse(await res.json()).error.code).toBe("unauthorized");
      }
    }
  });

  it("POST /v1/ingest/jobs (plain and gzip) → IngestResponse with per-item rejections", async () => {
    const body = { source: "test", runId: "r-1", jobs: [makeJob({ key: "api-1" }), { bad: true }] };
    const res = await api.request(API_ROUTES.ingestJobs, { method: "POST", headers: ingestHeaders(), body: JSON.stringify(body) });
    expect(res.status).toBe(200);
    const r = ingestResponseSchema.parse(await res.json());
    expect(r).toMatchObject({ inserted: 1, updated: 0, merged: 0 });
    expect(r.rejected.map((x) => x.index)).toEqual([1]);
    const gz = await api.request(API_ROUTES.ingestJobs, {
      method: "POST",
      headers: ingestHeaders({ "content-encoding": "gzip" }),
      body: gzipSync(JSON.stringify({ source: "test", runId: "r-2", jobs: [makeJob({ key: "api-1" }), makeJob({ key: "api-2" })] })),
    });
    expect(ingestResponseSchema.parse(await gz.json())).toMatchObject({ inserted: 1, updated: 1 });
  });

  it("rejects malformed envelopes, bad JSON, > 500 jobs and oversized bodies", async () => {
    const post = (body: BodyInit, headers: Record<string, string> = {}, app: TestApi = api) =>
      app.request(API_ROUTES.ingestJobs, { method: "POST", headers: ingestHeaders(headers), body });
    expect((await post("{not json")).status).toBe(400);
    expect((await post(JSON.stringify({ source: "x", jobs: [] }))).status).toBe(400); // runId missing
    const many = await post(JSON.stringify({ source: "x", runId: "r", jobs: Array.from({ length: 501 }, () => ({})) }));
    expect(many.status).toBe(413);
    expect(apiErrorSchema.parse(await many.json()).error.code).toBe("too_many_jobs");
    const small = await startTestApi(repo, testConfig({ limits: { ingestJobsBytes: 1024, ingestInflatedBytes: 4096, ingestOtherBytes: 1024 } }));
    try {
      expect((await post(JSON.stringify({ source: "x", runId: "r", jobs: [], pad: "x".repeat(5000) }), {}, small)).status).toBe(413);
      const bomb = gzipSync(JSON.stringify({ source: "x", runId: "r", jobs: [], pad: "a".repeat(100_000) }));
      expect(bomb.length).toBeLessThan(1024);
      const res = await post(bomb, { "content-encoding": "gzip" }, small);
      expect(res.status).toBe(413);
    } finally {
      await small.close();
    }
  });

  it("POST /v1/ingest/sweep, GET /v1/ingest/known, POST /v1/ingest/runs", async () => {
    await api.request(API_ROUTES.ingestJobs, {
      method: "POST",
      headers: ingestHeaders(),
      body: JSON.stringify({ source: "test", runId: "r-3", jobs: [makeJob({ key: "sw-a", target: "sweep-co" }), makeJob({ key: "sw-b", target: "sweep-co" })] }),
    });
    const known = knownIdsResponseSchema.parse(await (await api.request(`${API_ROUTES.ingestKnown}?source=greenhouse&target=sweep-co`, { headers: ingestHeaders() })).json());
    expect(known.ids).toEqual(["sw-a", "sw-b"]);
    expect((await api.request(API_ROUTES.ingestKnown, { headers: ingestHeaders() })).status).toBe(400);
    const sweep = await api.request(API_ROUTES.ingestSweep, { method: "POST", headers: ingestHeaders(), body: JSON.stringify({ source: "greenhouse", target: "sweep-co", seenSourceJobIds: ["sw-a"] }) });
    expect(sweepResponseSchema.parse(await sweep.json())).toEqual({ closed: 1, removed: 1 });
    expect((await api.request(API_ROUTES.ingestSweep, { method: "POST", headers: ingestHeaders(), body: JSON.stringify({ source: "greenhouse" }) })).status).toBe(400);
    const run = { runId: "run-x", source: "greenhouse", target: "sweep-co", startedAt: "2026-11-20T10:00:00Z", finishedAt: "2026-11-20T10:01:00Z", status: "ok", emitted: 2, invalid: 0, errors: [] };
    const runRes = await api.request(API_ROUTES.ingestRuns, { method: "POST", headers: ingestHeaders(), body: JSON.stringify(run) });
    expect(okSchema.parse(await runRes.json())).toEqual({ ok: true });
    expect((await api.request(API_ROUTES.ingestRuns, { method: "POST", headers: ingestHeaders(), body: JSON.stringify({ ...run, status: "meh" }) })).status).toBe(400);
  });
});

describe("security middleware", () => {
  it("rate-limits public routes per IP with 429 + Retry-After (ingest exempt)", async () => {
    const limited = await startTestApi(repo, { ...testConfig(), rateLimit: { rps: 0.5, burst: 3 } });
    try {
      const statuses: number[] = [];
      for (let i = 0; i < 5; i++) statuses.push((await limited.request(API_ROUTES.stats)).status);
      expect(statuses).toEqual([200, 200, 200, 429, 429]);
      const res = await limited.request(API_ROUTES.stats);
      expect(res.headers.get("retry-after")).toMatch(/^\d+$/);
      expect(apiErrorSchema.parse(await res.json()).error.code).toBe("rate_limited");
      expect((await limited.request(API_ROUTES.health)).status).toBe(200);
      expect((await limited.request(`${API_ROUTES.ingestKnown}?source=x`, { headers: ingestHeaders() })).status).toBe(200);
    } finally {
      await limited.close();
    }
  });

  it("allows CORS only for WEB_ORIGIN and answers preflights", async () => {
    const ok = await api.request(API_ROUTES.stats, { headers: { origin: "http://localhost:3000" } });
    expect(ok.headers.get("access-control-allow-origin")).toBe("http://localhost:3000");
    expect(ok.headers.get("access-control-expose-headers")).toContain("ETag");
    const evil = await api.request(API_ROUTES.stats, { headers: { origin: "https://evil.example" } });
    expect(evil.headers.get("access-control-allow-origin")).toBeNull();
    const pre = await api.request(API_ROUTES.jobs, { method: "OPTIONS", headers: { origin: "http://localhost:3000", "access-control-request-method": "GET" } });
    expect(pre.status).toBe(204);
    expect(pre.headers.get("access-control-allow-methods")).toContain("GET");
  });

  it("sets security headers and request ids", async () => {
    const res = await api.request(API_ROUTES.stats);
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("x-request-id")).toBeTruthy();
    expect(res.headers.get("server-timing")).toMatch(/^app;dur=/);
  });
});

describe("search features over HTTP", () => {
  it("reports typo corrections and fuzzy mode in headers and (contract 1.1) in the body", async () => {
    const res = await api.request(`${API_ROUTES.jobs}?q=amazn`);
    expect(decodeURIComponent(res.headers.get("x-search-corrected") ?? "")).toBe("amazn=amazon");
    const body = jobsSearchResponseSchema.parse(await res.json()) as JobsSearchResponse;
    expect(body.total).toBeGreaterThan(0);
    expect(body.corrections).toEqual({ amazn: "amazon" });
    expect(body.fuzzy).toBeUndefined();
  });
});
