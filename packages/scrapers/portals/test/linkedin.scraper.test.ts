import { validateRawJob } from "@easyjobs/contract";
import { describe, expect, it } from "vitest";
import { createLinkedInScraper } from "../src/linkedin/scraper";
import { createMemoryStateStore } from "../src/shared/state";
import { collect, fakeHttp, FakeClock, fixture, HOUR, html, makeCtx, responseAt, type FakeHttp } from "./helpers";

const ALLOW_ALL = "User-agent: *\nAllow: /\n";
const DETAILS: Record<string, string> = {
  "4290000001": "linkedin/job-posting-offsite.html",
  "4290000002": "linkedin/job-posting-easy-apply.html",
  "4290000004": "linkedin/job-posting-closed.html",
};

interface Routes {
  robots?: () => Response;
  listing?: (url: URL, n: number) => Response;
  detail?: (id: string) => Response;
}

/** Fake www.linkedin.com: robots.txt, guest search fragments and guest job postings. */
function linkedIn(routes: Routes = {}): FakeHttp {
  let n = 0;
  return fakeHttp((raw) => {
    const url = new URL(raw);
    if (url.pathname === "/robots.txt") return routes.robots?.() ?? new Response(ALLOW_ALL);
    if (url.pathname === "/jobs-guest/jobs/api/seeMoreJobPostings/search") return routes.listing?.(url, n++) ?? html(fixture("linkedin/search-page.html"));
    const id = /^\/jobs-guest\/jobs\/api\/jobPosting\/(\d+)$/.exec(url.pathname)?.[1];
    if (id) return routes.detail?.(id) ?? (DETAILS[id] ? html(fixture(DETAILS[id])) : html("", 404));
    return html("not found", 404);
  });
}

function setup(env: Record<string, string> = {}, random = 0) {
  const clock = new FakeClock();
  const store = createMemoryStateStore();
  const scraper = createLinkedInScraper({ clock, random: () => random, stateStore: () => store });
  return { clock, store, scraper, env: { LINKEDIN_QUERIES_PER_RUN: "1", ...env } };
}

const kinds = (http: FakeHttp): string[] =>
  http.calls.map((c) => {
    const p = new URL(c.url).pathname;
    return p === "/robots.txt" ? "robots" : p.includes("seeMoreJobPostings") ? "listing" : "detail";
  });

describe("linkedin scraper — happy path", () => {
  it("robots gate → listing → capped details for unknown ids → valid RawJobs", async () => {
    const { clock, store, scraper, env } = setup({}, 0.5);
    const http = linkedIn();
    const ctx = makeCtx({ http, env, isKnown: (id) => id === "4290000003" });
    const jobs = await collect(scraper.scrape(ctx));

    expect(kinds(http)).toEqual(["robots", "listing", "detail", "detail", "detail"]);
    expect(jobs.map((j) => j.sourceJobId)).toEqual(["4290000001", "4290000002", "4290000003"]); // 4290000004 is closed
    for (const job of jobs) expect(validateRawJob(job)).toEqual([]);
    expect(jobs[0]?.descriptionHtml).toContain("Spring Boot");
    expect(jobs[2]?.descriptionHtml).toBeNull(); // known id → light record, no detail request

    // retries: 0 on every request; robots.txt itself is fetched with robots: false, everything else robots-checked.
    expect(http.calls.every((c) => c.init?.retries === 0)).toBe(true);
    expect(http.calls[0]?.init?.robots).toBe(false);
    expect(http.calls.slice(1).every((c) => c.init?.robots === undefined)).toBe(true);
    // 1 request per 4–6 s: 4 waits of 5 s (random 0.5) between 5 requests.
    expect(clock.sleeps).toEqual([5000, 5000, 5000, 5000]);

    const state = store.current();
    expect(state).toMatchObject({ strikes: 0, blockedUntil: null, rotationCursor: 1 });
    expect(state.lastRun).toMatchObject({ outcome: "ok", requests: 5, listingRequests: 1, detailRequests: 3, emitted: 3, queries: ["software engineer|E1"] });
    expect(ctx.log.text()).toMatch(/linkedin: run ok — 3 job\(s\), 5 request\(s\)/);
  });

  it("listing URL carries keywords, location=India, f_TPR=r86400, f_E, sortBy=DD, start", async () => {
    const { scraper, env } = setup();
    const http = linkedIn();
    await collect(scraper.scrape(makeCtx({ http, env: { ...env, LINKEDIN_MAX_DETAILS_PER_RUN: "0" } })));
    const listing = new URL(http.calls[1]!.url);
    expect(Object.fromEntries(listing.searchParams)).toEqual({ keywords: "software engineer", location: "India", f_TPR: "r86400", f_E: "1", sortBy: "DD", start: "0" });
  });

  it("respects LINKEDIN_MAX_REQ_PER_RUN (robots + listing only → light records)", async () => {
    const { store, scraper, env } = setup({ LINKEDIN_MAX_REQ_PER_RUN: "2" });
    const http = linkedIn();
    const jobs = await collect(scraper.scrape(makeCtx({ http, env })));
    expect(kinds(http)).toEqual(["robots", "listing"]);
    expect(jobs).toHaveLength(4);
    expect(jobs.every((j) => j.descriptionHtml === null)).toBe(true);
    expect(store.current().lastRun?.requests).toBe(2);
  });

  it("respects LINKEDIN_MAX_DETAILS_PER_RUN and keeps budget for planned listing pages", async () => {
    const { scraper, env } = setup({ LINKEDIN_MAX_DETAILS_PER_RUN: "1", LINKEDIN_QUERIES_PER_RUN: "2" });
    const http = linkedIn();
    await collect(scraper.scrape(makeCtx({ http, env })));
    expect(kinds(http)).toEqual(["robots", "listing", "detail", "listing"]);
  });

  it("paginates by the number of cards returned and stops on the empty fragment", async () => {
    const { scraper, env } = setup({ LINKEDIN_PAGES_PER_QUERY: "3", LINKEDIN_MAX_DETAILS_PER_RUN: "0" });
    const http = linkedIn({ listing: (_u, n) => (n === 0 ? html(fixture("linkedin/search-page.html")) : html("")) });
    const jobs = await collect(scraper.scrape(makeCtx({ http, env })));
    const starts = http.calls.filter((c) => c.url.includes("seeMoreJobPostings")).map((c) => new URL(c.url).searchParams.get("start"));
    expect(starts).toEqual(["0", "4"]);
    expect(jobs).toHaveLength(4);
  });

  it("stops paging a query once every card is older than ctx.since", async () => {
    const { scraper, env } = setup({ LINKEDIN_PAGES_PER_QUERY: "3", LINKEDIN_MAX_DETAILS_PER_RUN: "0" });
    const http = linkedIn();
    await collect(scraper.scrape(makeCtx({ http, env, since: new Date("2026-11-26T05:00:00Z") })));
    expect(kinds(http).filter((k) => k === "listing")).toHaveLength(1);
  });

  it("stops early at ctx.limit", async () => {
    const { scraper, env } = setup();
    const http = linkedIn();
    const jobs = await collect(scraper.scrape(makeCtx({ http, env, limit: 2 })));
    expect(jobs).toHaveLength(2);
    expect(kinds(http)).toEqual(["robots", "listing", "detail", "detail"]);
  });

  it("rotates the keyword plan across runs (and persists the cursor)", async () => {
    const { store, scraper, env } = setup({ LINKEDIN_QUERIES_PER_RUN: "2", LINKEDIN_MAX_DETAILS_PER_RUN: "0" });
    const seen: string[] = [];
    for (let run = 0; run < 3; run++) {
      const http = linkedIn();
      await collect(scraper.scrape(makeCtx({ http, env })));
      for (const c of http.calls.filter((x) => x.url.includes("seeMoreJobPostings"))) {
        const u = new URL(c.url);
        seen.push(`${u.searchParams.get("keywords")}|E${u.searchParams.get("f_E")}`);
      }
    }
    expect(seen).toEqual(["software engineer|E1", "software engineer|E2", "developer|E1", "developer|E2", "data analyst|E1", "data analyst|E2"]);
    expect(store.current().rotationCursor).toBe(6);
  });

  it("a query that keeps failing (400) does not stall the rotation; a blocked one is retried after the backoff", async () => {
    const { clock, store, scraper, env } = setup({ LINKEDIN_MAX_DETAILS_PER_RUN: "0" });
    const listingKey = (http: FakeHttp): string[] =>
      http.calls.filter((c) => c.url.includes("seeMoreJobPostings")).map((c) => `${new URL(c.url).searchParams.get("keywords")}|E${new URL(c.url).searchParams.get("f_E")}`);
    const bad = linkedIn({ listing: () => html("bad request", 400) });
    await collect(scraper.scrape(makeCtx({ http: bad, env })));
    expect(store.current().rotationCursor).toBe(1);
    const blocked = linkedIn({ listing: () => html("", 429) });
    await collect(scraper.scrape(makeCtx({ http: blocked, env })));
    expect(listingKey(blocked)).toEqual(["software engineer|E2"]);
    expect(store.current().rotationCursor).toBe(1); // not consumed — retried after the backoff
    clock.advance(3 * HOUR);
    const retry = linkedIn();
    await collect(scraper.scrape(makeCtx({ http: retry, env })));
    expect(listingKey(retry)).toEqual(["software engineer|E2"]);
    expect(store.current().rotationCursor).toBe(2);
  });

  it("a second concurrent run in the same process is skipped", async () => {
    const { scraper, env } = setup();
    const ctxA = makeCtx({ http: linkedIn(), env });
    const httpB = linkedIn();
    const ctxB = makeCtx({ http: httpB, env });
    const [a, b] = await Promise.all([collect(scraper.scrape(ctxA)), collect(scraper.scrape(ctxB))]);
    expect(a.length).toBeGreaterThan(0);
    expect(b).toEqual([]);
    expect(httpB.calls).toHaveLength(0);
    expect(ctxB.log.text()).toMatch(/already in progress/);
  });
});

describe("linkedin scraper — blocks back off for hours and end the run gracefully", () => {
  it("429 → 2 h backoff (strike 1) → next runs send nothing → 999 after expiry → 4 h (strike 2)", async () => {
    const { clock, store, scraper, env } = setup();
    const http1 = linkedIn({ listing: () => html("", 429) });
    const ctx1 = makeCtx({ http: http1, env });
    await expect(collect(scraper.scrape(ctx1))).resolves.toEqual([]);
    let state = store.current();
    expect(state.strikes).toBe(1);
    expect(Date.parse(state.blockedUntil!) - clock.now()).toBe(2 * HOUR);
    expect(state.lastBlock).toMatchObject({ kind: "rate_limited", status: 429, strike: 1 });
    expect(state.lastRun?.outcome).toBe("blocked");
    expect(ctx1.log.text()).toMatch(/BLOCKED \(rate_limited\) — HTTP 429 Too Many Requests .* Backing off 2\.0 h \(strike 1\)/);

    // During the backoff: zero requests, clear log line.
    clock.advance(HOUR);
    const http2 = linkedIn();
    const ctx2 = makeCtx({ http: http2, env });
    await expect(collect(scraper.scrape(ctx2))).resolves.toEqual([]);
    expect(http2.calls).toHaveLength(0);
    expect(ctx2.log.text()).toMatch(/linkedin: backing off until .* \(1\.0 h left\) after rate_limited: HTTP 429 .* without sending any request/);
    expect(store.current().lastRun?.outcome).toBe("skipped_backoff");

    // After expiry the next block doubles the backoff.
    clock.advance(HOUR + 1);
    const http3 = linkedIn({ listing: () => html("", 999) });
    await collect(scraper.scrape(makeCtx({ http: http3, env })));
    state = store.current();
    expect(kinds(http3)).toEqual(["robots", "listing"]);
    expect(state.strikes).toBe(2);
    expect(Date.parse(state.blockedUntil!) - clock.now()).toBe(4 * HOUR);
    expect(state.lastBlock).toMatchObject({ kind: "denied", status: 999 });
    expect(state.history.map((h) => h.status)).toEqual([999, 429]);
  });

  it("a clean run after the backoff resets the strike counter", async () => {
    const { clock, store, scraper, env } = setup();
    await collect(scraper.scrape(makeCtx({ http: linkedIn({ listing: () => html("", 429) }), env })));
    clock.advance(3 * HOUR);
    await collect(scraper.scrape(makeCtx({ http: linkedIn(), env })));
    expect(store.current()).toMatchObject({ strikes: 0, blockedUntil: null });
  });

  it("honours a longer Retry-After", async () => {
    const { clock, store, scraper, env } = setup();
    await collect(scraper.scrape(makeCtx({ http: linkedIn({ listing: () => html("", 429, { "retry-after": "10800" }) }), env })));
    expect(Date.parse(store.current().blockedUntil!) - clock.now()).toBe(3 * HOUR);
  });

  it("403 on a detail page mid-run: emits what it already has, sends nothing more", async () => {
    const { store, scraper, env } = setup();
    const http = linkedIn({ detail: () => html("<html><title>Forbidden</title></html>", 403) });
    const jobs = await collect(scraper.scrape(makeCtx({ http, env })));
    expect(kinds(http)).toEqual(["robots", "listing", "detail"]);
    expect(jobs.map((j) => j.sourceJobId)).toEqual(["4290000001", "4290000002", "4290000003", "4290000004"]);
    expect(jobs.every((j) => j.descriptionHtml === null)).toBe(true);
    expect(store.current()).toMatchObject({ strikes: 1, lastRun: { outcome: "blocked", emitted: 4 } });
  });

  it("redirect to the auth wall (challenge page) is a block", async () => {
    const { store, scraper, env } = setup();
    const http = linkedIn({ listing: () => responseAt("https://www.linkedin.com/authwall?trk=guest", fixture("linkedin/authwall.html"), { status: 200 }) });
    await collect(scraper.scrape(makeCtx({ http, env })));
    expect(store.current().lastBlock).toMatchObject({ kind: "challenge", detail: "redirected to /authwall (login/auth wall)" });
  });

  it("5xx is not a block: noted as an error, the run continues", async () => {
    const { store, scraper, env } = setup({ LINKEDIN_QUERIES_PER_RUN: "2", LINKEDIN_MAX_DETAILS_PER_RUN: "0" });
    const http = linkedIn({ listing: (_u, n) => (n === 0 ? html("oops", 502) : html(fixture("linkedin/search-page.html"))) });
    const jobs = await collect(scraper.scrape(makeCtx({ http, env })));
    expect(jobs).toHaveLength(4);
    expect(store.current()).toMatchObject({ strikes: 0, blockedUntil: null, lastRun: { outcome: "partial", errors: 1 } });
  });
});

describe("linkedin scraper — robots.txt", () => {
  it("the real LinkedIn robots.txt disallows us: no listing request, re-check after 24 h, clear log", async () => {
    const { clock, store, scraper, env } = setup();
    const http = linkedIn({ robots: () => new Response(fixture("linkedin/robots.txt")) });
    const ctx = makeCtx({ http, env });
    await expect(collect(scraper.scrape(ctx))).resolves.toEqual([]);
    expect(kinds(http)).toEqual(["robots"]);
    const state = store.current();
    expect(state).toMatchObject({ strikes: 0, lastBlock: { kind: "robots", strike: 0 }, lastRun: { outcome: "robots_disallowed", requests: 1 } });
    expect(Date.parse(state.blockedUntil!) - clock.now()).toBe(24 * HOUR);
    expect(ctx.log.text()).toMatch(/robots\.txt disallows us — rule "Disallow: \/" matches \/jobs-guest\/jobs\/api\/seeMoreJobPostings\/search\?.* for user-agent "EasyJobsBot\/1\.0/);

    const again = linkedIn({ robots: () => new Response(fixture("linkedin/robots.txt")) });
    await collect(scraper.scrape(makeCtx({ http: again, env })));
    expect(again.calls).toHaveLength(0);
  });

  it("unreachable robots.txt (network error or 5xx) → assume disallow, 1 h pause, no strike", async () => {
    for (const robots of [() => Promise.reject(new TypeError("fetch failed")) as unknown as Response, () => html("down", 503)]) {
      const { clock, store, scraper, env } = setup();
      const http = fakeHttp((url) => (url.endsWith("/robots.txt") ? robots() : html(fixture("linkedin/search-page.html"))));
      await collect(scraper.scrape(makeCtx({ http, env })));
      expect(http.calls).toHaveLength(1);
      const state = store.current();
      expect(state).toMatchObject({ strikes: 0, lastBlock: { kind: "unavailable" }, lastRun: { outcome: "unavailable" } });
      expect(Date.parse(state.blockedUntil!) - clock.now()).toBe(HOUR);
    }
  });

  it("a robots.txt answered with an edge block page counts as a block (exponential backoff)", async () => {
    const { store, scraper, env } = setup();
    const http = linkedIn({ robots: () => html("", 999) });
    await collect(scraper.scrape(makeCtx({ http, env })));
    expect(store.current()).toMatchObject({ strikes: 1, lastBlock: { kind: "denied", status: 999 } });
  });
});
