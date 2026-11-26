/**
 * pnpm --filter @easyjobs/api dev   (tsx watch)  ·  start
 * Env: see apps/api/README.md and .env.example. Without DATABASE_URL the API uses PGlite at <repo>/.data/pglite.
 */
import { writeFileSync } from "node:fs";
import { loadRootEnv, PgliteLockedError } from "@easyjobs/db";
import { DEFAULT_INGEST_KEY, loadConfig } from "./config";
import { createApiLogger } from "./log";
import { startServer } from "./server";

loadRootEnv();
const log = createApiLogger("api");
const config = loadConfig();
if (config.ingestKey === DEFAULT_INGEST_KEY && process.env.NODE_ENV === "production") {
  log.warn("INGEST_API_KEY is the default dev key — set a secret in production");
}

try {
  const running = await startServer(config, log);
  // Test/bench hook: report the bound port (API_PORT=0 picks a free one).
  if (process.env.API_PORT_FILE) writeFileSync(process.env.API_PORT_FILE, String(running.port));
  log.info(
    `EasyJobs API v${config.version} on http://localhost:${running.port} · db ${running.repo.db.location} · docs /docs · ` +
      `CORS ${config.webOrigins.join(",")} · rate limit ${config.rateLimit ? `${config.rateLimit.rps}/s burst ${config.rateLimit.burst}` : "off"} · cache ${config.cacheTtlMs} ms`,
  );
  let signals = 0;
  const onSignal = (sig: NodeJS.Signals): void => {
    if (++signals > 1) process.exit(1);
    running.stop(sig).then(
      () => process.exit(0),
      (e: unknown) => {
        log.error("shutdown failed", { error: String(e) });
        process.exit(1);
      },
    );
  };
  process.on("SIGINT", onSignal);
  process.on("SIGTERM", onSignal);
} catch (e) {
  if (e instanceof PgliteLockedError) log.error(e.message);
  else log.error("failed to start", { error: e instanceof Error ? (e.stack ?? e.message) : String(e) });
  process.exit(1);
}
