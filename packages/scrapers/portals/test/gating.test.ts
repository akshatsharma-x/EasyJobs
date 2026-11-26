import type { ScraperModule } from "@easyjobs/contract/node";
import { describe, expect, it } from "vitest";
import * as mod from "../src/index";
import { createLinkedInScraper } from "../src/linkedin/scraper";
import { createNaukriScraper } from "../src/naukri/scraper";
import { collect, fakeBrowser, fakeHttp, FakeClock, makeCtx } from "./helpers";
import { createMemoryStateStore } from "../src/shared/state";

describe("package shape", () => {
  it("exports both scrapers as a ScraperModule (default + named)", () => {
    const m: ScraperModule = mod;
    expect(m.scrapers?.map((s) => s.id)).toEqual(["linkedin", "naukri"]);
    expect(m.default).toBe(m.scrapers);
    for (const s of mod.scrapers) {
      expect(s.kind).toBe("job_board");
      expect(s.intervalMinutes).toBe(60);
      expect(s.handlesAts).toBeUndefined();
      expect(typeof s.isEnabled).toBe("function");
    }
  });
});

describe("isEnabled gating", () => {
  const values: [string | undefined, boolean][] = [
    [undefined, false],
    ["0", false],
    ["", false],
    ["no", false],
    ["false", false],
    ["1", true],
    ["true", true],
    [" YES ", true],
    ["on", true],
  ];
  const cases = (flag: string): [Record<string, string | undefined>, boolean][] =>
    values.map(([v, expected]) => [v === undefined ? {} : { [flag]: v }, expected]);

  it.each(cases("ENABLE_LINKEDIN"))("linkedin %j → %s", (env, expected) => {
    expect(mod.linkedinScraper.isEnabled?.(env)).toBe(expected);
  });
  it.each(cases("ENABLE_NAUKRI"))("naukri %j → %s", (env, expected) => {
    expect(mod.naukriScraper.isEnabled?.(env)).toBe(expected);
  });
  it("the two flags are independent", () => {
    expect(mod.linkedinScraper.isEnabled?.({ ENABLE_NAUKRI: "1" })).toBe(false);
    expect(mod.naukriScraper.isEnabled?.({ ENABLE_LINKEDIN: "1" })).toBe(false);
  });
});

describe("importing the package has no side effects", () => {
  it("creating scrapers makes no requests and launches no browser", async () => {
    const http = fakeHttp(() => new Response("", { status: 500 }));
    const browser = fakeBrowser(() => {
      throw new Error("should not open");
    });
    createLinkedInScraper({ clock: new FakeClock(), stateStore: () => createMemoryStateStore() });
    createNaukriScraper({ clock: new FakeClock(), stateStore: () => createMemoryStateStore(), fetcherFactory: browser.factory });
    expect(http.calls).toHaveLength(0);
    expect(browser.launches).toBe(0);
  });

  it("a scraper still honours its own backoff when called directly without the flag check", async () => {
    // The worker/CLI call isEnabled() first; scrape() itself never bypasses the safety envelope.
    const store = createMemoryStateStore({ blockedUntil: "2099-01-01T00:00:00.000Z", lastBlock: null });
    const http = fakeHttp(() => new Response("", { status: 200 }));
    const s = createLinkedInScraper({ clock: new FakeClock(), stateStore: () => store });
    const jobs = await collect(s.scrape(makeCtx({ http })));
    expect(jobs).toEqual([]);
    expect(http.calls).toHaveLength(0);
  });
});
