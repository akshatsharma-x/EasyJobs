import { describe, expect, it } from "vitest";
import type { Salary } from "@easyjobs/contract";
import { cleanSalaryHint, detectCurrency, parseSalary, toInrYearly } from "../src/index";

type S = [string, number | null, number | null, Salary["period"]] | null;
const short = (s: Salary | null): S => (s ? [s.currency, s.min, s.max, s.period] : null);

describe("parseSalary — real-world formats", () => {
  const cases: [string, S][] = [
    ["₹ 4,00,000 - 6,00,000 /year", ["INR", 400000, 600000, "year"]],
    ["4-6 LPA", ["INR", 400000, 600000, "year"]],
    ["4.5 LPA", ["INR", 450000, 450000, "year"]],
    ["INR 25K/month", ["INR", 25000, 25000, "month"]],
    ["Stipend: ₹15,000 /month", ["INR", 15000, 15000, "month"]],
    ["10000-15000 /month", ["INR", 10000, 15000, "month"]],
    ["$120,000 – $150,000", ["USD", 120000, 150000, "year"]],
    ["€60k", ["EUR", 60000, 60000, "year"]],
    ["Unpaid", ["INR", 0, 0, "month"]],
    ["No stipend", ["INR", 0, 0, "month"]],
    ["Not disclosed", null],
    ["Performance based", null],
    ["Competitive", null],
    ["As per industry standards", null],
    ["Best in industry", null],
    ["Negotiable", null],
    ["₹12L - ₹18L", ["INR", 1200000, 1800000, "year"]],
    ["12-18 Lacs", ["INR", 1200000, 1800000, "year"]],
    ["Rs. 3.5 - 4.5 Lakhs per annum", ["INR", 350000, 450000, "year"]],
    ["CTC: 6.5 LPA", ["INR", 650000, 650000, "year"]],
    ["3 LPA - 5 LPA", ["INR", 300000, 500000, "year"]],
    ["5-10 LPA (Based on performance)", ["INR", 500000, 1000000, "year"]],
    ["₹1.2 Cr", ["INR", 12000000, 12000000, "year"]],
    ["$50/hr", ["USD", 50, 50, "hour"]],
    ["$40 - $60 per hour", ["USD", 40, 60, "hour"]],
    ["£45,000 - £55,000", ["GBP", 45000, 55000, "year"]],
    ["€45.000 - €55.000", ["EUR", 45000, 55000, "year"]],
    ["₹25k-35k per month", ["INR", 25000, 35000, "month"]],
    ["20K - 25K", ["INR", 20000, 25000, "month"]],
    ["Up to ₹50,000/month", ["INR", null, 50000, "month"]],
    ["upto 7 LPA", ["INR", null, 700000, "year"]],
    ["Starting from 4 LPA", ["INR", 400000, null, "year"]],
    ["4 LPA onwards", ["INR", 400000, null, "year"]],
    ["Min 4 LPA", ["INR", 400000, null, "year"]],
    ["USD 100k-150k", ["USD", 100000, 150000, "year"]],
    ["100K-150K USD", ["USD", 100000, 150000, "year"]],
    ["CAD 80,000–100,000", ["CAD", 80000, 100000, "year"]],
    ["S$5,000 - S$7,000 per month", ["SGD", 5000, 7000, "month"]],
    ["AED 15,000 per month", ["AED", 15000, 15000, "month"]],
    ["₹15,000/month + PPO", ["INR", 15000, 15000, "month"]],
    ["15000/- per month", ["INR", 15000, 15000, "month"]],
    ["Rs 15,000/- pm", ["INR", 15000, 15000, "month"]],
    ["Rs. 6,00,000 - Rs. 8,00,000 P.A.", ["INR", 600000, 800000, "year"]],
    ["₹ 4 - 6 Lakhs", ["INR", 400000, 600000, "year"]],
    ["Package: Rs 3.36 Lakh per annum", ["INR", 336000, 336000, "year"]],
    ["₹ 20,00,000 - 35,00,000 a year", ["INR", 2000000, 3500000, "year"]],
    ["$120K/yr", ["USD", 120000, 120000, "year"]],
    ["₹1 Lakh/month", ["INR", 100000, 100000, "month"]],
    ["₹ 500 / day", ["INR", 11000, 11000, "month"]],
    ["₹15,000/month for 6 months", ["INR", 15000, 15000, "month"]],
    ["2024", null],
    ["₹ 2", null],
    ["", null],
  ];
  it.each(cases)("%j → %j", (text, expected) => {
    expect(short(parseSalary(text))).toEqual(expected);
  });

  it("keeps the original text in raw", () => {
    expect(parseSalary("4-6 LPA")?.raw).toBe("4-6 LPA");
  });
  it("uses the default currency only when the text has no marker", () => {
    expect(short(parseSalary("120000 - 150000", { defaultCurrency: "USD" }))).toEqual(["USD", 120000, 150000, "year"]);
    expect(short(parseSalary("₹ 25,000", { defaultCurrency: "USD" }))).toEqual(["INR", 25000, 25000, "month"]);
  });
});

describe("parseSalary — strict mode (descriptions never invent a salary)", () => {
  const cases: [string, S][] = [
    ["Job Details - CTC: 4.5 LPA. Bond: 2 years.", ["INR", 450000, 450000, "year"]],
    ["The base salary range for this role is $150,000 - $200,000 USD per year, plus equity.", ["USD", 150000, 200000, "year"]],
    ["Stipend: 10k per month. Duration: 6 months.", ["INR", 10000, 10000, "month"]],
    ["Compensation: ₹ 25,000 - 35,000 per month", ["INR", 25000, 35000, "month"]],
    ["Offered package 12 LPA for the right candidate", ["INR", 1200000, 1200000, "year"]],
    ["About us: founded in 2010 with 500 employees. Salary: Not disclosed. Experience: 2 years.", null],
    ["We offer a competitive salary and great benefits.", null],
    ["Salary revision happens in April 2025 every year.", null],
    ["Our payments platform processes ₹1,000 crore every month for 10,000 merchants.", null],
    ["Salary will be decided after 2 rounds of interview.", null],
  ];
  it.each(cases)("%j → %j", (text, expected) => {
    expect(short(parseSalary(text, { strict: true }))).toEqual(expected);
  });
});

describe("toInrYearly", () => {
  it("month × 12, hour × 2080, static FX", () => {
    expect(toInrYearly({ min: 25000, max: 30000, currency: "INR", period: "month", raw: null })).toEqual({ min: 300000, max: 360000 });
    expect(toInrYearly({ min: 50, max: null, currency: "USD", period: "hour", raw: null })).toEqual({ min: Math.round(50 * 2080 * 88.5), max: null });
    expect(toInrYearly({ min: 60000, max: 60000, currency: "EUR", period: "year", raw: null })).toEqual({ min: 6180000, max: 6180000 });
  });
  it("unknown currency or null salary → nulls", () => {
    expect(toInrYearly({ min: 1, max: 2, currency: "XYZ", period: "year", raw: null })).toEqual({ min: null, max: null });
    expect(toInrYearly(null)).toEqual({ min: null, max: null });
  });
});

describe("cleanSalaryHint", () => {
  it("validates and normalizes structured hints", () => {
    expect(cleanSalaryHint({ min: 150000, max: 120000, currency: "usd", period: "yearly", raw: " $120k – $150k " })).toEqual({
      min: 120000,
      max: 150000,
      currency: "USD",
      period: "year",
      raw: "$120k – $150k",
    });
    expect(cleanSalaryHint({ min: "25,000", max: null, currency: "₹", period: "month" })).toMatchObject({ min: 25000, currency: "INR" });
  });
  it("rejects unusable hints", () => {
    expect(cleanSalaryHint({ min: null, max: null, currency: "INR", period: "year" })).toBeNull();
    expect(cleanSalaryHint({ min: 10, max: 20, currency: "INR", period: "fortnight" })).toBeNull();
    expect(cleanSalaryHint({ min: 1, max: 2, currency: "INR", period: "year" })).toBeNull();
    expect(cleanSalaryHint("4 LPA")).toBeNull();
  });
});

describe("detectCurrency", () => {
  it.each([
    ["₹ 10,000", "INR"],
    ["Rs. 10,000", "INR"],
    ["US$ 100", "USD"],
    ["S$ 100", "SGD"],
    ["C$ 100", "CAD"],
    ["A$ 100", "AUD"],
    ["€ 100", "EUR"],
    ["£ 100", "GBP"],
    ["AED 100", "AED"],
    ["$100", "USD"],
    ["100", null],
  ])("%s → %s", (text, cur) => expect(detectCurrency(text)).toBe(cur));
});
