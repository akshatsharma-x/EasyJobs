/**
 * Small in-memory TTL + LRU cache with single-flight (concurrent misses for one key share one computation)
 * and refresh-ahead: a hit on an entry older than half its TTL recomputes it in the background, so hot
 * keys are kept fresh without ever blocking a request on a miss.
 */
export class TtlCache<T> {
  private readonly map = new Map<string, { value: T; expires: number; created: number }>();
  private readonly inflight = new Map<string, Promise<T>>();
  hits = 0;
  misses = 0;

  refreshes = 0;

  constructor(
    private readonly maxEntries: number,
    private readonly ttlMs: number,
    private readonly refreshAhead = true,
  ) {}

  get enabled(): boolean {
    return this.ttlMs > 0 && this.maxEntries > 0;
  }

  private entry(key: string): { value: T; expires: number; created: number } | undefined {
    const e = this.map.get(key);
    if (!e) return undefined;
    if (e.expires <= Date.now()) {
      this.map.delete(key);
      return undefined;
    }
    // refresh LRU position
    this.map.delete(key);
    this.map.set(key, e);
    return e;
  }

  get(key: string): T | undefined {
    return this.entry(key)?.value;
  }

  set(key: string, value: T): void {
    if (!this.enabled) return;
    this.map.delete(key);
    const now = Date.now();
    this.map.set(key, { value, expires: now + this.ttlMs, created: now });
    while (this.map.size > this.maxEntries) {
      const oldest = this.map.keys().next().value;
      if (oldest === undefined) break;
      this.map.delete(oldest);
    }
  }

  /** Cached value or the (shared) result of compute(). Errors are not cached. */
  async getOrCompute(key: string, compute: () => Promise<T>): Promise<{ value: T; hit: boolean }> {
    const cached = this.entry(key);
    if (cached !== undefined) {
      this.hits++;
      if (this.refreshAhead && Date.now() - cached.created > this.ttlMs / 2 && !this.inflight.has(key)) {
        this.refreshes++;
        const p = compute()
          .then((v) => {
            this.set(key, v);
            return v;
          })
          .catch(() => cached.value)
          .finally(() => this.inflight.delete(key));
        this.inflight.set(key, p);
      }
      return { value: cached.value, hit: true };
    }
    this.misses++;
    const pending = this.inflight.get(key);
    if (pending) return { value: await pending, hit: false };
    const p = compute().then((v) => {
      this.set(key, v);
      return v;
    });
    this.inflight.set(key, p);
    try {
      return { value: await p, hit: false };
    } finally {
      this.inflight.delete(key);
    }
  }

  delete(key: string): void {
    this.map.delete(key);
  }

  clear(): void {
    this.map.clear();
  }

  get size(): number {
    return this.map.size;
  }
}
