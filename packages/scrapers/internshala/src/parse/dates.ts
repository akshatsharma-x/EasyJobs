import { cleanText } from "./text";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
/** Internshala shows dates in India Standard Time (UTC+05:30, no DST). */
const IST_OFFSET_MS = 5.5 * HOUR;

export interface AgeRange {
  minMs: number;
  maxMs: number;
}

/**
 * Age range implied by a relative "posted" label.
 * "Just now" · "Few hours ago" · "Today" · "Yesterday" · "N hour(s)/day(s)/week(s)/month(s) ago" · "30+ days ago".
 * Accepts an optional "Posted " prefix. Returns null when the label is not relative.
 */
export function parseRelativeAge(label: string | null | undefined): AgeRange | null {
  const s = cleanText(label).toLowerCase().replace(/^posted\s+/, "");
  if (!s) return null;
  if (/^(just now|few (seconds|minutes|mins) ago|a (few )?(seconds?|minutes?) ago|\d+\s*(seconds?|secs?|minutes?|mins?) ago)$/.test(s)) {
    return { minMs: 0, maxMs: HOUR };
  }
  if (/^(few|a few) hours? ago$/.test(s)) return { minMs: 0, maxMs: 12 * HOUR };
  if (s === "today") return { minMs: 0, maxMs: DAY };
  if (s === "yesterday") return { minMs: DAY, maxMs: 2 * DAY };
  const m = s.match(/^(\d+|an?|one)\s*\+?\s*(hour|hr|day|week|month|year)s?\s*\+?\s*ago$/);
  if (!m) return null;
  const n = m[1] === "a" || m[1] === "an" || m[1] === "one" ? 1 : Number(m[1]);
  const plus = s.includes("+");
  const unit = { hour: HOUR, hr: HOUR, day: DAY, week: 7 * DAY, month: 30 * DAY, year: 365 * DAY }[m[2] as "hour"];
  return { minMs: n * unit, maxMs: plus ? Number.POSITIVE_INFINITY : (n + 1) * unit };
}

/**
 * Internshala detail URLs end with the Unix time (seconds) of the latest (re)post:
 * "/internship/detail/…-at-acme1794806827" → 1794806827. Returns epoch **milliseconds**, or null.
 * Values outside 2015-01-01 … (now + 2 days) are rejected.
 */
export function urlTimestampMs(pathOrUrl: string, now: Date = new Date()): number | null {
  let path = pathOrUrl;
  try {
    path = new URL(pathOrUrl, "https://internshala.com").pathname;
  } catch {
    /* keep raw */
  }
  const m = path.replace(/\/+$/, "").match(/[a-z-](\d{10,})$/i);
  if (!m?.[1]) return null;
  const seconds = Number(m[1].slice(-10));
  const ms = seconds * 1000;
  if (!Number.isFinite(ms) || ms < Date.UTC(2015, 0, 1) || ms > now.getTime() + 2 * DAY) return null;
  return ms;
}

export interface PostedAtResult {
  iso: string | null;
  /** Where the value came from. */
  basis: "url" | "label" | "jsonld" | null;
}

/**
 * Best estimate of when a posting went live.
 * 1. The URL timestamp, if it agrees with the relative label (tolerance −1 day / +2 days) or there is no label.
 * 2. Otherwise the middle of the label's age range.
 * 3. Otherwise the JSON-LD `datePosted` (a date; taken as 00:00 IST).
 */
export function resolvePostedAt(input: {
  label?: string | null;
  urlTsMs?: number | null;
  datePosted?: string | null;
  now: Date;
}): PostedAtResult {
  const now = input.now.getTime();
  const range = parseRelativeAge(input.label);
  const ts = input.urlTsMs ?? null;
  if (ts !== null && ts <= now + HOUR) {
    const age = now - ts;
    const fits = range ? age >= range.minMs - DAY && age <= range.maxMs + 2 * DAY : age <= 400 * DAY;
    if (fits) return { iso: new Date(Math.min(ts, now)).toISOString(), basis: "url" };
  }
  if (range) {
    const hi = Number.isFinite(range.maxMs) ? range.maxMs : range.minMs;
    return { iso: new Date(now - (range.minMs + hi) / 2).toISOString(), basis: "label" };
  }
  const ld = parseIstDateTime(input.datePosted);
  if (ld) return { iso: ld, basis: "jsonld" };
  return { iso: null, basis: null };
}

const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, sept: 8, oct: 9, nov: 10, dec: 11,
};

function istToIso(y: number, mo: number, d: number, h = 0, mi = 0, s = 0): string | null {
  const ms = Date.UTC(y, mo, d, h, mi, s) - IST_OFFSET_MS;
  const check = new Date(ms + IST_OFFSET_MS);
  if (!Number.isFinite(ms) || check.getUTCDate() !== d || check.getUTCMonth() !== mo) return null;
  return new Date(ms).toISOString();
}

/**
 * JSON-LD style IST date-times → ISO UTC.
 * "2026-12-16 23:59:59" → "2026-12-16T18:29:59.000Z" · "2026-11-16" → "2026-11-15T18:30:00.000Z".
 * Strings with an explicit offset/Z are parsed as-is.
 */
export function parseIstDateTime(input: string | null | undefined): string | null {
  const s = cleanText(input);
  if (!s) return null;
  if (/T.*(Z|[+-]\d{2}:?\d{2})$/i.test(s)) {
    const t = Date.parse(s);
    return Number.isNaN(t) ? null : new Date(t).toISOString();
  }
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/);
  if (!m) return null;
  return istToIso(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4] ?? 0), Number(m[5] ?? 0), Number(m[6] ?? 0));
}

/**
 * Internshala short dates: "16 Dec' 26", "1 Jan'27", "16 Dec 2026", "16th Dec' 26".
 * Returns the ISO instant of that day at the given IST time (default end of day — for "apply by").
 */
export function parseShortDate(
  input: string | null | undefined,
  opts: { endOfDay?: boolean } = { endOfDay: true },
): string | null {
  const s = cleanText(input).toLowerCase();
  const m = s.match(/(\d{1,2})(?:st|nd|rd|th)?\s*([a-z]{3,9})\.?\s*[’'`]?\s*(\d{2}|\d{4})\b/);
  if (!m) return null;
  const month = MONTHS[(m[2] ?? "").slice(0, 3)];
  if (month === undefined) return null;
  const yy = Number(m[3]);
  const year = yy < 100 ? 2000 + yy : yy;
  const end = opts.endOfDay ?? true;
  return istToIso(year, month, Number(m[1]), end ? 23 : 0, end ? 59 : 0, end ? 59 : 0);
}

/** "3 Months" → 3 · "1 Month" → 1 · "2 Weeks" → 0.46 · "6 weeks" → 1.38 · otherwise null. */
export function parseDurationMonths(input: string | null | undefined): number | null {
  const m = cleanText(input).toLowerCase().match(/(\d+(?:\.\d+)?)\s*(month|week|day)s?/);
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n) || n <= 0) return null;
  const months = m[2] === "month" ? n : m[2] === "week" ? (n * 7) / 30.44 : n / 30.44;
  return Math.round(months * 100) / 100;
}
