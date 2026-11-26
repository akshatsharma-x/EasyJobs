import { describe, expect, it } from "vitest";
import type { Scraper } from "@easyjobs/contract/node";
import { checkEnabled } from "../src/tasks";

const scraper = (id: string, isEnabled?: Scraper["isEnabled"]): Scraper => ({
  id,
  name: id,
  kind: "ats",
  intervalMinutes: 60,
  isEnabled,
  async *scrape() {},
});

describe("checkEnabled", () => {
  it("WORKER_DISABLED_SOURCES disables listed scraper ids (case-insensitive), before isEnabled", () => {
    const env = { WORKER_DISABLED_SOURCES: " Workday, themuse ,," };
    expect(checkEnabled(scraper("workday"), env)).toEqual({ enabled: false, reason: "listed in WORKER_DISABLED_SOURCES" });
    expect(checkEnabled(scraper("themuse", () => true), env).enabled).toBe(false);
    expect(checkEnabled(scraper("greenhouse"), env)).toEqual({ enabled: true, reason: null });
  });

  it("falls back to isEnabled(env) and treats a throwing isEnabled as disabled", () => {
    expect(checkEnabled(scraper("adzuna", () => false), {}).enabled).toBe(false);
    expect(
      checkEnabled(
        scraper("broken", () => {
          throw new Error("boom");
        }),
        {},
      ).reason,
    ).toMatch(/threw: boom/);
  });
});
