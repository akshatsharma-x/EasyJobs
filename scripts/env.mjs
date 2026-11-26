/** Shared helpers for the root scripts: repo root, root .env loading, API URL, health wait. */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = fileURLToPath(new URL("..", import.meta.url));

/** Loads <repo>/.env (variables already set in the environment win). */
export function loadRootEnv() {
  const file = join(ROOT, ".env");
  if (existsSync(file)) process.loadEnvFile(file);
  return existsSync(file);
}

export const apiUrl = () => (process.env.API_URL || `http://localhost:${process.env.API_PORT || 4000}`).replace(/\/+$/, "");

export async function apiHealthy(url = apiUrl()) {
  try {
    const res = await fetch(`${url}/health`, { signal: AbortSignal.timeout(2000) });
    const body = await res.json().catch(() => ({}));
    return res.ok && body?.ok === true;
  } catch {
    return false;
  }
}

export async function waitForApi({ timeoutMs = 120_000, url = apiUrl() } = {}) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    if (await apiHealthy(url)) return true;
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
}
