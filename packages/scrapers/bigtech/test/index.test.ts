import { slugify } from "@easyjobs/contract";
import { describe, expect, it } from "vitest";
import mod, { careerSites, scrapers } from "../src/index";

describe("package shape", () => {
  it("exports the ScraperModule shape", () => {
    expect(Array.isArray(scrapers)).toBe(true);
    expect(mod).toBe(scrapers);
    expect(scrapers.length).toBe(careerSites.length);
  });

  it("follows the P09 rules for every company scraper", () => {
    const ids = new Set<string>();
    for (const s of careerSites) {
      expect(s.id).toBe(slugify(s.id));
      expect(ids.has(s.id)).toBe(false);
      ids.add(s.id);
      expect(s.kind).toBe("career_site");
      expect(s.handlesAts).toBeUndefined();
      expect(s.intervalMinutes).toBeGreaterThanOrEqual(30);
      expect(s.intervalMinutes).toBeLessThanOrEqual(60);
      expect(s.company.slug).toBe(s.id);
      expect(s.company.careersUrl).toMatch(/^https:\/\//);
      expect(typeof s.scrape).toBe("function");
      if (s.disabledReason) {
        expect(s.isEnabled?.({})).toBe(false);
        expect(s.disabledReason.length).toBeGreaterThan(20);
      } else if (s.optIn) {
        expect(s.optIn.env).toMatch(/^ENABLE_[A-Z_]+$/);
        expect(s.optIn.reason.length).toBeGreaterThan(20);
        expect(s.isEnabled?.({})).toBe(false);
        expect(s.isEnabled?.({ [s.optIn.env]: "1" })).toBe(true);
      } else {
        expect(s.isEnabled?.({})).toBe(true);
        expect(s.isEnabled?.({ BIGTECH_DISABLE: s.id })).toBe(false);
      }
    }
  });
});
