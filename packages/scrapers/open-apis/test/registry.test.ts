import { SOURCE_KINDS } from "@easyjobs/contract";
import { describe, expect, it } from "vitest";
import scrapersDefault, { scrapers } from "../src/index";

const KEYED: Record<string, string[]> = {
  adzuna: ["ADZUNA_APP_ID", "ADZUNA_APP_KEY"],
  jooble: ["JOOBLE_API_KEY"],
};

describe("package shape (ScraperModule) and isEnabled gating", () => {
  it("exports the same list as named and default export", () => {
    expect(scrapersDefault).toBe(scrapers);
  });

  it("has one scraper per source with unique kebab-case ids", () => {
    const ids = scrapers.map((s) => s.id);
    expect(ids).toEqual([
      "unstop", "adzuna", "jooble", "themuse", "remotive", "remoteok", "arbeitnow", "himalayas", "jobicy", "weworkremotely", "hn-whoishiring",
    ]);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
  });

  it.each(scrapers.map((s) => [s.id, s] as const))("%s: valid kind, interval, no handlesAts, scrape()", (_id, s) => {
    expect(SOURCE_KINDS).toContain(s.kind);
    expect(s.intervalMinutes).toBeGreaterThanOrEqual(60);
    expect(s.handlesAts).toBeUndefined();
    expect(typeof s.scrape).toBe("function");
    expect(s.name.length).toBeGreaterThan(0);
  });

  it("keyless sources are enabled by default; keyed ones only with their keys", () => {
    for (const s of scrapers) {
      const keys = KEYED[s.id];
      expect(s.isEnabled?.({}), s.id).toBe(!keys);
      if (keys) expect(s.isEnabled?.(Object.fromEntries(keys.map((k) => [k, "x"]))), s.id).toBe(true);
    }
  });

  it("OPEN_APIS_DISABLED is a per-source kill switch", () => {
    for (const s of scrapers) {
      const env = { ...Object.fromEntries((KEYED[s.id] ?? []).map((k) => [k, "x"])), OPEN_APIS_DISABLED: s.id };
      expect(s.isEnabled?.(env), s.id).toBe(false);
    }
  });

  it("sources whose terms require attribution declare it", () => {
    for (const id of ["adzuna", "remotive", "remoteok", "himalayas", "jobicy"]) {
      expect(scrapers.find((s) => s.id === id)?.attribution, id).toBeTruthy();
    }
  });

  it("intervals respect documented guidance", () => {
    const by = Object.fromEntries(scrapers.map((s) => [s.id, s.intervalMinutes]));
    expect(by.remotive).toBeGreaterThanOrEqual(360); // "max. 4 times a day"
    expect(by["hn-whoishiring"]).toBe(360);
    expect(by.himalayas).toBeGreaterThanOrEqual(60); // "cached for an hour or more"
  });
});
