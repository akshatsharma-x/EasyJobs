/**
 * In-process "job created" events emitted after an ingest transaction commits. The API fans them out to
 * SSE subscribers (and, on Postgres, to other instances via LISTEN/NOTIFY).
 */
import type { JobListItem } from "@easyjobs/contract";
import type { MatchableJob } from "./search/filters";

export interface JobCreatedEvent {
  item: JobListItem;
  /** Everything the stream's server-side filter needs (not all of it is in JobListItem). */
  match: MatchableJob;
}

export type JobEventListener = (events: readonly JobCreatedEvent[]) => void;

export class JobEvents {
  private readonly listeners = new Set<JobEventListener>();

  on(listener: JobEventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(events: readonly JobCreatedEvent[]): void {
    if (events.length === 0) return;
    for (const l of this.listeners) {
      try {
        l(events);
      } catch (e) {
        console.error("[db] job event listener failed:", e);
      }
    }
  }

  get size(): number {
    return this.listeners.size;
  }
}
