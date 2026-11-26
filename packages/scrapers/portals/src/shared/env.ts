import type { Env } from "@easyjobs/contract/node";

const TRUTHY = new Set(["1", "true", "yes", "on"]);
const NO_FILTER = new Set(["", "any", "all", "none", "-"]);

/** ENABLE_X=1 / true / yes / on (case-insensitive) → true; anything else (incl. unset) → false. */
export function envFlag(env: Env, name: string): boolean {
  return TRUTHY.has((env[name] ?? "").trim().toLowerCase());
}

/** Integer env var clamped to [min, max]; unset/blank/garbage → fallback. */
export function envInt(env: Env, name: string, fallback: number, min: number, max: number): number {
  const n = envNumber(env, name, fallback, min, max);
  return Math.floor(n);
}

/** Numeric env var clamped to [min, max]; unset/blank/garbage → fallback. */
export function envNumber(env: Env, name: string, fallback: number, min: number, max: number): number {
  const raw = env[name]?.trim();
  if (raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

/** Split a list env var on `,` `;` `|` or newlines, trimmed and de-duplicated. Unset or blank → fallback. */
export function envList(env: Env, name: string, fallback: readonly string[]): string[] {
  const raw = env[name];
  if (raw === undefined) return [...fallback];
  const items = splitList(raw);
  return items.length > 0 ? items : [...fallback];
}

/**
 * Filter-value list (e.g. LinkedIn f_E codes, Naukri experience years).
 * Unset → fallback. "" / "any" / "all" / "none" → [] (no filter). Values not in `allowed` are dropped.
 */
export function envFilterList(env: Env, name: string, fallback: readonly string[], allowed: readonly string[]): string[] {
  const raw = env[name];
  if (raw === undefined) return [...fallback];
  if (NO_FILTER.has(raw.trim().toLowerCase())) return [];
  return splitList(raw).filter((v) => allowed.includes(v));
}

function splitList(raw: string): string[] {
  return [...new Set(raw.split(/[,;|\n]/).map((s) => s.trim()).filter(Boolean))];
}
