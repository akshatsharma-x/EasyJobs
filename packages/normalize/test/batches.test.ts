import { describe, expect, it } from "vitest";
import { cleanBatches, extractBatches } from "../src/index";

const now = new Date("2026-11-26T00:00:00Z");

describe("extractBatches", () => {
  const cases: [string, number[]][] = [
    ["2024/2025/2026 batch", [2024, 2025, 2026]],
    ["Batch: 2025 & 2026", [2025, 2026]],
    ["graduating in 2026", [2026]],
    ["2025 passouts", [2025]],
    ["2025 pass-outs can apply", [2025]],
    ["YOP 2024", [2024]],
    ["Year of Passing: 2023, 2024, 2025", [2023, 2024, 2025]],
    ["Eligible batch: 2024, 2025, 2026", [2024, 2025, 2026]],
    ["Passing year: 2025/26", [2025, 2026]],
    ["2023 - 2025 batch", [2023, 2024, 2025]],
    ["2025-26 batch", [2025, 2026]],
    ["B.Tech 2021-2025 batch", [2025]],
    ["Class of 2026", [2026]],
    ["2025 grads", [2025]],
    ["2025 & 2026 Batch Freshers", [2025, 2026]],
    ["Graduates of 2024 and 2025", [2024, 2025]],
    ["expected graduation: May 2026", [2026]],
    ["Freshers (2024 passed out)", [2024]],
    ["Batch of 2025", [2025]],
    ["Batch 2022-2024", [2022, 2023, 2024]],
    ["2026 batch only", [2026]],
    ["Final year students (2027)", [2027]],
    ["Open to 2024, 2025 and 2026 graduates", [2024, 2025, 2026]],
    ["Founded in 2010; 2025 batch eligible", [2025]],
    ["Batch: 2024. Last date: 20 Nov 2025", [2024]],
    ["since 2005 we have grown", []],
    ["TCS Off Campus Drive 2026", []],
    ["Summer Internship 2026", []],
    ["Recruitment 2025 for freshers", []],
    ["© 2025 Acme Corp", []],
    ["Apply before 30 Nov 2026", []],
    ["Fortune 500 company in 2024", []],
    ["Any batch", []],
    ["We raised $50M in 2023.", []],
    ["Batch: 1999", []],
  ];
  it.each(cases)("%j → %j", (text, expected) => {
    expect(extractBatches(text, { now })).toEqual(expected);
  });

  it("combines several texts and dedupes", () => {
    expect(extractBatches(["2025 batch", "Batch: 2025 & 2026", "random 2024"], { now })).toEqual([2025, 2026]);
  });
  it("tolerates garbage", () => {
    expect(extractBatches(undefined, { now })).toEqual([]);
    expect(extractBatches(12345, { now })).toEqual([]);
  });
});

describe("cleanBatches (scraper hints)", () => {
  it("keeps plausible integer years, sorted and unique", () => {
    expect(cleanBatches([2026, "2025", 2025, 2025.5, 1990, 2099, "abc", null], { now })).toEqual([2025, 2026]);
    expect(cleanBatches("2025", { now })).toEqual([]);
  });
});
