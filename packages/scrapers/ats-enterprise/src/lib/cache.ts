import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Env } from "@easyjobs/contract/node";
import { envFlag, envInt, envStr } from "./env";

/** Package root `.cache/` (gitignored). */
export const PACKAGE_CACHE_DIR = fileURLToPath(new URL("../../.cache/", import.meta.url));

export interface DevCache {
  get(key: string): Buffer | undefined;
  set(key: string, body: Buffer): void;
}

export const sha1 = (s: string): string => createHash("sha1").update(s).digest("hex");

/**
 * Development response cache (ATS_ENTERPRISE_CACHE=1). Stores successful response bodies in
 * `.cache/http/` so repeated local runs do not hammer career sites. Off by default and in production.
 */
export function createDevCache(env: Env): DevCache | null {
  if (!envFlag(env, "ATS_ENTERPRISE_CACHE")) return null;
  const dir = envStr(env, "ATS_ENTERPRISE_CACHE_DIR") ?? join(PACKAGE_CACHE_DIR, "http");
  const ttlMs = envInt(env, "ATS_ENTERPRISE_CACHE_TTL_MIN", 360, 1) * 60_000;
  try {
    mkdirSync(dir, { recursive: true });
  } catch {
    return null;
  }
  const file = (key: string): string => join(dir, `${sha1(key)}.bin`);
  return {
    get(key) {
      const f = file(key);
      try {
        if (Date.now() - statSync(f).mtimeMs > ttlMs) return undefined;
        return readFileSync(f);
      } catch {
        return undefined;
      }
    },
    set(key, body) {
      try {
        writeFileSync(file(key), body);
      } catch {
        /* cache is best-effort */
      }
    },
  };
}
