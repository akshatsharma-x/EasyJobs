import { createHash } from "node:crypto";

/** Human-readable message for any thrown value, including one level of `cause` (e.g. fetch → ECONNREFUSED). */
export function errorMessage(e: unknown): string {
  if (e instanceof Error) {
    const cause = e.cause;
    const causeText =
      cause instanceof Error
        ? cause.message || (cause as NodeJS.ErrnoException).code || cause.name
        : cause && typeof cause === "object" && "code" in cause
          ? String((cause as { code: unknown }).code)
          : "";
    return causeText && !e.message.includes(causeText) ? `${e.message} (${causeText})` : e.message || e.name;
  }
  if (typeof e === "string") return e;
  try {
    return JSON.stringify(e) ?? String(e);
  } catch {
    return String(e);
  }
}

export function truncate(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, Math.max(0, max - 1))}…`;
}

export const sha1 = (s: string): string => createHash("sha1").update(s).digest("hex");

export const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

export function isOneOf<T extends string>(v: unknown, list: readonly T[]): v is T {
  return typeof v === "string" && (list as readonly string[]).includes(v);
}

/** Deterministic PRNG (mulberry32) — used for demo data and reproducible tests. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Serializes async critical sections. */
export class Mutex {
  private tail: Promise<unknown> = Promise.resolve();
  run<T>(fn: () => Promise<T> | T): Promise<T> {
    const result = this.tail.then(fn);
    this.tail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
}

/** Counting semaphore; `acquire()` resolves to a release function. */
export class Semaphore {
  private active = 0;
  private readonly waiters: (() => void)[] = [];
  constructor(private readonly max: number) {}
  async acquire(): Promise<() => void> {
    if (this.active < this.max) this.active++;
    else await new Promise<void>((resolve) => this.waiters.push(resolve));
    let released = false;
    return () => {
      if (released) return;
      released = true;
      const next = this.waiters.shift();
      if (next) next();
      else this.active--;
    };
  }
}

/** Counts string keys, e.g. validation problems → "title is required (3), …". */
export class Tally {
  private readonly counts = new Map<string, number>();
  add(key: string, n = 1): void {
    this.counts.set(key, (this.counts.get(key) ?? 0) + n);
  }
  get size(): number {
    return this.counts.size;
  }
  top(n: number): [string, number][] {
    return [...this.counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, n);
  }
  summary(n = 4): string {
    const top = this.top(n).map(([k, v]) => `${k} (${v})`);
    const rest = this.counts.size - top.length;
    return rest > 0 ? `${top.join(", ")}, +${rest} more` : top.join(", ");
  }
  toJSON(): Record<string, number> {
    return Object.fromEntries(this.top(this.counts.size));
  }
}

export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms)) return "∞";
  const abs = Math.abs(ms);
  if (abs < 1000) return `${Math.round(ms)}ms`;
  if (abs < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  if (abs < 3_600_000) return `${Math.round(ms / 60_000)}m`;
  if (abs < 86_400_000) {
    const h = ms / 3_600_000;
    return Number.isInteger(h) ? `${h}h` : `${h.toFixed(1)}h`;
  }
  const d = ms / 86_400_000;
  return Number.isInteger(d) ? `${d}d` : `${d.toFixed(1)}d`;
}

/** "12:45:03Z" for today, else "2026-11-27 12:45Z". */
export function formatClock(ms: number, now = Date.now()): string {
  const iso = new Date(ms).toISOString();
  return iso.slice(0, 10) === new Date(now).toISOString().slice(0, 10) ? `${iso.slice(11, 19)}Z` : `${iso.slice(0, 10)} ${iso.slice(11, 16)}Z`;
}

export const toIso = (ms: number): string => new Date(ms).toISOString();

export function parseTime(v: string | null | undefined): number | null {
  if (!v) return null;
  const t = Date.parse(v);
  return Number.isNaN(t) ? null : t;
}

export function isProcessAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === "EPERM";
  }
}

/** Timer-based sleep that can be cancelled; resolves (never rejects) so it is safe in shutdown paths. */
export function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve();
      return;
    }
    const timer = setTimeout(done, ms);
    function done(): void {
      clearTimeout(timer);
      signal?.removeEventListener("abort", done);
      resolve();
    }
    signal?.addEventListener("abort", done, { once: true });
  });
}
