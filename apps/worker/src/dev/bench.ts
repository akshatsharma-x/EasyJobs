/**
 * pnpm --filter @easyjobs/worker bench [--jobs 20000]
 * Offline throughput numbers: fallback normalizer alone, and the full pipeline
 * (validate → normalize → validate → dedupe → gzip batches of 200 → fake ingest API → sweep → run report).
 */
import { parseArgs } from "node:util";
import { gzipSync } from "node:zlib";
import type { RawJob } from "@easyjobs/contract";
import { createHttpClient, type ScrapeContext, type Scraper } from "@easyjobs/contract/node";
import { IngestApiClient } from "../api-client";
import { Delivery } from "../delivery";
import { fallbackNormalizerHandle } from "../discovery/normalizer";
import { loadSampleRegistry } from "../discovery/registry";
import { demoJob } from "../demo-scraper";
import { fallbackNormalize } from "../fallback-normalize";
import { silentLogger } from "../log";
import { runPipeline } from "../pipeline";
import { Spool } from "../spool";
import { startFakeIngest } from "./fake-ingest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const { values } = parseArgs({ options: { jobs: { type: "string", short: "n" } }, strict: true });
const N = Math.max(1, Number(values.jobs ?? 20_000));
const raws: RawJob[] = Array.from({ length: N }, (_, i) => demoJob(3_000_000 + i));
const now = new Date();

let t = performance.now();
for (const raw of raws) fallbackNormalize(raw, { sourceName: "Bench", now });
const normMs = performance.now() - t;

const server = await startFakeIngest();
const dir = mkdtempSync(join(tmpdir(), "p05-bench-"));
const api = new IngestApiClient({ baseUrl: server.url, key: "dev-ingest-key", log: silentLogger });
const delivery = new Delivery(api, new Spool(dir), { log: silentLogger, autoReplay: false });
const scraper: Scraper = {
  id: "bench",
  name: "Bench",
  kind: "aggregator",
  intervalMinutes: 60,
  async *scrape(_ctx: ScrapeContext) {
    yield* raws;
  },
};
t = performance.now();
const r = await runPipeline(
  { taskId: "bench", scraper, target: null, signal: new AbortController().signal },
  {
    http: createHttpClient(),
    normalizer: fallbackNormalizerHandle("bench"),
    registry: loadSampleRegistry("bench"),
    sink: delivery,
    log: silentLogger,
    env: {},
    batchSize: 200,
    maxJobsPerRun: 1_000_000,
  },
);
const pipeMs = performance.now() - t;
const batches = server.calls("/v1/ingest/jobs");
const sample = JSON.stringify(batches[0]?.body ?? {});
const ratio = sample.length / gzipSync(sample).length;
await server.close();
rmSync(dir, { recursive: true, force: true });

const fmt = (n: number): string => Math.round(n).toLocaleString("en-US");
console.log(`jobs                          ${fmt(N)}`);
console.log(`fallback normalizer           ${fmt((N / normMs) * 1000)} jobs/s (${(normMs / N * 1000).toFixed(1)} µs/job)`);
console.log(`pipeline → fake ingest API    ${fmt((N / pipeMs) * 1000)} jobs/s, ${(pipeMs / 1000).toFixed(2)} s total`);
console.log(`batches                       ${batches.length} × ≤200 jobs, gzip ratio ${ratio.toFixed(1)}× (${fmt(sample.length / 1024)} KB → ${fmt(gzipSync(sample).length / 1024)} KB per batch)`);
console.log(`result                        ${r.status}, ${r.counts.valid} valid, ${r.counts.duplicates} dup, ${r.counts.inserted} inserted, sweep ${r.sweeps.map((s) => s.outcome).join(",")}`);
