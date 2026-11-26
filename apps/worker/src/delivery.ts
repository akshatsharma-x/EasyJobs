import type { IngestRequest, IngestResponse, RunReport, SweepRequest, SweepResponse } from "@easyjobs/contract";
import type { Logger } from "@easyjobs/contract/node";
import type { ApiResult, IngestApiClient } from "./api-client";
import type { DeliveryOutcome, JobSink } from "./sink";
import type { Spool, SpoolKind, SpoolStats } from "./spool";
import { Mutex, delay, errorMessage } from "./util";

export interface ApiHealth {
  reachable: boolean | null;
  lastOkAt: string | null;
  lastErrorAt: string | null;
  lastError: string | null;
}

export interface DeliveryStats {
  sent: number;
  spooled: number;
  replayed: number;
  dropped: number;
  deadLettered: number;
  spool: SpoolStats;
  api: ApiHealth;
}

export interface DeliveryOptions {
  log: Logger;
  /** Background replay when the spool is non-empty (`start`); `once`/`replay` call drain() instead. */
  autoReplay?: boolean;
  /** Dead-letter the head item after this many consecutive failures while GET /health is OK (default 5). */
  poisonAfter?: number;
  replayMinMs?: number;
  replayMaxMs?: number;
}

/**
 * API sink with an ordered on-disk spool:
 * - while the spool holds anything, new requests are appended behind it (strict FIFO, so a run's jobs,
 *   sweep and report are applied in order even across an outage);
 * - otherwise requests go straight to the API; if it is unavailable they are spooled;
 * - a single replayer drains the spool head-first with exponential backoff.
 */
export class Delivery implements JobSink {
  readonly kind = "api" as const;
  private readonly mutex = new Mutex();
  private replaying: Promise<void> | null = null;
  private stopped = false;
  private shuttingDown = false;
  private readonly stopController = new AbortController();
  private down = false;
  private head: { key: string; failures: number } | null = null;
  private counters = { sent: 0, spooled: 0, replayed: 0, dropped: 0, deadLettered: 0 };
  readonly health: ApiHealth = { reachable: null, lastOkAt: null, lastErrorAt: null, lastError: null };

  constructor(
    readonly api: IngestApiClient,
    readonly spool: Spool,
    private readonly opts: DeliveryOptions,
  ) {}

  stats(): DeliveryStats {
    return { ...this.counters, spool: this.spool.stats(), api: { ...this.health } };
  }

  known(source: string, target: string | null): Promise<Set<string> | null> {
    return this.api.known(source, target);
  }
  jobs(req: IngestRequest): Promise<DeliveryOutcome<IngestResponse>> {
    return this.deliver("jobs", req) as Promise<DeliveryOutcome<IngestResponse>>;
  }
  sweep(req: SweepRequest): Promise<DeliveryOutcome<SweepResponse>> {
    return this.deliver("sweep", req) as Promise<DeliveryOutcome<SweepResponse>>;
  }
  run(report: RunReport): Promise<DeliveryOutcome<unknown>> {
    return this.deliver("run", report);
  }

  private send(kind: SpoolKind, body: unknown): Promise<ApiResult<unknown>> {
    if (kind === "jobs") return this.api.postJobs(body as IngestRequest);
    if (kind === "sweep") return this.api.postSweep(body as SweepRequest);
    return this.api.postRun(body as RunReport);
  }

  private markOk(): void {
    this.health.reachable = true;
    this.health.lastOkAt = new Date().toISOString();
    if (this.down) {
      this.down = false;
      const pending = this.spool.pending;
      this.opts.log.info(`API reachable again${pending > 0 ? ` — replaying ${pending} spooled request(s)` : ""}`);
    }
  }

  private markDown(error: string): void {
    this.health.reachable = false;
    this.health.lastErrorAt = new Date().toISOString();
    this.health.lastError = error;
    if (!this.down) {
      this.down = true;
      const hint = /HTTP 40[13]\b/.test(error) ? " (check INGEST_API_KEY)" : /HTTP 404\b/.test(error) ? " (is API_URL pointing at apps/api?)" : "";
      this.opts.log.warn(`API unavailable${hint} — spooling ingest requests to ${this.spool.dir} until it is back`, { error });
    }
  }

  private async toSpool(kind: SpoolKind, body: unknown): Promise<DeliveryOutcome<unknown>> {
    try {
      await this.mutex.run(() => this.spool.append(kind, body));
    } catch (e) {
      return { status: "failed", error: `API unavailable and the spool write failed: ${errorMessage(e)}` };
    }
    this.counters.spooled++;
    this.kick();
    return { status: "spooled" };
  }

  private async deliver(kind: SpoolKind, body: unknown): Promise<DeliveryOutcome<unknown>> {
    if (this.shuttingDown) return this.toSpool(kind, body);
    let queued: boolean;
    try {
      queued = await this.mutex.run(async () => {
        if (this.spool.pending === 0) return false;
        await this.spool.append(kind, body);
        return true;
      });
    } catch (e) {
      return { status: "failed", error: `spool write failed: ${errorMessage(e)}` };
    }
    if (queued) {
      this.counters.spooled++;
      this.kick();
      return { status: "spooled" };
    }
    const r = await this.send(kind, body);
    if (r.ok) {
      this.counters.sent++;
      this.markOk();
      return { status: "sent", data: r.data };
    }
    if (r.kind === "unavailable") {
      this.markDown(r.error);
      return this.toSpool(kind, body);
    }
    this.counters.dropped++;
    return { status: "failed", error: r.error };
  }

  /** Starts the background replayer if there is anything to replay. */
  kick(): void {
    if (this.replaying || this.stopped || this.opts.autoReplay === false) return;
    if (this.spool.pending === 0) return;
    this.replaying = this.replayLoop()
      .catch((e: unknown) => this.opts.log.error("spool replay crashed", { error: errorMessage(e) }))
      .finally(() => {
        this.replaying = null;
        if (!this.stopped && this.spool.pending > 0) setTimeout(() => this.kick(), this.opts.replayMinMs ?? 2000).unref?.();
      });
  }

  private async replayOne(): Promise<"delivered" | "dropped" | "unavailable" | "empty"> {
    const item = await this.mutex.run(() => this.spool.peek());
    if (!item) return "empty";
    const r = await this.send(item.envelope.kind, item.envelope.body);
    if (!r.ok && r.kind === "unavailable") {
      this.markDown(r.error);
      // Poison = the same head item keeps failing (network error / 5xx) while the API itself is healthy, e.g. a payload
      // that always 500s. 401/403/404/429 are configuration or rate problems that affect every item: never dead-letter those.
      const candidate = r.status === null || r.status >= 500;
      const key = `${item.segment.name}#${item.index}`;
      this.head = !candidate ? null : this.head?.key === key ? { key, failures: this.head.failures + 1 } : { key, failures: 1 };
      if (this.head && this.head.failures >= (this.opts.poisonAfter ?? 5) && (await this.api.health())) {
        await this.mutex.run(() => this.spool.deadLetter(item, r.error));
        this.head = null;
        this.counters.deadLettered++;
        this.opts.log.error(`spool: a ${item.envelope.kind} request failed ${this.opts.poisonAfter ?? 5}× while the API is healthy — moved to ${this.spool.dir}/dead-letter.jsonl so the queue can move on`, { error: r.error, spooledAt: item.envelope.at });
        return "dropped";
      }
      return "unavailable";
    }
    this.head = null;
    await this.mutex.run(() => this.spool.commit(item));
    if (r.ok) {
      this.counters.replayed++;
      this.markOk();
      return "delivered";
    }
    this.counters.dropped++;
    this.opts.log.error(`spool: dropped a ${item.envelope.kind} request the API rejected`, { error: r.error, spooledAt: item.envelope.at });
    return "dropped";
  }

  private async replayLoop(): Promise<void> {
    const min = this.opts.replayMinMs ?? 2000;
    const max = this.opts.replayMaxMs ?? 120_000;
    let wait = min;
    while (!this.stopped) {
      const r = await this.replayOne();
      if (r === "empty") return;
      if (r !== "unavailable") {
        wait = min;
        continue;
      }
      await delay(wait, this.stopController.signal);
      wait = Math.min(max, wait * 2);
      await this.mutex.run(() => this.spool.adoptOrphans()).catch(() => 0);
    }
  }

  /** Foreground drain (`once`, `replay`): stops when empty or after `maxFailures` consecutive unavailable attempts. */
  async drain(maxFailures = 1): Promise<{ replayed: number; dropped: number; remaining: number }> {
    if (this.replaying) await this.replaying;
    let replayed = 0;
    let dropped = 0;
    let failures = 0;
    while (!this.stopped) {
      const r = await this.replayOne();
      if (r === "empty") break;
      if (r === "delivered") replayed++;
      if (r === "dropped") dropped++;
      if (r !== "unavailable") {
        failures = 0;
        continue;
      }
      if (++failures >= maxFailures) break;
      await delay(Math.min(30_000, 1000 * 2 ** failures), this.stopController.signal);
    }
    return { replayed, dropped, remaining: this.spool.pending };
  }

  /** From now on everything is spooled immediately (fast, no network) — used while shutting down. */
  beginShutdown(): void {
    this.shuttingDown = true;
  }

  async stop(graceMs = 2000): Promise<void> {
    this.stopped = true;
    this.stopController.abort();
    if (this.replaying) await Promise.race([this.replaying, delay(graceMs)]);
  }
}
