const UNIT_MS: Record<string, number> = {
  second: 1000,
  minute: 60_000,
  hour: 3_600_000,
  day: 86_400_000,
  week: 7 * 86_400_000,
  month: 30 * 86_400_000,
  year: 365 * 86_400_000,
};

const UNIT_ALIASES: Record<string, keyof typeof UNIT_MS> = {
  s: "second", sec: "second", secs: "second", second: "second", seconds: "second",
  m: "minute", min: "minute", mins: "minute", minute: "minute", minutes: "minute",
  h: "hour", hr: "hour", hrs: "hour", hour: "hour", hours: "hour",
  d: "day", day: "day", days: "day",
  w: "week", wk: "week", wks: "week", week: "week", weeks: "week",
  mo: "month", month: "month", months: "month",
  y: "year", yr: "year", yrs: "year", year: "year", years: "year",
};

/**
 * Portal "posted" labels → ISO-8601 (UTC), relative to `now`.
 * Handles: "Just now", "Few Hours Ago", "2 hours ago", "1 Day Ago", "30+ Days Ago", "a week ago",
 * "Reposted 3 weeks ago", "Today", "Yesterday". Unknown text → null (never guesses).
 */
export function parseRelativeTime(text: string | null | undefined, now: Date): string | null {
  if (!text) return null;
  const t = text.toLowerCase().replace(/\s+/g, " ").trim();
  if (!t) return null;
  const at = (ms: number): string => new Date(now.getTime() - ms).toISOString();
  if (/\b(just now|moments? ago|few seconds ago|right now)\b/.test(t) || t === "now") return at(0);
  if (/\btoday\b/.test(t)) return at(0);
  if (/\byesterday\b/.test(t)) return at(UNIT_MS.day ?? 0);
  const m = /((\d+)\s*\+?|\ban?\b|\b(?:a )?few\b)\s*([a-z]+)\s+ago\b/.exec(t);
  if (!m) return null;
  const unit = UNIT_ALIASES[m[3] ?? ""];
  if (!unit) return null;
  const n = m[2] !== undefined ? Number(m[2]) : /few/.test(m[1] ?? "") ? 3 : 1;
  return at(n * (UNIT_MS[unit] ?? 0));
}

/** "2025-11-25" (date only) → "2025-11-25T00:00:00.000Z"; full ISO passes through; garbage → null. */
export function isoFromDateAttr(value: string | null | undefined): string | null {
  if (!value) return null;
  const v = value.trim();
  const ms = Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(v) ? `${v}T00:00:00Z` : v);
  return Number.isNaN(ms) ? null : new Date(ms).toISOString();
}

/** Epoch ms or s (number or numeric string) or a date string → ISO; garbage → null. */
export function isoFromEpochOrDate(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    const ms = value < 1e12 ? value * 1000 : value;
    return new Date(ms).toISOString();
  }
  if (typeof value === "string" && value.trim()) {
    const v = value.trim();
    if (/^\d{10,13}$/.test(v)) return isoFromEpochOrDate(Number(v));
    // "2025-11-25 12:34:56" (no zone) — Naukri detail timestamps are IST.
    const local = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}(?::\d{2})?)$/.exec(v);
    const ms = Date.parse(local ? `${local[1]}T${local[2]}+05:30` : v);
    return Number.isNaN(ms) ? null : new Date(ms).toISOString();
  }
  return null;
}
