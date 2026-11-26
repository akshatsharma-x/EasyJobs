import { describe, expect, it } from "vitest";
import { joobleScraper, mapJoobleJob, parseJoobleBody } from "../src/sources/jooble";
import { collect, expectValidJobs, fakeHttp, fixture, testCtx } from "./helpers";

const KEY = { JOOBLE_API_KEY: "jooble-secret-key" };

describe("jooble · gating", () => {
  it("is enabled only when the key exists", () => {
    expect(joobleScraper.isEnabled?.({})).toBe(false);
    expect(joobleScraper.isEnabled?.({ JOOBLE_API_KEY: "" })).toBe(false);
    expect(joobleScraper.isEnabled?.(KEY)).toBe(true);
    expect(joobleScraper.isEnabled?.({ ...KEY, OPEN_APIS_DISABLED: "all" })).toBe(false);
  });
});

describe("jooble · mapping (synthetic fixture)", () => {
  const body = parseJoobleBody(fixture("jooble-in.json"));

  it("keeps 64-bit ids exact (they exceed Number.MAX_SAFE_INTEGER)", () => {
    expect(body.jobs?.[0]?.id).toBe("-4795470203364034427");
    expect(body.jobs?.[1]?.id).toBe("9007199254740993123");
    expect(body.jobs?.[2]?.id).toBe(123);
  });

  it("maps title/company/location/type/salary text", () => {
    const job = mapJoobleJob(body.jobs![0]!);
    expect(job).toMatchObject({
      source: "jooble",
      sourceKind: "aggregator",
      sourceJobId: "-4795470203364034427",
      title: "Software Engineer Intern",
      company: "Example Labs",
      locations: ["Bengaluru, Karnataka"],
      jobType: "internship",
      salaryRaw: "₹15,000 - ₹25,000 a month",
      postedAt: "2026-11-24T00:00:00.000Z",
      extra: { originalSource: "example-careers.in" },
    });
    expect(job?.applyUrl).toMatch(/^https:\/\/jooble\.org\/desc\//);
  });

  it("skips jobs without a company", () => {
    expect(mapJoobleJob(body.jobs![2]!)).toBeNull();
  });
});

describe("jooble · scrape", () => {
  it("POSTs per keyword with location India and dedupes across keywords", async () => {
    const http = fakeHttp([{ match: "jooble.org/api/", body: fixture("jooble-in.json") }]);
    const out = await collect(joobleScraper, testCtx(http, { ...KEY, JOOBLE_KEYWORDS: "internship,fresher" }));
    expect(out).toHaveLength(2);
    expectValidJobs(out, joobleScraper);
    expect(http.calls).toHaveLength(2);
    const first = http.calls[0]!;
    expect(first.url).toBe("https://jooble.org/api/jooble-secret-key");
    expect(first.init?.method).toBe("POST");
    expect(first.init?.retries).toBe(0);
    expect(JSON.parse(String(first.init?.body))).toMatchObject({ keywords: "internship", location: "India", page: "1" });
  });

  it("sends datecreatedfrom when an incremental cutoff is known", async () => {
    const http = fakeHttp([{ match: "jooble.org/api/", body: fixture("jooble-in.json") }]);
    await collect(joobleScraper, testCtx(http, { ...KEY, JOOBLE_KEYWORDS: "x" }, { since: new Date("2026-11-20T10:00:00Z") }));
    expect(JSON.parse(String(http.calls[0]?.init?.body))).toMatchObject({ datecreatedfrom: "2026-11-20" });
  });

  it("never leaks the key (it is part of the URL path) in errors", async () => {
    const http = fakeHttp([{ match: "jooble.org/api/", status: 403, body: "forbidden for jooble-secret-key" }]);
    const err = (await collect(joobleScraper, testCtx(http, KEY)).catch((e: unknown) => e)) as Error;
    expect(err.message).not.toContain("jooble-secret-key");
    expect(err.message).toContain("https://jooble.org/api/***");
  });
});
