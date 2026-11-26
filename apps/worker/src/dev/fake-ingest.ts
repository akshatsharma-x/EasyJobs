/**
 * Tiny in-memory stand-in for the API's ingest routes (§0.5) — used by the tests and by `pnpm --filter @easyjobs/worker fake-api`.
 * Implements x-ingest-key auth, gzip bodies, per-item validation, upsert by fingerprint, sweeps, known ids, run reports,
 * plus failure injection (failWith / failNext) and a body-size limit to exercise 413 splitting.
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { gunzipSync } from "node:zlib";
import { API_ROUTES, validateJobInput, type ApiError, type JobInput, type RunReport, type SweepRequest } from "@easyjobs/contract";
import { isObject } from "../util";

export interface RecordedRequest {
  method: string;
  path: string;
  query: Record<string, string>;
  gzip: boolean;
  status: number;
  body: unknown;
  at: number;
}

export interface FakeJobSource {
  source: string;
  sourceJobId: string;
  target: string | null;
}

export interface FakeJob {
  job: JobInput;
  status: "open" | "closed";
  sources: Map<string, FakeJobSource>;
  firstSeenAt: string;
  lastSeenAt: string;
}

export interface FakeIngestOptions {
  port?: number;
  host?: string;
  key?: string;
  /** false → answer gzip bodies with 415 (to test the worker's fallback). */
  acceptGzip?: boolean;
  maxBodyBytes?: number;
  log?: (line: string) => void;
}

export interface FakeIngestStats {
  jobs: number;
  open: number;
  closed: number;
  requests: number;
  runs: number;
  sweeps: number;
  bySource: Record<string, { open: number; closed: number }>;
}

export interface FakeIngestServer {
  readonly url: string;
  readonly port: number;
  readonly requests: RecordedRequest[];
  readonly jobs: Map<string, FakeJob>;
  readonly runs: RunReport[];
  readonly sweeps: (SweepRequest & { closed: number })[];
  /** When set, every /v1/ingest/* request answers with this HTTP status (simulated outage). */
  failWith: number | null;
  /** The next n /v1/ingest/* requests (optionally only those to `path`) answer with `status`. */
  failNext(n: number, status?: number, path?: string): void;
  /** Requests to a route, in arrival order (successful ones only unless `all`). */
  calls(path: string, all?: boolean): RecordedRequest[];
  stats(): FakeIngestStats;
  close(): Promise<void>;
}

const sourceKey = (source: string, id: string): string => `${source}\u0000${id}`;

function send(res: ServerResponse, status: number, body: unknown): void {
  const json = JSON.stringify(body);
  res.writeHead(status, { "content-type": "application/json", "content-length": Buffer.byteLength(json) });
  res.end(json);
}

const err = (code: string, message: string): ApiError => ({ error: { code, message } });

async function readBody(req: IncomingMessage, max: number): Promise<Buffer | "too_large"> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const b = chunk as Buffer;
    size += b.length;
    if (size <= max) chunks.push(b); // past the limit: keep draining so the client reads a clean 413, not a reset
  }
  return size > max ? "too_large" : Buffer.concat(chunks);
}

export async function startFakeIngest(opts: FakeIngestOptions = {}): Promise<FakeIngestServer> {
  const key = opts.key ?? "dev-ingest-key";
  const maxBody = opts.maxBodyBytes ?? 50 * 1024 * 1024;
  const requests: RecordedRequest[] = [];
  const jobs = new Map<string, FakeJob>();
  const runs: RunReport[] = [];
  const sweeps: (SweepRequest & { closed: number })[] = [];
  let failQueue: { status: number; path?: string }[] = [];
  const log = opts.log ?? (() => undefined);

  const upsert = (list: unknown[]): { inserted: number; updated: number; merged: number; rejected: { index: number; error: string }[] } => {
    let inserted = 0;
    let updated = 0;
    let merged = 0;
    const rejected: { index: number; error: string }[] = [];
    const now = new Date().toISOString();
    list.forEach((item, index) => {
      const problems = validateJobInput(item as Partial<JobInput>);
      if (problems.length > 0) {
        rejected.push({ index, error: problems.join("; ") });
        return;
      }
      const job = item as JobInput;
      const sk = sourceKey(job.source, job.sourceJobId);
      const existing = jobs.get(job.fingerprint);
      const src: FakeJobSource = { source: job.source, sourceJobId: job.sourceJobId, target: job.target };
      if (!existing) {
        jobs.set(job.fingerprint, { job, status: "open", sources: new Map([[sk, src]]), firstSeenAt: now, lastSeenAt: now });
        inserted++;
        return;
      }
      if (existing.sources.has(sk)) updated++;
      else merged++;
      existing.sources.set(sk, src);
      // §0.4-ish: a non-null value is never overwritten with null.
      const next: Record<string, unknown> = { ...existing.job };
      for (const [k, v] of Object.entries(job)) if (v !== null && v !== undefined) next[k] = v;
      existing.job = next as unknown as JobInput;
      existing.status = "open";
      existing.lastSeenAt = now;
    });
    return { inserted, updated, merged, rejected };
  };

  const sweep = (req: SweepRequest): number => {
    const seen = new Set(req.seenSourceJobIds);
    let closed = 0;
    for (const fj of jobs.values()) {
      for (const [sk, s] of fj.sources) {
        if (s.source === req.source && s.target === req.target && !seen.has(s.sourceJobId)) fj.sources.delete(sk);
      }
      if (fj.sources.size === 0 && fj.status === "open") {
        fj.status = "closed";
        closed++;
      }
    }
    return closed;
  };

  const handle = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const url = new URL(req.url ?? "/", "http://fake.local");
    const path = url.pathname;
    const record: RecordedRequest = {
      method: req.method ?? "GET",
      path,
      query: Object.fromEntries(url.searchParams),
      gzip: req.headers["content-encoding"] === "gzip",
      status: 0,
      body: null,
      at: Date.now(),
    };
    const reply = (status: number, body: unknown): void => {
      record.status = status;
      requests.push(record);
      send(res, status, body);
    };
    if (path === API_ROUTES.health) return reply(200, { ok: true, db: "memory", version: "fake-ingest" });
    if (path === "/_fake/stats") return reply(200, server.stats());
    if (!path.startsWith("/v1/ingest/")) return reply(404, err("not_found", path));
    if (req.headers["x-ingest-key"] !== key) {
      req.resume();
      return reply(401, err("unauthorized", "missing or invalid x-ingest-key"));
    }
    const queued = failQueue.findIndex((f) => !f.path || f.path === path);
    const injected = server.failWith ?? (queued >= 0 ? failQueue.splice(queued, 1)[0]?.status : undefined);
    if (injected !== undefined && injected !== null) {
      req.resume();
      return reply(injected, err("injected", `simulated HTTP ${injected}`));
    }
    let body: unknown = null;
    if (req.method === "POST") {
      const raw = await readBody(req, maxBody);
      if (raw === "too_large") return reply(413, err("payload_too_large", `body over ${maxBody} bytes`));
      let buf = raw;
      if (record.gzip) {
        if (opts.acceptGzip === false) return reply(415, err("unsupported_media_type", "gzip not accepted"));
        try {
          buf = gunzipSync(raw);
        } catch {
          return reply(400, err("bad_request", "invalid gzip body"));
        }
      }
      try {
        body = JSON.parse(buf.toString("utf8"));
      } catch {
        return reply(400, err("bad_request", "invalid JSON body"));
      }
      record.body = body;
    }
    if (req.method === "GET" && path === API_ROUTES.ingestKnown) {
      const source = url.searchParams.get("source") ?? "";
      const target = url.searchParams.get("target");
      const ids: string[] = [];
      for (const fj of jobs.values()) for (const s of fj.sources.values()) if (s.source === source && (!target || s.target === target)) ids.push(s.sourceJobId);
      return reply(200, { ids });
    }
    if (req.method === "POST" && path === API_ROUTES.ingestJobs) {
      if (!isObject(body) || typeof body.source !== "string" || typeof body.runId !== "string" || !Array.isArray(body.jobs)) {
        return reply(400, err("bad_request", "expected IngestRequest { source, runId, jobs[] }"));
      }
      if (body.jobs.length > 500) return reply(400, err("bad_request", "at most 500 jobs per request"));
      const r = upsert(body.jobs);
      log(`POST jobs   ${body.source} ${body.jobs.length} → +${r.inserted} new, ${r.updated} upd, ${r.merged} merged, ${r.rejected.length} rejected${record.gzip ? " (gzip)" : ""}`);
      return reply(200, r);
    }
    if (req.method === "POST" && path === API_ROUTES.ingestSweep) {
      if (!isObject(body) || typeof body.source !== "string" || typeof body.target !== "string" || !Array.isArray(body.seenSourceJobIds)) {
        return reply(400, err("bad_request", "expected SweepRequest"));
      }
      const sreq = body as unknown as SweepRequest;
      const closed = sweep(sreq);
      sweeps.push({ ...sreq, closed });
      log(`POST sweep  ${sreq.source}/${sreq.target} seen ${sreq.seenSourceJobIds.length} → ${closed} closed`);
      return reply(200, { closed });
    }
    if (req.method === "POST" && path === API_ROUTES.ingestRuns) {
      if (!isObject(body) || typeof body.runId !== "string") return reply(400, err("bad_request", "expected RunReport"));
      const report = body as unknown as RunReport;
      runs.push(report);
      log(`POST run    ${report.source}${report.target ? `/${report.target}` : ""} ${report.status} emitted=${report.emitted} invalid=${report.invalid}`);
      return reply(200, { ok: true });
    }
    return reply(404, err("not_found", `${req.method} ${path}`));
  };

  const http: Server = createServer((req, res) => {
    handle(req, res).catch((e: unknown) => send(res, 500, err("internal", String(e))));
  });
  await new Promise<void>((resolve, reject) => {
    http.once("error", reject);
    http.listen(opts.port ?? 0, opts.host ?? "127.0.0.1", () => resolve());
  });
  const addr = http.address();
  const port = typeof addr === "object" && addr ? addr.port : (opts.port ?? 0);

  const server: FakeIngestServer = {
    url: `http://${opts.host ?? "127.0.0.1"}:${port}`,
    port,
    requests,
    jobs,
    runs,
    sweeps,
    failWith: null,
    failNext(n: number, status = 503, path?: string): void {
      failQueue = [...failQueue, ...Array.from({ length: n }, () => ({ status, path }))];
    },
    calls(path: string, all = false): RecordedRequest[] {
      return requests.filter((r) => r.path === path && (all || (r.status >= 200 && r.status < 300)));
    },
    stats(): FakeIngestStats {
      const bySource: Record<string, { open: number; closed: number }> = {};
      let open = 0;
      for (const fj of jobs.values()) {
        if (fj.status === "open") open++;
        const s = (bySource[fj.job.source] ??= { open: 0, closed: 0 });
        s[fj.status]++;
      }
      return { jobs: jobs.size, open, closed: jobs.size - open, requests: requests.length, runs: runs.length, sweeps: sweeps.length, bySource };
    },
    close(): Promise<void> {
      return new Promise((resolve) => {
        http.close(() => resolve());
        http.closeAllConnections();
      });
    },
  };
  return server;
}
