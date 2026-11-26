import type { Server } from "node:http";
import { createHttpClient, type Env, type HttpClient, type Logger } from "@easyjobs/contract/node";
import { IngestApiClient, WORKER_VERSION } from "./api-client";
import type { WorkerConfig } from "./config";
import { Delivery } from "./delivery";
import { allScrapers, discoverAll, type Discovery, type ScraperCache } from "./discovery";
import { loadRepoEnv } from "./env-file";
import { acquireLock, type WorkerLock } from "./lock";
import { runPipeline } from "./pipeline";
import { Scheduler, type RunOutcome, type RunRequest, type TriggerResult } from "./scheduler";
import { closeServer, createStatusServer, listen, type StatusProvider } from "./server";
import { Spool } from "./spool";
import { StateStore } from "./state";
import { buildTasks, checkEnabled, type TaskPlan } from "./tasks";
import { errorMessage, formatDuration } from "./util";

export interface WorkerOptions {
  config: WorkerConfig;
  log: Logger;
  env?: Env;
  /** Install SIGHUP (re-scan) and SIGINT/SIGTERM (graceful stop) handlers. */
  signals?: boolean;
  /** Serve GET /health, GET /status, POST /run/:source (default true). */
  serve?: boolean;
  /** Take the single-scheduler lock in the state dir (default true). */
  lock?: boolean;
  /** Override the shared scraper HTTP client (tests). */
  http?: HttpClient;
  now?: () => number;
  random?: () => number;
  /** Spool replay backoff bounds (tests use small values). */
  replayMinMs?: number;
  replayMaxMs?: number;
  apiRetryBaseMs?: number;
}

/** The always-on process: discovery → schedule → pipeline → API, with status server, re-scan and graceful shutdown. */
export class Worker implements StatusProvider {
  readonly startedAt = new Date();
  readonly config: WorkerConfig;
  readonly delivery: Delivery;
  private readonly log: Logger;
  private readonly env: Env;
  private readonly http: HttpClient;
  private readonly store: StateStore;
  private readonly spool: Spool;
  private discovery: Discovery | null = null;
  private plan: TaskPlan | null = null;
  private scheduler: Scheduler | null = null;
  private server: Server | null = null;
  private port: number | null = null;
  private rescanTimer: ReturnType<typeof setInterval> | null = null;
  private rescanning: Promise<void> | null = null;
  private lastRescanAt: Date | null = null;
  private readonly scraperCache: ScraperCache = new Map();
  private lock: WorkerLock | null = null;
  private stopping: Promise<void> | null = null;
  private readonly signalHandlers: [NodeJS.Signals, () => void][] = [];

  constructor(private readonly opts: WorkerOptions) {
    this.config = opts.config;
    this.log = opts.log;
    this.env = opts.env ?? process.env;
    this.http = opts.http ?? createHttpClient({ log: this.log.child("http") });
    this.store = StateStore.forDir(this.config.stateDir, this.log.child("state"));
    this.spool = new Spool(this.config.spoolDir, { log: this.log.child("spool"), maxBytes: this.config.spoolMaxBytes });
    const api = new IngestApiClient({
      baseUrl: this.config.apiUrl,
      key: this.config.ingestKey,
      timeoutMs: this.config.apiTimeoutMs,
      retries: this.config.apiRetries,
      retryBaseMs: opts.apiRetryBaseMs,
      gzip: this.config.gzip,
      log: this.log.child("api"),
    });
    this.delivery = new Delivery(api, this.spool, {
      log: this.log.child("ingest"),
      autoReplay: true,
      replayMinMs: opts.replayMinMs,
      replayMaxMs: opts.replayMaxMs,
    });
  }

  get listeningPort(): number | null {
    return this.port;
  }

  async start(): Promise<{ port: number | null; tasks: number }> {
    const cfg = this.config;
    try {
      if (this.opts.lock !== false) this.lock = acquireLock(cfg.stateDir);
      this.store.load();
      await this.spool.init();
      this.discovery = await discoverAll({
        repoRoot: cfg.repoRoot,
        importTimeoutMs: cfg.importTimeoutMs,
        log: this.log.child("discovery"),
        scraperCache: this.scraperCache,
      });
      this.plan = buildTasks({ ...this.discovery, config: cfg, env: this.env });
      this.scheduler = new Scheduler({
        config: cfg,
        store: this.store,
        runner: (req) => this.runTask(req),
        log: this.log.child("run"),
        now: this.opts.now,
        random: this.opts.random,
      });
      this.scheduler.setTasks(this.plan.tasks);
      this.logPlan();
      if (this.opts.serve !== false) {
        this.server = createStatusServer(this, { ingestKey: cfg.ingestKey, log: this.log.child("http") });
        this.port = await listen(this.server, cfg.port, cfg.host);
        this.log.info(`status server on http://${cfg.host}:${this.port} (GET /health, GET /status, POST /run/:source)`);
      }
      this.scheduler.start();
      this.delivery.kick();
      this.rescanTimer = setInterval(() => void this.rescan("periodic"), cfg.rescanMs);
      this.rescanTimer.unref?.();
      if (this.opts.signals) this.installSignals();
      return { port: this.port, tasks: this.scheduler.size };
    } catch (e) {
      await this.stop().catch(() => undefined);
      throw e;
    }
  }

  private logPlan(): void {
    const d = this.discovery;
    const plan = this.plan;
    if (!d || !plan) return;
    const enabled = plan.tasks.filter((t) => t.enabled);
    const scrapers = new Set(plan.tasks.map((t) => t.scraperId));
    this.log.info(
      `${enabled.length} task(s) scheduled from ${scrapers.size} scraper(s)` +
        `${plan.tasks.length > enabled.length ? `, ${plan.tasks.length - enabled.length} disabled` : ""}` +
        `${plan.demoScheduled ? " — demo scraper scheduled (no real scraper packages found)" : ""}`,
      { normalizer: d.normalizer.kind, registry: `${d.registry.kind} (${d.registry.companies.length} companies)`, api: this.config.apiUrl },
    );
    for (const note of plan.notes) this.log.warn(note);
    // Package problems were already logged when the package was imported; duplicates are only known here.
    for (const w of d.warnings) if (w.startsWith("duplicate scraper id")) this.log.warn(`discovery: ${w}`);
  }

  private runTask(req: RunRequest): Promise<RunOutcome> {
    const d = this.discovery;
    if (!d) throw new Error("worker not started");
    return runPipeline(
      {
        taskId: req.task.id,
        scraper: req.task.scraper,
        target: req.task.target,
        signal: req.signal,
        since: req.since,
        previousTargetCounts: req.previousTargetCounts,
        annotate: req.annotate,
      },
      {
        http: this.http,
        normalizer: d.normalizer,
        registry: d.registry,
        sink: this.delivery,
        log: this.log.child(req.task.id),
        env: this.env,
        batchSize: this.config.batchSize,
        maxJobsPerRun: this.config.maxJobsPerRun,
      },
    );
  }

  /** Re-discovers scrapers, normalizer and registry; new/removed tasks are applied without a restart. */
  rescan(reason: string): Promise<void> {
    if (this.rescanning) return this.rescanning;
    if (!this.scheduler || this.stopping) return Promise.resolve();
    const scheduler = this.scheduler;
    this.rescanning = (async () => {
      try {
        if (reason === "SIGHUP") {
          const { file, applied } = loadRepoEnv(this.config.repoRoot);
          if (file) this.log.info(`reloaded ${file} (${applied.length} keys)`);
        }
        const d = await discoverAll({
          repoRoot: this.config.repoRoot,
          importTimeoutMs: this.config.importTimeoutMs,
          log: this.log.child("discovery"),
          previous: this.discovery,
          scraperCache: this.scraperCache,
        });
        const previousWarnings = new Set(this.discovery?.warnings ?? []);
        for (const w of d.warnings) if (w.startsWith("duplicate scraper id") && !previousWarnings.has(w)) this.log.warn(`discovery: ${w}`);
        this.discovery = d;
        this.plan = buildTasks({ ...d, config: this.config, env: this.env });
        const diff = scheduler.setTasks(this.plan.tasks);
        this.lastRescanAt = new Date();
        const changed = diff.added.length + diff.removed.length + diff.updated.length > 0;
        if (changed || reason !== "periodic") {
          this.log.info(`re-scan (${reason}): ${scheduler.size} task(s), +${diff.added.length} added, −${diff.removed.length} removed, ~${diff.updated.length} changed`, {
            added: diff.added.slice(0, 20),
            removed: diff.removed.slice(0, 20),
          });
          for (const note of this.plan.notes) this.log.warn(note);
        }
      } catch (e) {
        this.log.error(`re-scan (${reason}) failed — keeping the previous task set`, { error: errorMessage(e) });
      } finally {
        this.rescanning = null;
      }
    })();
    return this.rescanning;
  }

  private installSignals(): void {
    const on = (sig: NodeJS.Signals, fn: () => void): void => {
      try {
        process.on(sig, fn);
        this.signalHandlers.push([sig, fn]);
      } catch {
        /* signal not supported on this platform */
      }
    };
    on("SIGHUP", () => void this.rescan("SIGHUP"));
    let signals = 0;
    const shutdown = (): void => {
      if (++signals > 1) {
        this.log.warn("second signal — exiting immediately");
        process.exit(1);
      }
      void this.stop().then(
        () => process.exit(0),
        () => process.exit(1),
      );
    };
    on("SIGINT", shutdown);
    on("SIGTERM", shutdown);
  }

  /** Graceful: stop scheduling, abort running tasks (their unsent batches are spooled), flush state. */
  stop(): Promise<void> {
    if (this.stopping) return this.stopping;
    this.stopping = (async () => {
      this.log.info("shutting down…");
      if (this.rescanTimer) clearInterval(this.rescanTimer);
      this.delivery.beginShutdown();
      await this.scheduler?.stop(this.config.shutdownGraceMs);
      await this.delivery.stop();
      if (this.server) await closeServer(this.server);
      this.store.flushSync();
      this.lock?.release();
      for (const [sig, fn] of this.signalHandlers) process.off(sig, fn);
      const pending = this.spool.pending;
      this.log.info(`stopped${pending > 0 ? ` — ${pending} request(s) left in the spool for the next start` : ""}`);
    })();
    return this.stopping;
  }

  /* ─────────────── StatusProvider ─────────────── */

  trigger(source: string, target: string | undefined): TriggerResult {
    if (!this.scheduler) return { unknown: true, queued: [], running: [], disabled: [] };
    return this.scheduler.trigger(source, target);
  }

  health(): Record<string, unknown> {
    const tasks = this.scheduler?.snapshot() ?? [];
    const d = this.delivery.stats();
    return {
      ok: this.scheduler !== null && !this.stopping,
      version: WORKER_VERSION,
      startedAt: this.startedAt.toISOString(),
      uptimeS: Math.round((Date.now() - this.startedAt.getTime()) / 1000),
      tasks: tasks.length,
      running: tasks.filter((t) => t.running).length,
      paused: tasks.filter((t) => t.paused).length,
      disabled: tasks.filter((t) => !t.enabled).length,
      api: { url: this.config.apiUrl, ...d.api },
      spool: d.spool,
      normalizer: this.discovery?.normalizer.kind ?? null,
      registry: this.discovery ? { kind: this.discovery.registry.kind, companies: this.discovery.registry.companies.length } : null,
    };
  }

  status(query: URLSearchParams): Record<string, unknown> {
    const d = this.discovery;
    let tasks = this.scheduler?.snapshot() ?? [];
    const source = query.get("source");
    const task = query.get("task");
    const state = query.get("status");
    if (source) tasks = tasks.filter((t) => t.source === source);
    if (task) tasks = tasks.filter((t) => t.id === task);
    if (state === "paused") tasks = tasks.filter((t) => t.paused);
    else if (state === "running") tasks = tasks.filter((t) => t.running);
    else if (state === "failing") tasks = tasks.filter((t) => t.consecutiveFailures > 0);
    else if (state) tasks = tasks.filter((t) => t.lastStatus === state);
    return {
      generatedAt: new Date().toISOString(),
      worker: {
        version: WORKER_VERSION,
        startedAt: this.startedAt.toISOString(),
        uptime: formatDuration(Date.now() - this.startedAt.getTime()),
        concurrency: this.config.concurrency,
        perScraperConcurrency: this.config.perScraperConcurrency,
        fullRefreshMinutes: this.config.fullRefreshMs / 60_000,
        lastRescanAt: this.lastRescanAt?.toISOString() ?? null,
      },
      discovery: d
        ? {
            at: d.at.toISOString(),
            normalizer: { kind: d.normalizer.kind, note: d.normalizer.note },
            registry: { kind: d.registry.kind, note: d.registry.note, companies: d.registry.companies.length },
            scrapers: allScrapers(d).map((s) => ({
              id: s.scraper.id,
              name: s.scraper.name,
              kind: s.scraper.kind,
              package: s.packageName,
              handlesAts: s.handlesAts,
              intervalMinutes: s.scraper.intervalMinutes,
              enabled: checkEnabled(s.scraper, this.env).enabled,
              scheduled: this.plan?.tasks.some((t) => t.scraperId === s.scraper.id) ?? false,
            })),
            packages: d.packages,
            warnings: d.warnings,
            notes: this.plan?.notes ?? [],
          }
        : null,
      delivery: this.delivery.stats(),
      tasks,
    };
  }
}
