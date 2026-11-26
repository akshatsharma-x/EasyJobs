import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { errorMessage, truncate } from "../util";

export type ImportResult = { ok: true; module: Record<string, unknown> } | { ok: false; error: string };

/**
 * Dynamic import that never throws and never hangs discovery: errors and timeouts become `{ ok: false }`.
 * `version` is appended as a query so a changed entry module is re-evaluated on re-scan
 * (ESM caches by URL; modules it imports stay cached until restart).
 */
export async function safeImport(file: string, opts: { timeoutMs: number; version?: string }): Promise<ImportResult> {
  const url = pathToFileURL(file).href + (opts.version ? `?rescan=${encodeURIComponent(opts.version)}` : "");
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`import timed out after ${opts.timeoutMs} ms`)), opts.timeoutMs);
  });
  try {
    const mod = (await Promise.race([import(url), timeout])) as Record<string, unknown>;
    return { ok: true, module: mod };
  } catch (e) {
    return { ok: false, error: describeImportError(e) };
  } finally {
    clearTimeout(timer);
  }
}

function describeImportError(e: unknown): string {
  const lines = errorMessage(e)
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
  return truncate(lines.slice(0, 3).join(" | "), 500);
}

const SKIP_DIRS = new Set(["node_modules", ".cache", "out", "dist", "coverage", ".state", ".spool"]);

/** Cheap content signature of files/dirs: newest mtime + file count. Changes whenever a file is added/edited/removed. */
export function treeVersion(paths: string[]): string {
  let newest = 0;
  let count = 0;
  const visit = (p: string, depth: number): void => {
    let st;
    try {
      st = statSync(p);
    } catch {
      return;
    }
    if (st.isFile()) {
      newest = Math.max(newest, st.mtimeMs);
      count++;
      return;
    }
    if (!st.isDirectory() || depth > 8) return;
    let entries: string[] = [];
    try {
      entries = readdirSync(p);
    } catch {
      return;
    }
    for (const name of entries) if (!name.startsWith(".") && !SKIP_DIRS.has(name)) visit(join(p, name), depth + 1);
  };
  for (const p of paths) visit(p, 0);
  return `${Math.round(newest)}-${count}`;
}
