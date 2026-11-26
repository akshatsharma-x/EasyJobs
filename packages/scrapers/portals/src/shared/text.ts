/** Collapses runs of whitespace (incl. NBSP) and trims; empty → null. */
export function cleanText(s: string | null | undefined): string | null {
  if (s === null || s === undefined) return null;
  const t = s.replace(/[\s ]+/g, " ").trim();
  return t.length > 0 ? t : null;
}

/** Absolute http(s) URL or null. Relative paths resolve against `base`. */
export function absoluteUrl(href: string | null | undefined, base?: string): string | null {
  if (!href) return null;
  try {
    const u = new URL(href.trim(), base);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
  } catch {
    return null;
  }
}

/** URL without query string and fragment (drops tracking params like refId/trackingId/src/sid). */
export function stripQuery(url: string): string {
  const u = new URL(url);
  u.search = "";
  u.hash = "";
  return u.toString();
}

/** De-duplicates case-insensitively, keeping the first spelling. */
export function uniqueCi(items: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    const key = item.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
