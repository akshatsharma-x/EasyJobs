import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ShutdownAbort, TaskTimeout } from "../src/abort";
import { Scheduler, type RunOutcome, type RunRequest, type SchedulerConfig, type TaskRunner } from "../src/scheduler";
import { StateStore } from "../src/state";
import type { TaskDef } from "../src/tasks";
import { company, fakeScraper, memoryLogger } from "./helpers";

const MIN = 60_000;
const HOUR = 60 * MIN;
const T0 = Date.parse("2026-11-26T00:00:00.000Z");

const CFG: SchedulerConfig = {
  concurrency: 6,
  perScraperConcurrency: 2,
  taskTimeoutMs: 30 * MIN,
  jitterRatio: 0.1,
  backoffBaseMs: 2 * MIN,
  breakerThreshold: 5,
  breakerPauseMs: 6 * HOUR,
  initialSpreadMs: 60 * MIN,
  fullRefreshMs: 60 * MIN,
  sinceOverlapMs: 10 * MIN,
};

function def(id: string, o: Partial<TaskDef> = {}): TaskDef {
  const scraperId = o.scraperId ?? id.split(":")[0] ?? id;
  const slug = id.includes(":") ? id.split(":")[1] : undefined;
  return {
    id,
    scraperId,
    scraper: fakeScraper({ id: scraperId }),
    packageName: "test",
    target: slug ? company(slug, "greenhouse", o.priority ?? 1) : null,
    priority: null,
    intervalMs: 15 * MIN,
    enabled: true,
    disabledReason: null,
    ...o,
  };
}

interface Call {
  id: string;
  at: number;
  req: RunRequest;
}

/** Runner whose behaviour per call is scripted; each run takes `durationMs` of (fake) time. */
function scripted(script: (req: RunRequest, n: number) => Partial<RunOutcome> = () => ({}), durationMs = 1000) {
  const calls: Call[] = [];
  let active = 0;
  let maxActive = 0;
  const activeByScraper = new Map<string, number>();
  let maxPerScraper = 0;
  const runner: TaskRunner = async (req) => {
    const n = calls.filter((c) => c.id === req.task.id).length;
    calls.push({ id: req.task.id, at: Date.now(), req });
    active++;
    maxActive = Math.max(maxActive, active);
    const s = (activeByScraper.get(req.task.scraperId) ?? 0) + 1;
    activeByScraper.set(req.task.scraperId, s);
    maxPerScraper = Math.max(maxPerScraper, s);
    const startedAt = new Date();
    await new Promise<void>((resolve) => {
      const t = setTimeout(resolve, durationMs);
      req.signal.addEventListener("abort", () => {
        clearTimeout(t);
        resolve();
      });
    });
    active--;
    activeByScraper.set(req.task.scraperId, (activeByScraper.get(req.task.scraperId) ?? 1) - 1);
    const aborted = req.signal.aborted ? (req.signal.reason instanceof TaskTimeout ? "timeout" : "shutdown") : null;
    const base: RunOutcome = {
      status: aborted ? "error" : "ok",
      failure: aborted === "timeout",
      aborted,
      startedAt,
      finishedAt: new Date(),
      emitted: 1,
      invalid: 0,
      errors: aborted ? [String(req.signal.reason)] : [],
      full: req.full,
      targetCounts: null,
    };
    return { ...base, ...script(req, n) };
  };
  return { runner, calls, stats: () => ({ maxActive, maxPerScraper }) };
}

const fail = (msg = "HTTP 500"): Partial<RunOutcome> => ({ status: "error", failure: true, emitted: 0, errors: [msg] });

function makeScheduler(runner: TaskRunner, o: { config?: Partial<SchedulerConfig>; store?: StateStore; random?: () => number } = {}) {
  const log = memoryLogger();
  const store = o.store ?? new StateStore(null);
  const scheduler = new Scheduler({ config: { ...CFG, ...o.config }, store, runner, log, random: o.random ?? (() => 0.5) });
  return { scheduler, store, log };
}

describe("scheduler", () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: T0 });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("orders due tasks: manual first, then due time aged by priority (p1 < p2 < p3)", async () => {
    const { runner, calls } = scripted(() => ({}), 10 * MIN);
    const { scheduler } = makeScheduler(runner, { config: { concurrency: 1, initialSpreadMs: 0 } });
    scheduler.setTasks([
      def("ats:c3", { priority: 3, intervalMs: 24 * HOUR }),
      def("ats2:a1", { priority: 1, intervalMs: 24 * HOUR }),
      def("ats3:b2", { priority: 2, intervalMs: 24 * HOUR }),
      def("feed", { intervalMs: 24 * HOUR }),
    ]);
    scheduler.trigger("ats", "c3"); // manual trigger jumps the queue
    scheduler.start();
    await vi.advanceTimersByTimeAsync(45 * MIN);
    expect(calls.map((c) => c.id)).toEqual(["ats:c3", "ats2:a1", "feed", "ats3:b2"]);
    await scheduler.stop(0);
  });

  it("ages priorities so a long-overdue p3 runs before a just-due p1 (no starvation)", async () => {
    const { runner, calls } = scripted(() => ({}), 30 * MIN);
    const store = new StateStore(null);
    const at = (ms: number): string => new Date(T0 + ms).toISOString();
    store.ensure("blocker").nextRunAt = at(30_000);
    store.ensure("p3:old").nextRunAt = at(1 * MIN);
    store.ensure("p1:new").nextRunAt = at(25 * MIN);
    const { scheduler } = makeScheduler(runner, { store, config: { concurrency: 1, taskTimeoutMs: 2 * HOUR } });
    scheduler.setTasks([
      def("blocker", { intervalMs: 24 * HOUR }),
      def("p3:old", { priority: 3, intervalMs: 24 * HOUR }),
      def("p1:new", { priority: 1, intervalMs: 24 * HOUR }),
    ]);
    scheduler.start();
    await vi.advanceTimersByTimeAsync(95 * MIN);
    expect(calls.map((c) => c.id)).toEqual(["blocker", "p3:old", "p1:new"]);
    await scheduler.stop(0);
  });

  it("spreads first runs evenly across the window with jitter, then keeps the cadence ± jitter", async () => {
    const seq = [0.0, 0.99, 0.5, 0.25, 0.75, 0.1, 0.9, 0.3, 0.6, 0.8];
    let i = 0;
    const random = (): number => seq[i++ % seq.length] ?? 0.5;
    const { runner, calls } = scripted(() => ({}), 1000);
    const { scheduler, store } = makeScheduler(runner, { random });
    const defs = Array.from({ length: 10 }, (_, k) => def(`gh:t${k}`, { priority: 1, intervalMs: 15 * MIN }));
    scheduler.setTasks(defs);
    const slot = (15 * MIN) / 10;
    const firsts = defs.map((d) => Date.parse(store.get(d.id)?.nextRunAt ?? "") - T0);
    firsts.forEach((offset, k) => {
      expect(offset).toBeGreaterThanOrEqual(k * slot);
      expect(offset).toBeLessThan((k + CFG.jitterRatio) * slot + 1);
    });
    expect(new Set(firsts).size).toBe(10); // no two tasks at the same instant
    scheduler.start();
    await vi.advanceTimersByTimeAsync(15 * MIN);
    // every task ran within the 15-minute window, each first run inside its own slot
    expect(new Set(calls.map((c) => c.id)).size).toBe(10);
    defs.forEach((d, k) => {
      const first = calls.find((c) => c.id === d.id)!.at - T0;
      expect(first).toBeGreaterThanOrEqual(k * slot);
      expect(first).toBeLessThan((k + 1) * slot);
    });
    // next runs: startedAt + interval × [0.9, 1.1]
    for (const d of defs) {
      const st = store.get(d.id)!;
      const gap = Date.parse(st.nextRunAt!) - Date.parse(st.lastRunAt!);
      expect(gap).toBeGreaterThanOrEqual(0.9 * 15 * MIN - 1);
      expect(gap).toBeLessThanOrEqual(1.1 * 15 * MIN + 1);
    }
    await scheduler.stop(0);
  });

  it("caps the first-run spread of daily tasks at WORKER_INITIAL_SPREAD_MINUTES and re-spreads overdue tasks after a restart", () => {
    const store = new StateStore(null);
    store.ensure("daily:a").nextRunAt = new Date(T0 - 5 * HOUR).toISOString(); // overdue (worker was down)
    store.ensure("daily:b").nextRunAt = new Date(T0 + 2 * HOUR).toISOString(); // planned, keep
    const { scheduler } = makeScheduler(scripted().runner, { store });
    scheduler.setTasks([
      def("daily:a", { priority: 3, intervalMs: 24 * HOUR }),
      def("daily:b", { priority: 3, intervalMs: 24 * HOUR }),
      def("daily:c", { priority: 3, intervalMs: 24 * HOUR }),
      def("daily:d", { priority: 3, intervalMs: 24 * HOUR }),
    ]);
    const next = (id: string): number => Date.parse(store.get(id)!.nextRunAt!) - T0;
    expect(next("daily:b")).toBe(2 * HOUR);
    // a (overdue, goes first), c, d spread over min(24 h, 60 min) = 20-minute slots
    expect(next("daily:a")).toBeLessThan(20 * MIN * 0.1 + 1);
    expect(next("daily:c")).toBeGreaterThanOrEqual(20 * MIN);
    expect(next("daily:d")).toBeGreaterThanOrEqual(40 * MIN);
    expect(Math.max(next("daily:a"), next("daily:c"), next("daily:d"))).toBeLessThan(60 * MIN);
  });

  it("staggers feed scrapers over ≤ 5 min (different hosts) but spreads ATS targets over the full window", () => {
    const store = new StateStore(null);
    const { scheduler } = makeScheduler(scripted().runner, { store });
    const feeds = Array.from({ length: 11 }, (_, k) => def(`feed-${k}`, { intervalMs: 60 * MIN }));
    const ats = Array.from({ length: 11 }, (_, k) => def(`gh:t${k}`, { priority: 2, intervalMs: 60 * MIN }));
    scheduler.setTasks([...feeds, ...ats]);
    const offsets = (defs: TaskDef[]): number[] => defs.map((d) => Date.parse(store.get(d.id)!.nextRunAt!) - T0);
    expect(Math.max(...offsets(feeds))).toBeLessThan(5 * MIN);
    expect(Math.max(...offsets(ats))).toBeGreaterThan(50 * MIN);
    expect(Math.min(...offsets(ats))).toBeLessThan(MIN);
  });

  it("backs off exponentially on consecutive failures (2, 4, 8, 16 min)", async () => {
    const { runner, calls } = scripted(() => fail(), 1000);
    const { scheduler, store } = makeScheduler(runner, { config: { initialSpreadMs: 0 } });
    scheduler.setTasks([def("flaky", { intervalMs: 60 * MIN })]);
    scheduler.start();
    await vi.advanceTimersByTimeAsync(40 * MIN);
    const starts = calls.map((c) => c.at - T0);
    const gaps = starts.slice(1).map((s, k) => s - (starts[k] ?? 0) - 1000);
    expect(gaps).toEqual([2 * MIN, 4 * MIN, 8 * MIN, 16 * MIN]);
    expect(store.get("flaky")?.consecutiveFailures).toBe(5);
    await scheduler.stop(0);
  });

  it("opens the circuit after 5 consecutive failures, pauses 6 h, half-opens, and closes on success", async () => {
    let healthy = false;
    const { runner, calls } = scripted(() => (healthy ? {} : fail("HTTP 503 from source")), 1000);
    const { scheduler, store, log } = makeScheduler(runner, { config: { initialSpreadMs: 0 } });
    scheduler.setTasks([def("src", { intervalMs: 15 * MIN })]);
    scheduler.start();
    await vi.advanceTimersByTimeAsync(40 * MIN);
    expect(calls).toHaveLength(5);
    const st = store.get("src")!;
    expect(st.pausedUntil).not.toBeNull();
    const pausedAt = Date.parse(st.lastFinishedAt!);
    expect(Date.parse(st.pausedUntil!) - pausedAt).toBe(6 * HOUR);
    expect(scheduler.snapshot()[0]?.paused).toBe(true);
    expect(log.lines.some((l) => l.level === "error" && /circuit breaker OPEN for src/.test(l.msg))).toBe(true);
    // the tripping run told the pipeline to report it
    expect(calls[4]?.req.annotate({ failure: true })[0]).toMatch(/circuit breaker opened after 5 consecutive failures/);
    expect(calls[3]?.req.annotate({ failure: true })).toEqual([]);

    const until = Date.parse(st.pausedUntil!);
    await vi.advanceTimersByTimeAsync(until - Date.now() - MIN); // still paused 1 minute before the end
    expect(calls).toHaveLength(5);
    await vi.advanceTimersByTimeAsync(2 * MIN); // half-open trial fails → paused again
    expect(calls).toHaveLength(6);
    expect(store.get("src")?.consecutiveFailures).toBe(6);
    expect(Date.parse(store.get("src")!.pausedUntil!)).toBeGreaterThan(Date.now() + 5 * HOUR);

    healthy = true;
    await vi.advanceTimersByTimeAsync(6 * HOUR + MIN); // next trial succeeds → closed
    expect(calls).toHaveLength(7);
    expect(store.get("src")?.consecutiveFailures).toBe(0);
    expect(store.get("src")?.pausedUntil).toBeNull();
    expect(scheduler.snapshot()[0]?.paused).toBe(false);
    await scheduler.stop(0);
  });

  it("manual trigger runs a paused task immediately and a success closes the circuit", async () => {
    const store = new StateStore(null);
    Object.assign(store.ensure("src"), { consecutiveFailures: 5, pausedUntil: new Date(T0 + 5 * HOUR).toISOString() });
    const { runner, calls } = scripted(() => ({}), 1000);
    const { scheduler } = makeScheduler(runner, { store });
    scheduler.setTasks([def("src")]);
    scheduler.start();
    await vi.advanceTimersByTimeAsync(MIN);
    expect(calls).toHaveLength(0);
    expect(scheduler.trigger("src").queued).toEqual(["src"]);
    expect(scheduler.trigger("nope").unknown).toBe(true);
    await vi.advanceTimersByTimeAsync(2000);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.req.manual).toBe(true);
    expect(calls[0]?.req.full).toBe(true);
    expect(store.get("src")?.pausedUntil).toBeNull();
    await scheduler.stop(0);
  });

  it("enforces global and per-scraper concurrency (1–2 per scraper)", async () => {
    const { runner, calls, stats } = scripted(() => ({}), 5 * MIN);
    const { scheduler } = makeScheduler(runner, { config: { concurrency: 3, perScraperConcurrency: 2, initialSpreadMs: 0 } });
    scheduler.setTasks([
      ...Array.from({ length: 6 }, (_, k) => def(`gh:t${k}`, { priority: 1, intervalMs: 24 * HOUR })),
      def("feed-a", { intervalMs: 24 * HOUR }),
      def("feed-b", { intervalMs: 24 * HOUR }),
    ]);
    scheduler.start();
    await vi.advanceTimersByTimeAsync(14 * MIN);
    expect(calls).toHaveLength(7); // 6 gh targets at 2 per scraper need three 5-minute rounds
    await vi.advanceTimersByTimeAsync(2 * MIN);
    expect(calls).toHaveLength(8);
    expect(stats().maxActive).toBe(3);
    expect(stats().maxPerScraper).toBe(2);
    await scheduler.stop(0);
  });

  it("aborts a task that exceeds the per-task timeout and counts it as a failure", async () => {
    const { runner, calls } = scripted(() => ({}), 10 * HOUR);
    const { scheduler, store } = makeScheduler(runner, { config: { taskTimeoutMs: 5 * MIN, initialSpreadMs: 0 } });
    scheduler.setTasks([def("slow", { intervalMs: 60 * MIN })]);
    scheduler.start();
    await vi.advanceTimersByTimeAsync(5 * MIN + 1000);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.req.signal.aborted).toBe(true);
    expect(calls[0]?.req.signal.reason).toBeInstanceOf(TaskTimeout);
    expect(store.get("slow")?.consecutiveFailures).toBe(1);
    expect(store.get("slow")?.lastStatus).toBe("error");
    await scheduler.stop(0);
  });

  it("stop() aborts running tasks with ShutdownAbort, does not count a failure, and starts nothing new", async () => {
    const { runner, calls } = scripted(() => ({}), 10 * MIN);
    const { scheduler, store } = makeScheduler(runner, { config: { initialSpreadMs: 0 } });
    scheduler.setTasks([def("a"), def("b")]);
    scheduler.start();
    await vi.advanceTimersByTimeAsync(1000);
    expect(scheduler.running).toBe(2);
    await scheduler.stop(5000);
    expect(calls.every((c) => c.req.signal.reason instanceof ShutdownAbort)).toBe(true);
    expect(store.get("a")?.consecutiveFailures).toBe(0);
    expect(scheduler.running).toBe(0);
    await vi.advanceTimersByTimeAsync(2 * HOUR);
    expect(calls).toHaveLength(2);
  });

  it("restores persisted schedule state: a restart does not re-hammer sources", async () => {
    const store = new StateStore(null);
    const first = makeScheduler(scripted().runner, { store, config: { initialSpreadMs: 0 } });
    first.scheduler.setTasks([def("feed", { intervalMs: 60 * MIN })]);
    first.scheduler.start();
    await vi.advanceTimersByTimeAsync(2 * MIN);
    await first.scheduler.stop(0);
    const planned = store.get("feed")!.nextRunAt!;
    expect(Date.parse(planned) - T0).toBeGreaterThan(50 * MIN);

    const { runner, calls } = scripted();
    const second = makeScheduler(runner, { store, config: { initialSpreadMs: 0 } });
    second.scheduler.setTasks([def("feed", { intervalMs: 60 * MIN })]);
    second.scheduler.start();
    await vi.advanceTimersByTimeAsync(30 * MIN);
    expect(calls).toHaveLength(0); // still waiting for the persisted next run
    await vi.advanceTimersByTimeAsync(40 * MIN);
    expect(calls).toHaveLength(1);
    await second.scheduler.stop(0);
  });

  it("runs incrementally (ctx.since = last success − overlap) between full refreshes", async () => {
    const { runner, calls } = scripted(() => ({}), 1000);
    const { scheduler } = makeScheduler(runner, { config: { initialSpreadMs: 0, jitterRatio: 0 } });
    scheduler.setTasks([def("feed", { intervalMs: 15 * MIN })]);
    scheduler.start();
    await vi.advanceTimersByTimeAsync(76 * MIN);
    const modes = calls.map((c) => (c.req.full ? "full" : "inc"));
    expect(modes).toEqual(["full", "inc", "inc", "inc", "full", "inc"]);
    const second = calls[1]!.req;
    expect(second.since?.getTime()).toBe(calls[0]!.at - 10 * MIN);
    await scheduler.stop(0);
  });

  it("does not run a task again before the retryAt its scraper reported, and keeps reported stats", async () => {
    const { runner, calls } = scripted((_req, n) => (n === 0 ? { status: "partial", retryAt: T0 + 3 * HOUR, stats: { siteTotal: 9 } } : {}), 1000);
    const { scheduler, store } = makeScheduler(runner, { config: { initialSpreadMs: 0 } });
    scheduler.setTasks([def("portal", { intervalMs: 15 * MIN })]);
    scheduler.start();
    await vi.advanceTimersByTimeAsync(3 * HOUR - MIN);
    expect(calls).toHaveLength(1);
    expect(store.get("portal")?.consecutiveFailures).toBe(0);
    expect(scheduler.snapshot()[0]?.stats).toEqual({ siteTotal: 9 });
    await vi.advanceTimersByTimeAsync(2 * MIN);
    expect(calls).toHaveLength(2);
    await scheduler.stop(0);
  });

  it("applies task-set changes: added tasks are spread, removed ones stop, disabled ones never run", async () => {
    const { runner, calls } = scripted(() => ({}), 1000);
    const { scheduler } = makeScheduler(runner, { config: { initialSpreadMs: 0 } });
    scheduler.setTasks([def("a"), def("b", { enabled: false, disabledReason: "isEnabled(env) returned false" })]);
    scheduler.start();
    await vi.advanceTimersByTimeAsync(5000);
    const diff = scheduler.setTasks([def("a"), def("c")]);
    expect(diff).toEqual({ added: ["c"], removed: ["b"], updated: [] });
    await vi.advanceTimersByTimeAsync(5000);
    expect(calls.map((c) => c.id).sort()).toEqual(["a", "c"]);
    expect(scheduler.snapshot().map((t) => t.id)).toEqual(["a", "c"]);
    await scheduler.stop(0);
  });
});
