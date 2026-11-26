/** Small, dependency-free text and URL helpers shared by the parsers. */

export const INTERNSHALA_ORIGIN = "https://internshala.com";

/** Collapse whitespace (incl. NBSP and zero-width chars) and trim. */
export function cleanText(input: string | null | undefined): string {
  if (!input) return "";
  return input
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** cleanText, but "" → null. */
export function textOrNull(input: string | null | undefined): string | null {
  const t = cleanText(input);
  return t.length > 0 ? t : null;
}

/** Remove a leading list number such as "1. ", "2) ", "3.". */
export function stripListNumber(input: string): string {
  return input.replace(/^\s*\d{1,2}\s*[.)]\s*/, "").trim();
}

/** Case-insensitive de-duplication that keeps the first spelling and order. */
export function uniqueCi(values: Iterable<string>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    const v = cleanText(raw);
    const key = v.toLowerCase();
    if (!v || seen.has(key)) continue;
    seen.add(key);
    out.push(v);
  }
  return out;
}

/** First integer in a string ("56 applicants" → 56, "2,416 opportunities" → 2416). */
export function firstInt(input: string | null | undefined): number | null {
  const m = (input ?? "").match(/\d[\d,]*/);
  if (!m) return null;
  const n = Number(m[0].replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

export function escapeHtml(input: string): string {
  return input.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/**
 * Resolve an href against the Internshala origin. Drops query and hash by default because
 * robots.txt disallows every URL with a query string (`Disallow: /*?*`).
 * Returns null for empty, javascript:, mailto: and unparsable values.
 */
export function absoluteUrl(href: string | null | undefined, opts: { base?: string; keepQuery?: boolean } = {}): string | null {
  const raw = cleanText(href).replace(/\\+$/, ""); // some company links end with a stray backslash
  if (!raw || /^(javascript|mailto|tel|data):/i.test(raw) || raw === "#") return null;
  try {
    const url = new URL(raw, opts.base ?? INTERNSHALA_ORIGIN);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (!opts.keepQuery) url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

/** Hosts that are never a company's own domain (social profiles, app stores, link-in-bio, shorteners…). */
const NON_COMPANY_HOSTS = [
  "internshala.com", "facebook.com", "fb.com", "instagram.com", "linkedin.com", "twitter.com", "x.com", "youtube.com",
  "youtu.be", "t.me", "telegram.me", "wa.me", "whatsapp.com", "play.google.com", "apps.apple.com", "linktr.ee",
  "bit.ly", "tinyurl.com", "goo.gl", "forms.gle", "docs.google.com", "drive.google.com", "sites.google.com", "medium.com",
  "github.com", "behance.net", "dribbble.com", "pinterest.com", "threads.net", "wixsite.com", "blogspot.com", "wordpress.com",
  "justdial.com", "indiamart.com", "glassdoor.com", "glassdoor.co.in", "ambitionbox.com", "crunchbase.com", "tracxn.com",
];

/** "https://www.loadit.in/about" → "loadit.in"; null for social/app-store/link hosts and non-URLs. */
export function companyDomainFromUrl(href: string | null | undefined): string | null {
  const abs = absoluteUrl(href, { base: "https://invalid.invalid" });
  if (!abs) return null;
  const host = new URL(abs).hostname.toLowerCase().replace(/^www\d*\./, "");
  if (!host.includes(".") || host.endsWith(".invalid") || /^\d+(\.\d+){3}$/.test(host)) return null;
  if (NON_COMPANY_HOSTS.some((h) => host === h || host.endsWith(`.${h}`))) return null;
  return host;
}
