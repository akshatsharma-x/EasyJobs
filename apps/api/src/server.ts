/**
 * Server lifecycle: open DB (migrate), build the app, start SSE fan-out, hourly expiry, optional registry
 * enrichment, and graceful shutdown. Used by src/index.ts and the benchmark.
 */
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { serve, type ServerType } from "@hono/node-server";
import type { CompanyTarget } from "@easyjobs/contract";
import type { Logger } from "@easyjobs/contract/node";
import { openRepository, REPO_ROOT, type DatabaseOptions, type Repository } from "@easyjobs/db";
import { createApp, type ApiApp } from "./app";
import { startEventBus } from "./bus";
import type { ApiConfig } from "./config";

const EXPIRE_LOCK = 482_901_339;
const REGISTRY_SYNC_MS = 6 * 3_600_000;

export interface RunningServer {
  api: ApiApp;
  repo: Repository;
  server: ServerType;
  port: number;
  stop(reason?: string): Promise<void>;
}

/** Best-effort: enrich companies (hq, careers URL, tags) from @easyjobs/registry when that package exists. */
async function syncRegistry(repo: Repository, log: Logger): Promise<void> {
  const entry = resolve(REPO_ROOT, "packages/registry/src/index.ts");
  if (!existsSync(entry)) return;
  try {
    const mod = (await import(pathToFileURL(entry).href)) as { companies?: unknown; default?: { companies?: unknown } };
    const list = (Array.isArray(mod.companies) ? mod.companies : mod.default?.companies) as CompanyTarget[] | undefined;
    if (!Array.isArray(list)) return;
    const valid = list.filter((t) => t && typeof t.slug === "string");
    const n = await repo.syncCompanyProfiles(valid);
    log.info(`registry: ${valid.length} companies known, ${n} company profiles updated`);
  } catch (e) {
    log.debug("registry sync skipped", { error: e instanceof Error ? e.message : String(e) });
  }
}

export async function startServer(config: ApiConfig, log: Logger, dbOptions: DatabaseOptions = {}): Promise<RunningServer> {
  const repo = await openRepository({ appName: "easyjobs-api", ...dbOptions });
  const api = createApp({ repo, config, log });
  const stopBus = await startEventBus(repo, api.hub, log);
  api.hub.start();

  const server = await new Promise<{ server: ServerType; port: number }>((resolveListen, reject) => {
    const s = serve({ fetch: api.app.fetch, port: config.port, hostname: config.host }, (info) => resolveListen({ server: s, port: info.port }));
    s.once("error", reject);
  });

  const runExpire = async (): Promise<void> => {
    try {
      const r = await repo.db.withSessionLock(EXPIRE_LOCK, () => repo.expireStale(), { wait: false });
      if (r.acquired && r.value && r.value.closed > 0) log.info(`expireStale: closed ${r.value.closed} jobs`);
    } catch (e) {
      log.warn("expireStale failed", { error: e instanceof Error ? e.message : String(e) });
    }
  };
  const timers = [
    setTimeout(() => void runExpire(), 5_000),
    setInterval(() => void runExpire(), config.expireIntervalMs),
    setTimeout(() => void syncRegistry(repo, log), 2_000),
    setInterval(() => void syncRegistry(repo, log), REGISTRY_SYNC_MS),
  ];
  for (const t of timers) t.unref();
  const tWarm = Date.now();
  void repo
    .warmup()
    .then(() => log.info(`indexes ready in ${Date.now() - tWarm} ms (facets: ${repo.facetEngine()})`))
    .catch((e: unknown) => log.warn("index warm-up failed (SQL facets stay in use)", { error: e instanceof Error ? e.message : String(e) }));

  let stopping: Promise<void> | null = null;
  const stop = (reason = "stop"): Promise<void> => {
    stopping ??= (async () => {
      log.info(`shutting down (${reason})…`);
      for (const t of timers) clearTimeout(t);
      api.close(); // ends SSE streams so connections can drain
      const closed = new Promise<void>((done) => server.server.close(() => done()));
      (server.server as { closeIdleConnections?: () => void }).closeIdleConnections?.();
      const timeout = new Promise<void>((done) => setTimeout(done, 10_000).unref());
      await Promise.race([closed, timeout]);
      (server.server as { closeAllConnections?: () => void }).closeAllConnections?.();
      await stopBus();
      await repo.close();
      log.info("bye");
    })();
    return stopping;
  };

  return { api, repo, server: server.server, port: server.port, stop };
}
