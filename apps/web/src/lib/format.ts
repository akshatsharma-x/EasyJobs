/**
 * Display formatters shared by server and client components. Pure and locale-stable (en-IN, Asia/Kolkata),
 * so server-rendered HTML matches the client.
 */
import type { ExperienceLevel, Salary } from "@easyjobs/contract";

const MINUTE = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;
const TIME_ZONE = "Asia/Kolkata";

const CURRENCY_SYMBOLS: Record<string, string> = {
  INR: "₹", USD: "$", EUR: "€", GBP: "£", JPY: "¥", SGD: "S$", CAD: "C$", AUD: "A$", AED: "AED ", CHF: "CHF ",
};

const countFormatter = new Intl.NumberFormat("en-IN");
const dateFormatter = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: TIME_ZONE });
const dayMonthFormatter = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: TIME_ZONE });
const yearFormatter = new Intl.DateTimeFormat("en-IN", { year: "numeric", timeZone: TIME_ZONE });

/** Up to one decimal, trailing ".0" dropped: 4 → "4", 4.5 → "4.5", 4.25 → "4.3". */
function num(n: number): string {
  return String(Number(n.toFixed(1)));
}

function currencySymbol(currency: string): string {
  const known = CURRENCY_SYMBOLS[currency];
  if (known) return known;
  try {
    const part = new Intl.NumberFormat("en", { style: "currency", currency, currencyDisplay: "narrowSymbol" })
      .formatToParts(0)
      .find((p) => p.type === "currency");
    if (part && part.value !== currency) return part.value;
  } catch {
    /* unknown ISO code — fall through */
  }
  return `${currency} `;
}

/** "₹4–6 LPA" · "₹12 LPA" · "₹1.2–1.8 Cr" — INR per year. */
function inrYearly(min: number | null, max: number | null): string {
  const top = max ?? min ?? 0;
  const [div, unit] = top >= 10_000_000 ? [10_000_000, " Cr"] : [100_000, " LPA"];
  const a = min === null ? null : num(min / div);
  const b = max === null ? null : num(max / div);
  if (a !== null && b !== null) return a === b ? `₹${a}${unit}` : `₹${a}–${b}${unit}`;
  if (a !== null) return `From ₹${a}${unit}`;
  return `Up to ₹${b}${unit}`;
}

/** "₹25k/mo" · "₹20–30k/mo" · "₹1.2L/mo" · "₹90k–1.1L/mo" · "₹800/mo" — INR per month (each bound in its own unit). */
function inrMonthly(min: number | null, max: number | null): string {
  const part = (n: number): [string, string] =>
    n >= 100_000 ? [num(n / 100_000), "L"] : n >= 1000 ? [num(n / 1000), "k"] : [num(n), ""];
  const a = min === null ? null : part(min);
  const b = max === null ? null : part(max);
  if (a && b) {
    if (a[0] === b[0] && a[1] === b[1]) return `₹${a[0]}${a[1]}/mo`;
    return a[1] === b[1] ? `₹${a[0]}–${b[0]}${b[1]}/mo` : `₹${a[0]}${a[1]}–${b[0]}${b[1]}/mo`;
  }
  if (a) return `From ₹${a[0]}${a[1]}/mo`;
  return `Up to ₹${b?.[0] ?? "0"}${b?.[1] ?? ""}/mo`;
}

/** Compact amount with the unit repeated on both ends for non-INR currencies: "$120k–150k". */
function compactAmount(n: number): string {
  if (n >= 1_000_000) return `${num(n / 1_000_000)}M`;
  if (n >= 1000) return `${num(n / 1000)}k`;
  return num(n);
}

const PERIOD_SUFFIX: Record<Salary["period"], string> = { hour: "/hr", month: "/mo", year: "/yr" };

/**
 * "₹4–6 LPA" · "₹12 LPA" · "₹25k/mo" · "₹20–30k/mo" · "₹1.2L/mo" · "₹1.2–1.8 Cr" · "₹500/hr" · "$120k–150k/yr" ·
 * "€60k/yr" · "$40–60/hr" · "From ₹5 LPA" · "Up to ₹8 LPA". Both bounds missing → `salary.raw` (≤ 32 chars) or null.
 */
export function formatSalary(salary: Salary | null | undefined): string | null {
  if (!salary) return null;
  let min = typeof salary.min === "number" && Number.isFinite(salary.min) && salary.min > 0 ? salary.min : null;
  let max = typeof salary.max === "number" && Number.isFinite(salary.max) && salary.max > 0 ? salary.max : null;
  if (min !== null && max !== null && min > max) [min, max] = [max, min];
  if (min === null && max === null) {
    const raw = salary.raw?.replace(/\s+/g, " ").trim();
    if (!raw) return null;
    return raw.length > 32 ? `${raw.slice(0, 31).trimEnd()}…` : raw;
  }
  const currency = (salary.currency || "INR").toUpperCase();
  if (currency === "INR") {
    if (salary.period === "year") return inrYearly(min, max);
    if (salary.period === "month") return inrMonthly(min, max);
  }
  const sym = currencySymbol(currency);
  const suffix = PERIOD_SUFFIX[salary.period] ?? "";
  // Hourly amounts stay plain ("$40–60/hr"); larger amounts are compacted ("$120k–150k/yr").
  const fmt = salary.period === "hour" ? num : compactAmount;
  if (min !== null && max !== null) {
    const a = fmt(min);
    const b = fmt(max);
    return a === b ? `${sym}${a}${suffix}` : `${sym}${a}–${b}${suffix}`;
  }
  if (min !== null) return `From ${sym}${fmt(min)}${suffix}`;
  return `Up to ${sym}${fmt(max as number)}${suffix}`;
}

/** "just now" · "5m ago" · "2h ago" · "3d ago" · "2w ago" · "4 Mar" · "4 Mar 2025". Invalid input → "". */
export function formatRelativeTime(iso: string, now: number = Date.now()): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  const diff = now - t;
  if (diff < MINUTE) return "just now";
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)}m ago`;
  if (diff < DAY) return `${Math.floor(diff / HOUR)}h ago`;
  const days = Math.floor(diff / DAY);
  if (days < 7) return `${days}d ago`;
  if (days < 35) return `${Math.floor(days / 7)}w ago`;
  const date = new Date(t);
  return yearFormatter.format(date) === yearFormatter.format(new Date(now)) ? dayMonthFormatter.format(date) : dateFormatter.format(date);
}

/** postedAt within the last 24 hours ("New"). */
export function isNewJob(iso: string, now: number = Date.now()): boolean {
  const t = Date.parse(iso);
  return !Number.isNaN(t) && now - t < DAY;
}

/** en-IN digit grouping: 12480 → "12,480", 123456 → "1,23,456". */
export function formatCount(n: number): string {
  return countFormatter.format(Math.round(n));
}

/**
 * Indian compact notation: 950 → "950", 1284 → "1.3k", 12480 → "12.5k", 1,20,000 → "1.2L", 12,00,000 → "12L",
 * 3,40,00,000 → "3.4Cr". Thousands use "k" below one lakh.
 */
export function formatCompact(n: number): string {
  const v = Math.round(n);
  const sign = v < 0 ? "-" : "";
  const a = Math.abs(v);
  if (a < 1000) return `${sign}${a}`;
  if (a < 100_000) return `${sign}${num(a / 1000)}k`;
  if (a < 10_000_000) return `${sign}${num(a / 100_000)}L`;
  return `${sign}${num(a / 10_000_000)}Cr`;
}

const LEVEL_FALLBACK: Record<ExperienceLevel, string> = {
  intern: "Internship",
  fresher: "Fresher",
  entry: "0–2 yrs",
  mid: "2–5 yrs",
  senior: "5–8 yrs",
  lead: "8+ yrs",
  executive: "12+ yrs",
};

const yrs = (n: number): string => `${num(n)} ${n === 1 ? "yr" : "yrs"}`;

/** "Internship" · "Fresher" · "0–2 yrs" · "3+ yrs" · "Up to 2 yrs" · "5 yrs"; level fallback when years are unknown. */
export function formatExperience(min: number | null, max: number | null, level: ExperienceLevel): string {
  if (level === "intern") return "Internship";
  if (level === "fresher") return "Fresher";
  if (min === 0 && max !== null && max <= 1) return "Fresher";
  if (min !== null && max !== null) return min === max ? yrs(min) : `${num(min)}–${num(max)} yrs`;
  if (min !== null && min > 0) return `${num(min)}+ yrs`;
  if (min === null && max !== null) return `Up to ${yrs(max)}`;
  return LEVEL_FALLBACK[level];
}

/** "Bengaluru +2" · "Remote (India)" · "London, GB"; [] → "Remote" or "Location not specified". */
export function formatLocations(locations: string[], isRemote: boolean): string {
  const clean = locations.map((l) => l.trim()).filter(Boolean);
  if (clean.length === 0) return isRemote ? "Remote" : "Location not specified";
  const first = (clean[0] as string).replace(/,\s*IN$/i, "");
  return clean.length > 1 ? `${first} +${clean.length - 1}` : first;
}

/** [2026] → "2026 batch" · [2025, 2026] → "2025, 2026 batch" · [2024…2027] → "2024–2027 batch" · [] → "". */
export function formatBatches(batches: number[]): string {
  const years = [...new Set(batches.filter((b) => Number.isFinite(b)).map((b) => Math.trunc(b)))].sort((a, b) => a - b);
  if (years.length === 0) return "";
  if (years.length === 1) return `${years[0]} batch`;
  const consecutive = years.every((y, i) => i === 0 || y === (years[i - 1] as number) + 1);
  if (years.length >= 3 && consecutive) return `${years[0]}–${years[years.length - 1]} batch`;
  return `${years.join(", ")} batch`;
}

/** Slider labels for INR/yr: 0 → "Any" · 300000 → "₹3 LPA" · 450000 → "₹4.5 LPA" · 15000000 → "₹1.5 Cr". */
export function formatInrYearly(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "Any";
  if (n >= 10_000_000) return `₹${num(n / 10_000_000)} Cr`;
  return `₹${num(n / 100_000)} LPA`;
}

/** "26 Nov 2026" (en-IN, Asia/Kolkata). Invalid input → "". */
export function formatDate(iso: string): string {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? "" : dateFormatter.format(new Date(t));
}

/** "38 ms" · "1.2 s". */
export function formatTookMs(ms: number): string {
  const v = Math.max(0, ms);
  return v < 1000 ? `${Math.round(v)} ms` : `${(v / 1000).toFixed(1)} s`;
}
