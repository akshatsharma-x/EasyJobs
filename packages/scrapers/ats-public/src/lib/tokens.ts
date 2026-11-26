/**
 * Registry tokens (§0.6) are normally bare board names ("stripe"), but registry entries sometimes carry
 * a full careers URL instead. These helpers accept both.
 */

const tryUrl = (raw: string): URL | null => {
  const s = raw.trim();
  const withScheme = /^https?:\/\//i.test(s) ? s : /^[a-z0-9-]+(\.[a-z0-9-]+)+(\/|$)/i.test(s) ? `https://${s}` : null;
  if (!withScheme) return null;
  try {
    return new URL(withScheme);
  } catch {
    return null;
  }
};

/** When `raw` is a URL on a host matching `host`: its URL and decoded path segments. Otherwise null. */
export function tokenUrl(raw: string, host: RegExp): { url: URL; parts: string[] } | null {
  const url = tryUrl(raw);
  if (!url || !host.test(url.hostname)) return null;
  const parts = url.pathname
    .split("/")
    .filter(Boolean)
    .map((p) => {
      try {
        return decodeURIComponent(p);
      } catch {
        return p;
      }
    });
  return { url, parts };
}

/** A bare token, trimmed of slashes and whitespace. */
export const bareToken = (raw: string): string => raw.trim().replace(/^\/+|\/+$/g, "");

/**
 * Origin of a company careers host: "acme" → "https://acme.<suffix>"; "acme.<suffix>" or any URL → its origin.
 * Lets registry entries use custom career domains (e.g. Teamtailor "https://jobs.lunar.app").
 */
export function careersOrigin(raw: string, suffix: string): string {
  const s = raw.trim().replace(/\/+$/, "");
  if (/^[a-z0-9][a-z0-9-]*$/i.test(s)) return `https://${s.toLowerCase()}.${suffix}`;
  const url = tryUrl(s);
  if (!url) throw new Error(`Invalid token "${raw}": expected a subdomain or a URL`);
  return url.origin;
}
