/**
 * Static FX table: INR per 1 unit of currency. Approximate mid-market rates (late 2025 / 2026 range).
 * Static on purpose (prompts.md §0.4): normalization must be deterministic and offline. Precision does not
 * matter for filtering by "minimum salary"; refresh occasionally.
 */
export const FX_RATES_AS_OF = "2026-11";

export const INR_PER_UNIT: Readonly<Record<string, number>> = {
  INR: 1,
  USD: 88.5,
  EUR: 103,
  GBP: 117,
  CAD: 63.5,
  AUD: 58,
  NZD: 51,
  SGD: 68,
  HKD: 11.4,
  JPY: 0.58,
  CNY: 12.4,
  KRW: 0.062,
  TWD: 2.85,
  CHF: 110,
  SEK: 9.3,
  NOK: 8.7,
  DKK: 13.8,
  PLN: 24.2,
  CZK: 4.2,
  HUF: 0.26,
  RON: 20.3,
  BGN: 52.5,
  AED: 24.1,
  SAR: 23.6,
  QAR: 24.3,
  KWD: 289,
  BHD: 235,
  OMR: 230,
  ILS: 26.5,
  TRY: 2.1,
  EGP: 1.85,
  ZAR: 5,
  NGN: 0.06,
  KES: 0.68,
  MYR: 21,
  IDR: 0.0053,
  THB: 2.7,
  PHP: 1.5,
  VND: 0.0034,
  LKR: 0.29,
  BDT: 0.72,
  PKR: 0.31,
  NPR: 0.625,
  BRL: 16.5,
  MXN: 4.8,
  ARS: 0.07,
  COP: 0.022,
  CLP: 0.093,
  PEN: 23.5,
  RUB: 1.1,
  UAH: 2.1,
};

/** Hours per year used for hourly → yearly (prompts.md §0.4). */
export const HOURS_PER_YEAR = 2080;
