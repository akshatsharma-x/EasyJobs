import type { Salary } from "@easyjobs/contract";

export type SalaryPeriod = Salary["period"];

/** "annual" / "yearly" / "per annum" → "year", etc. Unsupported periods (weekly, daily) → null. */
export function mapPeriod(raw: unknown): SalaryPeriod | null {
  const s = String(raw ?? "").toLowerCase().trim();
  if (!s) return null;
  if (/^(annual(ly)?|year(ly)?|yr|per (year|annum)|p\.?a\.?|annum)$/.test(s)) return "year";
  if (/^(month(ly)?|mo|per month|pm)$/.test(s)) return "month";
  if (/^(hour(ly)?|hr|per hour)$/.test(s)) return "hour";
  return null;
}

const CURRENCY_ALIASES: Record<string, string> = {
  "fa-rupee": "INR", rupee: "INR", rs: "INR", "₹": "INR", "$": "USD", "€": "EUR", "£": "GBP",
};

/** ISO 4217 code or null. */
export function normalizeCurrency(raw: unknown): string | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  const alias = CURRENCY_ALIASES[s.toLowerCase()] ?? CURRENCY_ALIASES[s];
  if (alias) return alias;
  return /^[A-Za-z]{3}$/.test(s) ? s.toUpperCase() : null;
}

const toAmount = (v: unknown): number | null => {
  const n = typeof v === "string" ? Number(v.replace(/[, ]/g, "")) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
};

const SYMBOL: Record<string, string> = { INR: "₹", USD: "$", EUR: "€", GBP: "£" };

function formatAmount(n: number, currency: string): string {
  const locale = currency === "INR" ? "en-IN" : "en-US";
  return new Intl.NumberFormat(locale, { maximumFractionDigits: n < 100 ? 2 : 0 }).format(n);
}

/** Human-readable range, e.g. "₹5,40,000 – ₹8,64,000 /year". */
export function formatSalary(min: number | null, max: number | null, currency: string, period: SalaryPeriod): string {
  const sym = SYMBOL[currency];
  const fmt = (n: number): string => (sym ? `${sym}${formatAmount(n, currency)}` : `${currency} ${formatAmount(n, currency)}`);
  const range = min !== null && max !== null && min !== max ? `${fmt(min)} – ${fmt(max)}` : fmt((min ?? max) as number);
  return `${range} /${period}`;
}

/**
 * Structured salary from source fields. Returns null unless at least one positive amount, a currency and a
 * supported period are known. Swaps inverted ranges. Never invents values.
 */
export function makeSalary(input: {
  min: unknown;
  max: unknown;
  currency: unknown;
  period: unknown;
  raw?: string | null;
}): Salary | null {
  let min = toAmount(input.min);
  let max = toAmount(input.max);
  const currency = normalizeCurrency(input.currency);
  const period = mapPeriod(input.period);
  if ((min === null && max === null) || !currency || !period) return null;
  if (min !== null && max !== null && min > max) [min, max] = [max, min];
  return { min, max, currency, period, raw: input.raw ?? formatSalary(min, max, currency, period) };
}
