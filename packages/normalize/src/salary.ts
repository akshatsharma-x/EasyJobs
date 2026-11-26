import type { Salary } from "@easyjobs/contract";
import { HOURS_PER_YEAR, INR_PER_UNIT } from "./data/fx";
import { asString, cleanLine, isRecord, truncateWords } from "./text";

type Period = Salary["period"];

export interface ParseSalaryOptions {
  /** Currency when the text has no marker. normalizeJob passes the primary location's currency (INR default). */
  defaultCurrency?: string;
  /**
   * Strict mode for descriptions: only amounts next to a salary keyword ("CTC", "Stipend", "salary range"),
   * an LPA figure, or a currency-symbol range count. Never invents a value from unrelated numbers.
   */
  strict?: boolean;
}

/* ─────────────────────────── Vocabulary ─────────────────────────── */

const NOT_DISCLOSED =
  /\b(?:not\s+(?:disclosed|specified|mentioned|revealed|available|provided)|undisclosed|confidential|negotiable|competitive|as\s+per\s+(?:the\s+)?(?:industry|company|market|experience|norms|standards?|policy|interview)|best\s+in\s+(?:the\s+)?industry|industry\s+standards?|performance[\s-]based|depends\s+on|based\s+on\s+(?:experience|interview|performance|skills)|attractive|market\s+(?:standards?|rate|related)|\bdoe\b|tbd|n\/?a)\b/i;
const UNPAID =
  /\b(?:unpaid|no\s+stipend|without\s+(?:any\s+)?stipend|stipend\s*[:\-]?\s*(?:nil|none|na|n\/a|zero|not\s+applicable)|volunteer(?:ing)?\s+(?:role|position|basis|opportunity)|free\s+internship|non[\s-]paid)\b/i;

const CURRENCY_PATTERNS: readonly (readonly [RegExp, string])[] = [
  [/₹|\brs\.?(?=\s*\d)|\brs\b|\binr\b|\brupees?\b|\bलाख/i, "INR"],
  [/\bus\s?\$|\busd\b|\bus\s+dollars?\b/i, "USD"],
  [/\bs\$|\bsgd\b|\bsingapore\s+dollars?\b/i, "SGD"],
  [/\bc\$|\bca\$|\bcad\b|\bcanadian\s+dollars?\b/i, "CAD"],
  [/\ba\$|\bau\$|\baud\b|\baustralian\s+dollars?\b/i, "AUD"],
  [/\bnz\$|\bnzd\b/i, "NZD"],
  [/\bhk\$|\bhkd\b/i, "HKD"],
  [/€|\beur\b|\beuros?\b/i, "EUR"],
  [/£|\bgbp\b|\bpounds?\s+sterling\b/i, "GBP"],
  [/¥|\bjpy\b|\byen\b/i, "JPY"],
  [/\bcny\b|\brmb\b|\byuan\b/i, "CNY"],
  [/\baed\b|\bdirhams?\b/i, "AED"],
  [/\bsar\b|\bsaudi\s+riyals?\b/i, "SAR"],
  [/\bchf\b|\bswiss\s+francs?\b/i, "CHF"],
];

const P_YEAR =
  /(?:\/|\bper\b|\ba\b|\bp\.?)\s*(?:annum|annual|year|yr|y)\b|\bp\.\s?a\b\.?|\bpa\b|\bannual(?:ly)?\b|\byearly\b|\blpa\b|\bctc\b|\bper\s+year\b|\/\s*yr\b|\byoy\b/i;
const P_MONTH = /(?:\/|\bper\b|\ba\b|\bp\.?)\s*(?:month|mo|mon|mnth|mth|m)\b|\bp\.\s?m\b\.?|\bpm\b|\bmonthly\b|\/\s*m\b/i;
const P_HOUR = /(?:\/|\bper\b|\ban?\b|\bp\.?)\s*(?:hour|hr|h)\b|\bhourly\b|\bph\b|\/\s*hr\b/i;
const P_WEEK = /(?:\/|\bper\b|\ba\b)\s*(?:week|wk)\b|\bweekly\b/i;
const P_DAY = /(?:\/|\bper\b|\ba\b)\s*day\b|\bdaily\b|\bper\s+diem\b/i;

const NUM_RE = /(\d+(?:\.\d+)?)\s?(lpa|lakhs?|lacs?|l|crores?|cr|k|thousand|million|mn|m)?(?![a-z0-9])/gi;
const NON_MONEY_AFTER =
  /^\s*(?:\+\s*)?(?:years?|yrs?|months?|mos?|weeks?|days?|hours?|hrs?|%|percent|rounds?|people|employees|members|openings|positions|vacancies|seats|cities|countries|offices|stars?|candidates|students|users|customers|lpa\s+package\s+holders)\b/i;
const CURRENCY_BEFORE = /(?:₹|\brs\.?|\binr|\$|€|£|¥|\b[a-z]{3})\s*$/i;
const CURRENCY_AFTER = /^\s*(?:inr|usd|eur|gbp|sgd|aed|cad|aud|rupees?|dollars?|euros?)\b/i;
const RANGE_SEP =
  /^\s*(?:(?:₹|rs\.?|inr|us\$|s\$|c\$|a\$|\$|€|£|usd|eur|gbp|cad|aud|sgd|aed)\s*)?(?:-|–|—|to|~|and)\s*(?:₹|rs\.?|inr|us\$|s\$|c\$|a\$|\$|€|£|usd|eur|gbp|cad|aud|sgd|aed)?\s*$/i;
const Q_MAX =
  /(?:up\s*to|upto|max(?:imum)?|not\s+more\s+than|under|below|less\s+than|till|capped\s+at)\s*(?:of\s+)?(?:₹|rs\.?|inr|us\$|\$|€|£|[a-z]{3})?\s*$/i;
const Q_MIN =
  /(?:from|starting(?:\s+(?:from|at))?|starts?\s+(?:at|from)|min(?:imum)?|at\s*least|above|over|more\s+than|beginning\s+at)\s*(?:of\s+)?(?:₹|rs\.?|inr|us\$|\$|€|£|[a-z]{3})?\s*$/i;
/** "4 LPA+", "4 LPA onwards" — but not "₹15,000/month + PPO" (a "+" followed by a word means "plus …"). */
const Q_MIN_AFTER = /^\s*(?:(?:lpa|per\s+annum|p\.?a\.?|\/\s*(?:month|year|yr|mo))\s*)?(?:\+(?!\s*[a-z(])|onwards|and\s+above|or\s+more|&\s*above)/i;

const MULTIPLIERS: Readonly<Record<string, number>> = {
  k: 1e3, thousand: 1e3, l: 1e5, lakh: 1e5, lakhs: 1e5, lac: 1e5, lacs: 1e5, lpa: 1e5, cr: 1e7, crore: 1e7,
  crores: 1e7, m: 1e6, mn: 1e6, million: 1e6,
};
const YEARLY_MULTIPLIERS = new Set(["l", "lakh", "lakhs", "lac", "lacs", "lpa", "cr", "crore", "crores"]);

/** Plausible INR/year band; anything outside is a parse error, not a salary. */
const MIN_INR_YEARLY = 5_000;
const MAX_INR_YEARLY = 200_000_000;

/* ─────────────────────────── Helpers ─────────────────────────── */

export function detectCurrency(text: string): string | null {
  for (const [re, code] of CURRENCY_PATTERNS) if (re.test(text)) return code;
  for (const m of text.matchAll(/\b([A-Z]{3})\b/g)) {
    const code = m[1] as string;
    if (code in INR_PER_UNIT) return code;
  }
  if (text.includes("$")) return "USD";
  return null;
}

function detectPeriod(text: string): Period | "week" | "day" | null {
  if (P_HOUR.test(text)) return "hour";
  if (P_DAY.test(text)) return "day";
  if (P_WEEK.test(text)) return "week";
  if (P_MONTH.test(text)) return "month";
  if (P_YEAR.test(text)) return "year";
  return null;
}

function normalizeNumbers(s: string): string {
  return s
    .replace(/[–—−]/g, "-")
    .replace(/(\d)\s*\/-/g, "$1")
    .replace(/(\d),(?=\d)/g, "$1")
    .replace(/\b\d{1,3}(?:\.\d{3})+\b(?!\s?(?:lpa|lakhs?|lacs?|l|crores?|cr|k|m|mn)\b)/gi, (m) => m.replace(/\./g, ""));
}

interface NumTok {
  value: number;
  mult: string | null;
  start: number;
  end: number;
}

function numbers(s: string): NumTok[] {
  const out: NumTok[] = [];
  NUM_RE.lastIndex = 0;
  for (let m = NUM_RE.exec(s); m !== null && out.length < 40; m = NUM_RE.exec(s)) {
    const value = Number(m[1]);
    if (!Number.isFinite(value)) continue;
    const mult = m[2] ? m[2].toLowerCase() : null;
    // "m" right after a number is "million" only for non-INR amounts; "25k/m" never reaches here.
    out.push({ value, mult, start: m.index, end: m.index + m[0].length });
  }
  return out;
}

function round(n: number, period: Period): number {
  return period === "hour" ? Math.round(n * 100) / 100 : Math.round(n);
}

function inrRate(currency: string): number | null {
  return INR_PER_UNIT[currency] ?? null;
}

function inferPeriod(amount: number, currency: string): Period {
  const rate = inrRate(currency) ?? 1;
  const inr = amount * rate;
  if (currency === "INR") return inr < 1_500 ? "hour" : inr < 100_000 ? "month" : "year";
  return inr < 15_000 ? "hour" : inr < 1_500_000 ? "month" : "year";
}

function plausible(s: Salary): boolean {
  // Placeholder ranges ATSs publish when pay is undisclosed: "USD 1–999,999", "0–9999999" (W2 found them topping
  // the "Highest pay" sort). Real bands rarely span more than ~5×; 20× is a safe cut. Ranges from 0 are exempt.
  if (s.min !== null && s.max !== null && s.min > 0 && s.max / s.min > 20) return false;
  if (s.max !== null && /^9{5,}$/.test(String(Math.round(s.max)))) return false;
  const y = toInrYearly(s);
  const top = Math.max(y.min ?? 0, y.max ?? 0);
  if (y.min === null && y.max === null) return false;
  if (top === 0) return s.min === 0 && s.max === 0;
  return top >= MIN_INR_YEARLY && top <= MAX_INR_YEARLY;
}

interface ParseCore {
  /** Require the primary amount to look like money (currency marker, multiplier, explicit period or ≥ 1000). */
  requireMoney: boolean;
}

function parseCore(rawText: string, opts: ParseSalaryOptions, core: ParseCore): Salary | null {
  const raw = rawText.trim();
  if (!raw) return null;
  const text = normalizeNumbers(raw);
  const lower = text.toLowerCase();
  const currency = (detectCurrency(text) ?? opts.defaultCurrency ?? "INR").toUpperCase();
  const hasDigit = /\d/.test(lower);

  if (UNPAID.test(lower) || /^\s*(?:stipend|salary)?\s*[:\-]?\s*(?:₹|rs\.?|inr)?\s*0\s*(?:\/[-\s]*)?$/i.test(lower)) {
    return { min: 0, max: 0, currency, period: "month", raw: truncateWords(raw, 200) };
  }
  if (!hasDigit) return null;

  const nums = numbers(lower).filter((n) => !NON_MONEY_AFTER.test(lower.slice(n.end)));
  if (nums.length === 0) return null;

  const isMoneyLike = (n: NumTok): boolean => {
    const before = lower.slice(Math.max(0, n.start - 6), n.start);
    const after = lower.slice(n.end, n.end + 14);
    if (n.mult && n.mult !== "m") return true;
    if (CURRENCY_BEFORE.test(before) && !/\b(?:in|on|of|at|to|by|or|an|and|the|for|per)\s*$/i.test(before)) return true;
    if (CURRENCY_AFTER.test(after)) return true;
    if (/^\s*(?:\/|per\b|p\.?\s?[ma]\b)/i.test(after)) return true;
    return !core.requireMoney ? true : n.value >= 1000 && !(n.value >= 1990 && n.value <= 2099 && !n.mult);
  };

  const primaryIdx = nums.findIndex((n) => {
    const before = lower.slice(Math.max(0, n.start - 6), n.start);
    return (n.mult !== null && n.mult !== "m") || CURRENCY_BEFORE.test(before);
  });
  let idx = primaryIdx >= 0 ? primaryIdx : 0;
  // "4-6 LPA": the marked number is the range's upper end; step back to its range-connected partner.
  const prev = idx > 0 ? nums[idx - 1] : undefined;
  if (prev && RANGE_SEP.test(lower.slice(prev.end, (nums[idx] as NumTok).start))) idx -= 1;
  const first = nums[idx] as NumTok;
  if (!isMoneyLike(first)) return null;
  // A year like "2025" with no money marker is never a salary.
  if (first.value >= 1990 && first.value <= 2099 && !first.mult && !CURRENCY_BEFORE.test(lower.slice(Math.max(0, first.start - 6), first.start))) {
    if (core.requireMoney || !/^\s*(?:\/|per\b)/.test(lower.slice(first.end))) return null;
  }

  let second: NumTok | null = null;
  const next = nums[idx + 1];
  if (next && RANGE_SEP.test(lower.slice(first.end, next.start))) second = next;

  const multFor = (n: NumTok, other: NumTok | null): string | null => {
    if (n.mult === "m" && currency === "INR") return null;
    if (n.mult) return n.mult;
    // "4-6 LPA", "25-30K": the trailing multiplier applies to the bare first number.
    if (other?.mult && other.mult !== "m" && n.value < 1000 && n.value <= other.value * 10) return other.mult;
    if (other?.mult === "m" && currency !== "INR" && n.value < 1000) return "m";
    return null;
  };
  const m1 = multFor(first, second);
  const m2 = second ? multFor(second, null) : null;
  let a = first.value * (m1 ? (MULTIPLIERS[m1] ?? 1) : 1);
  let b = second ? second.value * (m2 ? (MULTIPLIERS[m2] ?? 1) : 1) : null;

  let period: Period | "week" | "day" | null = detectPeriod(lower);
  if (!period && ((m1 && YEARLY_MULTIPLIERS.has(m1)) || (m2 && YEARLY_MULTIPLIERS.has(m2)))) period = "year";
  if (!period) period = inferPeriod(Math.max(a, b ?? 0), currency);
  if (period === "week") {
    a = (a * 52) / 12;
    if (b !== null) b = (b * 52) / 12;
    period = "month";
  } else if (period === "day") {
    a *= 22;
    if (b !== null) b *= 22;
    period = "month";
  }

  let min: number | null = a;
  let max: number | null = b ?? a;
  const before = lower.slice(Math.max(0, first.start - 30), first.start);
  const afterLast = lower.slice((second ?? first).end, (second ?? first).end + 30);
  if (!second && Q_MAX.test(before)) min = null;
  else if (!second && (Q_MIN.test(before) || Q_MIN_AFTER.test(afterLast))) max = null;
  if (min !== null && max !== null && min > max) [min, max] = [max, min];

  const salary: Salary = {
    min: min === null ? null : round(min, period),
    max: max === null ? null : round(max, period),
    currency,
    period,
    raw: truncateWords(raw, 200),
  };
  return plausible(salary) ? salary : null;
}

/* ─────────────────────────── Description scanning ─────────────────────────── */

const SAL_KEY =
  /\b(?:salary|salaries|ctc|stipend|package|compensation|pay\s*(?:range|scale|band|rate)|base\s+(?:pay|salary)|remuneration|wages?|annual\s+(?:salary|pay|ctc)|emoluments|earnings|pay)\b/gi;
/** Starts only at the beginning of a number ((?<![\d.])) and needs a separator before a second number — linear even on "1111…". */
const LPA_ANYWHERE = /(?<![\d.])\d{1,4}(?:\.\d{1,2})?(?:\s*(?:-|–|to)\s*\d{1,4}(?:\.\d{1,2})?)?\s*(?:lpa|lakhs?\s+per\s+annum|lacs?\s+per\s+annum)\b/gi;
const CURRENCY_RANGE_ANYWHERE =
  /(?:₹|\brs\.?|\binr|us\$|\$|€|£)\s?\d[\d,.]{0,15}\s?(?:k|l|lakhs?)?\s*(?:-|–|—|to)\s*(?:₹|\brs\.?|\binr|us\$|\$|€|£)?\s?\d[\d,.]{0,15}\s?(?:k|l|lakhs?)?(?:\s*(?:usd|inr|eur|gbp|cad|aud|sgd))?(?:\s*(?:per|\/|a)\s*(?:annum|year|yr|month|mo|hour|hr))?/gi;

function snippet(text: string, start: number, len: number): string {
  const s = text.slice(start, start + len);
  const cut = s.search(/\n\s*\n|(?<=[a-z0-9)])\.\s+(?=[A-Z])/);
  return (cut > 8 ? s.slice(0, cut) : s).replace(/\s+/g, " ").trim();
}

function fromDescription(text: string, opts: ParseSalaryOptions): Salary | null {
  const sample = text.length > 30_000 ? text.slice(0, 30_000) : text;
  SAL_KEY.lastIndex = 0;
  let tries = 0;
  for (let m = SAL_KEY.exec(sample); m !== null && tries < 25; m = SAL_KEY.exec(sample)) {
    tries++;
    const window = snippet(sample, m.index, 140);
    if (!/\d/.test(window)) continue;
    const s = parseCore(window, opts, { requireMoney: true });
    if (s) return s;
  }
  for (const re of [LPA_ANYWHERE, CURRENCY_RANGE_ANYWHERE]) {
    re.lastIndex = 0;
    let n = 0;
    for (let m = re.exec(sample); m !== null && n < 10; m = re.exec(sample)) {
      n++;
      const s = parseCore(m[0], opts, { requireMoney: true });
      if (s && (s.min ?? 0) > 0) return s;
    }
  }
  return null;
}

/* ─────────────────────────── Public API ─────────────────────────── */

/**
 * "₹ 4,00,000 - 6,00,000 /year" · "4-6 LPA" · "4.5 LPA" · "INR 25K/month" · "Stipend: ₹15,000 /month" ·
 * "10000-15000 /month" · "$120,000 – $150,000" · "€60k" · "Unpaid" (→ 0) · "Not disclosed"/"Competitive" (→ null).
 * Amounts stay in the original currency/period; use toInrYearly() for filtering. Never invents a salary.
 */
export function parseSalary(input: unknown, opts: ParseSalaryOptions = {}): Salary | null {
  const text = asString(input);
  if (!text.trim()) return null;
  if (opts.strict) return fromDescription(text, opts);
  const line = cleanLine(text).slice(0, 400);
  if (!/\d/.test(line) && NOT_DISCLOSED.test(line) && !UNPAID.test(line)) return null;
  return parseCore(line, opts, { requireMoney: false });
}

const PERIOD_ALIASES: Readonly<Record<string, Period>> = {
  hour: "hour", hourly: "hour", hr: "hour", month: "month", monthly: "month", mo: "month", year: "year", yearly: "year",
  annual: "year", annually: "year", annum: "year", yr: "year",
};

/** Validate a structured Salary hint from a scraper; returns null when it is unusable. */
export function cleanSalaryHint(input: unknown): Salary | null {
  if (!isRecord(input)) return null;
  const num = (v: unknown): number | null => {
    const n = typeof v === "string" ? Number(v.replace(/[,\s]/g, "")) : v;
    return typeof n === "number" && Number.isFinite(n) && n >= 0 ? n : null;
  };
  let min = num(input.min);
  let max = num(input.max);
  if (min === null && max === null) return null;
  const currencyRaw = asString(input.currency).trim();
  const currency = currencyRaw === "₹" || /^rs\.?$/i.test(currencyRaw) ? "INR" : currencyRaw === "$" ? "USD" : currencyRaw.toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) return null;
  const period = PERIOD_ALIASES[asString(input.period).toLowerCase()] ?? null;
  if (!period) return null;
  if (min !== null && max !== null && min > max) [min, max] = [max, min];
  const raw = asString(input.raw).trim();
  const salary: Salary = { min, max, currency, period, raw: raw ? truncateWords(cleanLine(raw), 200) : null };
  if (!(currency in INR_PER_UNIT)) return salary;
  return plausible(salary) ? salary : null;
}

export interface InrYearly {
  min: number | null;
  max: number | null;
}

/** Salary → INR per year (month × 12, hour × 2080, static FX). Unknown currency → nulls. */
export function toInrYearly(salary: Salary | null | undefined): InrYearly {
  if (!salary) return { min: null, max: null };
  const rate = inrRate(salary.currency);
  if (rate === null) return { min: null, max: null };
  const factor = salary.period === "hour" ? HOURS_PER_YEAR : salary.period === "month" ? 12 : 1;
  const conv = (x: number | null): number | null => (x === null ? null : Math.round(x * factor * rate));
  return { min: conv(salary.min), max: conv(salary.max) };
}
