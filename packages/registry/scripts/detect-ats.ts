/**
 * Detect which ATS a company's careers site runs on.
 *
 *   pnpm --filter @easyjobs/registry detect <careersUrl|domain> [--json] [--save-fixture <name>]
 *   pnpm --filter @easyjobs/registry detect --candidates [--slug a,b] [--segment s] [--limit n] [--retry] [--concurrency 8]
 *
 * Fetches the careers page (robots.txt obeyed, ≤ 1 request/s per site, redirects followed), then looks for ATS
 * fingerprints in the redirect chain, the HTML, inline scripts, one hop of job-listing links and — for
 * JavaScript apps — a few first-party bundles. Prints {ats, token}; --candidates writes data/discovery/detect.json.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { detectAts, type AtsDetection } from "../src/ats";
import { normalizeDomain, registrableDomain } from "../src/normalize";
import { candidates, type Candidate } from "./candidates";
import { createSaver, DETECT_FILE, loadDiscovery, type DiscoveryRecord, type Proposal } from "./lib/discovery";
import { Fetcher, mapLimit, parseArgs, PKG_ROOT, type FetchResult } from "./lib/fetcher";

export interface DetectResult {
  input: string;
  best: AtsDetection | null;
  detections: AtsDetection[];
  /** Careers page that loaded (the one the best detection came from, else the first that loaded). */
  careersUrl: string | null;
  pages: { url: string; finalUrl: string; status: number; error?: string }[];
  /** HTML of the page the best detection came from (for fixtures). */
  html?: string;
}

const JOB_LINK = /(careers?|jobs?|openings?|positions?|vacanc|join[-_ ]?us|work[-_ ]?with[-_ ]?us|life[-_ ]?at|opportunit|hiring|apply)/i;
const MAX_PAGES = 4;
const MAX_FOLLOW = 3;
const MAX_SCRIPTS = 3;

function looksHtml(r: FetchResult): boolean {
  return /html|xml/i.test(r.contentType) || /<html|<!doctype html/i.test(r.body.slice(0, 2000));
}

function absolute(href: string, base: string): string | null {
  try {
    const u = new URL(href.replace(/&amp;/g, "&"), base);
    return u.protocol === "https:" || u.protocol === "http:" ? u.href : null;
  } catch {
    return null;
  }
}

function links(html: string, base: string): { href: string; text: string }[] {
  const out: { href: string; text: string }[] = [];
  for (const m of html.matchAll(/<a\b[^>]*?href\s*=\s*["']([^"'#]+)["'][^>]*>([\s\S]{0,200}?)<\/a>/gi)) {
    const href = absolute(m[1]!, base);
    if (href) out.push({ href, text: m[2]!.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() });
  }
  for (const m of html.matchAll(/<iframe\b[^>]*?src\s*=\s*["']([^"']+)["']/gi)) {
    const href = absolute(m[1]!, base);
    if (href) out.push({ href, text: "iframe" });
  }
  return out;
}

function scriptSrcs(html: string, base: string): string[] {
  const own = new URL(base);
  const out: string[] = [];
  for (const m of html.matchAll(/<script\b[^>]*?src\s*=\s*["']([^"']+)["']/gi)) {
    const src = absolute(m[1]!, base);
    if (!src) continue;
    const u = new URL(src);
    if (registrableDomain(u.hostname) !== registrableDomain(own.hostname)) continue;
    if (/(?:jquery|polyfill|analytics|gtm|tracking|cookie|consent|recaptcha|hotjar|optimizely|segment|newrelic|datadog)/i.test(u.pathname)) continue;
    out.push(src);
  }
  // App bundles (main/app/_app/index/pages/careers) are the likeliest to embed board URLs.
  return out.sort((a, b) => Number(/main|app|index|careers|jobs|pages/i.test(b)) - Number(/main|app|index|careers|jobs|pages/i.test(a))).slice(0, MAX_SCRIPTS);
}

function guessPages(domain: string): string[] {
  return [
    `https://www.${domain}/careers`,
    `https://careers.${domain}/`,
    `https://jobs.${domain}/`,
    `https://www.${domain}/jobs`,
    `https://www.${domain}/company/careers`,
    `https://www.${domain}/about/careers`,
  ];
}

const strong = (d: AtsDetection | null | undefined): boolean => !!d && d.score >= 10 && d.ats !== "jsonld";

/** How likely a link leads to the actual job list (not "life at X" pages). */
function linkScore(l: { href: string; text: string }): number {
  let s = 0;
  if (/(open (positions|roles|jobs)|view (all )?(jobs|openings|roles|positions)|see (all )?(jobs|openings|roles)|current openings|job openings|search (all )?jobs|explore (all )?(jobs|roles|opportunities|openings)|browse (all )?jobs|all jobs|find (a )?(job|role)|apply now|join (the|our) team)/i.test(l.text)) s += 4;
  if (/(openings|open-positions|open-roles|positions|jobs|roles|search|vacanc|listing|requisition|apply)/i.test(l.href)) s += 2;
  if (JOB_LINK.test(l.href) || JOB_LINK.test(l.text)) s += 1;
  if (/(blog|news|press|culture|how-we-work|benefits|life|values|story|team|leadership|grow|students?|events)/i.test(l.href) && s < 4) s -= 1;
  return s;
}

export async function detectForSite(f: Fetcher, input: { careersUrl?: string | null; domain?: string | null }): Promise<DetectResult> {
  const domain = input.domain ?? null;
  const starts = [...new Set([...(input.careersUrl ? [input.careersUrl] : []), ...(domain ? guessPages(domain) : [])])];
  const result: DetectResult = { input: input.careersUrl ?? domain ?? "", best: null, detections: [], careersUrl: null, pages: [] };
  const all = new Map<string, AtsDetection>();
  let bestHtml: string | undefined;
  const merge = (dets: AtsDetection[], html: string, pageUrl: string): void => {
    for (const d of dets) {
      const key = `${d.ats}|${d.token}`;
      const prev = all.get(key);
      if (!prev || prev.score < d.score) all.set(key, d);
      if (!result.best || d.score > result.best.score) {
        result.best = d;
        bestHtml = html;
        result.careersUrl = pageUrl;
      }
    }
  };
  const fetchPage = async (url: string): Promise<FetchResult | null> => {
    if (result.pages.length >= MAX_PAGES + MAX_FOLLOW) return null;
    const host = new URL(url).hostname;
    const r = await f.fetch(url, { group: `html:${host}`, timeoutMs: 15_000, retries: 1, ttlMs: 3 * 86_400_000, maxCacheBytes: 2_500_000 });
    result.pages.push({ url, finalUrl: r.finalUrl, status: r.status, ...(r.error ? { error: r.error } : {}) });
    return r;
  };

  let firstOk: string | null = null;
  const followQueue: string[] = [];
  const scriptQueue: string[] = [];
  for (const url of starts.slice(0, MAX_PAGES)) {
    const r = await fetchPage(url);
    if (r && r.finalUrl !== url && (r.status < 200 || r.status >= 300)) {
      // Redirected onto a page we can't read (e.g. an ATS answering 429): the redirect itself is evidence.
      merge(detectAts({ url: r.finalUrl, urls: [url, r.finalUrl], domainHint: domain }), "", r.finalUrl);
      if (strong(result.best)) break;
    }
    if (!r || r.status < 200 || r.status >= 300 || !looksHtml(r)) continue;
    firstOk ??= r.finalUrl;
    merge(detectAts({ url: r.finalUrl, urls: [url, r.finalUrl], html: r.body, domainHint: domain }), r.body, r.finalUrl);
    if (strong(result.best)) break;
    const site = registrableDomain(new URL(r.finalUrl).hostname);
    const scored = links(r.body, r.finalUrl)
      .filter((l) => l.href !== r.finalUrl && !/\.(?:pdf|png|jpe?g|svg|zip)$/i.test(l.href))
      .map((l) => {
        const h = new URL(l.href).hostname;
        const sameSite = registrableDomain(h) === site;
        // Other domains only when they look like a jobs site ("careers.zohocorp.com", "jobs.example.io").
        const jobsHost = /(?:^|\.)(?:careers?|jobs?|talent|recruit\w*|hiring)\./i.test(`${h}.`);
        return { href: l.href, score: sameSite || jobsHost ? linkScore(l) + (jobsHost ? 1 : 0) : -1 };
      })
      .filter((l) => l.score >= 1)
      .sort((a, b) => b.score - a.score);
    followQueue.push(...scored.map((l) => l.href));
    scriptQueue.push(...scriptSrcs(r.body, r.finalUrl));
    // A careers page that loaded but shows nothing: one hop deeper beats guessing other URLs.
    if (followQueue.length > 0 || scriptQueue.length > 0) break;
  }
  if (!strong(result.best)) {
    for (const href of [...new Set(followQueue)].slice(0, MAX_FOLLOW)) {
      const r = await fetchPage(href);
      if (!r || r.status < 200 || r.status >= 300 || !looksHtml(r)) continue;
      merge(detectAts({ url: r.finalUrl, urls: [href, r.finalUrl], html: r.body, domainHint: domain }), r.body, r.finalUrl);
      scriptQueue.push(...scriptSrcs(r.body, r.finalUrl));
      if (strong(result.best)) break;
    }
  }
  if (!strong(result.best)) {
    const scripts: string[] = [];
    for (const src of [...new Set(scriptQueue)].slice(0, MAX_SCRIPTS)) {
      const r = await f.fetch(src, { group: `html:${new URL(src).hostname}`, timeoutMs: 15_000, retries: 1, ttlMs: 3 * 86_400_000, maxCacheBytes: 2_500_000 });
      if (r.status === 200 && r.body.length < 4_000_000) scripts.push(r.body);
    }
    if (scripts.length > 0 && firstOk) merge(detectAts({ url: firstOk, scripts, domainHint: domain }), "", firstOk);
  }
  result.detections = [...all.values()].sort((a, b) => b.score - a.score);
  result.careersUrl ??= firstOk;
  if (bestHtml) result.html = bestHtml;
  return result;
}

/* ─────────────────────────── CLI ─────────────────────────── */

function toProposals(r: DetectResult): Proposal[] {
  const at = new Date().toISOString();
  const good = r.detections.filter((d) => d.score >= 6 && d.ats !== "jsonld");
  const list = good.length > 0 ? good : r.detections.filter((d) => d.ats === "jsonld").slice(0, 1);
  return list.slice(0, 4).map((d) => ({ ats: d.ats, token: d.token, via: "detect" as const, evidence: d.evidence.slice(0, 200), score: d.score, at }));
}

async function runCandidates(f: Fetcher, flags: Map<string, string | true>): Promise<void> {
  const log = f.log.child("detect");
  const store = loadDiscovery(DETECT_FILE);
  const saver = createSaver(DETECT_FILE, store);
  const only = typeof flags.get("slug") === "string" ? new Set(String(flags.get("slug")).split(",")) : null;
  const segment = flags.get("segment");
  let list: Candidate[] = candidates.filter(
    (c) => (c.domain || c.careersUrl) && (!only || only.has(c.slug)) && (typeof segment !== "string" || c.segment === segment),
  );
  if (!only && flags.has("retry-missing")) list = list.filter((c) => store[c.slug]?.status !== "found");
  else if (!only && !flags.has("retry")) list = list.filter((c) => !store[c.slug]);
  const limit = Number(flags.get("limit") ?? 0);
  if (limit > 0) list = list.slice(0, limit);
  log.info(`detecting ${list.length} careers sites`);
  let done = 0;
  let found = 0;
  await mapLimit(list, Number(flags.get("concurrency") ?? 8), async (c) => {
    try {
      const r = await detectForSite(f, { careersUrl: c.careersUrl, domain: c.domain });
      const proposals = toProposals(r);
      const rec: DiscoveryRecord = {
        slug: c.slug,
        at: new Date().toISOString(),
        status: proposals.length > 0 ? "found" : r.careersUrl ? "none" : "error",
        proposals,
        careersUrl: r.careersUrl,
        pages: r.pages.map((p) => `${p.status} ${p.url}${p.finalUrl !== p.url ? ` → ${p.finalUrl}` : ""}${p.error ? ` (${p.error})` : ""}`),
      };
      store[c.slug] = rec;
      if (proposals.length > 0) {
        found++;
        log.info(`✓ ${c.slug}: ${proposals.slice(0, 2).map((p) => `${p.ats}:${p.token} (${p.score})`).join(" · ")}`);
      }
    } catch (e) {
      store[c.slug] = { slug: c.slug, at: new Date().toISOString(), status: "error", proposals: [], detail: e instanceof Error ? e.message : String(e) };
    }
    saver.touch();
    if (++done % 25 === 0) log.info(`progress ${done}/${list.length} · found ${found} · ${f.stats.requests} requests`);
  });
  saver.flush();
  log.info(`done: ${found}/${list.length} careers sites point at a known ATS`, f.stats);
}

async function runSingle(f: Fetcher, target: string, flags: Map<string, string | true>): Promise<void> {
  const isUrl = /^https?:\/\//i.test(target);
  const r = await detectForSite(f, isUrl ? { careersUrl: target, domain: normalizeDomain(target) } : { domain: normalizeDomain(target) });
  const fixture = flags.get("save-fixture");
  if (typeof fixture === "string" && r.html) {
    const dir = join(PKG_ROOT, "test", "fixtures", "html");
    mkdirSync(dir, { recursive: true });
    const header = `<!-- fixture: ${r.careersUrl ?? target} fetched ${new Date().toISOString().slice(0, 10)} -->\n`;
    writeFileSync(join(dir, `${fixture}.html`), header + r.html.slice(0, 400_000));
  }
  if (flags.has("json")) {
    console.log(JSON.stringify({ ...r, html: undefined }, null, 2));
    return;
  }
  console.log(JSON.stringify(r.best ? { ats: r.best.ats, token: r.best.token } : { ats: null, token: null }));
  for (const d of r.detections.slice(0, 8)) console.error(`  ${String(d.score).padStart(4)}  ${d.ats.padEnd(15)} ${d.token}   ← ${d.evidence.slice(0, 100)}`);
  for (const p of r.pages) console.error(`  page ${p.status} ${p.url}${p.finalUrl !== p.url ? ` → ${p.finalUrl}` : ""}${p.error ? ` (${p.error})` : ""}`);
}

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/").split("/").pop() ?? "");
if (isMain) {
  const { flags, positional } = parseArgs(process.argv.slice(2));
  const f = new Fetcher({ fresh: flags.has("fresh") });
  if (flags.has("candidates")) await runCandidates(f, flags);
  else if (positional[0]) await runSingle(f, positional[0], flags);
  else {
    console.error("usage: detect-ats.ts <careersUrl|domain> [--json] [--save-fixture name] | --candidates [--slug a,b] [--limit n]");
    process.exitCode = 2;
  }
}
