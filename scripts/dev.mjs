#!/usr/bin/env node
/**
 * `pnpm dev` — API + worker + web together (colored prefixes). The API runs DB migrations on start;
 * the worker starts once the API is healthy. Ctrl-C stops everything.
 */
import concurrently from "concurrently";
import { ROOT, apiUrl, loadRootEnv } from "./env.mjs";

const hasEnv = loadRootEnv();
if (!hasEnv) console.warn("[dev] no .env found — using defaults (run `cp .env.example .env`)");
const webPort = process.env.WEB_PORT || "3000";
console.log(`[dev] api ${apiUrl()} · web http://localhost:${webPort} · worker :${process.env.WORKER_PORT || 4100} · mocks ${process.env.NEXT_PUBLIC_USE_MOCKS === "1" ? "on" : "off"}`);

const { result, commands } = concurrently(
  [
    { command: "pnpm --filter @easyjobs/api dev", name: "api", prefixColor: "blue" },
    { command: "node scripts/wait-for-api.mjs && pnpm --filter @easyjobs/worker dev", name: "worker", prefixColor: "magenta" },
    { command: `pnpm --filter @easyjobs/web exec next dev --port ${webPort}`, name: "web", prefixColor: "green" },
  ],
  { cwd: ROOT, prefix: "name", killOthersOn: ["failure"], restartTries: 0 },
);
// Forward stop signals to every child (a plain `kill <pid>` of this launcher must not orphan api/worker/web).
for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
  process.on(signal, () => {
    for (const c of commands) c.kill(signal);
  });
}
result.then(
  () => process.exit(0),
  () => process.exit(1),
);
