/**
 * W2 contract tests: every documented route answers with its strict (§0.5) schema, facet counts equal the filtered
 * totals, pagination is stable and complete, and SSE delivers a newly ingested job within a second.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { z } from "zod";
import { API_ROUTES, parseSearchQuery, toQueryString, type Facets, type JobsSearchResponse } from "@easyjobs/contract";
import { makeJob, type TestDb } from "@easyjobs/db/testing";
import type { Repository } from "@easyjobs/db";
import { buildOpenApi } from "../src/openapi";
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
  streamEventSchema,
  suggestResponseSchema,
  sweepResponseSchema,
} from "../src/schemas";
import { ingestHeaders, parseFrames, readStream, seededRepo, startTestApi, testConfig, type TestApi } from "./helpers";

let t: TestDb;
let repo: Repository;
let api: TestApi;

beforeAll(async () => {
  ({ t, repo } = await seededRepo(400));
  api = await startTestApi(repo, testConfig({ sse: { heartbeatMs: 1000, statsMs: 1000, maxPerIp: 10, maxClients: 100 } }));
});
afterAll(async () => {
  await api.close();
  await t.cleanup();
});

const getJson = async (path: string): Promise<{ status: number; body: unknown }> => {
  const res = await api.request(path);
  return { status: res.status, body: await res.json() };
};
const search = async (qs: string): Promise<JobsSearchResponse> => jobsSearchResponseSchema.parse((await getJson(`${API_ROUTES.jobs}?${qs}`)).body);

/* ───────────────────────────── every route ───────────────────────────── */

const SCHEMAS: Record<string, z.ZodType> = {
  JobsSearchResponse: jobsSearchResponseSchema,
  JobDetail: jobDetailSchema,
  SimilarJobsResponse: similarJobsResponseSchema,
  SuggestResponse: suggestResponseSchema,
  StatsResponse: statsResponseSchema,
  CompaniesResponse: companiesResponseSchema,
  CompanySummary: companySummarySchema,
  IngestResponse: ingestResponseSchema,
  SweepResponse: sweepResponseSchema,
  KnownIdsResponse: knownIdsResponseSchema,
  Ok: okSchema,
  Health: healthSchema,
  ApiError: apiErrorSchema,
};

type OpenApi = { paths: Record<string, Record<string, { responses: Record<string, { content?: Record<string, { schema?: { $ref?: string } }> }> }>> };

/** The schema component an OpenAPI response points at ("#/components/schemas/JobDetail" → JobDetail). */
function documentedSchema(doc: OpenApi, path: string, method: string, status: number): string | null {
  const content = doc.paths[path]?.[method]?.responses[String(status)]?.content ?? {};
  const ref = Object.values(content)[0]?.schema?.$ref ?? null;
  return ref ? (ref.split("/").pop() ?? null) : null;
}

describe("contract: every documented route answers with its strict schema", () => {
  const doc = buildOpenApi("test") as unknown as OpenApi;

  it("documents exactly the routes the app serves", () => {
    const served = new Set(
      api.api.app.routes
        .filter((r) => r.method !== "ALL" && r.path !== "/*" && !["/", "/docs", "/openapi.json"].includes(r.path))
        .map((r) => `${r.method.toLowerCase()} ${r.path.replace(/:(\w+)/g, "{$1}")}`),
    );
    const documented = new Set(Object.entries(doc.paths).flatMap(([p, ops]) => Object.keys(ops).map((m) => `${m} ${p}`)));
    expect([...served].sort()).toEqual([...documented].sort());
  });

  it("every GET route's 200 body parses with the documented schema; 404/400 bodies are ApiErrors", async () => {
    const list = await search("pageSize=1");
    const id = list.data[0]!.id;
    const slug = list.data[0]!.company.slug;
    const concrete: Record<string, string> = {
      "/health": "/health",
      "/v1/jobs": `${API_ROUTES.jobs}?level=fresher,entry&mode=remote,hybrid&sort=newest&page=1&pageSize=5`,
      "/v1/jobs/{id}": API_ROUTES.job(id),
      "/v1/jobs/{id}/similar": API_ROUTES.similar(id),
      "/v1/suggest": `${API_ROUTES.suggest}?q=eng`,
      "/v1/stats": API_ROUTES.stats,
      "/v1/companies": `${API_ROUTES.companies}?pageSize=5`,
      "/v1/companies/{slug}": API_ROUTES.company(slug),
    };
    for (const [path, url] of Object.entries(concrete)) {
      const name = documentedSchema(doc, path, "get", 200);
      expect(name, path).not.toBeNull();
      const { status, body } = await getJson(url);
      expect(status, url).toBe(200);
      const parsed = SCHEMAS[name!]!.safeParse(body);
      expect(parsed.success, `${url} → ${name}: ${parsed.success ? "" : JSON.stringify(parsed.error.issues.slice(0, 3))}`).toBe(true);
    }
    for (const url of [API_ROUTES.job("does-not-exist"), API_ROUTES.similar("does-not-exist"), API_ROUTES.company("no-such-company")]) {
      const { status, body } = await getJson(url);
      expect(status, url).toBe(404);
      expect(apiErrorSchema.safeParse(body).success, url).toBe(true);
    }
    const known = await api.request(API_ROUTES.ingestKnown, { headers: ingestHeaders() });
    expect(known.status).toBe(400);
    expect(apiErrorSchema.safeParse(await known.json()).success).toBe(true);
  });

  it("every ingest route's 200 body parses with the documented schema; 401s are ApiErrors", async () => {
    const post = (path: string, body: unknown, headers = ingestHeaders()) => api.request(path, { method: "POST", headers, body: JSON.stringify(body) });
    const job = makeJob({ key: "contract-1", title: "Contract Test Engineer" });
    const cases: { path: string; method: "post" | "get"; res: () => Promise<Response> }[] = [
      { path: "/v1/ingest/jobs", method: "post", res: () => post(API_ROUTES.ingestJobs, { source: "test", runId: "contract-run", jobs: [job] }) },
      { path: "/v1/ingest/sweep", method: "post", res: () => post(API_ROUTES.ingestSweep, { source: "greenhouse", target: "no-such-board", seenSourceJobIds: [] }) },
      { path: "/v1/ingest/known", method: "get", res: () => api.request(`${API_ROUTES.ingestKnown}?source=greenhouse`, { headers: ingestHeaders() }) },
      {
        path: "/v1/ingest/runs",
        method: "post",
        res: () =>
          post(API_ROUTES.ingestRuns, {
            runId: "contract-run",
            source: "test",
            target: null,
            startedAt: new Date(Date.now() - 1000).toISOString(),
            finishedAt: new Date().toISOString(),
            status: "ok",
            emitted: 1,
            invalid: 0,
            errors: [],
          }),
      },
    ];
    for (const c of cases) {
      const name = documentedSchema(doc, c.path, c.method, 200);
      const res = await c.res();
      expect(res.status, c.path).toBe(200);
      const parsed = SCHEMAS[name!]!.safeParse(await res.json());
      expect(parsed.success, `${c.path} → ${name}: ${parsed.success ? "" : JSON.stringify(parsed.error.issues.slice(0, 3))}`).toBe(true);
      const unauth = await api.request(c.method === "get" ? `${c.path}?source=test` : c.path, { method: c.method.toUpperCase(), headers: { "content-type": "application/json" }, body: c.method === "post" ? "{}" : undefined });
      expect(unauth.status, `${c.path} without key`).toBe(401);
      expect(apiErrorSchema.safeParse(await unauth.json()).success).toBe(true);
    }
  });

  it("GET /v1/stream frames parse as StreamEvent", async () => {
    const res = await api.request(API_ROUTES.stream);
    expect(res.status).toBe(200);
    const reader = res.body!.getReader();
    const text = await readStream(reader, (s) => s.includes("event: stats"));
    for (const f of parseFrames(text)) expect(streamEventSchema.safeParse(f.data).success).toBe(true);
    await reader.cancel();
  });
});

/* ───────────────────────────── facets = totals ───────────────────────────── */

const FACET_KEYS = ["type", "level", "mode", "category", "location", "company", "ctype", "skills", "batch", "source", "tag"] as const satisfies readonly (keyof Facets)[];

/** The same query with facet group `key` replaced by the single value `value`. */
function withOnly(qs: string, key: (typeof FACET_KEYS)[number], value: string): string {
  const q = parseSearchQuery(new URLSearchParams(qs));
  const next = { ...q, page: 1, pageSize: 1, [key]: key === "batch" ? [Number(value)] : [value] };
  return toQueryString(next);
}

describe("facet counts equal the filtered totals (disjunctive within a group, conjunctive across groups)", () => {
  const BASES = ["", "level=fresher,entry", "mode=remote", "type=internship&level=intern", "q=engineer", "category=software_engineering&mode=hybrid,remote", "posted=7d&sort=newest", "official=1&ctype=mnc"];

  it.each(BASES)("base query '%s'", async (base) => {
    const r = await search(`${base}${base ? "&" : ""}pageSize=1`);
    let checked = 0;
    for (const key of FACET_KEYS) {
      for (const bucket of r.facets[key].slice(0, 8)) {
        const total = (await search(withOnly(base, key, bucket.value))).total;
        expect(total, `${base} · ${key}=${bucket.value}`).toBe(bucket.count);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it("a group's own selection does not change its own counts (disjunctive)", async () => {
    const all = await search("pageSize=1");
    const picked = await search("level=intern&pageSize=1");
    expect(picked.facets.level).toEqual(all.facets.level);
    expect(picked.total).toBe(all.facets.level.find((b) => b.value === "intern")?.count ?? 0);
  });

  it("stats agree with the unfiltered facets", async () => {
    const all = await search("pageSize=1");
    const stats = statsResponseSchema.parse((await getJson(API_ROUTES.stats)).body);
    expect(stats.totalOpen).toBe(all.total);
    for (const b of all.facets.level) expect(stats.byLevel[b.value as keyof typeof stats.byLevel], b.value).toBe(b.count);
  });
});

/* ───────────────────────────── pagination ───────────────────────────── */

describe("pagination is stable and complete", () => {
  it.each(["sort=newest", "sort=relevance", "sort=salary", "q=engineer&sort=relevance", "level=fresher,entry,mid&sort=newest"])("%s: pages are disjoint, cover the total and repeat identically", async (qs) => {
    const pageSize = 37;
    const first = await search(`${qs}&pageSize=${pageSize}`);
    const pages = Math.ceil(first.total / pageSize);
    const seen: string[] = [];
    for (let page = 1; page <= pages; page++) {
      const r = await search(`${qs}&page=${page}&pageSize=${pageSize}`);
      expect(r.total).toBe(first.total);
      expect(r.page).toBe(page);
      expect(r.data.length).toBe(page < pages ? pageSize : first.total - pageSize * (pages - 1));
      seen.push(...r.data.map((j) => j.id));
      if (page === 2) {
        const again = await search(`${qs}&page=2&pageSize=${pageSize}`);
        expect(again.data.map((j) => j.id)).toEqual(r.data.map((j) => j.id));
      }
    }
    expect(new Set(seen).size).toBe(seen.length);
    expect(seen.length).toBe(first.total);
    const beyond = await search(`${qs}&page=${pages + 1}&pageSize=${pageSize}`);
    expect(beyond.data).toEqual([]);
    expect(beyond.total).toBe(first.total);
  });

  it("different page sizes produce the same order", async () => {
    const big = await search("sort=newest&pageSize=50");
    const small = [...(await search("sort=newest&pageSize=10&page=1")).data, ...(await search("sort=newest&pageSize=10&page=2")).data];
    expect(small.map((j) => j.id)).toEqual(big.data.slice(0, 20).map((j) => j.id));
  });
});

/* ───────────────────────────── SSE latency ───────────────────────────── */

describe("SSE delivers new jobs within seconds", () => {
  it("an ingested job reaches an open stream in < 1 s", async () => {
    const res = await api.request(`${API_ROUTES.stream}?level=fresher`);
    const reader = res.body!.getReader();
    await readStream(reader, (s) => s.includes("event: stats"));
    const latencies: number[] = [];
    for (let i = 0; i < 5; i++) {
      const title = `SSE Latency Probe ${i}`;
      const started = performance.now();
      const ingest = await api.request(API_ROUTES.ingestJobs, {
        method: "POST",
        headers: ingestHeaders(),
        body: JSON.stringify({ source: "test", runId: `latency-${i}`, jobs: [makeJob({ key: `sse-latency-${i}`, title, experienceLevel: "fresher" })] }),
      });
      expect(ingest.status).toBe(200);
      const text = await readStream(reader, (s) => s.includes(title), 3000);
      expect(text).toContain(title);
      latencies.push(performance.now() - started);
    }
    await reader.cancel();
    expect(Math.max(...latencies)).toBeLessThan(1000);
  });
});
