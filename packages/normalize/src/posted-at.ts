import { asString, bag, cleanLine, NUMBER_WORDS, validNow } from "./text";

const MS = { second: 1_000, minute: 60_000, hour: 3_600_000, day: 86_400_000, week: 604_800_000, month: 2_592_000_000, year: 31_536_000_000 };
const MONTHS: Readonly<Record<string, number>> = {
  jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2, apr: 3, april: 3, may: 4, jun: 5, june: 5, jul: 6, july: 6,
  aug: 7, august: 7, sep: 8, sept: 8, september: 8, oct: 9, october: 9, nov: 10, november: 10, dec: 11, december: 11,
};
const UNIT_ALIASES: Readonly<Record<string, keyof typeof MS>> = {
  s: "second", sec: "second", secs: "second", second: "second", seconds: "second",
  m: "minute", min: "minute", mins: "minute", minute: "minute", minutes: "minute",
  h: "hour", hr: "hour", hrs: "hour", hour: "hour", hours: "hour",
  d: "day", day: "day", days: "day",
  w: "week", wk: "week", wks: "week", week: "week", weeks: "week",
  mo: "month", mon: "month", mos: "month", month: "month", months: "month",
  y: "year", yr: "year", yrs: "year", year: "year", years: "year",
};

const MIN_TS = Date.UTC(1995, 0, 1);

function iso(ts: number): string {
  return new Date(ts).toISOString();
}

function fromEpoch(n: number): number | null {
  if (!Number.isFinite(n) || n <= 0) return null;
  if (n > 1e14) return null;
  if (n >= 1e11) return n; // milliseconds
  if (n >= 1e8) return n * 1000; // seconds
  return null;
}

function utc(y: number, m: number, d: number, h = 0, mi = 0, s = 0): number | null {
  if (m < 0 || m > 11 || d < 1 || d > 31) return null;
  const ts = Date.UTC(y, m, d, h, mi, s);
  const dt = new Date(ts);
  return dt.getUTCMonth() === m && dt.getUTCDate() === d ? ts : null;
}

function year4(y: string): number {
  const n = Number(y);
  return y.length === 2 ? 2000 + n : n;
}

function relative(s: string, now: number): number | null {
  if (/\b(?:just\s+(?:now|posted)|moments?\s+ago|(?:a\s+)?few\s+(?:seconds|minutes)\s+ago|right\s+now|^now$|active\s+now)\b/.test(s)) return now;
  if (/\b(?:posted\s+)?today\b|\btoday'?s\b/.test(s) && !/\d{4}/.test(s)) return now;
  if (/\byesterday\b/.test(s)) return now - MS.day;
  const m =
    /\b(\d{1,4}|an?|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty)\s*\+?\s*(seconds?|secs?|s|minutes?|mins?|m|hours?|hrs?|h|days?|d|weeks?|wks?|w|months?|mos?|mon|years?|yrs?|y)\b\s*\+?\s*(?:ago|back|old)?/.exec(s);
  if (!m) return null;
  const isAgo = /\bago\b|\bback\b|\bold\b|^\s*(?:posted|updated|reposted)?\s*\d+\s*\+?\s*[a-z]+\s*\+?\s*$/.test(s);
  if (!isAgo) return null;
  const qty = /^\d+$/.test(m[1] as string) ? Number(m[1]) : m[1] === "a" || m[1] === "an" ? 1 : (NUMBER_WORDS[m[1] as string] ?? 1);
  const unit = UNIT_ALIASES[m[2] as string];
  if (!unit) return null;
  return now - qty * MS[unit];
}

function absolute(s: string): number | null {
  let m = /\b(\d{4})-(\d{1,2})-(\d{1,2})(?:[t\s](\d{1,2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?\s*(z|[+-]\d{2}:?\d{2})?)?/.exec(s);
  if (m) {
    if (m[4] !== undefined) {
      const isoish = `${m[1]}-${(m[2] as string).padStart(2, "0")}-${(m[3] as string).padStart(2, "0")}T${(m[4] as string).padStart(2, "0")}:${m[5]}:${m[6] ?? "00"}${m[7] ? (m[7] === "z" ? "Z" : (m[7] as string).replace(/^([+-]\d{2})(\d{2})$/, "$1:$2")) : "Z"}`;
      const ts = Date.parse(isoish);
      if (Number.isFinite(ts)) return ts;
    }
    return utc(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  }
  // RFC 2822 first (keeps the time) and other engine-parsable forms ("Tue, 12 Nov 2025 10:00:00 GMT").
  if (/[a-z]{3},?\s+\d{1,2}\s+[a-z]{3}\s+\d{4}/.test(s)) {
    const ts = Date.parse(s);
    if (Number.isFinite(ts)) return ts;
  }
  // 12 Nov 2025 · 12th November, 2025 · 12-Nov-2025
  m = /\b(\d{1,2})(?:st|nd|rd|th)?[\s\-/.,]*([a-z]{3,9})\.?[\s\-/.,]*(\d{4}|\d{2})\b/.exec(s);
  if (m && (m[2] as string) in MONTHS) return utc(year4(m[3] as string), MONTHS[m[2] as string] as number, Number(m[1]));
  // Nov 12, 2025 · November 12th 2025
  m = /\b([a-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})\b/.exec(s);
  if (m && (m[1] as string) in MONTHS) return utc(Number(m[3]), MONTHS[m[1] as string] as number, Number(m[2]));
  // 2025/11/12
  m = /\b(\d{4})[/.](\d{1,2})[/.](\d{1,2})\b/.exec(s);
  if (m) return utc(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  // 12/11/2025 · 12-11-2025 · 12.11.2025 (Indian DD/MM by default; MM/DD when the day is clearly second)
  m = /\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}|\d{2})\b/.exec(s);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    const y = year4(m[3] as string);
    return a > 12 || b <= 12 ? utc(y, b - 1, a) : utc(y, a - 1, b);
  }
  return null;
}

export interface ParseDateOptions {
  now?: Date;
}

/** Parse a date-ish value (ISO, epoch s/ms, relative, "Posted on 12 Nov 2025") → ISO string, or null. */
export function parseDate(input: unknown, opts: ParseDateOptions = {}): string | null {
  const now = validNow(bag(opts).now).getTime();
  if (input instanceof Date) return Number.isFinite(input.getTime()) && input.getTime() >= MIN_TS ? input.toISOString() : null;
  if (typeof input === "number") {
    const ts = fromEpoch(input);
    return ts !== null && ts >= MIN_TS ? iso(ts) : null;
  }
  const s = cleanLine(asString(input).slice(0, 300)).toLowerCase();
  if (!s) return null;
  if (/^\d{9,14}(?:\.\d+)?$/.test(s)) {
    const ts = fromEpoch(Number(s));
    return ts !== null && ts >= MIN_TS ? iso(ts) : null;
  }
  const ts = relative(s, now) ?? absolute(s);
  if (ts === null || !Number.isFinite(ts) || ts < MIN_TS) return null;
  return iso(ts);
}

/**
 * RawJob.postedAt → ISO. Accepts ISO, epoch seconds/ms, "Posted Today", "Just now", "2 days ago", "30+ Days Ago",
 * "Posted on 12 Nov 2025". Unknown, unparseable or future values fall back to `now`.
 */
export function parsePostedAt(input: unknown, nowInput: Date = new Date()): string {
  const now = validNow(nowInput);
  const parsed = parseDate(input, { now });
  if (!parsed) return now.toISOString();
  return Date.parse(parsed) > now.getTime() ? now.toISOString() : parsed;
}
