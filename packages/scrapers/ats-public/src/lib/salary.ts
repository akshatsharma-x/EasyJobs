/**
 * Salary hints. Rule: never invent a salary — return null unless amount, currency and period are all known.
 */
import type { Salary } from "@easyjobs/contract";
import { countryCode } from "./location";
import { clean, toNumber } from "./text";

export type SalaryPeriod = Salary["period"];

/** Below this (in major units) a range is a placeholder, e.g. MongoDB's "USD 0.01 – 0.01". */
const MIN_PLAUSIBLE = 5;

const ISO_CURRENCIES = new Set<string>(Intl.supportedValuesOf("currency"));

/** True for a real ISO 4217 code ("INR", "USD"); rejects words such as "PER" or "AND". */
export function isCurrencyCode(value: unknown): value is string {
  return typeof value === "string" && ISO_CURRENCIES.has(value);
}

const fmt = (n: number): string =>
  n.toLocaleString("en-US", { maximumFractionDigits: n >= 100 ? 0 : 2, minimumFractionDigits: 0 });

export function formatSalaryRaw(min: number | null, max: number | null, currency: string, period: SalaryPeriod | null): string {
  const amount = min !== null && max !== null && min !== max ? `${fmt(min)}–${fmt(max)}` : fmt((min ?? max) as number);
  const prefix = min === null && max !== null ? "up to " : max === null && min !== null ? "from " : "";
  return `${currency} ${prefix}${amount}${period ? ` per ${period}` : ""}`;
}

export interface SalaryInput {
  min?: unknown;
  max?: unknown;
  currency?: unknown;
  period?: SalaryPeriod | null;
  raw?: string | null;
}

/** Validated Salary or null. Non-positive bounds count as unknown; swapped bounds are fixed. */
export function makeSalary(input: SalaryInput): Salary | null {
  let min = toNumber(input.min);
  let max = toNumber(input.max);
  if (min !== null && min <= 0) min = null;
  if (max !== null && max <= 0) max = null;
  if (min === null && max === null) return null;
  if (Math.max(min ?? 0, max ?? 0) < MIN_PLAUSIBLE) return null;
  if (min !== null && max !== null && min > max) [min, max] = [max, min];
  const currency = clean(input.currency)?.toUpperCase() ?? null;
  if (!isCurrencyCode(currency)) return null;
  const period = input.period ?? null;
  if (!period || !isPlausibleSalary(min, max, currency, period)) return null;
  return { min, max, currency, period, raw: clean(input.raw) ?? formatSalaryRaw(min, max, currency, period) };
}

/**
 * Interval labels from the ATS APIs → contract period.
 * "per-year-salary" (Lever), "1 YEAR" (Ashby), "YEARLY"/"MONTHLY" (SmartRecruiters), "year"/"month" (Recruitee).
 * Week/day/one-time intervals have no contract period → null (the raw text is still kept).
 */
export function periodFromInterval(value: unknown): SalaryPeriod | null {
  const s = clean(value)?.toLowerCase();
  if (!s) return null;
  if (/\b(week|weekly|day|daily|one[- ]?time|project)\b|per-week|per-day/.test(s)) return null;
  if (/(^|[^a-z])(year|yearly|annual|annually|annum|yr)([^a-z]|$)|per-year/.test(s)) return "year";
  if (/(^|[^a-z])(month|monthly|mo)([^a-z]|$)|per-month/.test(s)) return "month";
  if (/(^|[^a-z])(hour|hourly|hr)([^a-z]|$)|per-hour/.test(s)) return "hour";
  return null;
}

/** Period words in free text ("Germany Annual Pay Range", "$14 / hour"). */
export function periodFromText(text: string | null | undefined): SalaryPeriod | null {
  if (!text) return null;
  const s = text.toLowerCase();
  if (/\b(per hour|hourly|an hour)\b|\/\s*(hr|hour)\b/.test(s)) return "hour";
  if (/\b(per month|monthly|a month)\b|\/\s*(mo|month)\b/.test(s)) return "month";
  if (/\b(per year|per annum|annual|annually|yearly|a year)\b|\/\s*(yr|year|annum)\b|\bp\.\s?a\./.test(s)) return "year";
  return null;
}

/** Rough units-per-USD, used ONLY to classify an unlabelled amount as hourly vs yearly. */
const UNITS_PER_USD: Record<string, number> = {
  USD: 1, EUR: 0.92, GBP: 0.79, CHF: 0.88, CAD: 1.37, AUD: 1.52, NZD: 1.65, SGD: 1.34, HKD: 7.8, JPY: 150,
  CNY: 7.2, INR: 84, KRW: 1350, TWD: 32, PHP: 57, IDR: 15800, MYR: 4.5, THB: 35, VND: 25000, AED: 3.67,
  SAR: 3.75, ILS: 3.7, TRY: 34, ZAR: 18, BRL: 5.4, MXN: 18, COP: 4000, CLP: 950, ARS: 900, PLN: 3.9,
  CZK: 23, HUF: 360, RON: 4.6, SEK: 10.5, NOK: 10.7, DKK: 6.9, EGP: 48, NGN: 1500, KES: 130, PKR: 280,
};

/**
 * Period of an unlabelled range by magnitude. Only answers when unambiguous:
 * ≤ $200 → hour; ≥ $10,000 at the low end → year; anything in between (could be a monthly stipend) → null.
 */
export function periodFromMagnitude(min: number | null, max: number | null, currency: string): SalaryPeriod | null {
  const rate = UNITS_PER_USD[currency];
  if (!rate) return null;
  const hi = (max ?? min ?? 0) / rate;
  const lo = (min ?? max ?? 0) / rate;
  if (hi > 0 && hi <= 200) return "hour";
  if (lo >= 10_000) return "year";
  return null;
}

/** Plausible amounts per period, in USD-equivalents (wide on purpose; Indian stipends start around ₹2,500/month). */
const PLAUSIBLE: Record<SalaryPeriod, [number, number]> = { hour: [1, 1_000], month: [30, 100_000], year: [500, 10_000_000] };

/**
 * False when the amounts cannot be right for the period — e.g. Databricks labels some yearly ranges
 * "SF Bay Area Hourly Rate" (USD 222,500 "per hour"). Unknown currencies are not checked.
 */
export function isPlausibleSalary(min: number | null, max: number | null, currency: string, period: SalaryPeriod): boolean {
  const rate = UNITS_PER_USD[currency];
  if (!rate) return true;
  const [lo, hi] = PLAUSIBLE[period];
  const low = (min ?? max ?? 0) / rate;
  const high = (max ?? min ?? 0) / rate;
  return low >= lo && high <= hi;
}

const SYMBOLS: Record<string, string> = { "₹": "INR", "€": "EUR", "£": "GBP", "¥": "JPY", "₩": "KRW", "₱": "PHP", "₪": "ILS", "₺": "TRY", "₦": "NGN" };
const DOLLAR_BY_COUNTRY: Record<string, string> = {
  CA: "CAD", AU: "AUD", NZ: "NZD", SG: "SGD", HK: "HKD", MX: "MXN", TW: "TWD", CO: "COP", CL: "CLP", AR: "ARS",
};

/** "$" means USD unless the job's country uses its own dollar (Breezy shows "$" for CAD jobs in Toronto). */
export function currencyFromSymbol(symbol: string, country?: unknown): string | null {
  if (symbol === "$") return DOLLAR_BY_COUNTRY[countryCode(country) ?? ""] ?? "USD";
  return SYMBOLS[symbol] ?? null;
}

const AMOUNT = String.raw`(\d[\d,]*(?:\.\d+)?)\s*([kKmM])?`;
const CURRENCY = String.raw`([$€£₹¥₩₱₪₺₦]|[A-Z]{3}\b)?`;
const STRICT_RANGE = new RegExp(
  String.raw`^\s*${CURRENCY}\s*${AMOUNT}\s*(\+)?\s*(?:(?:-|–|—|to)\s*${CURRENCY}\s*${AMOUNT})?\s*(?:${CURRENCY})?\s*(?:/|per|an|a)?\s*(hour|hr|hourly|month|mo|monthly|year|yr|yearly|annum|annual|annually)?\s*\.?\s*$`,
  "i",
);

const scale = (n: string, suffix: string | undefined): number | null => {
  const v = toNumber(n);
  if (v === null) return null;
  if (!suffix) return v;
  return /k/i.test(suffix) ? v * 1_000 : v * 1_000_000;
};

/**
 * Strict parser for short, structured salary strings such as "$75,000 – $80,000 / year", "$14 / hour",
 * "€60k per year", "INR 25,000 - 30,000 / month". Anything looser returns null (the raw text is kept
 * in salaryRaw for the normalizer).
 */
export function parseSalaryText(text: unknown, country?: unknown): Salary | null {
  const raw = clean(text);
  if (!raw || raw.length > 80) return null;
  const m = STRICT_RANGE.exec(raw);
  if (!m) return null;
  const [, cur1, a1, s1, plus, cur2, a2, s2, cur3, periodWord] = m;
  const toCurrency = (c: string | undefined): string | null => {
    if (!c) return null;
    if (/^[a-z]{3}$/i.test(c)) return isCurrencyCode(c.toUpperCase()) ? c.toUpperCase() : null;
    return currencyFromSymbol(c, country);
  };
  const currency = toCurrency(cur1) ?? toCurrency(cur2) ?? toCurrency(cur3);
  const period = periodFromInterval(periodWord);
  if (!currency || !period) return null;
  const lo = scale(a1 ?? "", s1);
  const hi = a2 !== undefined ? scale(a2, s2) : plus ? null : lo;
  return makeSalary({ min: lo, max: hi, currency, period, raw });
}
