import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

/** Tiny persistent key/value store backed by one JSON file (or memory only when `file` is null). */
export interface JsonStore<T> {
  get(key: string): T | undefined;
  set(key: string, value: T): void;
  delete(key: string): void;
  has(key: string): boolean;
  entries(): [string, T][];
  readonly size: number;
  /** Persist if dirty (atomic write). No-op for memory stores. */
  flush(): void;
}

export function openJsonStore<T>(file: string | null): JsonStore<T> {
  let data = new Map<string, T>();
  if (file && existsSync(file)) {
    try {
      const parsed = JSON.parse(readFileSync(file, "utf8")) as Record<string, T>;
      data = new Map(Object.entries(parsed));
    } catch {
      data = new Map(); // corrupt cache → start fresh (it's only a cache)
    }
  }
  let dirty = false;
  return {
    get: (k) => data.get(k),
    set: (k, v) => {
      data.set(k, v);
      dirty = true;
    },
    delete: (k) => {
      if (data.delete(k)) dirty = true;
    },
    has: (k) => data.has(k),
    entries: () => [...data.entries()],
    get size() {
      return data.size;
    },
    flush: () => {
      if (!file || !dirty) return;
      mkdirSync(dirname(file), { recursive: true });
      const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
      writeFileSync(tmp, JSON.stringify(Object.fromEntries(data)));
      renameSync(tmp, file);
      dirty = false;
    },
  };
}
