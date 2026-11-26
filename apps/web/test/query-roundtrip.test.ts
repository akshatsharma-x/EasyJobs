import { DEFAULT_SEARCH_QUERY, parseSearchQuery, toQueryString, type SearchQuery } from "@easyjobs/contract";
import { describe, expect, it } from "vitest";

const RICH: SearchQuery = {
  q: "react developer",
  type: ["internship", "full_time"],
  level: ["intern", "fresher"],
  mode: ["remote", "hybrid"],
  category: ["software_engineering", "data_ai"],
  location: ["Bengaluru", "Remote"],
  country: ["IN"],
  company: ["razorpay", "google"],
  ctype: ["startup", "unicorn"],
  skills: ["React", "TypeScript"],
  batch: [2025, 2026],
  source: ["coursejoiner", "greenhouse"],
  tag: ["off-campus", "wfh"],
  official: true,
  posted: "7d",
  salaryMin: 600_000,
  exp: 1,
  sort: "newest",
  page: 3,
  pageSize: 30,
};

describe("toQueryString ↔ parseSearchQuery", () => {
  it("round-trips a rich query through URLSearchParams", () => {
    const qs = toQueryString(RICH);
    expect(parseSearchQuery(new URLSearchParams(qs))).toEqual(RICH);
  });

  it("round-trips through a Next.js-style searchParams record", () => {
    const record = Object.fromEntries(new URLSearchParams(toQueryString(RICH)));
    expect(parseSearchQuery(record)).toEqual(RICH);
  });

  it("produces readable, shareable URLs (comma-joined lists, no %2C)", () => {
    const qs = toQueryString(RICH);
    expect(qs).toContain("location=Bengaluru,Remote");
    expect(qs).toContain("level=intern,fresher");
    expect(qs).toContain("official=1");
    expect(qs).not.toMatch(/%2C/i);
  });

  it("is idempotent", () => {
    const once = toQueryString(RICH);
    expect(toQueryString(parseSearchQuery(new URLSearchParams(once)))).toBe(once);
  });

  it("omits defaults and empty values", () => {
    expect(toQueryString(DEFAULT_SEARCH_QUERY)).toBe("");
    expect(toQueryString({ ...DEFAULT_SEARCH_QUERY, level: [], q: "", official: false })).toBe("");
    expect(parseSearchQuery(new URLSearchParams(""))).toEqual(DEFAULT_SEARCH_QUERY);
  });

  it("keeps page/sort when they differ from the defaults only", () => {
    expect(toQueryString({ ...DEFAULT_SEARCH_QUERY, page: 2 })).toBe("page=2");
    expect(toQueryString({ ...DEFAULT_SEARCH_QUERY, sort: "salary" })).toBe("sort=salary");
  });

  it("drops unknown values and clamps numbers when parsing", () => {
    const parsed = parseSearchQuery(new URLSearchParams("level=intern,wizard&mode=moon&batch=2026,1999&exp=99&pageSize=500&page=0&sort=weird"));
    expect(parsed.level).toEqual(["intern"]);
    expect(parsed.mode).toBeUndefined();
    expect(parsed.batch).toEqual([2026]);
    expect(parsed.exp).toBe(50);
    expect(parsed.pageSize).toBe(50);
    expect(parsed.page).toBe(1);
    expect(parsed.sort).toBe("relevance");
  });
});
