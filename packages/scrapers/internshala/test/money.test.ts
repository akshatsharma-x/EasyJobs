import { describe, expect, it } from "vitest";
import { cleanPayText, parsePay, parsePpoAmount } from "../src/parse/money";

const month = { defaultPeriod: "month" as const };
const year = { defaultPeriod: "year" as const };

describe("parsePay — internship stipends", () => {
  it.each([
    ["₹ 10,000 - 12,000 /month", 10_000, 12_000, "range"],
    ["₹ 10,000 /month", 10_000, 10_000, "fixed"],
    ["₹ 1,501 - 15,001 /month", 1_501, 15_001, "range"],
    ["₹ 6,000 - 15,000 /month", 6_000, 15_000, "range"],
    ["INR₹ 10,000 - 12,000 /month", 10_000, 12_000, "range"], // JSON-LD description spelling
    ["₹13,000 - 16,000 /month (only for freshers)", 13_000, 16_000, "range"], // probation line
    ["₹ 12,000 - 10,000 /month", 10_000, 12_000, "range"], // swapped bounds
    ["₹ 5,000 /month + incentives", 5_000, 5_000, "fixed"],
  ])("%s → %d–%d /month", (text, min, max, kind) => {
    const p = parsePay(text, month);
    expect(p.salary).toMatchObject({ min, max, currency: "INR", period: "month" });
    expect(p.kind).toBe(kind);
    expect(p.salary?.raw).toBe(cleanPayText(text));
  });

  it("flags incentives and ignores the variable part", () => {
    const p = parsePay("₹ 2,000 - 5,000 /month +  Incentives", month);
    expect(p.incentives).toBe(true);
    expect(p.salary).toMatchObject({ min: 2_000, max: 5_000, period: "month" });
  });

  it("Unpaid is a known zero, tagged as unpaid", () => {
    expect(parsePay("Unpaid", month)).toEqual({
      salary: { min: 0, max: 0, currency: "INR", period: "month", raw: "Unpaid" },
      kind: "unpaid",
      sourcePeriod: "month",
      incentives: false,
      raw: "Unpaid",
    });
  });

  it.each(["Performance Based", "INRPerformance Based", "performance based"])("%s → no salary (never invented)", (text) => {
    const p = parsePay(text, month);
    expect(p.salary).toBeNull();
    expect(p.kind).toBe("performance");
    expect(p.raw?.toLowerCase()).toBe("performance based"); // "INR" prefix from JSON-LD stripped
  });

  it("weekly pay becomes monthly (× 52/12)", () => {
    const p = parsePay("₹ 300 /week", month);
    expect(p.sourcePeriod).toBe("week");
    expect(p.salary).toMatchObject({ min: 1_300, max: 1_300, period: "month", raw: "₹ 300 /week" });
  });

  it("a lump sum is spread over the internship duration", () => {
    expect(parsePay("₹ 1,500 - 15,000 lump sum", { ...month, durationMonths: 3 }).salary).toMatchObject({ min: 500, max: 5_000, period: "month" });
    expect(parsePay("₹ 1,500 - 15,000 lump sum", { ...month, durationMonths: 1 }).salary).toMatchObject({ min: 1_500, max: 15_000 });
  });

  it("a lump sum for less than a month is not inflated", () => {
    expect(parsePay("₹ 500 - 15,000 lump sum", { ...month, durationMonths: 0.46 }).salary).toMatchObject({ min: 500, max: 15_000, period: "month" });
  });

  it("a lump sum without a known duration gives no salary", () => {
    const p = parsePay("₹ 1,500 - 15,000 lump sum", month);
    expect(p.kind).toBe("lump_sum");
    expect(p.salary).toBeNull();
    expect(p.raw).toBe("₹ 1,500 - 15,000 lump sum");
  });

  it.each([null, undefined, "", "   ", "Not disclosed", "Competitive"])("%j → unknown", (text) => {
    const p = parsePay(text, month);
    expect(p.salary).toBeNull();
    expect(p.kind).toBe("unknown");
  });

  it("does not pick up unrelated numbers after the amount", () => {
    expect(parsePay("₹ 5,000 /month for 2 months", month).salary).toMatchObject({ min: 5_000, max: 5_000 });
  });

  it("detects other currencies", () => {
    expect(parsePay("$ 500 /month", month).salary?.currency).toBe("USD");
    expect(parsePay("€ 800 /month", month).salary?.currency).toBe("EUR");
  });
});

describe("parsePay — job CTC", () => {
  it.each([
    ["₹ 3,00,000 - 4,50,000", 300_000, 450_000],
    ["₹ 4,00,000 - 4,50,000 /year", 400_000, 450_000],
    ["₹ 2,04,000 - 3,20,000 /year", 204_000, 320_000],
    ["₹ 3,60,000 /year", 360_000, 360_000],
    ["Annual CTC: ₹ 2,05,000 - 3,00,000 /year", 205_000, 300_000],
    ["₹ 1.2 - 1.8 LPA", 120_000, 180_000],
    ["4.5 LPA", 450_000, 450_000],
  ])("%s → %d–%d /year", (text, min, max) => {
    expect(parsePay(text, year).salary).toMatchObject({ min, max, currency: "INR", period: "year" });
  });

  it("a monthly figure on a job stays monthly", () => {
    expect(parsePay("₹ 25,000 /month", year).salary).toMatchObject({ min: 25_000, period: "month" });
  });
});

describe("parsePpoAmount", () => {
  it.each([
    ["Job offer upto ₹ 3LPA post internship", 300_000],
    ["Job offer upto ₹ 4.8LPA post internship", 480_000],
    ["Job offer post internship", null],
    [null, null],
  ])("%s → %s", (text, expected) => {
    expect(parsePpoAmount(text)).toBe(expected);
  });
});
