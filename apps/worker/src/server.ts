import { timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { ApiError } from "@easyjobs/contract";
import type { Logger } from "@easyjobs/contract/node";
import type { TriggerResult } from "./scheduler";
import { errorMessage } from "./util";

export interface StatusProvider {
  health(): Record<string, unknown>;
  status(query: URLSearchParams): Record<string, unknown>;
  trigger(source: string, target: string | undefined): TriggerResult;
}

export function keysEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

const apiError = (code: string, message: string): ApiError => ({ error: { code, message } });

function send(res: ServerResponse, status: number, body: unknown): void {
  const json = `${JSON.stringify(body, null, 2)}\n`;
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "content-length": Buffer.byteLength(json),
  });
  res.end(json);
}

/**
 * GET /health · GET /status[?source=&task=&status=] · POST /run/:source[?target=slug] (x-ingest-key).
 * Errors use the contract's ApiError shape.
 */
export function createStatusServer(provider: StatusProvider, opts: { ingestKey: string; log: Logger }): Server {
  const handle = (req: IncomingMessage, res: ServerResponse): void => {
    const url = new URL(req.url ?? "/", "http://worker.local");
    const path = url.pathname.replace(/\/+$/, "") || "/";
    if (path === "/health" || path === "/status") {
      if (req.method !== "GET" && req.method !== "HEAD") return send(res, 405, apiError("method_not_allowed", `use GET ${path}`));
      return send(res, 200, path === "/health" ? provider.health() : provider.status(url.searchParams));
    }
    const m = /^\/run\/([^/]+)$/.exec(path);
    if (m?.[1]) {
      req.resume();
      if (req.method !== "POST") return send(res, 405, apiError("method_not_allowed", "use POST /run/:source"));
      const key = req.headers["x-ingest-key"];
      if (typeof key !== "string" || !keysEqual(key, opts.ingestKey)) return send(res, 401, apiError("unauthorized", "missing or invalid x-ingest-key"));
      let source: string;
      try {
        source = decodeURIComponent(m[1]);
      } catch {
        return send(res, 400, apiError("bad_request", "malformed source id"));
      }
      const target = url.searchParams.get("target") ?? undefined;
      const r = provider.trigger(source, target);
      if (r.unknown) return send(res, 404, apiError("not_found", `no scheduled task for source "${source}"${target ? ` and target "${target}"` : ""}`));
      if (r.queued.length === 0 && r.running.length === 0) {
        return send(res, 409, { ...apiError("disabled", `every task of "${source}" is disabled (isEnabled returned false)`), disabled: r.disabled });
      }
      opts.log.info(`manual trigger via HTTP: ${source}${target ? `:${target}` : ""}`, { queued: r.queued.length, alreadyRunning: r.running.length });
      return send(res, 202, { ok: true, ...r });
    }
    req.resume();
    send(res, 404, apiError("not_found", `no route ${req.method ?? "GET"} ${path}`));
  };
  return createServer((req, res) => {
    try {
      handle(req, res);
    } catch (e) {
      opts.log.error("status server error", { error: errorMessage(e) });
      if (!res.headersSent) send(res, 500, apiError("internal", errorMessage(e)));
    }
  });
}

export function listen(server: Server, port: number, host: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const onError = (e: Error): void => reject(e);
    server.once("error", onError);
    server.listen(port, host, () => {
      server.off("error", onError);
      const addr = server.address();
      resolve(typeof addr === "object" && addr ? addr.port : port);
    });
  });
}

export function closeServer(server: Server): Promise<void> {
  return new Promise((resolve) => {
    server.close(() => resolve());
    server.closeAllConnections();
  });
}
