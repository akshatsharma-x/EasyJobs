import { describe, expect, it } from "vitest";
import { parseExperience } from "../src/index";

type R = [number | null, number | null] | null;
const asPair = (r: ReturnType<typeof parseExperience>): R => (r ? [r.min, r.max] : null);

describe("parseExperience — experienceRaw / titles", () => {
  const cases: [string, R][] = [
    ["0-2 Yrs", [0, 2]],
    ["2+ years", [2, null]],
    ["1 to 3 years", [1, 3]],
    ["minimum 3 years", [3, null]],
    ["min. 3 yrs", [3, null]],
    ["3-5 yrs exp", [3, 5]],
    ["Freshers", [0, 0]],
    ["Fresher", [0, 0]],
    ["fresher/experienced", [0, null]],
    ["Freshers & Experienced", [0, null]],
    ["0 - 1 Years", [0, 1]],
    ["2 – 4 years", [2, 4]],
    ["Experience: 5+ yrs", [5, null]],
    ["upto 2 years", [0, 2]],
    ["up to 2 years", [0, 2]],
    ["less than 1 year", [0, 1]],
    ["< 1 year", [0, 1]],
    ["maximum 2 years", [0, 2]],
    ["6 months - 1 year", [0.5, 1]],
    ["0-6 months", [0, 0.5]],
    ["10+ years", [10, null]],
    ["2 years", [2, null]],
    ["2yrs+", [2, null]],
    ["between 2 and 4 years", [2, 4]],
    ["two years", [2, null]],
    ["No experience required", [0, 0]],
    ["Experience not required", [0, 0]],
    ["Fresher - 2 years", [0, 2]],
    ["Freshers or 1-3 years", [0, 3]],
    ["8 to 12 Years", [8, 12]],
    ["1.5 - 3 years", [1.5, 3]],
    ["over 5 years", [5, null]],
    ["more than 5 years", [5, null]],
    ["5 years and above", [5, null]],
    ["at least 2 years", [2, null]],
    ["15-20 Yrs", [15, 20]],
    ["1 year - 2 years", [1, 2]],
    ["2-5", [2, 5]],
    ["3", [3, null]],
    ["0", [0, 0]],
    ["4-6 LPA", null],
    ["2024 batch", null],
    ["Any", null],
    ["", null],
    ["Experienced", null],
  ];
  it.each(cases)("%j → %j", (text, expected) => {
    expect(asPair(parseExperience(text))).toEqual(expected);
  });

  it("never returns min > max", () => {
    expect(asPair(parseExperience("5-3 years"))).toEqual([3, 5]);
  });
  it("tolerates garbage", () => {
    expect(parseExperience(undefined)).toBeNull();
    expect(parseExperience(4)).toEqual({ min: 4, max: null });
    expect(parseExperience(42)).toBeNull();
    expect(parseExperience({})).toBeNull();
    expect(parseExperience("999 years")).toBeNull();
  });
});

describe("parseExperience — strict mode for descriptions", () => {
  const cases: [string, R][] = [
    ["Must have 3+ years of experience in Java.", [3, null]],
    ["Experience: 2-4 years", [2, 4]],
    ["5+ years in software development", [5, null]],
    ["At least 2 years of hands-on experience with React", [2, null]],
    ["0-1 years of experience; freshers welcome", [0, 1]],
    ["We have 25+ years of experience in the industry. You need 3+ years of experience in Java.", [3, null]],
    ["Candidates must sign a 2 year bond. Must have 3+ years of experience.", [3, null]],
    ["Founded 15 years ago, we build payments.", null],
    ["This is a 6 month internship", null],
    ["Grow into a lead within 2 years.", null],
    ["Minimum 4 years of B.Tech degree", null],
    ["Applicants must be 18 years old.", null],
    ["Our company has been in business for 30 years.", null],
    ["No prior experience is required.", [0, 0]],
    ["We are a team of 200 engineers.", null],
    ["• 3.5 years to 8 years of relevant experience is required", [3.5, 8]],
    ["8yrs -14yrs of experience building and maintaining services", [8, 14]],
    ["Experience: 2 yrs - 4 yrs", [2, 4]],
    ["Requires 3 – 5 years of experience (en dash)", [3, 5]],
  ];
  it.each(cases)("%j → %j", (text, expected) => {
    expect(asPair(parseExperience(text, { strict: true }))).toEqual(expected);
  });
});
