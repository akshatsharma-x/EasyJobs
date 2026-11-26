/**
 * SSE hub for GET /v1/stream: `event: job` for newly created jobs that match the client's filters
 * (server-side, same logic as search), `event: stats` every SSE_STATS_MS, `: ping` every SSE_HEARTBEAT_MS.
 */
import type { SearchQuery, StreamEvent } from "@easyjobs/contract";
import type { Logger } from "@easyjobs/contract/node";
import { matchesFilters, type JobCreatedEvent } from "@easyjobs/db";
import { HttpError } from "./http";

export type StreamStats = Extract<StreamEvent, { type: "stats" }>["stats"];

interface Client {
  id: number;
  ip: string;
  filters: SearchQuery;
  write(chunk: string): void;
  close(): void;
}

export interface StreamHubOptions {
  heartbeatMs: number;
  statsMs: number;
  maxPerIp: number;
  maxClients: number;
  getStats(): Promise<StreamStats>;
  log: Logger;
}

const encoder = new TextEncoder();
/** A client whose unread backlog exceeds this is disconnected (slow consumer). */
const MAX_BACKLOG_BYTES = 1_000_000;

export function sseFrame(event: StreamEvent): string {
  return `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}

export class StreamHub {
  private readonly clients = new Map<number, Client>();
  private nextId = 1;
  private timers: ReturnType<typeof setInterval>[] = [];
  sent = 0;

  constructor(private readonly opts: StreamHubOptions) {}

  start(): void {
    if (this.timers.length > 0) return;
    const ping = setInterval(() => this.broadcast(": ping\n\n"), this.opts.heartbeatMs);
    const stats = setInterval(() => {
      if (this.clients.size === 0) return;
      this.opts
        .getStats()
        .then((s) => this.broadcast(sseFrame({ type: "stats", stats: s })))
        .catch((e: unknown) => this.opts.log.warn("stream stats failed", { error: String(e) }));
    }, this.opts.statsMs);
    ping.unref();
    stats.unref();
    this.timers = [ping, stats];
  }

  get size(): number {
    return this.clients.size;
  }

  /** Open a stream for these filters (q / sort / page are ignored). */
  connect(filters: SearchQuery, ip: string, signal?: AbortSignal): Response {
    if (this.clients.size >= this.opts.maxClients) throw new HttpError(503, "too_many_streams", "Too many open streams, try again later");
    let perIp = 0;
    for (const c of this.clients.values()) if (c.ip === ip) perIp++;
    if (perIp >= this.opts.maxPerIp) throw new HttpError(429, "too_many_streams", `At most ${this.opts.maxPerIp} open streams per client`);

    const id = this.nextId++;
    const streamFilters: SearchQuery = { ...filters, q: undefined, page: 1 };
    const stream = new ReadableStream<Uint8Array>(
      {
        start: (controller) => {
          const client: Client = {
            id,
            ip,
            filters: streamFilters,
            write: (chunk) => {
              try {
                if ((controller.desiredSize ?? 0) < -MAX_BACKLOG_BYTES) {
                  this.opts.log.warn("stream client too slow, closing", { id, ip });
                  this.remove(id);
                  controller.close();
                  return;
                }
                controller.enqueue(encoder.encode(chunk));
              } catch {
                this.remove(id);
              }
            },
            close: () => {
              try {
                controller.close();
              } catch {
                /* already closed */
              }
            },
          };
          this.clients.set(id, client);
          client.write("retry: 5000\n: connected\n\n");
          this.opts
            .getStats()
            .then((s) => this.clients.get(id)?.write(sseFrame({ type: "stats", stats: s })))
            .catch(() => {});
        },
        cancel: () => {
          this.remove(id);
        },
      },
      new ByteLengthQueuingStrategy({ highWaterMark: 64 * 1024 }),
    );
    signal?.addEventListener("abort", () => this.disconnect(id), { once: true });
    return new Response(stream, {
      status: 200,
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        "X-Accel-Buffering": "no",
      },
    });
  }

  /** Fan out new jobs to every client whose filters match. */
  publishJobs(events: readonly JobCreatedEvent[]): void {
    if (this.clients.size === 0 || events.length === 0) return;
    const now = new Date();
    const frames = events.map((e) => ({ e, frame: sseFrame({ type: "job", job: e.item }) }));
    for (const c of [...this.clients.values()]) {
      for (const { e, frame } of frames) {
        if (matchesFilters(e.match, c.filters, now)) {
          c.write(frame);
          this.sent++;
        }
      }
    }
  }

  private broadcast(chunk: string): void {
    for (const c of [...this.clients.values()]) c.write(chunk);
  }

  private remove(id: number): void {
    this.clients.delete(id);
  }

  private disconnect(id: number): void {
    const c = this.clients.get(id);
    this.clients.delete(id);
    c?.close();
  }

  /** End every stream and stop timers (graceful shutdown). */
  close(): void {
    for (const t of this.timers) clearInterval(t);
    this.timers = [];
    for (const c of [...this.clients.values()]) {
      c.write(": server shutting down\n\n");
      c.close();
    }
    this.clients.clear();
  }
}
