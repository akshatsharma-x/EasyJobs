/** Small, dependency-free value helpers shared by every adapter. */

export type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Trims and collapses whitespace. Numbers become strings. Anything else (or "") → null. */
export function clean(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value !== "string") return null;
  const s = value.replace(/[\s ]+/g, " ").trim();
  return s.length > 0 ? s : null;
}

/** Like clean(), but keeps newlines (for plain-text descriptions). */
export function cleanMultiline(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const s = value
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return s.length > 0 ? s : null;
}

export function asArray<T>(value: T | T[] | null | undefined): T[] {
  if (value === null || value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

/** Case-insensitive de-duplication of cleaned strings, preserving first-seen order and casing. */
export function uniqStrings(values: Iterable<unknown>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    const s = clean(v);
    if (!s) continue;
    const key = s.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out;
}

export function truncate(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, Math.max(0, max - 1))}…`;
}

/** Parses "1,234.5", 1234.5, "70000" → number; anything else → null. */
export function toNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const s = value.replace(/[,\s_]/g, "");
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Absolute http(s) URL or null. */
export function httpUrl(value: unknown): string | null {
  const s = clean(value);
  if (!s || !/^https?:\/\//i.test(s)) return null;
  try {
    return new URL(s).toString();
  } catch {
    return null;
  }
}

/** Drops undefined values (keeps null) so emitted JSON stays tidy. */
export function compact<T extends object>(obj: T): T {
  const rec = obj as Record<string, unknown>;
  for (const key of Object.keys(rec)) if (rec[key] === undefined) delete rec[key];
  return obj;
}

/** Builds a small JSON-safe "extra" bag: drops null/undefined/""/[]/{}. */
export function extraOf(entries: Record<string, unknown>): Record<string, unknown> | undefined {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(entries)) {
    if (value === null || value === undefined || value === "") continue;
    if (Array.isArray(value) && value.length === 0) continue;
    if (isRecord(value) && Object.keys(value).length === 0) continue;
    out[key] = value;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}
