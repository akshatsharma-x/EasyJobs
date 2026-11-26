/**
 * In-process memo of ids with a TTL (and a size cap, oldest evicted first). Used by the site factory to
 * remember jobs whose detail page was fetched and then dropped (closed, outside India): they are never
 * emitted, so ctx.isKnown() never learns them, and without the memo every run would re-fetch them first
 * and could starve the per-run detail budget.
 */
export class SkipMemo {
  private readonly entries = new Map<string, number>();
  constructor(private readonly ttlMs = 24 * 3_600_000, private readonly max = 100_000) {}

  has(key: string, now = Date.now()): boolean {
    const at = this.entries.get(key);
    if (at === undefined) return false;
    if (now - at > this.ttlMs) {
      this.entries.delete(key);
      return false;
    }
    return true;
  }

  add(key: string, now = Date.now()): void {
    if (this.entries.size >= this.max) {
      const oldest = this.entries.keys().next().value;
      if (oldest !== undefined) this.entries.delete(oldest);
    }
    this.entries.set(key, now);
  }

  clear(): void {
    this.entries.clear();
  }

  get size(): number {
    return this.entries.size;
  }
}
