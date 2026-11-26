import { createHash } from "node:crypto";

/**
 * Picks `count` consecutive items starting at `cursor` (wrapping around), so each run covers a
 * different slice of the query plan and volume per run stays low.
 */
export function rotate<T>(items: readonly T[], cursor: number, count: number): T[] {
  if (items.length === 0 || count <= 0) return [];
  const start = normalizeCursor(cursor, items.length);
  const n = Math.min(Math.floor(count), items.length);
  return Array.from({ length: n }, (_, i) => items[(start + i) % items.length] as T);
}

/** Cursor for the next run after `consumed` queries of this run were actually covered. */
export function advanceCursor(cursor: number, consumed: number, length: number): number {
  if (length <= 0) return 0;
  return normalizeCursor(normalizeCursor(cursor, length) + Math.max(0, consumed), length);
}

export function normalizeCursor(cursor: number, length: number): number {
  if (length <= 0 || !Number.isFinite(cursor)) return 0;
  return ((Math.floor(cursor) % length) + length) % length;
}

/** Short stable fingerprint of a plan; when the plan changes the rotation restarts at 0. */
export function planKey(keys: readonly string[]): string {
  return createHash("sha1").update(keys.join("\n")).digest("hex").slice(0, 12);
}
