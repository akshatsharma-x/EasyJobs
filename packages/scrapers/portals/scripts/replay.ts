/**
 * Offline replay — runs BOTH real scrapers end-to-end against the saved fixtures (fake transport, fake clock, temp
 * state), writes out/<id>.fixtures.jsonl and prints per-field fill rates. No network. Useful while both portals are
 * blocked live: it shows exactly what the worker/normalizer would receive.
 *
 *   pnpm --filter @easyjobs/scraper-portals replay
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { validateRawJob, type RawJob } from "@easyjobs/contract";
import { createLinkedInScraper } from "../src/linkedin/scraper";
import { createNaukriScraper } from "../src/naukri/scraper";
import { NAUKRI_ROBOTS_URL } from "../src/naukri/plan";
import { createMemoryStateStore } from "../src/shared/state";
import { apiJson, collect, fakeBrowser, fakeHttp, FakeClock, fixture, fixtureJson, html, makeCtx, page } from "../test/helpers";

const DETAILS: Record<string, string> = {
  "4290000001": "linkedin/job-posting-offsite.html",
  "4290000002": "linkedin/job-posting-easy-apply.html",
  "4290000004": "linkedin/job-posting-closed.html",
};

async function replayLinkedIn(): Promise<RawJob[]> {
  const http = fakeHttp((raw) => {
    const url = new URL(raw);
    if (url.pathname === "/robots.txt") return new Response("User-agent: *\nAllow: /\n");
    if (url.pathname.includes("seeMoreJobPostings")) return html(fixture("linkedin/search-page.html"));
    const detail = DETAILS[/jobPosting\/(\d+)$/.exec(url.pathname)?.[1] ?? ""];
    return detail ? html(fixture(detail)) : html("", 404); // no fixture for this id → posting gone → light record
  });
  const scraper = createLinkedInScraper({ clock: new FakeClock(), random: () => 0, stateStore: () => createMemoryStateStore() });
  return collect(scraper.scrape(makeCtx({ http, env: { LINKEDIN_QUERIES_PER_RUN: "1" } })));
}

async function replayNaukri(): Promise<RawJob[]> {
  const browser = fakeBrowser((url) => {
    if (url === NAUKRI_ROBOTS_URL) return page(200, "User-agent: *\nDisallow: /mnjuser/\n", url);
    if (url.includes("/job-listings-") && url.endsWith("251125900001")) {
      return page(200, "<html></html>", url, apiJson("https://www.naukri.com/jobapi/v4/job/251125900001", fixtureJson("naukri/job-v4.json")));
    }
    if (url.includes("/job-listings-")) return page(404, "", url);
    return page(200, "<html></html>", url, apiJson("https://www.naukri.com/jobapi/v3/search?pageNo=1", fixtureJson("naukri/search-v3.json")));
  });
  const scraper = createNaukriScraper({ clock: new FakeClock(), random: () => 0, stateStore: () => createMemoryStateStore(), fetcherFactory: browser.factory });
  return collect(scraper.scrape(makeCtx({ http: fakeHttp(() => new Response("")), env: { NAUKRI_QUERIES_PER_RUN: "1" } })));
}

function fillRates(jobs: RawJob[]): Record<string, string> {
  const fill: Record<string, number> = {};
  for (const job of jobs) {
    for (const [k, v] of Object.entries(job)) {
      if (v !== null && v !== undefined && v !== "" && !(Array.isArray(v) && v.length === 0)) fill[k] = (fill[k] ?? 0) + 1;
    }
  }
  return Object.fromEntries(Object.entries(fill).map(([k, v]) => [k, `${Math.round((v / Math.max(jobs.length, 1)) * 100)}%`]));
}

const outDir = join(import.meta.dirname, "..", "out");
mkdirSync(outDir, { recursive: true });
for (const [id, run] of [["linkedin", replayLinkedIn], ["naukri", replayNaukri]] as const) {
  const jobs = await run();
  const invalid = jobs.filter((j) => validateRawJob(j).length > 0).length;
  const file = join(outDir, `${id}.fixtures.jsonl`);
  writeFileSync(file, jobs.map((j) => JSON.stringify(j)).join("\n") + "\n");
  console.log(`${id}: ${jobs.length} jobs, ${invalid} invalid → ${file}`);
  console.log(fillRates(jobs));
}
