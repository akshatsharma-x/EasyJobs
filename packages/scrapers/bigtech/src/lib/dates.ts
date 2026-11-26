/**
 * Date helpers. Career sites express dates as ISO strings, epoch numbers, "November 25, 2026",
 * "25-Nov-2026", "25/11/2026" (day-first in India), or relative phrases ("Posted 3 Days Ago",
 * "30+ Days Ago", "about 6 hours", "Yesterday"). Everything is returned as an ISO-8601 UTC string.
 */

const MONTH_NAMES = [
  "january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december",
];

const DAY_MS = 86_400_000;

/** "Nov" / "November" / "Sept" → 10 / 10 / 8. Rejects non-month words ("Maybe", "Monday"). */
function monthIndex(name: string): number | undefined {
  const w = name.toLowerCase();
  if (w.length < 3) return undefined;
  const i = MONTH_NAMES.findIndex((full) => full.startsWith(w));
  return i >= 0 ? i : undefined;
}

function utcDate(y: number, m: number, d: number): Date | null {
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return null;
  if (y < 100) y += 2000;
  if (m < 0 || m > 11 || d < 1 || d > 31 || y < 1990 || y > 2100) return null;
  const date = new Date(Date.UTC(y, m, d));
  return date.getUTCMonth() === m ? date : null;
}

export interface ParseDateOptions {
  /** For ambiguous numeric dates like 03/04/2026 — default true (India: DD/MM/YYYY). */
  dayFirst?: boolean;
  /** Reference "now" for relative phrases (default: current time). */
  now?: Date;
}

/** Parses relative phrases. Returns null if the text is not a relative date. */
export function parseRelativeDate(text: string, now: Date = new Date()): Date | null {
  const s = text.toLowerCase().replace(/\s+/g, " ").trim();
  if (!s) return null;
  if (/\b(just now|moments? ago|few (seconds|minutes) ago|today|this (morning|afternoon|evening))\b/.test(s)) return new Date(now);
  if (/\byesterday\b/.test(s)) return new Date(now.getTime() - DAY_MS);
  const m = /(\d+|an?|one|few|several)\+?\s*(second|sec|minute|min|hour|hr|day|week|wk|month|mo|year|yr)s?\b/.exec(s);
  if (!m) return null;
  const word = m[1] ?? "1";
  const n = /^\d+$/.test(word) ? Number(word) : word === "few" || word === "several" ? 3 : 1;
  const unit = m[2] ?? "day";
  const ms =
    unit.startsWith("s") ? 1000
    : unit === "minute" || unit === "min" ? 60_000
    : unit === "hour" || unit === "hr" ? 3_600_000
    : unit === "day" ? DAY_MS
    : unit === "week" || unit === "wk" ? 7 * DAY_MS
    : unit === "month" || unit === "mo" ? 30 * DAY_MS
    : 365 * DAY_MS;
  return new Date(now.getTime() - n * ms);
}

/** Named zones that show up in feeds; V8 doesn't know IST/SGT/… (minutes east of UTC). */
const ZONE_OFFSETS: Record<string, number> = {
  gmt: 0, utc: 0, ut: 0, z: 0, ist: 330, sgt: 480, jst: 540, cet: 60, cest: 120, bst: 60,
  est: -300, edt: -240, cst: -360, cdt: -300, mst: -420, mdt: -360, pst: -480, pdt: -420,
};

function zoneOffset(zone: string | undefined): number | undefined {
  const z = (zone ?? "gmt").toLowerCase();
  if (/^[+-]/.test(z)) {
    const digits = z.replace(":", "");
    return (z[0] === "-" ? -1 : 1) * (Number(digits.slice(1, 3)) * 60 + Number(digits.slice(3, 5)));
  }
  return ZONE_OFFSETS[z];
}

function zonedUtc(y: number, mo: number, d: number, hh: number, mm: number, ss: number, offset: number): Date | null {
  const t = Date.UTC(y, mo, d, hh, mm, ss) - offset * 60_000;
  return Number.isNaN(t) ? null : new Date(t);
}

/**
 * RFC 2822 / RSS ("Fri, 24 Jun 2022 12:00:00 IST", "24 Jun 2022 12:00 +0530") and Java's
 * Date.toString() used by SuccessFactors ("Sat Nov 14 02:00:00 UTC 2026").
 */
function parseRfc2822(s: string): Date | null {
  let m = /^(?:[a-z]{3,9},?\s+)?(\d{1,2})\s+([a-z]{3,9})\.?\s+(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([a-z]{1,4}|[+-]\d{2}:?\d{2})?$/i.exec(s);
  if (m) {
    const mo = monthIndex(m[2] ?? "");
    const offset = zoneOffset(m[7]);
    if (mo === undefined || offset === undefined) return null;
    return zonedUtc(Number(m[3]), mo, Number(m[1]), Number(m[4]), Number(m[5]), Number(m[6] ?? 0), offset);
  }
  m = /^(?:[a-z]{3,9}\s+)?([a-z]{3,9})\s+(\d{1,2})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s+([a-z]{1,4}|[+-]\d{2}:?\d{2})\s+(\d{4})$/i.exec(s);
  if (m) {
    const mo = monthIndex(m[1] ?? "");
    const offset = zoneOffset(m[6]);
    if (mo === undefined || offset === undefined) return null;
    return zonedUtc(Number(m[7]), mo, Number(m[2]), Number(m[3]), Number(m[4]), Number(m[5] ?? 0), offset);
  }
  return null;
}

/** Parses absolute dates in many shapes. Returns null when unparseable. */
export function parseAbsoluteDate(input: string, opts: ParseDateOptions = {}): Date | null {
  const trimmed = input.trim().replace(/\s+/g, " ").replace(/(\d)(st|nd|rd|th)\b/gi, "$1");
  if (!trimmed) return null;
  const dayFirst = opts.dayFirst ?? true;
  const rfc = parseRfc2822(trimmed);
  if (rfc) return rfc;
  const s = trimmed.replace(/^(mon|tue|wed|thu|fri|sat|sun)[a-z]*\.?,?\s+/i, "");

  // ISO-ish: 2026-11-25, 2026-11-25T10:00:00Z, 2026-11-25 10:00:00
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const isoLike = /^\d{4}-\d{2}-\d{2}$/.test(s) ? `${s}T00:00:00Z` : s.replace(" ", "T");
    const t = Date.parse(isoLike);
    if (!Number.isNaN(t)) return new Date(t);
    const t2 = Date.parse(isoLike.replace(/(\.\d{3})\d+/, "$1"));
    if (!Number.isNaN(t2)) return new Date(t2);
  }
  // Numeric: 25/11/2026, 25-11-2026, 25.11.2026 (dayFirst) or 11/25/2026
  let m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})\b/.exec(s);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    const y = Number(m[3]);
    const [d, mo] = a > 12 ? [a, b] : b > 12 ? [b, a] : dayFirst ? [a, b] : [b, a];
    return utcDate(y, mo - 1, d);
  }
  // 2026/11/25
  m = /^(\d{4})[/.](\d{1,2})[/.](\d{1,2})\b/.exec(s);
  if (m) return utcDate(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  // 25 Nov 2026, 25-Nov-2026, 25-Nov-26
  m = /^(\d{1,2})[ -]([a-z]{3,9})\.?,?[ -](\d{2,4})\b/i.exec(s);
  if (m) {
    const mo = monthIndex(m[2] ?? "");
    if (mo !== undefined) return utcDate(Number(m[3]), mo, Number(m[1]));
  }
  // November 25, 2026 / Nov 25 2026 / Wed, Nov 25, 2026
  m = /(?:^|[\s,])([a-z]{3,9})\.? (\d{1,2}),? (\d{4})\b/i.exec(s);
  if (m) {
    const mo = monthIndex(m[1] ?? "");
    if (mo !== undefined) return utcDate(Number(m[3]), mo, Number(m[2]));
  }
  // Fallback to the engine for RFC 2822 etc. — only if it names a year and every word is a
  // month/day/time-zone token (V8's parser is lenient: it reads "Maybe 12, 2026" as May 12).
  const words = s.match(/[a-z]+/gi) ?? [];
  const allowed = (w: string): boolean =>
    monthIndex(w) !== undefined || /^(mon|tue|wed|thu|fri|sat|sun)[a-z]*$/i.test(w) || /^(gmt|utc|ist|z|t|am|pm|[ecmp][sd]t)$/i.test(w);
  if (/\b(19|20)\d{2}\b/.test(s) && words.every(allowed)) {
    const t = Date.parse(s);
    if (!Number.isNaN(t)) return new Date(t);
  }
  return null;
}

/** Epoch seconds or milliseconds → Date. */
export function fromEpoch(value: number): Date | null {
  if (!Number.isFinite(value) || value <= 0) return null;
  const ms = value < 1e11 ? value * 1000 : value;
  const d = new Date(ms);
  return d.getUTCFullYear() >= 1990 && d.getUTCFullYear() <= 2100 ? d : null;
}

/** Any date-ish value → ISO string (UTC) or null. */
export function toIsoDate(value: unknown, opts: ParseDateOptions = {}): string | null {
  if (value === null || value === undefined || value === "") return null;
  let d: Date | null = null;
  if (value instanceof Date) d = Number.isNaN(value.getTime()) ? null : value;
  else if (typeof value === "number") d = fromEpoch(value);
  else if (typeof value === "string") {
    const s = value.trim();
    if (/^\d{10,13}$/.test(s)) d = fromEpoch(Number(s));
    else {
      const m = /\/Date\((\d+)([+-]\d{4})?\)\//.exec(s); // ASP.NET JSON dates
      d = m ? fromEpoch(Number(m[1])) : parseAbsoluteDate(s, opts) ?? parseRelativeDate(s, opts.now);
    }
  }
  return d ? d.toISOString() : null;
}

/**
 * Like toIsoDate but for posting dates: values slightly in the future (time-zone skew of a
 * date-only value) are clamped to now; values far in the future are rejected.
 */
export function postedAtFrom(value: unknown, opts: ParseDateOptions = {}): string | null {
  const iso = toIsoDate(value, opts);
  if (!iso) return null;
  const now = (opts.now ?? new Date()).getTime();
  const t = Date.parse(iso);
  if (t > now + 2 * DAY_MS) return null;
  return t > now ? new Date(now).toISOString() : iso;
}

/**
 * A zone-less timestamp ("2026-11-25T09:20:20.183246") read in a fixed UTC offset — India-hosted
 * APIs (Infosys, TCS, …) emit IST wall-clock times without a zone. Values that carry a zone pass through.
 */
export function naiveToIso(value: string | null | undefined, offset = "+05:30"): string | null {
  if (!value) return null;
  const s = value.trim();
  const zoned = /([zZ]|[+-]\d{2}:?\d{2})$/.test(s) ? s : /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s) ? `${s.replace(/(\.\d{3})\d+$/, "$1")}${offset}` : s;
  return toIsoDate(zoned);
}
