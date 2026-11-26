/** Converts the timestamp shapes used by the ATS APIs into ISO-8601 UTC strings. */

const MIN_YEAR = 1995;

/**
 * Accepts:
 *  - epoch milliseconds or seconds (number or numeric string) — Lever `createdAt`
 *  - ISO-8601 with offsets — Greenhouse "2026-09-14T03:52:53-04:00"
 *  - "YYYY-MM-DD HH:MM:SS UTC" — Recruitee
 *  - "YYYY-MM-DD" — Workable / BambooHR (taken as midnight UTC)
 *  - RFC 822 — Teamtailor RSS "Wed, 25 Nov 2026 13:26:00 +0100"
 * Returns null for anything unparseable or implausible.
 */
export function toIso(input: unknown): string | null {
  let ms: number | null = null;
  if (typeof input === "number" && Number.isFinite(input)) {
    ms = input < 1e11 ? input * 1000 : input;
  } else if (typeof input === "string") {
    const s = input.trim();
    if (!s) return null;
    if (/^\d{9,13}$/.test(s)) {
      const n = Number(s);
      ms = n < 1e11 ? n * 1000 : n;
    } else if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
      ms = Date.parse(`${s}T00:00:00Z`);
    } else {
      const m = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?)\s*(UTC|GMT|Z)$/i.exec(s);
      ms = m ? Date.parse(`${m[1]}T${m[2]}Z`) : Date.parse(s);
    }
  }
  if (ms === null || !Number.isFinite(ms)) return null;
  const d = new Date(ms);
  const year = d.getUTCFullYear();
  if (year < MIN_YEAR || year > new Date().getUTCFullYear() + 5) return null;
  return d.toISOString();
}
