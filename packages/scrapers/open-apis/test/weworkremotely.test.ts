import { describe, expect, it } from "vitest";
import { mapWwrItem, parseWwrFeed, weworkremotelyScraper, wwrLocationSignals } from "../src/sources/weworkremotely";
import { collect, expectValidJobs, fakeHttp, fixture, testCtx } from "./helpers";

const items = parseWwrFeed(fixture("wwr.rss"));
const byTitle = (t: string) => {
  const i = items.find((x) => String(x.title).startsWith(t));
  if (!i) throw new Error(`fixture "${t}" missing`);
  return i;
};

describe("weworkremotely · RSS parsing (live capture 2026-11-26)", () => {
  it("parses items with WWR's custom tags", () => {
    expect(items.length).toBeGreaterThanOrEqual(12);
    const i = byTitle("Fivetran");
    expect(i.region).toBe("Anywhere in the World");
    expect(i.country).toContain("India");
    expect(i.description).toMatch(/^<img|<p>/);
  });

  it("India-country role: 'Company: Role' title split, dates, category, type", () => {
    const job = mapWwrItem(byTitle("Fivetran"));
    expect(job).toMatchObject({
      source: "weworkremotely",
      company: "Fivetran",
      title: "Manager, Software Engineering",
      locations: ["Remote (India)"],
      jobType: "full_time",
      department: "Product",
      isRemote: true,
      sourceJobId: "fivetran-manager-software-engineering",
      applyUrl: "https://weworkremotely.com/remote-jobs/fivetran-manager-software-engineering",
    });
    expect(job?.validThrough).toBe("2026-12-24T18:32:09.000Z");
  });

  it("'Asia Only' is kept as Asia; 'Anywhere' with HQ 'Remote' is kept", () => {
    expect(mapWwrItem(byTitle("D2B"))?.locations).toEqual(["Remote (Asia)"]);
    expect(mapWwrItem(byTitle("Carrot"))?.locations).toEqual(["Remote (Anywhere)"]);
  });

  it("'Anywhere in the World' is overridden by a country field or an HQ remote location", () => {
    // country: 🇺🇸 United States of America
    expect(mapWwrItem(byTitle("Datadog"))).toBeNull();
    // Headquarters: United States - Remote / Canada - Remote (ON, AB, BC, or NS Only)
    expect(mapWwrItem(byTitle("Instacart"))).toBeNull();
    expect(mapWwrItem(byTitle("Tebra"))).toBeNull();
    // Title: "... - Europe"
    expect(mapWwrItem(byTitle("Storyblok: Senior QA"))).toBeNull();
    // USA Only region
    expect(mapWwrItem(byTitle("Natera"))).toBeNull();
    expect(wwrLocationSignals(byTitle("Tebra"), "United States - Remote")).toEqual(["United States - Remote"]);
    expect(wwrLocationSignals(byTitle("Carrot"), "Remote")).toEqual(["Anywhere in the World"]);
  });
});

describe("weworkremotely · scrape", () => {
  it("one feed request (robots honoured), valid jobs", async () => {
    const http = fakeHttp([{ match: "weworkremotely.com/remote-jobs.rss", body: fixture("wwr.rss") }]);
    const out = await collect(weworkremotelyScraper, testCtx(http));
    expect(out).toHaveLength(4);
    expectValidJobs(out, weworkremotelyScraper);
    expect(http.calls[0]?.init?.robots).toBeUndefined();
  });

  it("WWR_FEEDS adds category feeds; duplicates are dropped", async () => {
    const http = fakeHttp([{ match: "weworkremotely.com", body: fixture("wwr.rss") }]);
    const out = await collect(
      weworkremotelyScraper,
      testCtx(http, { WWR_FEEDS: "https://weworkremotely.com/remote-jobs.rss,https://weworkremotely.com/categories/remote-programming-jobs.rss" }),
    );
    expect(http.calls).toHaveLength(2);
    expect(out).toHaveLength(4);
  });
});
