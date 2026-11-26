import type { CompanyTarget } from "@easyjobs/contract";
import { createHttpClient, type Env, type Logger } from "@easyjobs/contract/node";
import { ShutdownAbort, TaskTimeout } from "./abort";
import { IngestApiClient } from "./api-client";
import type { Priority, WorkerConfig } from "./config";
import { Delivery } from "./delivery";
import { allScrapers, discoverAll, findScraper, type DiscoveredScraper, type Discovery } from "./discovery";
import { runPipeline, type PipelineResult } from "./pipeline";
import { DryRunSink, type JobSink } from "./sink";
import { Spool } from "./spool";
import { checkEnabled, targetsFor, taskId } from "./tasks";
import { Semaphore, formatDuration } from "./util";

export class UsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UsageError";
  }
}

export interface OnceOptions {
  /** Scraper ids; ignored when `all`. */
  sources: string[];
  all: boolean;
  target?: string;
  limit?: number;
  dryRun: boolean;
  /** Pass ctx.since (an incremental run; never sweeps). */
  since?: Date;
  /** ATS scrapers: run at most this many targets (by priority, then slug). */
  maxTargets?: number;
  priority?: Priority;
  /** Run even when isEnabled(env) is false. */
  force: boolean;
}

export interface OnceResult {
  results: PipelineResult[];
  exitCode: number;
  outputs: { source: string; jobsFile: string; reportFile: string; jobs: number }[];
  spoolRemaining: number;
}

interface OnceTask {
  id: string;
  ds: DiscoveredScraper;
  target: CompanyTarget | null;
}

export function resolveOnceTasks(d: Discovery, opts: OnceOptions, env: Env, log: Logger): OnceTask[] {
  let selected: DiscoveredScraper[];
  if (opts.all) selected = d.scrapers.length > 0 ? d.scrapers : [d.demo];
  else {
    if (opts.sources.length === 0) throw new UsageError("once: pass --source <id> (repeatable / comma-separated) or --all");
    selected = opts.sources.map((id) => {
      const ds = findScraper(d, id);
      if (!ds) throw new UsageError(`unknown source "${id}". Available: ${allScrapers(d).map((s) => s.scraper.id).join(", ")}`);
      return ds;
    });
  }
  const tasks: OnceTask[] = [];
  for (const ds of selected) {
    const id = ds.scraper.id;
    const en = checkEnabled(ds.scraper, env);
    if (!en.enabled && !opts.force) {
      log.warn(`${id}: disabled (${en.reason}) — skipping; pass --force to run it anyway`);
      continue;
    }
    if (!ds.handlesAts) {
      if (opts.target) log.warn(`${id} is not an ATS scraper — --target ignored`);
      tasks.push({ id: taskId(id), ds, target: null });
      continue;
    }
    let targets = targetsFor(ds, d.registry);
    if (opts.target) {
      targets = targets.filter((t) => t.slug === opts.target);
      if (targets.length === 0) {
        const known = d.registry.get(opts.target);
        throw new UsageError(
          known
            ? `target "${opts.target}" uses ats "${known.ats}", which ${id} does not handle (${ds.handlesAts.join(", ")})`
            : `unknown target "${opts.target}" in the ${d.registry.kind} registry (${d.registry.companies.length} companies)`,
        );
      }
    }
    if (opts.priority) targets = targets.filter((t) => t.priority === opts.priority);
    targets.sort((a, b) => a.priority - b.priority || a.slug.localeCompare(b.slug));
    if (opts.maxTargets !== undefined) targets = targets.slice(0, opts.maxTargets);
    if (targets.length === 0) log.warn(`${id}: no registry targets to run`);
    for (const target of targets) tasks.push({ id: taskId(id, target.slug), ds, target });
  }
  return tasks;
}

/** `worker once …`: runs tasks through the full pipeline once (or to out/*.jsonl with --dry-run). State is not touched. */
export async function runOnce(opts: OnceOptions, cfg: WorkerConfig, log: Logger, env: Env = process.env): Promise<OnceResult> {
  const discovery = await discoverAll({ repoRoot: cfg.repoRoot, importTimeoutMs: cfg.importTimeoutMs, log: log.child("discovery") });
  const tasks = resolveOnceTasks(discovery, opts, env, log);
  if (tasks.length === 0) return { results: [], exitCode: 2, outputs: [], spoolRemaining: 0 };
  log.info(
    `once: ${tasks.length} task(s)${opts.dryRun ? " (dry run → " + cfg.outDir + ")" : ` → ${cfg.apiUrl}`}` +
      `${opts.limit !== undefined ? `, limit ${opts.limit}` : ""}${opts.since ? `, since ${opts.since.toISOString()}` : ""}`,
    { normalizer: discovery.normalizer.kind, registry: discovery.registry.kind },
  );

  let sink: JobSink;
  let delivery: Delivery | null = null;
  if (opts.dryRun) sink = new DryRunSink(cfg.outDir);
  else {
    const spool = new Spool(cfg.spoolDir, { log: log.child("spool"), maxBytes: cfg.spoolMaxBytes });
    await spool.init();
    const api = new IngestApiClient({ baseUrl: cfg.apiUrl, key: cfg.ingestKey, timeoutMs: cfg.apiTimeoutMs, retries: cfg.apiRetries, gzip: cfg.gzip, log: log.child("api") });
    delivery = new Delivery(api, spool, { log: log.child("ingest"), autoReplay: false });
    if (spool.pending > 0) {
      const r = await delivery.drain(1);
      log.info(`spool: replayed ${r.replayed} earlier request(s)${r.remaining > 0 ? `, ${r.remaining} still pending (API unavailable)` : ""}`);
    }
    sink = delivery;
  }

  const interrupt = new AbortController();
  const onSignal = (): void => interrupt.abort(new ShutdownAbort("interrupted"));
  process.once("SIGINT", onSignal);
  process.once("SIGTERM", onSignal);
  const http = createHttpClient({ log: log.child("http") });
  const global = new Semaphore(cfg.concurrency);
  const perScraper = new Map<string, Semaphore>();
  try {
    const results = await Promise.all(
      tasks.map(async (t) => {
        let sem = perScraper.get(t.ds.scraper.id);
        if (!sem) perScraper.set(t.ds.scraper.id, (sem = new Semaphore(cfg.perScraperConcurrency)));
        const releaseScraper = await sem.acquire();
        const releaseGlobal = await global.acquire();
        const taskAbort = new AbortController();
        const timer = setTimeout(() => taskAbort.abort(new TaskTimeout(`timed out after ${formatDuration(cfg.taskTimeoutMs)}`)), cfg.taskTimeoutMs);
        try {
          const r = await runPipeline(
            { taskId: t.id, scraper: t.ds.scraper, target: t.target, signal: AbortSignal.any([interrupt.signal, taskAbort.signal]), since: opts.since, limit: opts.limit },
            {
              http,
              normalizer: discovery.normalizer,
              registry: discovery.registry,
              sink,
              log: log.child(t.id),
              env,
              batchSize: cfg.batchSize,
              maxJobsPerRun: cfg.maxJobsPerRun,
            },
          );
          const line = r.summary ?? `${r.status} ${t.id}`;
          const more = r.status !== "ok" && r.errors.length > 1 ? { moreErrors: r.errors.slice(1, 4) } : undefined;
          if (r.status === "ok") log.info(line);
          else if (r.status === "partial") log.warn(line, more);
          else log.error(line, more);
          return r;
        } finally {
          clearTimeout(timer);
          releaseGlobal();
          releaseScraper();
        }
      }),
    );
    let spoolRemaining = 0;
    if (delivery) {
      if (delivery.spool.pending > 0) await delivery.drain(1);
      spoolRemaining = delivery.spool.pending;
      if (spoolRemaining > 0) log.warn(`${spoolRemaining} request(s) are spooled in ${cfg.spoolDir} — \`worker start\` or \`worker replay\` will deliver them`);
    }
    const outputs = sink instanceof DryRunSink ? sink.outputs() : [];
    for (const o of outputs) log.info(`dry run: ${o.jobs} JobInput(s) → ${o.jobsFile}`);
    return { results, exitCode: results.some((r) => r.status === "error") ? 1 : 0, outputs, spoolRemaining };
  } finally {
    process.off("SIGINT", onSignal);
    process.off("SIGTERM", onSignal);
  }
}
