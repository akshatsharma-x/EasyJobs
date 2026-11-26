export interface LogoSubject {
  name: string;
  domain: string | null;
  logoUrl: string | null;
}

/**
 * Ordered logo candidates: company.logoUrl → /logo/<domain> (same-origin proxy: logo.dev when configured →
 * Google favicon `https://www.google.com/s2/favicons?domain=<domain>&sz=128`) → monogram (rendered by the UI).
 */
export function logoSources(company: LogoSubject): string[] {
  const list: string[] = [];
  const domain = company.domain?.replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/^www\./, "").toLowerCase();
  // normalize stores a raw Google-favicon URL when it has nothing better; the proxy serves the same icon
  // without browser 404s and swaps blurry/default icons for a monogram — so use the proxy instead.
  const favicon = company.logoUrl ? googleFaviconDomain(company.logoUrl) : null;
  if (company.logoUrl && !favicon) list.push(company.logoUrl);
  const proxied = domain ?? favicon;
  if (proxied) list.push(`/logo/${encodeURIComponent(proxied)}`);
  return list;
}

/** "https://www.google.com/s2/favicons?domain=acme.com&sz=128" → "acme.com" (else null). */
export function googleFaviconDomain(url: string): string | null {
  try {
    const u = new URL(url);
    if (!/(^|\.)google\.com$/.test(u.hostname) || !u.pathname.startsWith("/s2/favicons")) return null;
    return u.searchParams.get("domain")?.toLowerCase() || null;
  } catch {
    return null;
  }
}

const MONOGRAM_HUES = [218, 262, 330, 12, 32, 160, 190, 280, 350, 200, 145, 45];

/** Deterministic monogram letters + tile colours for a company name. */
export function monogram(name: string): { letters: string; hue: number } {
  const words = name
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
  const letters = ((words[0]?.[0] ?? "?") + (words.length > 1 ? (words[1]?.[0] ?? "") : (words[0]?.[1] ?? ""))).toUpperCase();
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return { letters, hue: MONOGRAM_HUES[hash % MONOGRAM_HUES.length] ?? 218 };
}

/** "careers.google.com" from a URL, without www. */
export function hostOf(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\d*\./, "");
  } catch {
    return null;
  }
}

/** "Apply on careers.google.com" */
export function applyLabel(job: { applyUrl: string }): string {
  const host = hostOf(job.applyUrl);
  return host ? `Apply on ${host}` : "Apply";
}
