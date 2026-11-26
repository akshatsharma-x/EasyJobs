import { sleep, type Env, type ScrapeContext } from "@easyjobs/contract/node";

/** Trimmed env value, or undefined when missing/blank. */
export function envStr(env: Env, name: string): string | undefined {
  const v = env[name];
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t.length > 0 ? t : undefined;
}

/** Integer env value clamped to [min, max]; falls back on missing/invalid input. */
export function envInt(env: Env, name: string, fallback: number, min = 0, max = Number.MAX_SAFE_INTEGER): number {
  const raw = envStr(env, name);
  if (raw === undefined) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

/** Comma-separated env list (blank entries dropped). */
export function envList(env: Env, name: string, fallback: string[]): string[] {
  const raw = envStr(env, name);
  if (raw === undefined) return fallback;
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** True when every named env var is present and non-blank. */
export function hasEnv(env: Env, ...names: string[]): boolean {
  return names.every((n) => envStr(env, n) !== undefined);
}

/** Per-source kill switch: OPEN_APIS_DISABLED=remoteok,jobicy (or "all"). */
export function isDisabledByEnv(env: Env, id: string): boolean {
  const list = envList(env, "OPEN_APIS_DISABLED", []).map((s) => s.toLowerCase());
  return list.includes("all") || list.includes(id.toLowerCase());
}

export function uniq<T>(items: Iterable<T>): T[] {
  return [...new Set(items)];
}

/** Collapses whitespace and trims; non-strings become "". */
export function cleanText(v: unknown): string {
  if (typeof v !== "string") return "";
  return v.replace(/[\s\u200b]+/g, " ").trim();
}

/** Non-empty cleaned string or null. */
export function textOrNull(v: unknown): string | null {
  const t = cleanText(v);
  return t.length > 0 ? t : null;
}

/** Absolute http(s) URL (normalized by WHATWG URL) or null. */
export function httpUrl(v: unknown, base?: string): string | null {
  if (typeof v !== "string" || v.trim() === "") return null;
  try {
    const u = new URL(v.trim(), base);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.href;
  } catch {
    return null;
  }
}

const MIN_YEAR = 2000;
const MAX_YEAR = 2100;

/**
 * Best-effort timestamp → ISO-8601 UTC.
 * Accepts epoch seconds/ms (number or numeric string), ISO with or without zone (zone-less = UTC),
 * over-long fractions ("…00.0000000"), "2026-11-25 20:54:54 GMT+0530" and RFC 2822.
 */
export function toIso(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  let ms: number;
  if (typeof v === "number" || (typeof v === "string" && /^\d{9,13}(\.\d+)?$/.test(v.trim()))) {
    const n = Number(v);
    if (!Number.isFinite(n) || n <= 0) return null;
    ms = n < 1e11 ? n * 1000 : n;
  } else if (typeof v === "string") {
    let s = v.trim();
    const gmt = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}(?::\d{2})?)\s*(?:GMT|UTC)\s*([+-])(\d{2}):?(\d{2})$/i.exec(s);
    if (gmt) s = `${gmt[1]}T${gmt[2]}${gmt[3]}${gmt[4]}:${gmt[5]}`;
    s = s.replace(/(\.\d{3})\d+/, "$1");
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(s)) s += "Z";
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) s += "T00:00:00Z";
    ms = Date.parse(s);
  } else {
    return null;
  }
  if (!Number.isFinite(ms)) return null;
  const d = new Date(ms);
  const y = d.getUTCFullYear();
  if (y < MIN_YEAR || y > MAX_YEAR) return null;
  return d.toISOString();
}

/**
 * Polite pause between paged requests; rejects if the run is aborted.
 * OPEN_APIS_PAUSE_SCALE (default 1) scales it — tests set 0; never lower it in production.
 */
export function pause(ctx: Pick<ScrapeContext, "signal" | "env">, ms: number): Promise<void> {
  const scale = Number(ctx.env.OPEN_APIS_PAUSE_SCALE ?? 1);
  const wait = Math.round(ms * (Number.isFinite(scale) && scale >= 0 ? scale : 1));
  return wait > 0 ? sleep(wait, ctx.signal) : Promise.resolve();
}

/** True once ctx.limit jobs have been emitted. */
export function reachedLimit(ctx: Pick<ScrapeContext, "limit">, emitted: number): boolean {
  return ctx.limit !== undefined && emitted >= ctx.limit;
}

/** Drops keys whose value is undefined (keeps JSON output and fill-rate stats tidy). */
export function prune<T extends object>(obj: T): T {
  for (const key of Object.keys(obj) as (keyof T)[]) {
    if (obj[key] === undefined) delete obj[key];
  }
  return obj;
}

/** Strings → trimmed, de-duplicated (case-insensitive), capped list. */
export function cleanList(items: unknown, max = 50): string[] {
  if (!Array.isArray(items)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    const t = cleanText(item);
    const key = t.toLowerCase();
    if (!t || seen.has(key)) continue;
    seen.add(key);
    out.push(t);
    if (out.length >= max) break;
  }
  return out;
}
