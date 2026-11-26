/**
 * EasyJobs worker CLI.
 *   tsx src/cli.ts start
 *   tsx src/cli.ts once --source <id>[,<id>…] [--target <slug>] [--limit n] [--dry-run] [--all] [--since <iso>] [--max-targets n] [--priority 1|2|3] [--force]
 *   tsx src/cli.ts list [--json]
 *   tsx src/cli.ts replay
 */
import { parseArgs } from "node:util";
import { createLogger } from "@easyjobs/contract/node";
import { IngestApiClient } from "./api-client";
import { loadConfig, type Priority } from "./config";
import { Delivery } from "./delivery";
import { loadRepoEnv } from "./env-file";
import { listCommand } from "./list";
import { filterLogger } from "./log";
import { LockError } from "./lock";
import { UsageError, runOnce } from "./once";
import { findRepoRoot } from "./paths";
import { Spool } from "./spool";
import { errorMessage } from "./util";
import { Worker } from "./worker";

const HELP = `EasyJobs worker

Usage (from the repo root):
  pnpm --filter @easyjobs/worker start                       run the scheduler (+ status server on WORKER_PORT)
  pnpm --filter @easyjobs/worker once --source <id> [opts]   run one task (or several) once
  pnpm --filter @easyjobs/worker run list [--json]           discovered scrapers, targets and next runs
  pnpm --filter @easyjobs/worker replay                      deliver spooled requests now

once options:
  --source, -s <id[,id]>   scraper id(s) (repeatable); "demo" is always available
  --all                    every discovered, enabled scraper
  --target, -t <slug>      one registry target (ATS scrapers)
  --limit, -n <n|all>      stop after n raw jobs (a limited run never sweeps)
  --dry-run                write normalized JobInputs to apps/worker/out/<source>.jsonl instead of POSTing
  --since <iso>            incremental run (ctx.since); never sweeps
  --max-targets <n>        ATS scrapers: at most n targets (priority order)
  --priority <1|2|3>       ATS scrapers: only targets with this priority
  --force                  run even if isEnabled(env) returns false
`;

function parseIntArg(name: string, v: string | undefined, min: number): number | undefined {
  if (v === undefined || v === "all") return undefined;
  const n = Number(v);
  if (!Number.isInteger(n) || n < min) throw new UsageError(`--${name} must be an integer ≥ ${min} (got "${v}")`);
  return n;
}

async function main(argv: string[]): Promise<number | null> {
  loadRepoEnv(process.env.WORKER_REPO_ROOT ?? findRepoRoot());
  const [command = "help", ...rest] = argv;
  const cfg = loadConfig(process.env);
  const log = createLogger("worker");

  let unexpected = 0;
  process.on("unhandledRejection", (e) => {
    unexpected++;
    log.error("unhandled promise rejection (worker keeps running)", { error: errorMessage(e), count: unexpected });
  });
  process.on("uncaughtException", (e) => {
    unexpected++;
    log.error("uncaught exception (worker keeps running)", { error: errorMessage(e), stack: e.stack?.split("\n").slice(0, 4).join(" | "), count: unexpected });
  });

  switch (command) {
    case "start": {
      parseArgs({ args: rest, options: {}, strict: true });
      const worker = new Worker({ config: cfg, log, signals: true });
      await worker.start();
      return null; // keep running until SIGINT/SIGTERM
    }
    case "once": {
      const { values } = parseArgs({
        args: rest,
        strict: true,
        options: {
          source: { type: "string", short: "s", multiple: true },
          all: { type: "boolean" },
          target: { type: "string", short: "t" },
          limit: { type: "string", short: "n" },
          "dry-run": { type: "boolean" },
          since: { type: "string" },
          "max-targets": { type: "string" },
          priority: { type: "string" },
          force: { type: "boolean" },
        },
      });
      const since = values.since ? new Date(values.since) : undefined;
      if (since && Number.isNaN(since.getTime())) throw new UsageError(`--since must be an ISO-8601 date (got "${values.since}")`);
      const priority = parseIntArg("priority", values.priority, 1);
      if (priority !== undefined && priority > 3) throw new UsageError("--priority must be 1, 2 or 3");
      const result = await runOnce(
        {
          sources: (values.source ?? []).flatMap((s) => s.split(",")).map((s) => s.trim()).filter(Boolean),
          all: values.all ?? false,
          target: values.target,
          limit: parseIntArg("limit", values.limit, 1),
          dryRun: values["dry-run"] ?? false,
          since,
          maxTargets: parseIntArg("max-targets", values["max-targets"], 1),
          priority: priority as Priority | undefined,
          force: values.force ?? false,
        },
        cfg,
        log,
      );
      if (result.results.length === 0) log.warn("once: nothing ran");
      return result.exitCode;
    }
    case "list": {
      const { values } = parseArgs({ args: rest, strict: true, options: { json: { type: "boolean" } } });
      const quiet = filterLogger(log, "warn");
      process.stdout.write(`${await listCommand(cfg, quiet, process.env, { json: values.json })}\n`);
      return 0;
    }
    case "replay": {
      parseArgs({ args: rest, options: {}, strict: true });
      const spool = new Spool(cfg.spoolDir, { log: log.child("spool") });
      await spool.init();
      if (spool.pending === 0) {
        log.info(`spool is empty (${cfg.spoolDir})`);
        return 0;
      }
      const api = new IngestApiClient({ baseUrl: cfg.apiUrl, key: cfg.ingestKey, timeoutMs: cfg.apiTimeoutMs, retries: cfg.apiRetries, gzip: cfg.gzip, log: log.child("api") });
      const delivery = new Delivery(api, spool, { log: log.child("ingest"), autoReplay: false });
      const r = await delivery.drain(3);
      log.info(`replay: ${r.replayed} delivered, ${r.dropped} dropped (rejected by the API), ${r.remaining} remaining`);
      return r.remaining > 0 ? 1 : 0;
    }
    case "help":
    case "--help":
    case "-h":
      process.stdout.write(HELP);
      return 0;
    default:
      process.stderr.write(`unknown command "${command}"\n\n${HELP}`);
      return 2;
  }
}

main(process.argv.slice(2)).then(
  (code) => {
    if (code !== null) process.exit(code);
  },
  (e: unknown) => {
    if (e instanceof UsageError || e instanceof LockError || (e instanceof TypeError && "code" in e && String(e.code).startsWith("ERR_PARSE_ARGS"))) {
      process.stderr.write(`error: ${e.message}\n`);
      process.exit(2);
    }
    const code = (e as NodeJS.ErrnoException).code;
    if (code === "EADDRINUSE") {
      process.stderr.write(`error: port in use — another worker running? Set WORKER_PORT. (${errorMessage(e)})\n`);
      process.exit(2);
    }
    process.stderr.write(`fatal: ${e instanceof Error ? (e.stack ?? e.message) : String(e)}\n`);
    process.exit(1);
  },
);
