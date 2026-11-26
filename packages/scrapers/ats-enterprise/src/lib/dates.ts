const DAY_MS = 86_400_000;
const MIN_YEAR = 1995;

/** Zone abbreviations seen in Java-formatted dates from enterprise ATSs. */
const TZ_OFFSETS: Record<string, string> = {
  UTC: "+0000", GMT: "+0000", Z: "+0000", IST: "+0530", PST: "-0800", PDT: "-0700", MST: "-0700", MDT: "-0600",
  CST: "-0600", CDT: "-0500", EST: "-0500", EDT: "-0400", CET: "+0100", CEST: "+0200", BST: "+0100",
  EET: "+0200", EEST: "+0300", JST: "+0900", KST: "+0900", SGT: "+0800", HKT: "+0800", AEST: "+1000", AEDT: "+1100",
};

function sane(ms: number, now: Date): boolean {
  if (!Number.isFinite(ms)) return false;
  const year = new Date(ms).getUTCFullYear();
  // Allow a little clock skew into the future; reject placeholder years (1900, 9999…).
  return year >= MIN_YEAR && ms <= now.getTime() + 2 * 365 * DAY_MS;
}

/**
 * A calendar date ("2026-11-25") has no time of day. Anchor it at 12:00 UTC (error ≤ ±12 h for
 * most time zones) but never in the future, so a job posted "today" in any zone still counts as new.
 */
export function dateOnlyToIso(date: string, now: Date = new Date()): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date.trim());
  if (!m) return null;
  const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0);
  if (!sane(ms, now)) return null;
  return new Date(Math.min(ms, now.getTime())).toISOString();
}

/** Epoch seconds or milliseconds → ISO. */
export function epochToIso(value: number, now: Date = new Date()): string | null {
  if (!Number.isFinite(value) || value <= 0) return null;
  const ms = value < 1e11 ? value * 1000 : value;
  return sane(ms, now) ? new Date(ms).toISOString() : null;
}

/**
 * Lenient date → ISO-8601 UTC: ISO strings, date-only strings, epoch numbers/strings,
 * "11/25/2026", "25 Nov 2026", "Nov 25, 2026". Returns null when unknown/implausible.
 */
export function toIso(value: unknown, now: Date = new Date()): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return epochToIso(value, now);
  if (value instanceof Date) return sane(value.getTime(), now) ? value.toISOString() : null;
  if (typeof value !== "string") return null;
  const s = value.trim();
  if (!s) return null;
  if (/^\d{10}(?:\d{3})?$/.test(s)) return epochToIso(Number(s), now);
  const dateOnly = /^(\d{4}-\d{2}-\d{2})(?:T00:00(?::00(?:\.0+)?)?)?$/.exec(s);
  if (dateOnly?.[1]) return dateOnlyToIso(dateOnly[1], now);
  // US-style 11/25/2026 (schema.org pages from US vendors); ambiguous dd/mm resolved when day > 12.
  const slash = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (slash) {
    let month = Number(slash[1]);
    let day = Number(slash[2]);
    if (month > 12 && day <= 12) [month, day] = [day, month];
    return dateOnlyToIso(`${slash[3]}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`, now);
  }
  // ISO date-time without an offset: schema.org pages mean UTC; V8 would read it as server-local time.
  if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/.test(s)) {
    const ms = Date.parse(`${s.replace(" ", "T")}Z`);
    return sane(ms, now) ? new Date(ms).toISOString() : null;
  }
  // Java Date.toString(): "Thu Nov 12 02:00:00 UTC 2026" (SuccessFactors microdata).
  const java = /^[A-Za-z]{3} ([A-Za-z]{3}) (\d{1,2}) (\d{2}:\d{2}:\d{2}) ([A-Za-z]{2,5}) (\d{4})$/.exec(s);
  if (java) {
    const offset = TZ_OFFSETS[(java[4] ?? "").toUpperCase()];
    if (offset !== undefined) {
      const ms = Date.parse(`${java[2]} ${java[1]} ${java[5]} ${java[3]} GMT${offset}`);
      return sane(ms, now) ? new Date(ms).toISOString() : null;
    }
  }
  const ms = Date.parse(s);
  if (!sane(ms, now)) return null;
  // "Nov 25, 2026" / "25 Nov 2026" parse as local midnight; treat them as calendar dates.
  if (!/\d{1,2}:\d{2}/.test(s)) {
    const d = new Date(ms);
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    return dateOnlyToIso(iso, now);
  }
  return new Date(ms).toISOString();
}

export interface RelativeDate {
  iso: string;
  /** true when the label is a lower bound ("30+ Days Ago") or coarse (weeks/months). */
  approximate: boolean;
}

/**
 * Relative "posted" labels → ISO. Covers Workday ("Posted Today", "Posted Yesterday",
 * "Posted 3 Days Ago", "Posted 30+ Days Ago") and common variants ("2 hours ago", "1 week ago").
 */
export function parseRelativePosted(label: string | null | undefined, now: Date = new Date()): RelativeDate | null {
  if (!label) return null;
  const s = label.toLowerCase().replace(/\s+/g, " ").trim();
  const at = (ms: number, approximate: boolean): RelativeDate => ({ iso: new Date(now.getTime() - ms).toISOString(), approximate });
  if (/\b(?:just now|today|moments? ago|few (?:minutes|hours) ago)\b/.test(s)) return at(0, false);
  if (/\byesterday\b/.test(s)) return at(DAY_MS, false);
  const m = /(\d+)\s*(\+)?\s*(minute|min|hour|hr|day|week|month|year)s?\b/.exec(s);
  if (!m) return null;
  const n = Number(m[1]);
  const plus = Boolean(m[2]);
  const unit = m[3] ?? "";
  if (!/ago|posted|\+/.test(s) && !/^\d/.test(s)) return null;
  switch (unit) {
    case "minute":
    case "min":
      return at(n * 60_000, plus);
    case "hour":
    case "hr":
      return at(n * 3_600_000, plus);
    case "day":
      return at(n * DAY_MS, plus);
    case "week":
      return at(n * 7 * DAY_MS, true);
    case "month":
      return at(n * 30 * DAY_MS, true);
    case "year":
      return at(n * 365 * DAY_MS, true);
    default:
      return null;
  }
}

/** True if `iso` is strictly before `now` minus `graceMs`. */
export function isPast(iso: string | null | undefined, now: Date = new Date(), graceMs = DAY_MS): boolean {
  if (!iso) return false;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) && ms < now.getTime() - graceMs;
}
