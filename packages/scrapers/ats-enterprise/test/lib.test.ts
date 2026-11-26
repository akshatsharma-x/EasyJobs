import { describe, expect, it } from "vitest";
import type { RawJob } from "@easyjobs/contract";
import { dateOnlyToIso, epochToIso, isPast, parseRelativePosted, toIso } from "../src/lib/dates";
import { createDetailBudget, resolveDetails } from "../src/lib/details";
import { cleanText, decodeEntities, extractAssignedJson, htmlToText, looksEscapedHtml, normalizeDescriptionHtml } from "../src/lib/html";
import { BlockedError, createSourceHttp, isBlocked } from "../src/lib/http";
import { createLimiter, orderedMap, resetSharedLimiters } from "../src/lib/limiter";
import {
  countryNames,
  isCountryLabel,
  isPlaceholderLocation,
  isTestPosting,
  levelFromWorkerType,
  mapEmploymentType,
  mapWorkMode,
  mentionsCountry,
} from "../src/lib/mapping";
import { newStats, type TargetContext } from "../src/lib/run";
import { html, json, memoryLogger, mockHttp, NOW, target } from "./helpers";

describe("dates", () => {
  it.each([
    ["2026-11-25", "2026-11-25T12:00:00.000Z"],
    ["2026-11-25T00:00:00", "2026-11-25T12:00:00.000Z"],
    ["2026-11-25T21:09:16+00:00", "2026-11-25T21:09:16.000Z"],
    ["2026-11-20T10:00:00", "2026-11-20T10:00:00.000Z"], // offset-less → UTC, not server-local
    ["2026-11-09T00:00:00.000+0000", "2026-11-09T00:00:00.000Z"], // Phenom
    ["Thu Nov 12 02:00:00 UTC 2026", "2026-11-12T02:00:00.000Z"], // SuccessFactors microdata
    ["Thu Nov 12 02:00:00 IST 2026", "2026-11-11T20:30:00.000Z"],
    ["11/20/2026", "2026-11-20T12:00:00.000Z"],
    ["20/11/2026", "2026-11-20T12:00:00.000Z"],
    ["Nov 20, 2026", "2026-11-20T12:00:00.000Z"],
    [1794355200, "2026-11-11T00:00:00.000Z"], // epoch seconds (Eightfold)
    [1794355200000, "2026-11-11T00:00:00.000Z"], // epoch ms
    ["1794355200", "2026-11-11T00:00:00.000Z"],
  ])("toIso(%j) → %s", (input, expected) => {
    expect(toIso(input, NOW)).toBe(expected);
  });

  it("rejects placeholders and implausible dates", () => {
    for (const v of ["", null, undefined, "not a date", "1900-01-01", "9999-12-31", 0, -5, {}]) expect(toIso(v, NOW)).toBeNull();
  });

  it("clamps a calendar date of today to now (still 'new' in every time zone)", () => {
    expect(dateOnlyToIso("2026-11-26", NOW)).toBe(NOW.toISOString());
    expect(epochToIso(Number.NaN, NOW)).toBeNull();
  });

  it.each([
    ["Posted Today", 0, false],
    ["Posted Yesterday", 1, false],
    ["Posted 3 Days Ago", 3, false],
    ["Posted 30+ Days Ago", 30, true],
    ["2 weeks ago", 14, true],
    ["Just now", 0, false],
  ])("parseRelativePosted(%s)", (label, days, approx) => {
    const r = parseRelativePosted(label, NOW);
    expect(r).not.toBeNull();
    expect(Date.parse(r!.iso)).toBe(NOW.getTime() - days * 86_400_000);
    expect(r!.approximate).toBe(approx);
  });

  it("parseRelativePosted ignores unrelated text", () => {
    expect(parseRelativePosted("Full time", NOW)).toBeNull();
    expect(parseRelativePosted(null, NOW)).toBeNull();
  });

  it("isPast uses a one-day grace", () => {
    expect(isPast("2026-11-20T00:00:00Z", NOW)).toBe(true);
    expect(isPast("2026-11-25T00:00:00Z", NOW)).toBe(false);
    expect(isPast(null, NOW)).toBe(false);
  });
});

describe("html", () => {
  it("decodes named, decimal and hex entities", () => {
    expect(decodeEntities("AI &amp; ML &#8211; &#x2014; &rsquo;s &nbsp;x &bogus;")).toBe("AI & ML – — ’s  x &bogus;");
  });
  it("detects and decodes entity-escaped HTML (once and twice)", () => {
    expect(looksEscapedHtml("&lt;p&gt;Hi&lt;/p&gt;")).toBe(true);
    expect(looksEscapedHtml("<p>5 &lt; 6</p>")).toBe(false);
    expect(normalizeDescriptionHtml("&lt;h1&gt;&lt;b&gt;Role&lt;/b&gt;&lt;/h1&gt;")).toBe("<h1><b>Role</b></h1>");
    expect(normalizeDescriptionHtml("&amp;lt;p&amp;gt;Hi&amp;lt;/p&amp;gt;")).toBe("<p>Hi</p>");
    expect(normalizeDescriptionHtml("   ")).toBeNull();
    expect(normalizeDescriptionHtml("<p>&nbsp;</p>")).toBeNull();
  });
  it("htmlToText keeps block structure", () => {
    expect(htmlToText("<p>One</p><ul><li>Two</li></ul><script>x()</script>")).toBe("One\n\nTwo");
    expect(cleanText("  <b>Senior</b>&nbsp;Engineer  ")).toBe("Senior Engineer");
  });
  it("extracts an assigned JSON blob with strings containing braces", () => {
    const page = `<script>var phApp = {}; phApp.ddo = {"a":{"b":"x}{y","c":[1,2]}}; phApp.other = 1;</script>`;
    expect(extractAssignedJson(page, "phApp.ddo")).toEqual({ a: { b: "x}{y", c: [1, 2] } });
    expect(extractAssignedJson("nothing here", "phApp.ddo")).toBeUndefined();
  });
});

describe("mapping", () => {
  it.each([
    [["Full time"], "full_time"],
    [["FULL_TIME"], "full_time"],
    [["Regular Employee", "Part time"], "part_time"],
    [["Intern (Fixed Term)", "Full time"], "internship"],
    [["INTERN"], "internship"],
    [["CONTRACTOR"], "contract"],
    [["Fixed Term"], "temporary"],
    [["Apprentice"], "apprenticeship"],
    [["Regular Full-Time"], "full_time"],
    [["Management"], undefined],
    [[null, ""], undefined],
  ])("mapEmploymentType(%j) → %s", (raws, expected) => {
    expect(mapEmploymentType(...(raws as string[]))).toBe(expected);
  });

  it.each([
    ["ORA_REMOTE", "remote"],
    ["ORA_HYBRID", "hybrid"],
    ["ORA_ON_SITE", "onsite"],
    ["TELECOMMUTE", "remote"],
    ["Flexible", "hybrid"],
    ["onsite", "onsite"],
    ["Onsite", "onsite"],
    ["", undefined],
  ])("mapWorkMode(%s) → %s", (raw, expected) => {
    expect(mapWorkMode(raw)).toBe(expected);
  });

  it("structured worker types give level hints; ordinary ones do not", () => {
    expect(levelFromWorkerType("Intern (Fixed Term)")).toBe("intern");
    expect(levelFromWorkerType("New College Graduate")).toBe("fresher");
    expect(levelFromWorkerType("Regular Employee")).toBeUndefined();
  });

  it("country matching: exact labels and mentions", () => {
    const india = countryNames("IN");
    expect(india.code).toBe("IN");
    expect(isCountryLabel("India", india)).toBe(true);
    expect(isCountryLabel("Indiana", india)).toBe(false);
    for (const s of ["Bangalore, India", "India - Pune", "Remote India", "IND-Bangalore", "Ahmedabad - MIB, India"]) expect(mentionsCountry(s, india)).toBe(true);
    for (const s of ["Indianapolis, US", "Indiana", "Bangkok"]) expect(mentionsCountry(s, india)).toBe(false);
    expect(countryNames("United States").code).toBe("US");
  });

  it("placeholder locations and test postings", () => {
    expect(isPlaceholderLocation("3 Locations")).toBe(true);
    expect(isPlaceholderLocation("Multiple Locations")).toBe(true);
    expect(isPlaceholderLocation("US, CA, Santa Clara")).toBe(false);
    for (const t of ["DO NOT APPLY - TEST REQ - Sr Manager", "SA TEST OCT 15 1", "sourcing agent test oct 15", "Dummy Requisition"]) expect(isTestPosting(t)).toBe(true);
    for (const t of ["Test Engineer - HVDC", "QA Testing Analyst", "Senior Test Automation Engineer", "Test Job Coordinator"]) expect(isTestPosting(t)).toBe(false);
  });
});

describe("limiter", () => {
  it("caps concurrency and spaces starts", async () => {
    const l = createLimiter(2, 30);
    let active = 0;
    let peak = 0;
    const starts: number[] = [];
    await Promise.all(
      Array.from({ length: 5 }, () =>
        l.run(async () => {
          starts.push(Date.now());
          active++;
          peak = Math.max(peak, active);
          await new Promise((r) => setTimeout(r, 20));
          active--;
        }),
      ),
    );
    expect(peak).toBeLessThanOrEqual(2);
    for (let i = 1; i < starts.length; i++) expect((starts[i] ?? 0) - (starts[i - 1] ?? 0)).toBeGreaterThanOrEqual(25);
  });

  it("orderedMap yields in input order with bounded parallelism", async () => {
    let inflight = 0;
    let peak = 0;
    const out: number[] = [];
    for await (const v of orderedMap([30, 5, 20, 1], 2, async (ms, i) => {
      inflight++;
      peak = Math.max(peak, inflight);
      await new Promise((r) => setTimeout(r, ms));
      inflight--;
      return i;
    })) out.push(v);
    expect(out).toEqual([0, 1, 2, 3]);
    expect(peak).toBe(2);
  });
});

describe("source http", () => {
  const mk = (h: ReturnType<typeof mockHttp>, waits: number[] = [1, 1]) => {
    resetSharedLimiters();
    return createSourceHttp(h, {
      limiterKey: `t:${Math.random()}`,
      concurrency: 2,
      gapMs: 0,
      timeoutMs: 1000,
      robots: false,
      throttleWaitsMs: waits,
      signal: new AbortController().signal,
      log: memoryLogger(),
    });
  };

  it("passes retries:0 to the contract client and retries 429 itself", async () => {
    let n = 0;
    const h = mockHttp(() => (++n < 3 ? json({ error: "slow down" }, 429) : json({ ok: true })));
    const http = mk(h);
    await expect(http.json("https://x.test/a")).resolves.toEqual({ ok: true });
    expect(h.calls).toHaveLength(3);
    expect(h.calls.every((c) => c.init.retries === 0)).toBe(true);
    expect(http.stats.rateLimited).toBe(2);
  });

  it("gives up on 429 once the planned waits are used", async () => {
    const h = mockHttp(() => json({}, 429));
    await expect(mk(h, [1]).json("https://x.test/a")).rejects.toMatchObject({ status: 429 });
    expect(h.calls).toHaveLength(2);
  });

  it("treats a Cloudflare managed challenge as a block — no retries", async () => {
    const h = mockHttp(() =>
      html("<title>Just a moment...</title>Security Check Enable JavaScript and cookies to continue", 429, { "cf-mitigated": "challenge" }),
    );
    const err = await mk(h).json("https://x.test/a").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(BlockedError);
    expect(isBlocked(err)).toBe(true);
    expect(h.calls).toHaveLength(1);
  });

  it("after a challenge, the source stays blocked for this process — nothing more is sent", async () => {
    const h = mockHttp(() => html("Enable JavaScript and cookies to continue", 429, { "cf-mitigated": "challenge" }));
    const http = mk(h);
    await expect(http.json("https://x.test/a")).rejects.toBeInstanceOf(BlockedError);
    const again = await http.json("https://x.test/b").catch((e: unknown) => e);
    expect(again).toBeInstanceOf(BlockedError);
    expect(String(again)).toMatch(/no requests until/);
    expect(h.calls).toHaveLength(1);
  });

  it("retries transient 5xx, not 4xx", async () => {
    let n = 0;
    const h = mockHttp(() => (++n === 1 ? json({}, 502) : json({ ok: 1 })));
    await expect(mk(h).json("https://x.test/a")).resolves.toEqual({ ok: 1 });
    const h404 = mockHttp(() => json({}, 404));
    await expect(mk(h404).json("https://x.test/b")).rejects.toMatchObject({ status: 404 });
    expect(h404.calls).toHaveLength(1);
  });

  it("sends JSON bodies as POST with content-type", async () => {
    const h = mockHttp(() => json({ ok: 1 }));
    await mk(h).json("https://x.test/a", { body: { limit: 20 } });
    expect(h.calls[0]?.method).toBe("POST");
    expect(h.calls[0]?.body).toEqual({ limit: 20 });
    expect(new Headers(h.calls[0]?.init.headers).get("content-type")).toBe("application/json");
  });
});

describe("resolveDetails", () => {
  type Item = { id: string };
  const job = (id: string, full: boolean): RawJob => ({
    source: "t",
    sourceKind: "ats",
    sourceJobId: id,
    sourceUrl: `https://x.test/${id}`,
    target: "t",
    applyUrl: null,
    title: `Job ${id}`,
    company: "T",
    locations: [],
    descriptionHtml: full ? "<p>full</p>" : null,
    postedAt: null,
  });
  const tctx = (known: Set<string> = new Set()): TargetContext => ({
    target: target({ slug: "t", ats: "workday", token: "https://x.test" }),
    http: mockHttp(),
    log: memoryLogger(),
    signal: new AbortController().signal,
    env: {},
    isKnown: (id) => known.has(id),
    now: NOW,
    stats: newStats(),
    cache: null,
    drift: () => undefined,
  });
  const entries = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `j${i}`, item: { id: `j${i}` } }));
  const run = async (ctx: TargetContext, budget: ReturnType<typeof createDetailBudget>, fetchDetail: (i: Item) => Promise<string>, n = 5) => {
    const out: RawJob[] = [];
    for await (const j of resolveDetails(ctx, entries(n), budget, { fetchDetail, toFull: (i) => job(i.id, true), toLight: (i) => job(i.id, false) })) out.push(j);
    return out;
  };

  it("known → light without a request; unknown within budget → full; overflow → deferred", async () => {
    const ctx = tctx(new Set(["j0"]));
    const calls: string[] = [];
    const out = await run(ctx, createDetailBudget(2, "defer"), async (i) => (calls.push(i.id), "ok"));
    expect(out.map((j) => [j.sourceJobId, j.descriptionHtml !== null])).toEqual([
      ["j0", false],
      ["j1", true],
      ["j2", true],
    ]);
    expect(calls).toEqual(["j1", "j2"]);
    expect(ctx.stats).toMatchObject({ known: 1, detailed: 2, deferred: 2 });
  });

  it("overflow=light emits list data instead of deferring", async () => {
    const out = await run(tctx(), createDetailBudget(1, "light"), async () => "ok", 3);
    expect(out.map((j) => j.descriptionHtml !== null)).toEqual([true, false, false]);
  });

  it("404 → skipped as gone; throttling trips the breaker and defers the rest", async () => {
    const { HttpError } = await import("@easyjobs/contract/node");
    const ctx = tctx();
    const out = await run(ctx, createDetailBudget(10, "defer", 1), async (i) => {
      if (i.id === "j0") throw new HttpError(404, "u");
      throw new HttpError(429, "u");
    });
    expect(out).toHaveLength(0);
    expect(ctx.stats.gone).toBe(1);
    expect(ctx.stats.deferred).toBe(4);
  });

  it("an anti-bot block trips the breaker at once", async () => {
    const ctx = tctx();
    let calls = 0;
    const out = await run(ctx, createDetailBudget(10, "defer", 1), async () => {
      calls++;
      throw new BlockedError("https://x.test/a", 429);
    });
    expect(out).toHaveLength(0);
    expect(calls).toBe(1);
  });

  it("a broken detail endpoint falls back to list data", async () => {
    const ctx = tctx();
    const out = await run(ctx, createDetailBudget(10, "defer", 1), async () => {
      throw new Error("boom");
    }, 7);
    expect(out).toHaveLength(7);
    expect(out.every((j) => j.descriptionHtml === null)).toBe(true);
  });
});
