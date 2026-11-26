import { HttpError, type HttpClient, type HttpRequestInit } from "@easyjobs/contract/node";
import type { JsonStore } from "./store";

export interface ConditionalEntry {
  etag?: string;
  lastModified?: string;
  body: string;
  savedAt: string;
}

export interface ConditionalResult {
  body: string;
  /** true when the server answered 304 and the cached body was used. */
  notModified: boolean;
}

/**
 * GET with ETag / If-Modified-Since revalidation. Bodies are cached only when the server sends validators,
 * so endpoints without them (e.g. WP REST on most hosts) cost nothing extra.
 */
export async function fetchConditional(
  http: HttpClient,
  url: string,
  store: JsonStore<ConditionalEntry>,
  init: HttpRequestInit = {},
): Promise<ConditionalResult> {
  const cached = store.get(url);
  const headers = new Headers(init.headers);
  if (cached?.etag) headers.set("if-none-match", cached.etag);
  if (cached?.lastModified) headers.set("if-modified-since", cached.lastModified);
  const res = await http.fetch(url, { ...init, headers });
  if (res.status === 304 && cached) {
    await res.body?.cancel().catch(() => undefined);
    return { body: cached.body, notModified: true };
  }
  if (!res.ok) throw new HttpError(res.status, url, await res.text().catch(() => ""));
  const body = await res.text();
  const etag = res.headers.get("etag") ?? undefined;
  const lastModified = res.headers.get("last-modified") ?? undefined;
  if (etag || lastModified) store.set(url, { ...(etag ? { etag } : {}), ...(lastModified ? { lastModified } : {}), body, savedAt: new Date().toISOString() });
  else if (cached) store.delete(url);
  return { body, notModified: false };
}
