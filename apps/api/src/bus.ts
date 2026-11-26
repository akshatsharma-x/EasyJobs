/**
 * Event bus: repository "job created" events → local SSE hub, and (Postgres) NOTIFY so other API
 * instances LISTENing on the same database fan the jobs out to their own subscribers.
 */
import { randomUUID } from "node:crypto";
import type { Logger } from "@easyjobs/contract/node";
import type { JobCreatedEvent, Repository } from "@easyjobs/db";
import type { StreamHub } from "./stream";

export const NOTIFY_CHANNEL = "easyjobs_jobs";
/** Ids of jobs changed in any way (updates, closures) — other instances refresh their in-memory facet index. */
export const CHANGED_CHANNEL = "easyjobs_changed";
/** Postgres NOTIFY payloads must stay under 8000 bytes. */
const MAX_PAYLOAD = 7000;

interface Payload {
  o: string;
  ids: string[];
}

export function chunkIds(origin: string, ids: readonly string[]): string[] {
  const out: string[] = [];
  let cur: string[] = [];
  const size = (xs: string[]): number => JSON.stringify({ o: origin, ids: xs } satisfies Payload).length;
  for (const id of ids) {
    if (cur.length > 0 && size([...cur, id]) > MAX_PAYLOAD) {
      out.push(JSON.stringify({ o: origin, ids: cur } satisfies Payload));
      cur = [];
    }
    cur.push(id);
  }
  if (cur.length > 0) out.push(JSON.stringify({ o: origin, ids: cur } satisfies Payload));
  return out;
}

export async function startEventBus(repo: Repository, hub: StreamHub, log: Logger): Promise<() => Promise<void>> {
  const origin = randomUUID();
  const pubsub = repo.db.pubsub;
  const off = repo.events.on((events: readonly JobCreatedEvent[]) => {
    hub.publishJobs(events);
    if (!pubsub) return;
    for (const payload of chunkIds(origin, events.map((e) => e.item.id))) {
      pubsub.notify(NOTIFY_CHANNEL, payload).catch((e: unknown) => log.warn("NOTIFY failed", { error: String(e) }));
    }
  });
  const offChanged = repo.onJobsChanged((ids) => {
    if (!pubsub) return;
    for (const payload of chunkIds(origin, ids)) {
      pubsub.notify(CHANGED_CHANNEL, payload).catch((e: unknown) => log.warn("NOTIFY failed", { error: String(e) }));
    }
  });
  let unlisten: (() => Promise<void>) | null = null;
  let unlistenChanged: (() => Promise<void>) | null = null;
  if (pubsub) {
    unlistenChanged = await pubsub.listen(CHANGED_CHANNEL, (raw) => {
      try {
        const msg = JSON.parse(raw) as Payload;
        if (msg.o !== origin && Array.isArray(msg.ids)) repo.jobsChanged(msg.ids);
      } catch {
        /* ignore malformed */
      }
    });
    unlisten = await pubsub.listen(NOTIFY_CHANNEL, (raw) => {
      let msg: Payload;
      try {
        msg = JSON.parse(raw) as Payload;
      } catch {
        return;
      }
      if (msg.o === origin || !Array.isArray(msg.ids)) return;
      repo
        .getListItems(msg.ids)
        .then((events) => hub.publishJobs(events))
        .catch((e: unknown) => log.warn("LISTEN fan-out failed", { error: String(e) }));
    });
    log.info(`LISTEN ${NOTIFY_CHANNEL}, ${CHANGED_CHANNEL} (multi-instance SSE fan-out + facet index sync)`);
  }
  return async () => {
    off();
    offChanged();
    await unlisten?.().catch(() => {});
    await unlistenChanged?.().catch(() => {});
  };
}
