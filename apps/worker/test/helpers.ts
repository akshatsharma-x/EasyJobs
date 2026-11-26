import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { AtsType, CompanyTarget, RawJob } from "@easyjobs/contract";
import { createHttpClient, type HttpClient, type LogMeta, type Logger, type ScrapeContext, type Scraper } from "@easyjobs/contract/node";
import { loadSampleRegistry, type RegistryHandle } from "../src/discovery/registry";
import { fallbackNormalizerHandle } from "../src/discovery/normalizer";
import type { PipelineContext } from "../src/pipeline";
import type { JobSink } from "../src/sink";

export interface LogLine {
  level: "debug" | "info" | "warn" | "error";
  scope: string;
  msg: string;
  meta?: LogMeta;
}

/** Logger that records lines (assert on warnings without console noise). */
export function memoryLogger(scope = "test", lines: LogLine[] = []): Logger & { lines: LogLine[] } {
  const at =
    (level: LogLine["level"]) =>
    (msg: string, meta?: LogMeta): void => {
      lines.push({ level, scope, msg, meta });
    };
  return { lines, debug: at("debug"), info: at("info"), warn: at("warn"), error: at("error"), child: (s: string) => memoryLogger(`${scope}:${s}`, lines) };
}

const cleanups: string[] = [];
export function tempDir(prefix = "p05-"): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  cleanups.push(dir);
  return dir;
}
export function cleanupTempDirs(): void {
  for (const d of cleanups.splice(0)) rmSync(d, { recursive: true, force: true });
}

export function writeFiles(root: string, files: Record<string, string>): void {
  for (const [rel, content] of Object.entries(files)) {
    const file = join(root, rel);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, content);
  }
}

export function rawJob(n: number | string, overrides: Partial<RawJob> = {}): RawJob {
  return {
    source: "fake",
    sourceKind: "ats",
    sourceJobId: `job-${n}`,
    sourceUrl: `https://jobs.acme.test/postings/${n}`,
    target: null,
    applyUrl: `https://jobs.acme.test/postings/${n}`,
    title: `Software Engineer ${n}`,
    company: "Acme",
    locations: ["Bengaluru, Karnataka, India"],
    descriptionHtml: "<p>Build things with <b>TypeScript</b>.</p>",
    postedAt: "2026-11-01T00:00:00.000Z",
    ...overrides,
  };
}

export interface FakeScraperOptions {
  id?: string;
  name?: string;
  kind?: Scraper["kind"];
  intervalMinutes?: number;
  handlesAts?: AtsType[];
  isEnabled?: Scraper["isEnabled"];
  /** Jobs to emit (may depend on the context: target, since, isKnown…). */
  jobs?: (ctx: ScrapeContext) => RawJob[];
  /** Throw after emitting this many jobs. */
  failAfter?: number;
  error?: string;
  /** Wait this long before each job (ms, real or fake timers). */
  delayMs?: number;
  onScrape?: (ctx: ScrapeContext) => void;
}

export function fakeScraper(o: FakeScraperOptions = {}): Scraper {
  const id = o.id ?? "fake";
  return {
    id,
    name: o.name ?? `Fake ${id}`,
    kind: o.kind ?? "ats",
    intervalMinutes: o.intervalMinutes ?? 30,
    ...(o.handlesAts ? { handlesAts: o.handlesAts } : {}),
    ...(o.isEnabled ? { isEnabled: o.isEnabled } : {}),
    async *scrape(ctx: ScrapeContext): AsyncIterable<RawJob> {
      o.onScrape?.(ctx);
      const jobs = o.jobs ? o.jobs(ctx) : [rawJob(1, { source: id })];
      let n = 0;
      for (const job of jobs) {
        if (o.failAfter !== undefined && n >= o.failAfter) throw new Error(o.error ?? "boom");
        if (o.delayMs) await new Promise((r) => setTimeout(r, o.delayMs));
        yield job;
        n++;
      }
      if (o.failAfter !== undefined && n >= o.failAfter) throw new Error(o.error ?? "boom");
    },
  };
}

export const sampleRegistry = (): RegistryHandle => loadSampleRegistry("test sample");

export function company(slug: string, ats: AtsType = "greenhouse", priority: 1 | 2 | 3 = 1): CompanyTarget {
  return {
    slug,
    name: slug[0]?.toUpperCase() + slug.slice(1),
    domain: `${slug}.test`,
    ats,
    token: slug,
    careersUrl: `https://${slug}.test/careers`,
    tags: ["startup"],
    hq: null,
    indiaPresence: true,
    priority,
  };
}

/** Polite client is irrelevant offline; a client with no robots/delay keeps tests fast if a scraper ever uses it. */
export const testHttp = (): HttpClient => createHttpClient({ robots: false, perHostDelayMs: 0, retries: 0 });

export function pipelineContext(sink: JobSink, overrides: Partial<PipelineContext> = {}): PipelineContext {
  return {
    http: testHttp(),
    normalizer: fallbackNormalizerHandle("test"),
    registry: sampleRegistry(),
    sink,
    log: memoryLogger(),
    env: {},
    batchSize: 200,
    maxJobsPerRun: 20_000,
    ...overrides,
  };
}

/** Polls until `fn` returns truthy (real timers). */
export async function waitFor<T>(fn: () => T | Promise<T>, timeoutMs = 5000, stepMs = 10): Promise<T> {
  const start = Date.now();
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() - start > timeoutMs) throw new Error(`waitFor timed out after ${timeoutMs} ms`);
    await new Promise((r) => setTimeout(r, stepMs));
  }
}
