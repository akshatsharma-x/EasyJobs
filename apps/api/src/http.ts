/**
 * HTTP helpers: ApiError responses, cached JSON with ETag / 304 / Cache-Control.
 */
import { createHash } from "node:crypto";
import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { ApiError } from "@easyjobs/contract";
import type { TtlCache } from "./cache";

export class HttpError extends Error {
  constructor(
    readonly status: ContentfulStatusCode,
    readonly code: string,
    message: string,
    readonly headers: Record<string, string> = {},
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export function errorBody(code: string, message: string): ApiError {
  return { error: { code, message } };
}

export const PUBLIC_CACHE_CONTROL = "public, max-age=15, stale-while-revalidate=60";

export interface CachedBody {
  body: string;
  etag: string;
  headers?: Record<string, string>;
}

export function makeBody(value: unknown, headers?: Record<string, string>): CachedBody {
  const body = JSON.stringify(value);
  const etag = `W/"${createHash("sha1").update(body).digest("base64url").slice(0, 27)}"`;
  return { body, etag, headers };
}

function etagMatches(ifNoneMatch: string | undefined, etag: string): boolean {
  if (!ifNoneMatch) return false;
  if (ifNoneMatch.trim() === "*") return true;
  const bare = etag.replace(/^W\//, "");
  return ifNoneMatch.split(",").some((t) => t.trim().replace(/^W\//, "") === bare);
}

/** Send a cached JSON body with ETag (304 on If-None-Match) and the public Cache-Control policy. */
export function sendBody(c: Context, b: CachedBody, cacheState: "HIT" | "MISS" | "BYPASS"): Response {
  const headers: Record<string, string> = {
    ETag: b.etag,
    "Cache-Control": PUBLIC_CACHE_CONTROL,
    "X-Cache": cacheState,
    Vary: "Accept-Encoding",
    ...b.headers,
  };
  if (etagMatches(c.req.header("if-none-match"), b.etag)) {
    return new Response(null, { status: 304, headers });
  }
  return new Response(b.body, { status: 200, headers: { ...headers, "Content-Type": "application/json; charset=utf-8" } });
}

/**
 * Cached GET handler body: `compute` returns the value (or null → 404). Values are cached for the cache's TTL
 * keyed by a normalised key; 404s are not cached.
 */
export async function cachedJson(
  c: Context,
  cache: TtlCache<CachedBody>,
  key: string,
  compute: () => Promise<{ value: unknown; headers?: Record<string, string> } | null>,
  notFound = "Not found",
): Promise<Response> {
  if (!cache.enabled) {
    const r = await compute();
    if (!r) throw new HttpError(404, "not_found", notFound);
    return sendBody(c, makeBody(r.value, r.headers), "BYPASS");
  }
  const { value, hit } = await cache.getOrCompute(key, async () => {
    const r = await compute();
    if (!r) throw new HttpError(404, "not_found", notFound);
    return makeBody(r.value, r.headers);
  });
  return sendBody(c, value, hit ? "HIT" : "MISS");
}
