import { validateRawJob } from "@easyjobs/contract";
import { describe, expect, it } from "vitest";
import { BrowserUnavailableError } from "../src/naukri/browser";
import { NAUKRI_ROBOTS_URL } from "../src/naukri/plan";
import { createNaukriScraper } from "../src/naukri/scraper";
import { createMemoryStateStore } from "../src/shared/state";
import { apiJson, collect, fakeBrowser, FakeClock, fixture, fixtureJson, HOUR, makeCtx, page, type PageScript } from "./helpers";
import { fakeHttp } from "./helpers";

const ROBOTS_OK = "User-agent: *\nDisallow: /mnjuser/\nDisallow: /nlogin/\n";
const SEARCH_API = "https://www.naukri.com/jobapi/v3/search?noOfResults=20&urlType=search_by_keyword&searchType=adv&keyword=software%20engineer&experience=0&pageNo=1";

interface Site {
  robots?: (url: string) => ReturnType<PageScript>;
  search?: (url: string) => ReturnType<PageScript>;
  detail?: (url: string) => ReturnType<PageScript>;
}

/** Fake naukri.com as seen through the headless browser: document + the data request the page makes. */
function naukri(site: Site = {}): PageScript {
  return (url) => {
    if (url === NAUKRI_ROBOTS_URL) return site.robots?.(url) ?? page(200, ROBOTS_OK, url);
    if (/\/job-listings-/.test(url)) {
      if (site.detail) return site.detail(url);
      return url.endsWith("251125900001")
        ? page(200, "<html><title>Job</title></html>", url, apiJson("https://www.naukri.com/jobapi/v4/job/251125900001?microsite=y", fixtureJson("naukri/job-v4.json")))
        : page(404, "<html><title>Not found</title></html>", url);
    }
    return site.search?.(url) ?? page(200, "<html><title>Jobs</title><div id=root></div></html>", url, apiJson(SEARCH_API, fixtureJson("naukri/search-v3.json")));
  };
}

function setup(site: Site = {}, env: Record<string, string> = {}) {
  const clock = new FakeClock();
  const store = createMemoryStateStore();
  const browser = fakeBrowser(naukri(site));
  const scraper = createNaukriScraper({ clock, random: () => 0, stateStore: () => store, fetcherFactory: browser.factory });
  // Naukri never uses ctx.http (everything goes through the browser) — a throwing client proves it.
  const http = fakeHttp(() => {
    throw new Error("naukri must not use plain HTTP");
  });
  return { clock, store, browser, scraper, http, env: { NAUKRI_QUERIES_PER_RUN: "1", ...env } };
}

describe("naukri scraper — happy path (fake headless browser)", () => {
  it("robots → search page (reads the data the page receives) → capped job pages → valid RawJobs", async () => {
    const { clock, store, browser, scraper, http, env } = setup();
    const ctx = makeCtx({ http, env });
    const jobs = await collect(scraper.scrape(ctx));

    expect(browser.opened[0]).toBe(NAUKRI_ROBOTS_URL);
    expect(browser.opened[1]).toBe("https://www.naukri.com/software-engineer-jobs?experience=0");
    expect(browser.opened.slice(2)).toEqual([
      "https://www.naukri.com/job-listings-software-engineer-fresher-acme-analytics-pvt-ltd-bengaluru-hyderabad-0-to-1-years-251125900001",
      "https://www.naukri.com/job-listings-graduate-trainee-finance-operations-kestrel-fintech-pune-0-to-2-years-251125900002",
      "https://www.naukri.com/job-listings-walk-in-drive-customer-support-associate-orbit-retail-india-chennai-0-to-1-years-251125900003",
    ]);
    expect(http.calls).toHaveLength(0);
    expect(browser).toMatchObject({ launches: 1, closes: 1 });
    expect(clock.sleeps).toEqual([4000, 4000, 4000, 4000]);

    expect(jobs.map((j) => j.sourceJobId)).toEqual(["251125900001", "251125900002", "251125900003"]);
    for (const job of jobs) expect(validateRawJob(job)).toEqual([]);
    expect(jobs[0]).toMatchObject({ applyUrl: "https://careers.acme-analytics.example/jobs/swe-fresher-2026?source=naukri", jobType: "full_time" });
    expect(jobs[1]?.descriptionHtml).toBeNull(); // job page 404 → light record
    expect(store.current()).toMatchObject({ strikes: 0, rotationCursor: 1, lastRun: { outcome: "ok", requests: 5, emitted: 3 } });
  });

  it("isKnown ids skip the job page; NAUKRI_MAX_REQ_PER_RUN caps navigations", async () => {
    const { browser, scraper, http, env } = setup({}, { NAUKRI_MAX_REQ_PER_RUN: "3" });
    const jobs = await collect(scraper.scrape(makeCtx({ http, env, isKnown: (id) => id === "251125900001" })));
    expect(browser.opened).toHaveLength(3); // robots + search + 1 job page
    expect(browser.opened[2]).toContain("251125900002");
    expect(jobs).toHaveLength(3);
  });

  it("rotates fresher-focused queries across runs (experience 0 then 1)", async () => {
    const { browser, scraper, http, env } = setup({}, { NAUKRI_MAX_DETAILS_PER_RUN: "0" });
    await collect(scraper.scrape(makeCtx({ http, env })));
    await collect(scraper.scrape(makeCtx({ http, env })));
    expect(browser.opened.filter((u) => u.includes("-jobs"))).toEqual([
      "https://www.naukri.com/software-engineer-jobs?experience=0",
      "https://www.naukri.com/software-engineer-jobs?experience=1",
    ]);
  });
});

describe("naukri scraper — blocks", () => {
  it("Akamai 'Access Denied' (real capture) on robots.txt → 2 h backoff; no browser launch while backing off", async () => {
    const { clock, store, browser, scraper, http, env } = setup({ robots: (url) => page(403, fixture("naukri/access-denied-http.html"), url) });
    const ctx = makeCtx({ http, env });
    await expect(collect(scraper.scrape(ctx))).resolves.toEqual([]);
    expect(browser.opened).toEqual([NAUKRI_ROBOTS_URL]);
    expect(browser).toMatchObject({ launches: 1, closes: 1 });
    const state = store.current();
    expect(state).toMatchObject({ strikes: 1, lastBlock: { kind: "denied", status: 403 }, lastRun: { outcome: "blocked" } });
    expect(state.lastBlock?.detail).toContain("Akamai edge 'Access Denied' (Reference #18.9fdc55b8.1795643750.e9278252)");
    expect(Date.parse(state.blockedUntil!) - clock.now()).toBe(2 * HOUR);
    expect(ctx.log.text()).toMatch(/naukri: BLOCKED \(denied\)/);

    await collect(scraper.scrape(makeCtx({ http, env })));
    expect(browser.launches).toBe(1);
    expect(store.current().lastRun?.outcome).toBe("skipped_backoff");
  });

  it("search page served but its data request answered 429 → rate_limited backoff", async () => {
    const { store, scraper, http, env } = setup({ search: (url) => page(200, "<html></html>", url, { url: SEARCH_API, status: 429, text: "", json: null }) });
    await collect(scraper.scrape(makeCtx({ http, env })));
    expect(store.current()).toMatchObject({ strikes: 1, lastBlock: { kind: "rate_limited", status: 429, url: SEARCH_API } });
  });

  it("headless Chromium capture of the denial page (403) on the search page → block", async () => {
    const { store, browser, scraper, http, env } = setup({ search: (url) => page(403, fixture("naukri/access-denied-headless.html"), url) });
    await collect(scraper.scrape(makeCtx({ http, env })));
    expect(browser.opened).toHaveLength(2);
    expect(store.current().lastBlock?.detail).toContain("Reference #18.6e220f7a.1795643854.1faa9a6f");
  });

  it("page loads but never makes its data request → error (not a block), run ends partial", async () => {
    const { store, scraper, http, env } = setup({ search: (url) => page(200, "<html></html>", url, null) });
    const ctx = makeCtx({ http, env });
    await collect(scraper.scrape(ctx));
    expect(store.current()).toMatchObject({ strikes: 0, blockedUntil: null, lastRun: { outcome: "partial", errors: 1 } });
    expect(ctx.log.text()).toMatch(/made no .* request within the wait window/);
  });

  it("robots.txt that disallows the search path → nothing else is opened", async () => {
    const { store, browser, scraper, http, env } = setup({ robots: (url) => page(200, "User-agent: *\nDisallow: /\n", url) });
    await collect(scraper.scrape(makeCtx({ http, env })));
    expect(browser.opened).toEqual([NAUKRI_ROBOTS_URL]);
    expect(store.current().lastRun?.outcome).toBe("robots_disallowed");
  });

  it("missing Playwright/Chromium → 'unavailable' 1 h pause, no strike, clear hint", async () => {
    const clock = new FakeClock();
    const store = createMemoryStateStore();
    const scraper = createNaukriScraper({
      clock,
      stateStore: () => store,
      fetcherFactory: async () => {
        throw new BrowserUnavailableError("playwright is not installed; install it with: pnpm --filter @easyjobs/scraper-portals exec playwright install chromium");
      },
    });
    const ctx = makeCtx({ http: fakeHttp(() => new Response("")), env: {} });
    await collect(scraper.scrape(ctx));
    const state = store.current();
    expect(state).toMatchObject({ strikes: 0, lastBlock: { kind: "unavailable" }, lastRun: { outcome: "unavailable" } });
    expect(Date.parse(state.blockedUntil!) - clock.now()).toBe(HOUR);
    expect(ctx.log.text()).toMatch(/playwright install chromium/);
  });
});
