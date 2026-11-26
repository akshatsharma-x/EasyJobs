import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { API_ROUTES, type StreamEvent } from "@easyjobs/contract";
import { makeJob, type TestDb } from "@easyjobs/db/testing";
import type { Repository } from "@easyjobs/db";
import { chunkIds } from "../src/bus";
import { streamEventSchema } from "../src/schemas";
import { ingestHeaders, parseFrames, readStream, seededRepo, startTestApi, testConfig, type TestApi } from "./helpers";

let t: TestDb;
let repo: Repository;
let api: TestApi;

beforeAll(async () => {
  ({ t, repo } = await seededRepo(120));
  api = await startTestApi(repo, testConfig({ sse: { heartbeatMs: 150, statsMs: 250, maxPerIp: 3, maxClients: 100 } }));
});
afterAll(async () => {
  await api.close();
  await t.cleanup();
});

const ingest = (jobs: unknown[]) =>
  api.request(API_ROUTES.ingestJobs, { method: "POST", headers: ingestHeaders(), body: JSON.stringify({ source: "test", runId: `r-${Math.random()}`, jobs }) });

describe("GET /v1/stream (SSE)", () => {
  it("sends text/event-stream with an initial stats event", async () => {
    const res = await api.request(`${API_ROUTES.stream}`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/^text\/event-stream/);
    expect(res.headers.get("cache-control")).toContain("no-cache");
    const reader = res.body!.getReader();
    const text = await readStream(reader, (s) => s.includes("event: stats"));
    expect(text.startsWith("retry: 5000")).toBe(true);
    const frame = parseFrames(text).find((f) => f.event === "stats")!;
    expect(streamEventSchema.parse(frame.data).type).toBe("stats");
    await reader.cancel();
  });

  it("delivers only new jobs matching the stream's filters (server-side, q ignored)", async () => {
    const res = await api.request(`${API_ROUTES.stream}?level=intern&location=Remote&q=ignored-text`);
    const reader = res.body!.getReader();
    await readStream(reader, (s) => s.includes("event: stats"));
    const match = makeJob({ key: "sse-match", title: "SSE Match", experienceLevel: "intern", jobType: "internship", isRemote: true, workMode: "remote", locations: [] });
    const wrongLevel = makeJob({ key: "sse-senior", title: "SSE Senior", experienceLevel: "senior", isRemote: true, workMode: "remote", locations: [] });
    const notRemote = makeJob({ key: "sse-onsite", title: "SSE Onsite", experienceLevel: "intern", jobType: "internship" });
    expect((await ingest([wrongLevel, match, notRemote])).status).toBe(200);
    const text = await readStream(reader, (s) => s.includes("SSE Match"), 3000);
    const extra = await readStream(reader, () => false, 400); // give non-matching events a chance to (wrongly) arrive
    const jobs = parseFrames(text + extra)
      .filter((f) => f.event === "job")
      .map((f) => streamEventSchema.parse(f.data) as Extract<StreamEvent, { type: "job" }>);
    expect(jobs.map((j) => j.job.title)).toEqual(["SSE Match"]);
    // re-sighting an existing job is not a "job created" event
    await ingest([match]);
    const after = await readStream(reader, () => false, 400);
    expect(parseFrames(after).filter((f) => f.event === "job")).toEqual([]);
    await reader.cancel();
  });

  it("an unfiltered stream gets every new job", async () => {
    const res = await api.request(API_ROUTES.stream);
    const reader = res.body!.getReader();
    await readStream(reader, (s) => s.includes("event: stats"));
    await ingest([makeJob({ key: "sse-any-1", title: "Any One" }), makeJob({ key: "sse-any-2", title: "Any Two" })]);
    const text = await readStream(reader, (s) => s.includes("Any One") && s.includes("Any Two"));
    expect(parseFrames(text).filter((f) => f.event === "job")).toHaveLength(2);
    await reader.cancel();
  });

  it("sends `: ping` heartbeats and periodic stats", async () => {
    const res = await api.request(API_ROUTES.stream);
    const reader = res.body!.getReader();
    const text = await readStream(reader, (s) => s.includes(": ping") && (s.match(/event: stats/g) ?? []).length >= 2, 2500);
    expect(text).toContain(": ping\n\n");
    expect((text.match(/event: stats/g) ?? []).length).toBeGreaterThanOrEqual(2);
    await reader.cancel();
  });

  it("limits concurrent streams per client and frees slots on disconnect", async () => {
    await new Promise((r) => setTimeout(r, 50));
    const before = api.api.hub.size;
    const readers: ReadableStreamDefaultReader<Uint8Array>[] = [];
    for (let i = 0; i < 3 - before; i++) readers.push((await api.request(API_ROUTES.stream)).body!.getReader());
    const over = await api.request(API_ROUTES.stream);
    expect(over.status).toBe(429);
    for (const r of readers) await r.cancel();
    await new Promise((r) => setTimeout(r, 50));
    expect(api.api.hub.size).toBe(before);
    const again = await api.request(API_ROUTES.stream);
    expect(again.status).toBe(200);
    await again.body!.cancel();
  });

  it("NOTIFY payloads stay under Postgres' 8000-byte limit", () => {
    const ids = Array.from({ length: 2000 }, (_, i) => `id${String(i).padStart(9, "0")}`);
    const chunks = chunkIds("origin-uuid", ids);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((c) => c.length <= 7000)).toBe(true);
    expect(chunks.flatMap((c) => (JSON.parse(c) as { ids: string[] }).ids)).toEqual(ids);
  });
});
