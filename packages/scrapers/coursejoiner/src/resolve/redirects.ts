/** Resolves URL shorteners (bit.ly, tinyurl, …) to their destination with manual redirect following, cached on disk. */
import { RobotsDisallowedError, type HttpClient, type Logger } from "@easyjobs/contract/node";
import type { JsonStore } from "../util/store";
import { cleanHref, hostMatches, parseUrl, stripTracking, unwrapWrapperUrl } from "../util/url";
import { SHORTENER_DOMAINS } from "../parse/hosts";

export interface RedirectEntry {
  to: string;
  at: string;
  /** true when resolution failed (kept as-is). */
  failed?: boolean;
}

export interface RedirectResolverOptions {
  http: HttpClient;
  store: JsonStore<RedirectEntry>;
  log: Logger;
  signal?: AbortSignal;
  maxHops?: number;
  /** Re-resolve successful entries after this many days (default 30); failures after 1 day. */
  ttlDays?: number;
}

export function isShortener(url: string): boolean {
  const u = parseUrl(url);
  return !!u && SHORTENER_DOMAINS.some((d) => hostMatches(u.hostname, d)) && u.pathname.length > 1;
}

/** All shortener hrefs in a post body (cleaned like the parser does). */
export function collectShortLinks(html: string, baseUrl: string): string[] {
  const out = new Set<string>();
  for (const m of html.matchAll(/href\s*=\s*["']([^"']+)["']/gi)) {
    const href = cleanHref(m[1] ?? "", baseUrl);
    if (href && isShortener(href)) out.add(href);
  }
  return [...out];
}

export interface RedirectResolver {
  /** Resolves all shortener URLs in `urls`; returns url → destination for every input (identity when not a shortener). */
  resolveMany(urls: Iterable<string>): Promise<Map<string, string>>;
}

export function createRedirectResolver(opts: RedirectResolverOptions): RedirectResolver {
  const maxHops = opts.maxHops ?? 5;
  const ttlMs = (opts.ttlDays ?? 30) * 86_400_000;

  async function hop(url: string): Promise<string | null> {
    for (const method of ["HEAD", "GET"] as const) {
      const res = await opts.http.fetch(url, { method, redirect: "manual", signal: opts.signal, retries: 1, timeoutMs: 10_000 });
      const location = res.headers.get("location");
      await res.body?.cancel().catch(() => undefined);
      if (res.status >= 300 && res.status < 400 && location) return new URL(location, url).toString();
      // Some shorteners reject HEAD (405/403/400) — retry once with GET.
      if (method === "HEAD" && [400, 403, 404, 405, 501].includes(res.status)) continue;
      return null;
    }
    return null;
  }

  async function resolveOne(url: string): Promise<string> {
    const cached = opts.store.get(url);
    if (cached) {
      const age = Date.now() - Date.parse(cached.at);
      if (age < (cached.failed ? 86_400_000 : ttlMs)) return cached.to;
    }
    let current = url;
    try {
      for (let i = 0; i < maxHops && isShortener(current); i++) {
        const next = await hop(current);
        if (!next || next === current) break;
        current = unwrapWrapperUrl(next);
      }
      const to = stripTracking(current);
      opts.store.set(url, { to, at: new Date().toISOString(), ...(to === url ? { failed: true } : {}) });
      return to;
    } catch (e) {
      if (opts.signal?.aborted) throw e;
      const reason = e instanceof RobotsDisallowedError ? "robots.txt" : e instanceof Error ? e.message : String(e);
      opts.log.debug(`could not resolve ${url}`, { reason });
      opts.store.set(url, { to: url, at: new Date().toISOString(), failed: true });
      return url;
    }
  }

  return {
    async resolveMany(urls) {
      const out = new Map<string, string>();
      for (const url of new Set(urls)) out.set(url, isShortener(url) ? await resolveOne(url) : url);
      return out;
    },
  };
}
