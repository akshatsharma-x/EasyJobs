import type { Env } from "@easyjobs/contract/node";

/** Integer env var with a fallback; values below `min` or non-numeric fall back. */
export function envInt(env: Env, name: string, fallback: number, min = 0): number {
  const raw = env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= min ? Math.floor(n) : fallback;
}

/** "1" / "true" / "yes" / "on" → true. */
export function envFlag(env: Env, name: string, fallback = false): boolean {
  const raw = env[name]?.trim().toLowerCase();
  if (raw === undefined || raw === "") return fallback;
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

export function envStr(env: Env, name: string): string | undefined {
  const raw = env[name]?.trim();
  return raw ? raw : undefined;
}
