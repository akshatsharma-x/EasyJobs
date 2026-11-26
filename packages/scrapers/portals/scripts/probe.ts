/**
 * Evidence probe — re-checks whether LinkedIn / Naukri can be read under this package's rules.
 *
 *   pnpm --filter @easyjobs/scraper-portals probe [--portal linkedin|naukri|all] [--browser]
 *
 * LinkedIn: fetches robots.txt only and evaluates it for our UA (and Googlebot, for comparison). It never requests
 *           a disallowed path.
 * Naukri:   robots.txt + one public search page over plain HTTP; with --browser, one more load of the same page in
 *           vanilla headless Chromium (honest UA), recording whether the page's own search-API call ever happens.
 * ≤ 4 requests in total, ≥ 5 s apart. Writes .cache/evidence/probe-<timestamp>.json and prints a summary.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createHttpClient, DEFAULT_USER_AGENT, sleep } from "@easyjobs/contract/node";
import { createPlaywrightFetcher } from "../src/naukri/browser";
import { NAUKRI_ROBOTS_URL, NAUKRI_SEARCH_API, naukriSearchUrl } from "../src/naukri/plan";
import { LINKEDIN_ROBOTS_URL } from "../src/linkedin/constants";
import { linkedInConfigFromEnv, linkedInDetailUrl, linkedInSearchUrl } from "../src/linkedin/plan";
import { describeDenialPage, detectBlock } from "../src/shared/block";
import { judgeRobots, robotsPath } from "../src/shared/robots";
import { errorMessage } from "../src/shared/text";

interface Observation {
  portal: "linkedin" | "naukri";
  what: string;
  url: string;
  status: number | null;
  verdict: string;
  server?: string | null;
  bytes?: number;
  head?: string;
}

const argv = process.argv.slice(2);
const portal = argv.includes("--portal") ? argv[argv.indexOf("--portal") + 1] : "all";
const withBrowser = argv.includes("--browser");
const ua = process.env.SCRAPER_USER_AGENT?.trim() || DEFAULT_USER_AGENT;
const http = createHttpClient({ userAgent: ua, retries: 0, robots: false });
const observations: Observation[] = [];
const GAP_MS = 5000;
let first = true;
const pace = async (): Promise<void> => {
  if (!first) await sleep(GAP_MS);
  first = false;
};

async function get(url: string, accept: string): Promise<{ status: number | null; body: string; server: string | null; error?: string }> {
  await pace();
  try {
    const res = await http.fetch(url, { headers: { accept }, robots: false, retries: 0 });
    return { status: res.status, body: await res.text(), server: res.headers.get("server") };
  } catch (e) {
    return { status: null, body: "", server: null, error: errorMessage(e) };
  }
}

if (portal === "all" || portal === "linkedin") {
  const cfg = linkedInConfigFromEnv({});
  const paths = [robotsPath(linkedInSearchUrl(cfg.plan[0]!, cfg, 0)), robotsPath(linkedInDetailUrl("4290000001"))];
  const r = await get(LINKEDIN_ROBOTS_URL, "text/plain");
  const res = r.status === null ? null : { status: r.status, url: LINKEDIN_ROBOTS_URL, body: r.body };
  const ours = judgeRobots(res, ua, paths, r.error);
  const google = judgeRobots(res, "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)", paths, r.error);
  const show = (v: typeof ours): string => (v.verdict === "disallowed" ? `disallowed ("Disallow: ${v.rule}")` : v.verdict);
  observations.push({
    portal: "linkedin",
    what: "robots.txt",
    url: LINKEDIN_ROBOTS_URL,
    status: r.status,
    verdict: `our UA: ${show(ours)} · Googlebot: ${show(google)}`,
    server: r.server,
    bytes: r.body.length,
    head: r.body.split("\n").slice(0, 2).join(" "),
  });
}

if (portal === "all" || portal === "naukri") {
  const search = naukriSearchUrl({ keywords: "software engineer", experience: "0", key: "probe" });
  for (const [what, url, accept] of [
    ["robots.txt", NAUKRI_ROBOTS_URL, "text/plain"],
    ["search page (plain HTTP)", search, "text/html"],
  ] as const) {
    const r = await get(url, accept);
    const block = r.status === null ? null : detectBlock({ status: r.status, url, body: r.body });
    observations.push({
      portal: "naukri",
      what,
      url,
      status: r.status,
      verdict: r.error ?? (block ? `${block.kind}: ${block.detail}` : "served"),
      server: r.server,
      bytes: r.body.length,
      head: r.body.replace(/\s+/g, " ").slice(0, 160),
    });
  }
  if (withBrowser) {
    await pace();
    try {
      const fetcher = await createPlaywrightFetcher({ botUserAgent: ua, navigationTimeoutMs: 45_000, apiWaitMs: 20_000, log: { debug() {}, info() {}, warn() {}, error() {}, child() { return this; } } });
      try {
        const page = await fetcher.open(search, NAUKRI_SEARCH_API, new AbortController().signal);
        const block = page.status === null ? null : detectBlock({ status: page.status, url: page.url, body: page.body });
        observations.push({
          portal: "naukri",
          what: "search page (headless Chromium)",
          url: search,
          status: page.status,
          verdict: `${block ? `${block.kind}: ${block.detail}` : "served"} · search-API responses seen: ${page.api ? `1 (HTTP ${page.api.status})` : "0"}`,
          bytes: page.body.length,
          head: `UA: ${fetcher.userAgent} | ${page.body.replace(/\s+/g, " ").slice(0, 120)}${describeDenialPage(page.body)}`,
        });
      } finally {
        await fetcher.close();
      }
    } catch (e) {
      observations.push({ portal: "naukri", what: "search page (headless Chromium)", url: search, status: null, verdict: `browser unavailable: ${errorMessage(e)}` });
    }
  }
}

const at = new Date().toISOString();
const dir = join(import.meta.dirname, "..", ".cache", "evidence");
mkdirSync(dir, { recursive: true });
const file = join(dir, `probe-${at.replace(/[:.]/g, "-")}.json`);
writeFileSync(file, JSON.stringify({ at, userAgent: ua, observations }, null, 2) + "\n");
console.log(`\nEvidence probe ${at} — UA "${ua}"\n`);
for (const o of observations) console.log(`${o.portal.padEnd(9)} ${o.what.padEnd(32)} ${String(o.status ?? "—").padEnd(4)} ${o.verdict}`);
console.log(`\n→ ${file}`);
