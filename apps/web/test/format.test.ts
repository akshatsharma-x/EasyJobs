import type { Salary } from "@easyjobs/contract";
import { describe, expect, it } from "vitest";
import {
  formatBatches,
  formatCompact,
  formatCount,
  formatDate,
  formatExperience,
  formatInrYearly,
  formatLocations,
  formatRelativeTime,
  formatSalary,
  formatTookMs,
  isNewJob,
} from "@/lib/format";

const NOW = Date.parse("2026-11-26T06:30:00.000Z");
const ago = (ms: number): string => new Date(NOW - ms).toISOString();
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

const salary = (min: number | null, max: number | null, currency = "INR", period: Salary["period"] = "year", raw: string | null = null): Salary => ({
  min,
  max,
  currency,
  period,
  raw,
});

describe("formatSalary", () => {
  it.each<[string, Salary, string]>([
    ["INR LPA range", salary(400_000, 600_000), "₹4–6 LPA"],
    ["INR single LPA", salary(1_200_000, 1_200_000), "₹12 LPA"],
    ["INR decimal LPA", salary(450_000, 600_000), "₹4.5–6 LPA"],
    ["INR crore range", salary(12_000_000, 18_000_000), "₹1.2–1.8 Cr"],
    ["INR min only", salary(500_000, null), "From ₹5 LPA"],
    ["INR max only", salary(null, 800_000), "Up to ₹8 LPA"],
    ["stipend k", salary(25_000, 25_000, "INR", "month"), "₹25k/mo"],
    ["stipend range", salary(20_000, 30_000, "INR", "month"), "₹20–30k/mo"],
    ["stipend lakh", salary(120_000, 120_000, "INR", "month"), "₹1.2L/mo"],
    ["stipend k→lakh range", salary(90_000, 110_000, "INR", "month"), "₹90k–1.1L/mo"],
    ["stipend lakh range", salary(120_000, 150_000, "INR", "month"), "₹1.2–1.5L/mo"],
    ["INR hourly", salary(500, 500, "INR", "hour"), "₹500/hr"],
    ["USD yearly", salary(120_000, 150_000, "USD"), "$120k–150k/yr"],
    ["EUR single", salary(60_000, 60_000, "EUR"), "€60k/yr"],
    ["GBP range", salary(45_000, 55_000, "GBP"), "£45k–55k/yr"],
    ["USD hourly", salary(40, 60, "USD", "hour"), "$40–60/hr"],
    ["USD monthly", salary(8_000, 8_000, "USD", "month"), "$8k/mo"],
    ["unknown currency", salary(12_000, 12_000, "XYZ"), "XYZ 12k/yr"],
  ])("%s", (_name, input, expected) => {
    expect(formatSalary(input)).toBe(expected);
  });

  it("swaps inverted bounds and drops trailing .0", () => {
    expect(formatSalary(salary(600_000, 400_000))).toBe("₹4–6 LPA");
    expect(formatSalary(salary(1_000_000, 1_000_000))).toBe("₹10 LPA");
  });

  it("uses the en dash", () => {
    expect(formatSalary(salary(400_000, 600_000))).toContain("–");
  });

  it("falls back to raw text, then null", () => {
    expect(formatSalary(salary(null, null, "INR", "year", "  Best in industry  "))).toBe("Best in industry");
    expect(formatSalary(salary(null, null, "INR", "year", "x".repeat(50)))?.length).toBeLessThanOrEqual(32);
    expect(formatSalary(salary(null, null))).toBeNull();
    expect(formatSalary(null)).toBeNull();
    expect(formatSalary(undefined)).toBeNull();
  });
});

describe("formatRelativeTime / isNewJob", () => {
  it("formats short relative times", () => {
    expect(formatRelativeTime(ago(20_000), NOW)).toBe("just now");
    expect(formatRelativeTime(ago(5 * MIN), NOW)).toBe("5m ago");
    expect(formatRelativeTime(ago(2 * HOUR + 5 * MIN), NOW)).toBe("2h ago");
    expect(formatRelativeTime(ago(3 * DAY), NOW)).toBe("3d ago");
    expect(formatRelativeTime(ago(15 * DAY), NOW)).toBe("2w ago");
  });

  it("falls back to dates after five weeks", () => {
    expect(formatRelativeTime(ago(40 * DAY), NOW)).toBe("17 Oct");
    expect(formatRelativeTime("2025-03-04T10:00:00.000Z", NOW)).toBe("4 Mar 2025");
  });

  it("treats future and invalid dates gracefully", () => {
    expect(formatRelativeTime(new Date(NOW + HOUR).toISOString(), NOW)).toBe("just now");
    expect(formatRelativeTime("not a date", NOW)).toBe("");
  });

  it("flags jobs from the last 24 hours as new", () => {
    expect(isNewJob(ago(23 * HOUR), NOW)).toBe(true);
    expect(isNewJob(ago(25 * HOUR), NOW)).toBe(false);
    expect(isNewJob("garbage", NOW)).toBe(false);
  });
});

describe("counts and numbers", () => {
  it("uses Indian digit grouping", () => {
    expect(formatCount(12_480)).toBe("12,480");
    expect(formatCount(123_456)).toBe("1,23,456");
    expect(formatCount(7)).toBe("7");
  });

  it("formats compact Indian numbers", () => {
    expect(formatCompact(950)).toBe("950");
    expect(formatCompact(1284)).toBe("1.3k");
    expect(formatCompact(12_480)).toBe("12.5k");
    expect(formatCompact(120_000)).toBe("1.2L");
    expect(formatCompact(1_200_000)).toBe("12L");
    expect(formatCompact(34_000_000)).toBe("3.4Cr");
  });

  it("formats INR/yr slider values", () => {
    expect(formatInrYearly(0)).toBe("Any");
    expect(formatInrYearly(300_000)).toBe("₹3 LPA");
    expect(formatInrYearly(450_000)).toBe("₹4.5 LPA");
    expect(formatInrYearly(15_000_000)).toBe("₹1.5 Cr");
  });

  it("formats durations", () => {
    expect(formatTookMs(38)).toBe("38 ms");
    expect(formatTookMs(1234)).toBe("1.2 s");
  });

  it("formats absolute dates in IST", () => {
    expect(formatDate("2026-11-26T06:30:00.000Z")).toBe("26 Nov 2026");
    expect(formatDate("2026-11-25T20:00:00.000Z")).toBe("26 Nov 2026"); // 01:30 IST next day
    expect(formatDate("nope")).toBe("");
  });
});

describe("formatExperience", () => {
  it.each<[number | null, number | null, Parameters<typeof formatExperience>[2], string]>([
    [null, null, "intern", "Internship"],
    [0, 0, "fresher", "Fresher"],
    [0, 0, "entry", "Fresher"],
    [0, 1, "entry", "Fresher"],
    [0, 2, "entry", "0–2 yrs"],
    [3, null, "mid", "3+ yrs"],
    [null, 2, "entry", "Up to 2 yrs"],
    [5, 5, "senior", "5 yrs"],
    [1, 1, "entry", "1 yr"],
    [null, null, "entry", "0–2 yrs"],
    [null, null, "mid", "2–5 yrs"],
    [null, null, "senior", "5–8 yrs"],
    [null, null, "lead", "8+ yrs"],
    [null, null, "executive", "12+ yrs"],
    [0, null, "mid", "2–5 yrs"],
  ])("(%s, %s, %s) → %s", (min, max, level, expected) => {
    expect(formatExperience(min, max, level)).toBe(expected);
  });
});

describe("formatLocations / formatBatches", () => {
  it("summarises locations", () => {
    expect(formatLocations(["Bengaluru, IN"], false)).toBe("Bengaluru");
    expect(formatLocations(["Bengaluru, IN", "Pune, IN", "Chennai, IN"], false)).toBe("Bengaluru +2");
    expect(formatLocations(["London, GB"], false)).toBe("London, GB");
    expect(formatLocations(["Remote (India)"], true)).toBe("Remote (India)");
    expect(formatLocations([], true)).toBe("Remote");
    expect(formatLocations([], false)).toBe("Location not specified");
  });

  it("summarises batches", () => {
    expect(formatBatches([])).toBe("");
    expect(formatBatches([2026])).toBe("2026 batch");
    expect(formatBatches([2026, 2025])).toBe("2025, 2026 batch");
    expect(formatBatches([2027, 2024, 2025, 2026])).toBe("2024–2027 batch");
    expect(formatBatches([2024, 2026, 2027])).toBe("2024, 2026, 2027 batch");
    expect(formatBatches([2026, 2026])).toBe("2026 batch");
  });
});
