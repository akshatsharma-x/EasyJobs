import type { Logger } from "@easyjobs/contract/node";

/** Per-minute request summary (count, errors, p50/p95/max, cache hit rate) logged at info. */
export class RequestMetrics {
  private samples: number[] = [];
  private errors = 0;
  private hits = 0;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly log: Logger,
    intervalMs = 60_000,
  ) {
    if (intervalMs > 0) {
      this.timer = setInterval(() => this.flush(), intervalMs);
      this.timer.unref();
    }
  }

  record(ms: number, status: number, cacheHit: boolean): void {
    this.samples.push(ms);
    if (status >= 500) this.errors++;
    if (cacheHit) this.hits++;
    if (this.samples.length > 200_000) this.samples.splice(0, 100_000);
  }

  snapshot(): { count: number; errors: number; p50: number; p95: number; max: number; cacheHitRate: number } {
    const s = [...this.samples].sort((a, b) => a - b);
    const pct = (p: number): number => (s.length ? s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]! : 0);
    return {
      count: s.length,
      errors: this.errors,
      p50: Math.round(pct(50) * 10) / 10,
      p95: Math.round(pct(95) * 10) / 10,
      max: Math.round((s[s.length - 1] ?? 0) * 10) / 10,
      cacheHitRate: s.length ? Math.round((this.hits / s.length) * 100) / 100 : 0,
    };
  }

  flush(): void {
    if (this.samples.length === 0) return;
    const snap = this.snapshot();
    this.log.info(`requests/min: ${snap.count} · p50 ${snap.p50}ms · p95 ${snap.p95}ms · max ${snap.max}ms · errors ${snap.errors} · cache hits ${Math.round(snap.cacheHitRate * 100)}%`);
    this.samples = [];
    this.errors = 0;
    this.hits = 0;
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}
