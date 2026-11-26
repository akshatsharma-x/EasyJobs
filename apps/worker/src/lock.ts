import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { hostname } from "node:os";
import { join } from "node:path";
import { isObject, isProcessAlive } from "./util";

export class LockError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LockError";
  }
}

export interface WorkerLock {
  file: string;
  release(): void;
}

/** One scheduler per state dir: two schedulers would double-scrape sources and fight over state.json. */
export function acquireLock(dir: string): WorkerLock {
  mkdirSync(dir, { recursive: true });
  const file = join(dir, "worker.lock");
  const data = JSON.stringify({ pid: process.pid, host: hostname(), startedAt: new Date().toISOString() });
  try {
    writeFileSync(file, data, { flag: "wx" });
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
    let holder: unknown = null;
    try {
      holder = JSON.parse(readFileSync(file, "utf8"));
    } catch {
      holder = null;
    }
    const pid = isObject(holder) && typeof holder.pid === "number" ? holder.pid : null;
    if (pid !== null && pid !== process.pid && isProcessAlive(pid)) {
      throw new LockError(`another worker (pid ${pid}) is already running with state dir ${dir} — stop it first, or set WORKER_STATE_DIR`);
    }
    writeFileSync(file, data); // stale lock from a dead process
  }
  return {
    file,
    release(): void {
      try {
        const cur: unknown = JSON.parse(readFileSync(file, "utf8"));
        if (isObject(cur) && cur.pid === process.pid) rmSync(file, { force: true });
      } catch {
        /* already gone */
      }
    },
  };
}
