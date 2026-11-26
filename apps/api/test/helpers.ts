import { createRepository, type Repository } from "@easyjobs/db";
import { generateSeedJobs } from "@easyjobs/db/seed";
import { createTestDb, TEST_NOW, type TestDb } from "@easyjobs/db/testing";
import { createApp, type ApiApp } from "../src/app";
import { startEventBus } from "../src/bus";
import { loadConfig, type ApiConfig } from "../src/config";
import { silentLogger } from "../src/log";

export const INGEST_KEY = "test-ingest-key";

export function testConfig(over: Partial<ApiConfig> = {}): ApiConfig {
  const base = loadConfig({ INGEST_API_KEY: INGEST_KEY, WEB_ORIGIN: "http://localhost:3000", RATE_LIMIT_RPS: "0" });
  return { ...base, cacheTtlMs: 0, ...over, sse: { ...base.sse, ...over.sse }, limits: { ...base.limits, ...over.limits } };
}

export interface TestApi {
  api: ApiApp;
  request: (path: string, init?: RequestInit) => Promise<Response>;
  close(): Promise<void>;
}

export async function startTestApi(repo: Repository, config: ApiConfig): Promise<TestApi> {
  const api = createApp({ repo, config, log: silentLogger });
  const stopBus = await startEventBus(repo, api.hub, silentLogger);
  api.hub.start();
  return {
    api,
    request: async (path, init) => api.app.request(path, init),
    async close() {
      api.close();
      await stopBus();
    },
  };
}

export async function seededRepo(count = 400): Promise<{ t: TestDb; repo: Repository }> {
  const t = await createTestDb();
  const repo = createRepository(t.db);
  const jobs = generateSeedJobs({ count, seed: 11, now: TEST_NOW });
  for (let i = 0; i < jobs.length; i += 250) await repo.upsertJobs(jobs.slice(i, i + 250), { now: TEST_NOW });
  await repo.warmup();
  return { t, repo };
}

export const ingestHeaders = (extra: Record<string, string> = {}): Record<string, string> => ({
  "content-type": "application/json",
  "x-ingest-key": INGEST_KEY,
  ...extra,
});

/** Read an SSE body until `until(text)` is true or the timeout elapses; returns everything read. */
export async function readStream(reader: ReadableStreamDefaultReader<Uint8Array>, until: (text: string) => boolean, timeoutMs = 3000): Promise<string> {
  const decoder = new TextDecoder();
  let text = "";
  const deadline = Date.now() + timeoutMs;
  while (!until(text)) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) break;
    const chunk = await Promise.race([
      reader.read(),
      new Promise<{ done: true; value: undefined; timeout: true }>((resolve) => setTimeout(() => resolve({ done: true, value: undefined, timeout: true }), remaining)),
    ]);
    if ("timeout" in chunk) break;
    if (chunk.done) break;
    text += decoder.decode(chunk.value, { stream: true });
  }
  return text;
}

export function parseFrames(text: string): { event: string; data: unknown }[] {
  return text
    .split("\n\n")
    .map((block) => {
      const event = /^event: (.+)$/m.exec(block)?.[1];
      const data = /^data: (.+)$/m.exec(block)?.[1];
      return event && data ? { event, data: JSON.parse(data) as unknown } : null;
    })
    .filter((x): x is { event: string; data: unknown } => x !== null);
}
