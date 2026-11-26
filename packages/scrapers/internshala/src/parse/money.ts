import type { Salary } from "@easyjobs/contract";
import { cleanText } from "./text";

/**
 * How Internshala expressed the pay:
 * - range/fixed: a normal amount per week/month/year
 * - lump_sum:    one payment for the whole internship ("₹ 1,500 - 15,000 lump sum")
 * - unpaid:      "Unpaid"
 * - performance: "Performance Based" (no amount)
 * - unknown:     anything we could not read ("Not disclosed", empty, …)
 */
export type PayKind = "range" | "fixed" | "lump_sum" | "unpaid" | "performance" | "unknown";

export interface ParsedPay {
  salary: Salary | null;
  kind: PayKind;
  /** The period as written by Internshala (before any conversion). */
  sourcePeriod: "week" | "month" | "year" | "lump_sum" | null;
  /** "+ incentives" (or similar) follows the fixed part. */
  incentives: boolean;
  /** The text that was parsed, cleaned ("INR₹ 300 /week" → "₹ 300 /week"). */
  raw: string | null;
}

export interface ParsePayOptions {
  /** Period to assume when none is written. Internship stipends are monthly; job CTCs are yearly. */
  defaultPeriod: "month" | "year";
  /** Internship duration in months — used to express a lump sum as a monthly amount. */
  durationMonths?: number | null;
}

const WEEKS_PER_MONTH = 52 / 12;

const CURRENCIES: [RegExp, string][] = [
  [/₹|\bINR\b|\bRs\.?(?=\s|\d)/i, "INR"],
  [/US\$|\bUSD\b|\$/i, "USD"],
  [/€|\bEUR\b/i, "EUR"],
  [/£|\bGBP\b/i, "GBP"],
  [/\bAED\b/i, "AED"],
  [/\bSGD\b/i, "SGD"],
];

function detectCurrency(text: string): string {
  for (const [re, code] of CURRENCIES) if (re.test(text)) return code;
  return "INR";
}

/** "4,00,000" → 400000 · "12000" → 12000 · "4.5" (+ L/LPA/K multipliers) */
function toNumber(digits: string, suffix: string | undefined): number | null {
  const n = Number(digits.replace(/,/g, ""));
  if (!Number.isFinite(n)) return null;
  const s = (suffix ?? "").toLowerCase();
  if (s === "k") return Math.round(n * 1_000);
  if (s === "l" || s === "lac" || s === "lakh" || s === "lakhs" || s === "lpa") return Math.round(n * 100_000);
  if (s === "cr" || s === "crore") return Math.round(n * 10_000_000);
  return n;
}

const UNIT = String.raw`(k|lpa|lakhs?|lac|l|cr|crore)?`;
const NUM = String.raw`(\d[\d,]*(?:\.\d+)?)`;
/** First amount, optionally followed by "- / – / to" and a second amount: "₹ 10,000 - 12,000", "1.2 - 1.8 LPA". */
const RANGE_RE = new RegExp(String.raw`${NUM}\s*${UNIT}\b(?:\s*(?:-|–|—|to)\s*(?:₹|rs\.?|inr)?\s*${NUM}\s*${UNIT}\b)?`, "i");

/** Returns [] (no amount), [amount] or [min, max]. A unit written only on the second amount applies to both. */
function readRange(text: string): number[] {
  const m = RANGE_RE.exec(text);
  if (!m) return [];
  const unit1 = m[2];
  const unit2 = m[4];
  const a = toNumber(m[1] ?? "", unit1 ?? (m[3] ? unit2 : undefined));
  if (a === null) return [];
  if (!m[3]) return [a];
  const b = toNumber(m[3], unit2 ?? unit1);
  return b === null ? [a] : [a, b];
}

/** Strip Internshala's JSON-LD prefixes ("INR₹ 10,000", "INRPerformance Based") and normalise spacing. */
export function cleanPayText(input: string | null | undefined): string {
  return cleanText(input)
    .replace(/^INR\s*(?=₹)/i, "")
    .replace(/^INR(?=[A-Za-z])/, "")
    .replace(/\s*\/\s*/g, " /")
    .trim();
}

/**
 * Parse an Internshala stipend or CTC string into a contract `Salary`.
 *
 * Never invents an amount: "Performance Based" and unreadable text give `salary: null`.
 * "Unpaid" is a real, known amount of 0. Weekly pay is converted to monthly (× 52/12).
 * A lump sum is spread over the internship duration (never over less than one month, so short
 * internships are not inflated); without a known duration a lump sum gives `salary: null`.
 */
export function parsePay(input: string | null | undefined, opts: ParsePayOptions): ParsedPay {
  const raw = cleanPayText(input);
  const empty: ParsedPay = { salary: null, kind: "unknown", sourcePeriod: null, incentives: false, raw: raw || null };
  if (!raw) return empty;
  const lower = raw.toLowerCase();

  if (/^unpaid\b/.test(lower)) {
    return {
      salary: { min: 0, max: 0, currency: "INR", period: "month", raw },
      kind: "unpaid",
      sourcePeriod: "month",
      incentives: false,
      raw,
    };
  }
  const incentives = /\+\s*(incentive|incentives|commission|bonus|variable)/i.test(raw);
  // Only look at the fixed part ("₹ 5,000 /month + incentives" → "₹ 5,000 /month").
  const fixedPart = raw.split(/\s\+\s|\+\s*(?=incentive|commission|bonus|variable)/i)[0] ?? raw;
  const amounts = readRange(fixedPart);

  if (amounts.length === 0) {
    if (/performance|incentive|commission/.test(lower)) return { ...empty, kind: "performance", incentives: true };
    return empty;
  }

  const fixedLower = fixedPart.toLowerCase();
  let sourcePeriod: ParsedPay["sourcePeriod"];
  if (/lump\s*-?\s*sum/.test(fixedLower)) sourcePeriod = "lump_sum";
  else if (/\/\s*week|per\s+week|\bweekly\b/.test(fixedLower)) sourcePeriod = "week";
  else if (/\/\s*month|per\s+month|\bmonthly\b|\/\s*mo\b/.test(fixedLower)) sourcePeriod = "month";
  else if (/\/\s*(year|annum)|per\s+(year|annum)|\bannual|\bp\.?a\.?\b|\blpa\b/.test(fixedLower)) sourcePeriod = "year";
  else sourcePeriod = opts.defaultPeriod;

  let min: number | null = amounts[0] ?? null;
  let max: number | null = amounts.length > 1 ? (amounts[1] ?? null) : min;
  if (min !== null && max !== null && max < min) [min, max] = [max, min];
  const currency = detectCurrency(fixedPart);
  const kind: PayKind = sourcePeriod === "lump_sum" ? "lump_sum" : min === max ? "fixed" : "range";

  let period: Salary["period"];
  if (sourcePeriod === "week") {
    period = "month";
    min = min === null ? null : Math.round(min * WEEKS_PER_MONTH);
    max = max === null ? null : Math.round(max * WEEKS_PER_MONTH);
  } else if (sourcePeriod === "lump_sum") {
    const months = opts.durationMonths;
    if (!months || !Number.isFinite(months) || months <= 0) {
      return { salary: null, kind, sourcePeriod, incentives, raw };
    }
    const divisor = Math.max(1, months);
    period = "month";
    min = min === null ? null : Math.round(min / divisor);
    max = max === null ? null : Math.round(max / divisor);
  } else {
    period = sourcePeriod;
  }

  return { salary: { min, max, currency, period, raw }, kind, sourcePeriod, incentives, raw };
}

/** "Job offer upto ₹ 4.8LPA post internship" → 480000 (INR / year); null when no amount is given. */
export function parsePpoAmount(input: string | null | undefined): number | null {
  const m = cleanText(input).match(/(\d+(?:\.\d+)?)\s*(lpa|l|lakhs?|lac)\b/i);
  if (!m) return null;
  return toNumber(m[1] ?? "", m[2]);
}
