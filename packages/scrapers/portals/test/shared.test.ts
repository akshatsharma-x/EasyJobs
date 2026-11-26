import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DEFAULT_USER_AGENT } from "@easyjobs/contract/node";
import { afterAll, describe, expect, it } from "vitest";
import { backoffDelayMs, backoffPolicyFromEnv, parseRetryAfter } from "../src/shared/backoff";
import { decodeEntities, describeDenialPage, detectBlock } from "../src/shared/block";
import { envFilterList, envFlag, envInt, envList } from "../src/shared/env";
import { createPacer } from "../src/shared/pacer";
import { isoFromDateAttr, isoFromEpochOrDate, parseRelativeTime } from "../src/shared/relative-time";
import { judgeRobots, matchingDisallowRule } from "../src/shared/robots";
import { advanceCursor, planKey, rotate } from "../src/shared/rotation";
import { createFileStateStore, emptyState } from "../src/shared/state";
import { FakeClock, fixture, HOUR, NOW } from "./helpers";

const LINKEDIN_SEARCH_PATH = "/jobs-guest/jobs/api/seeMoreJobPostings/search?keywords=software%20engineer&location=India&f_TPR=r86400&sortBy=DD&start=0";

describe("detectBlock", () => {
  it("real Naukri capture (plain HTTP, 403) → denied, with the Akamai reference", () => {
    const sig = detectBlock({ status: 403, url: "https://www.naukri.com/software-engineer-jobs?experience=0", body: fixture("naukri/access-denied-http.html") });
    expect(sig).toMatchObject({ kind: "denied", status: 403 });
    expect(sig?.detail).toBe("HTTP 403 — Akamai edge 'Access Denied' (Reference #18.9fdc55b8.1795643750.e9278252)");
  });

  it("real Naukri capture (headless Chromium) is recognised even when served with 200", () => {
    const sig = detectBlock({ status: 200, url: "https://www.naukri.com/software-engineer-jobs?experience=0", body: fixture("naukri/access-denied-headless.html") });
    expect(sig?.kind).toBe("denied");
    expect(sig?.detail).toContain('page title "Access Denied"');
    expect(sig?.detail).toContain("Reference #18.6e220f7a.1795643854.1faa9a6f");
  });

  it.each([
    [429, "rate_limited", "HTTP 429 Too Many Requests"],
    [999, "denied", "HTTP 999 (LinkedIn anti-bot 'request denied')"],
    [403, "denied", "HTTP 403"],
    [401, "denied", "HTTP 401"],
  ] as const)("HTTP %i → %s", (status, kind, detail) => {
    expect(detectBlock({ status, url: "https://www.linkedin.com/jobs-guest/x", body: "" })).toMatchObject({ kind, status, detail });
  });

  it("Retry-After (seconds or HTTP-date) is carried along", () => {
    const now = NOW.getTime();
    const h = new Headers({ "retry-after": "7200" });
    expect(detectBlock({ status: 429, url: "https://x.test/", body: "", headers: h }, now)?.retryAfterMs).toBe(7_200_000);
    const d = new Headers({ "retry-after": new Date(now + 3 * HOUR).toUTCString() });
    expect(detectBlock({ status: 503, url: "https://x.test/", body: "<title>Just a moment...</title>", headers: d }, now)?.retryAfterMs).toBe(3 * HOUR);
  });

  it("redirect to the LinkedIn auth wall / checkpoint → challenge", () => {
    for (const url of ["https://www.linkedin.com/authwall?trk=x", "https://www.linkedin.com/checkpoint/challenge/abc", "https://www.naukri.com/nlogin/login?URL=x"]) {
      expect(detectBlock({ status: 200, url, body: "<html></html>" })?.kind).toBe("challenge");
    }
    expect(detectBlock({ status: 200, url: "https://www.linkedin.com/x", body: fixture("linkedin/authwall.html") })).toMatchObject({
      kind: "challenge",
      detail: 'page title "Sign Up | LinkedIn"',
    });
  });

  it("CAPTCHA / bot-manager pages → challenge", () => {
    expect(detectBlock({ status: 200, url: "https://x.test/", body: '<script src="https://www.google.com/recaptcha/api.js"></script>' })?.kind).toBe("challenge");
    expect(detectBlock({ status: 200, url: "https://x.test/", body: '<form action="/_sec/cp_challenge/verify">' })?.kind).toBe("challenge");
  });

  it("normal pages are not blocks — even when a job description mentions CAPTCHA", () => {
    expect(detectBlock({ status: 200, url: "https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?x", body: fixture("linkedin/search-page.html") })).toBeNull();
    expect(detectBlock({ status: 200, url: "https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/1", body: fixture("linkedin/job-posting-offsite.html") })).toBeNull();
    expect(detectBlock({ status: 200, url: "https://x.test/job", body: "<p>Build CAPTCHA solvers for our anti-fraud team</p>" })).toBeNull();
    expect(detectBlock({ status: 404, url: "https://x.test/gone", body: "" })).toBeNull();
    expect(detectBlock({ status: 200, url: "https://www.linkedin.com/jobs-guest/x", body: "" })).toBeNull();
  });

  it("decodeEntities / describeDenialPage", () => {
    expect(decodeEntities("Reference&#32;&#35;18&#46;9fdc &amp; &#x41;")).toBe("Reference #18.9fdc & A");
    expect(describeDenialPage("<p>hello</p>")).toBe("");
  });
});

describe("judgeRobots (with the real LinkedIn robots.txt, reduced)", () => {
  const robots = fixture("linkedin/robots.txt");
  const ok = (body: string, status = 200) => ({ status, url: "https://www.linkedin.com/robots.txt", body });

  it("our default UA falls into `User-agent: *` → Disallow: / → disallowed", () => {
    const v = judgeRobots(ok(robots), DEFAULT_USER_AGENT, [LINKEDIN_SEARCH_PATH]);
    expect(v).toMatchObject({ verdict: "disallowed", path: LINKEDIN_SEARCH_PATH, rule: "/" });
  });

  it("even whitelisted search engines are disallowed from /jobs-guest/", () => {
    const v = judgeRobots(ok(robots), "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)", [LINKEDIN_SEARCH_PATH, "/jobs-guest/jobs/api/jobPosting/1"]);
    expect(v).toMatchObject({ verdict: "disallowed", rule: "/jobs-guest/" });
  });

  it("allowed paths, missing robots.txt (404) → allowed; 5xx / network → unreachable; 403 page → denied", () => {
    expect(judgeRobots(ok("User-agent: *\nDisallow: /private/\n"), DEFAULT_USER_AGENT, ["/jobs/x"]).verdict).toBe("allowed");
    expect(judgeRobots(ok("", 404), DEFAULT_USER_AGENT, ["/x"]).verdict).toBe("allowed");
    expect(judgeRobots(ok("", 503), DEFAULT_USER_AGENT, ["/x"])).toMatchObject({ verdict: "unreachable", detail: "HTTP 503" });
    expect(judgeRobots(null, DEFAULT_USER_AGENT, ["/x"], "ECONNRESET")).toMatchObject({ verdict: "unreachable", detail: "ECONNRESET" });
    const denied = judgeRobots({ status: 403, url: "https://www.naukri.com/robots.txt", body: fixture("naukri/access-denied-http.html") }, DEFAULT_USER_AGENT, ["/x"]);
    expect(denied.verdict).toBe("denied");
  });

  it("matchingDisallowRule picks the longest matching rule", () => {
    expect(matchingDisallowRule({ allow: [], disallow: ["/", "/jobs-guest/", "/jobs-guest/jobs/api/"] }, LINKEDIN_SEARCH_PATH)).toBe("/jobs-guest/jobs/api/");
    expect(matchingDisallowRule({ allow: [], disallow: ["/private"] }, "/public")).toBeNull();
  });
});

describe("backoff", () => {
  const policy = backoffPolicyFromEnv({});
  const noJitter = (): number => 0;

  it("is exponential in hours: 2 h, 4 h, 8 h, … capped at 7 days", () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => backoffDelayMs(n, policy, null, noJitter) / HOUR)).toEqual([2, 4, 8, 16, 32, 64, 128, 168, 168]);
  });

  it("adds at most 10 % jitter, and a longer Retry-After wins (still capped)", () => {
    expect(backoffDelayMs(1, policy, null, () => 0.999) / HOUR).toBeCloseTo(2.2, 2);
    expect(backoffDelayMs(1, policy, 5 * HOUR, noJitter)).toBe(5 * HOUR);
    expect(backoffDelayMs(1, policy, 30 * 24 * HOUR, noJitter)).toBe(168 * HOUR);
    expect(backoffDelayMs(3, policy, 60_000, noJitter)).toBe(8 * HOUR);
  });

  it("env knobs are clamped", () => {
    const p = backoffPolicyFromEnv({ PORTALS_BACKOFF_BASE_HOURS: "0.01", PORTALS_BACKOFF_MAX_HOURS: "6", PORTALS_ROBOTS_RECHECK_HOURS: "48" });
    expect(p.baseMs).toBe(0.5 * HOUR);
    expect(p.maxMs).toBe(6 * HOUR);
    expect(p.robotsRecheckMs).toBe(48 * HOUR);
  });

  it("parseRetryAfter", () => {
    const now = NOW.getTime();
    expect(parseRetryAfter("120", now)).toBe(120_000);
    expect(parseRetryAfter(new Date(now + 60_000).toUTCString(), now)).toBe(60_000);
    expect(parseRetryAfter("soon", now)).toBeNull();
    expect(parseRetryAfter(null, now)).toBeNull();
  });
});

describe("pacer", () => {
  it("spaces requests 4–6 s apart, measured from the end of the previous request", async () => {
    const clock = new FakeClock();
    let r = 0;
    const randoms = [0, 1, 0.5];
    const pacer = createPacer({ minGapMs: 4000, maxGapMs: 6000, clock, random: () => randoms[r++ % randoms.length] ?? 0 });
    expect(await pacer.acquire()).toBe(0); // first request: no wait
    clock.advance(1500); // request takes 1.5 s
    pacer.release(); // next allowed at +4 s (random 0)
    expect(await pacer.acquire()).toBe(4000);
    pacer.release(); // random 1 → 6 s
    clock.advance(2000); // caller idles 2 s before the next request
    expect(await pacer.acquire()).toBe(4000);
    pacer.release();
    expect(clock.sleeps).toEqual([4000, 4000]);
  });

  it("never goes below the 4 s floor even if configured lower", async () => {
    const clock = new FakeClock();
    const pacer = createPacer({ minGapMs: 10, maxGapMs: 20, clock, random: () => 0 });
    expect(pacer.minGapMs).toBe(4000);
    expect(pacer.maxGapMs).toBe(4000);
    await pacer.acquire();
    pacer.release();
    expect(await pacer.acquire()).toBe(4000);
  });

  it("serialises concurrent callers", async () => {
    const clock = new FakeClock();
    const pacer = createPacer({ minGapMs: 4000, maxGapMs: 4000, clock, random: () => 0 });
    const order: string[] = [];
    const run = async (name: string): Promise<void> => {
      await pacer.acquire();
      order.push(`start ${name}`);
      await Promise.resolve();
      order.push(`end ${name}`);
      pacer.release();
    };
    await Promise.all([run("a"), run("b")]);
    expect(order).toEqual(["start a", "end a", "start b", "end b"]);
  });

  it("an aborted wait rejects and frees the slot", async () => {
    const clock = new FakeClock();
    const pacer = createPacer({ minGapMs: 4000, maxGapMs: 4000, clock, random: () => 0 });
    await pacer.acquire();
    pacer.release();
    const ac = new AbortController();
    ac.abort(new Error("shutdown"));
    await expect(pacer.acquire(ac.signal)).rejects.toThrow("shutdown");
    expect(await pacer.acquire()).toBe(4000);
  });
});

describe("rotation", () => {
  const items = ["a", "b", "c", "d", "e"];
  it("rotates through the plan across runs and wraps", () => {
    expect(rotate(items, 0, 2)).toEqual(["a", "b"]);
    expect(rotate(items, 2, 2)).toEqual(["c", "d"]);
    expect(rotate(items, 4, 2)).toEqual(["e", "a"]);
    expect(rotate(items, 12, 9)).toEqual(["c", "d", "e", "a", "b"]);
    expect(rotate([], 3, 2)).toEqual([]);
    expect(advanceCursor(4, 2, 5)).toBe(1);
    expect(advanceCursor(4, 0, 5)).toBe(4);
    expect(advanceCursor(-1, 1, 5)).toBe(0);
  });
  it("planKey changes with the plan", () => {
    expect(planKey(["a", "b"])).toBe(planKey(["a", "b"]));
    expect(planKey(["a", "b"])).not.toBe(planKey(["b", "a"]));
  });
});

describe("relative time", () => {
  it.each([
    ["Just now", "2026-11-26T06:00:00.000Z"],
    ["Just Now", "2026-11-26T06:00:00.000Z"],
    ["Today", "2026-11-26T06:00:00.000Z"],
    ["Few Hours Ago", "2026-11-26T03:00:00.000Z"],
    ["a few hours ago", "2026-11-26T03:00:00.000Z"],
    ["35 minutes ago", "2026-11-26T05:25:00.000Z"],
    ["an hour ago", "2026-11-26T05:00:00.000Z"],
    ["2 hours ago", "2026-11-26T04:00:00.000Z"],
    ["1 Day Ago", "2026-11-25T06:00:00.000Z"],
    ["Yesterday", "2026-11-25T06:00:00.000Z"],
    ["Reposted 3 weeks ago", "2026-11-05T06:00:00.000Z"],
    ["30+ Days Ago", "2026-10-27T06:00:00.000Z"],
    ["1 month ago", "2026-10-27T06:00:00.000Z"],
    ["5d ago", "2026-11-21T06:00:00.000Z"],
    ["Hiring now", null],
    ["", null],
    [null, null],
  ] as const)("%j → %s", (text, expected) => {
    expect(parseRelativeTime(text, NOW)).toBe(expected);
  });

  it("date attributes and epochs", () => {
    expect(isoFromDateAttr("2026-11-25")).toBe("2026-11-25T00:00:00.000Z");
    expect(isoFromDateAttr("nope")).toBeNull();
    expect(isoFromEpochOrDate(1795587300000)).toBe("2026-11-25T06:15:00.000Z");
    expect(isoFromEpochOrDate(1795587300)).toBe("2026-11-25T06:15:00.000Z");
    expect(isoFromEpochOrDate("1795587300000")).toBe("2026-11-25T06:15:00.000Z");
    expect(isoFromEpochOrDate("2026-11-25 11:45:00")).toBe("2026-11-25T06:15:00.000Z");
    expect(isoFromEpochOrDate(0)).toBeNull();
    expect(isoFromEpochOrDate("garbage")).toBeNull();
  });
});

describe("env helpers", () => {
  it("parse flags, ints, lists and filter lists", () => {
    expect(envFlag({ X: "1" }, "X")).toBe(true);
    expect(envFlag({ X: "2" }, "X")).toBe(false);
    expect(envInt({ N: "7.9" }, "N", 3, 1, 10)).toBe(7);
    expect(envInt({ N: "-5" }, "N", 3, 1, 10)).toBe(1);
    expect(envInt({ N: "abc" }, "N", 3, 1, 10)).toBe(3);
    expect(envList({ L: " a, b;a |c\n" }, "L", ["z"])).toEqual(["a", "b", "c"]);
    expect(envList({ L: " , ; " }, "L", ["z"])).toEqual(["z"]);
    expect(envFilterList({}, "F", ["1"], ["1", "2"])).toEqual(["1"]);
    expect(envFilterList({ F: "any" }, "F", ["1"], ["1", "2"])).toEqual([]);
    expect(envFilterList({ F: "2,7" }, "F", ["1"], ["1", "2"])).toEqual(["2"]);
  });
});

describe("file state store", () => {
  const dirs: string[] = [];
  afterAll(async () => {
    await Promise.all(dirs.map((d) => rm(d, { recursive: true, force: true })));
  });

  it("round-trips state atomically and survives a corrupt file", async () => {
    const dir = await mkdtemp(join(tmpdir(), "portals-state-"));
    dirs.push(dir);
    const file = join(dir, "nested", "linkedin.json");
    const store = createFileStateStore(file);
    expect(await store.load()).toEqual(emptyState());
    const state = { ...emptyState(), strikes: 2, blockedUntil: "2026-11-26T10:00:00.000Z", rotationCursor: 5, planKey: "abc" };
    await store.save(state);
    expect(await store.load()).toEqual(state);
    expect(JSON.parse(await readFile(file, "utf8"))).toMatchObject({ version: 1, strikes: 2 });
    await writeFile(file, "{not json", "utf8");
    expect(await store.load()).toEqual(emptyState());
    await writeFile(file, JSON.stringify({ strikes: -3, blockedUntil: "garbage", rotationCursor: "x" }), "utf8");
    expect(await store.load()).toMatchObject({ strikes: 0, blockedUntil: null, rotationCursor: 0 });
  });
});
