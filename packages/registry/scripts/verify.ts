/**
 * Verify every candidate's board with the cheapest real request and write the registry.
 *
 *   pnpm --filter @easyjobs/registry verify [--only <ats>] [--slug a,b] [--fresh] [--concurrency 16] [--max-age-hours 20]
 *
 * For each candidate, proposals come from (in trust order): its own careers page (detect), curated hints,
 * name-matched probes, weaker page markers, Workday-robots/Eightfold probes, the previous registry entry, and
 * finally the careers page itself (ats "custom"). Each is checked (.cache/checks, TTL 20 h unless --fresh);
 * the best acceptable one becomes the entry (verifiedAt + openJobs). Dead entries → data/rejected.json with
 * the reason. --only/--slug re-verify a subset and carry everything else over unchanged.
 */
import { join } from "node:path";
import { COMPANY_TAGS, type AtsType, type CompanyTarget } from "@easyjobs/contract";
import { validateCompanyTarget } from "../src/validate";
import { candidatePriority, candidates, type Candidate } from "./candidates";
import { ATS_VENDOR_HOST } from "../src/ats";
import { checkBoard, domainRelation, judgeBoard, publicBoardUrl, tenantPlausible, type BoardCheck } from "./lib/checks";
import { DETECT_FILE, loadDiscovery, PROBE_FILE, type Proposal, type ProposalVia } from "./lib/discovery";
import { DATA_DIR, Fetcher, mapLimit, parseArgs, readJsonFile, vendorFamily, writeJsonFile } from "./lib/fetcher";
import { writeSummary } from "./summary";

export interface RejectedEntry {
  slug: string;
  name: string;
  domain: string | null;
  reason: string;
  tried: { ats: AtsType; token: string; via: ProposalVia; status: string; detail: string }[];
  checkedAt: string;
}

/**
 * Companies that @easyjobs/scraper-bigtech (P09) scrapes through their own portals (enabled scrapers, read from
 * packages/scrapers/bigtech/src/sites on 2026-11-26). They get `ats: "custom"` with P09's slug so the ATS adapters
 * don't crawl the same jobs twice; live ATS boards we found are kept in extra.altBoards for W1.
 */
const P09_PORTALS = new Set(["accenture", "amazon", "apple", "atlassian", "capgemini", "deloitte", "ey", "google", "hcltech", "ibm", "infosys", "ltimindtree", "microsoft", "wipro", "zoho"]);
/** P09 slugs whose portal scrapers are disabled: an ATS board is used when one exists, else an (unverified) custom entry. */
const P09_DISABLED = new Set(["cognizant", "flipkart", "meta", "tcs", "tech-mahindra", "uber"]);

const COMPANIES_FILE = join(DATA_DIR, "companies.json");
const REJECTED_FILE = join(DATA_DIR, "rejected.json");

interface Ranked extends Omit<Proposal, "at"> {
  tier: number;
}

const { flags } = parseArgs(process.argv.slice(2));
const fetcher = new Fetcher({ fresh: flags.has("fresh") });
const log = fetcher.log.child("verify");
const ttlMs = Number(flags.get("max-age-hours") ?? 20) * 3_600_000;
/** --skip workday,oracle: don't call these ATSs this run (e.g. while rate-limited); their companies are retried later. */
const SKIP = new Set(typeof flags.get("skip") === "string" ? String(flags.get("skip")).split(",") : []);

function proposalsFor(c: Candidate, previous: CompanyTarget | undefined): Ranked[] {
  const detect = loadDiscoveryCached(DETECT_FILE)[c.slug];
  const probe = loadDiscoveryCached(PROBE_FILE)[c.slug];
  const out: Ranked[] = [];
  const add = (p: Omit<Ranked, "tier">, tier: number): void => {
    if (!out.some((x) => x.ats === p.ats && x.token === p.token)) out.push({ ...p, tier });
  };
  // Sub-portals (events, military hiring, talent communities…) are never the main job board.
  const subPortal = (p: { token: string }): boolean => /^https?:\/\/[^/]+\/[^|]*(?:event|military|veteran|talent-?community|talentcommunity|alumni|referr|newsletter|join-?our-?community)/i.test(p.token);
  for (const p of detect?.proposals ?? []) if ((p.score ?? 0) >= 10 && p.ats !== "jsonld" && !subPortal(p)) add(p, 1);
  for (const h of c.hints) if (h.ats !== "custom") add({ ats: h.ats, token: h.token, via: "hint", evidence: "curated hint" }, 2);
  for (const p of probe?.proposals ?? []) if (p.via === "probe" && p.verdict === "match") add(p, 3);
  for (const p of detect?.proposals ?? []) if ((p.score ?? 0) < 10 || p.ats === "jsonld" || subPortal(p)) add(p, 4);
  for (const p of probe?.proposals ?? []) if (!(p.via === "probe" && p.verdict === "match")) add(p, 5);
  if (previous && previous.ats !== "custom") add({ ats: previous.ats, token: previous.token, via: "previous", evidence: "previous registry entry" }, 6);
  for (const h of c.hints) if (h.ats === "custom") add({ ats: "custom", token: h.token, via: "hint", evidence: "curated careers site" }, 7);
  // The custom fallback must be the company's own careers site, never an ATS vendor page (that's a board, or someone else's).
  const ownSite = (u: string | null | undefined): u is string => !!u && /^https:\/\//.test(u) && !ATS_VENDOR_HOST.test(new URL(u).hostname);
  const page = [detect?.careersUrl, c.careersUrl, previous?.ats === "custom" ? previous.careersUrl : null].find(ownSite);
  if (page) add({ ats: "custom", token: page, via: page === detect?.careersUrl ? "detect" : "previous", evidence: "careers page (no supported ATS found)" }, 8);
  return out;
}

const discoveryCache = new Map<string, ReturnType<typeof loadDiscovery>>();
function loadDiscoveryCached(file: string): ReturnType<typeof loadDiscovery> {
  let d = discoveryCache.get(file);
  if (!d) {
    d = loadDiscovery(file);
    discoveryCache.set(file, d);
  }
  return d;
}

/** ATS types verified through a real job API that returns a job count. */
const JOB_API_ATS = new Set<AtsType>(["greenhouse", "lever", "ashby", "smartrecruiters", "workable", "recruitee", "bamboohr", "personio", "breezy", "workday", "oracle", "eightfold"]);
/** Vendor domains of subdomain-token ATSs (token "airtel" → airtel.darwinbox.in). */
const VENDOR_SUFFIX: Partial<Record<AtsType, string>> = { darwinbox: "darwinbox.in", keka: "keka.com", zoho_recruit: "zohorecruit.com", freshteam: "freshteam.com", teamtailor: "teamtailor.com", bamboohr: "bamboohr.com", personio: "jobs.personio.de", breezy: "breezy.hr", recruitee: "recruitee.com" };

/** For URL / subdomain tokens: the vendor tenant or company host must relate to the candidate (detect & probe only). */
function tokenPlausible(p: Ranked, c: Candidate): { ok: boolean; why: string } {
  if (p.via === "hint" || p.via === "previous") return { ok: true, why: "" }; // curated tenants can be odd ("ghr" = BofA)
  const head = p.token.split("|")[0]!;
  let host: string | null = null;
  if (/^https:\/\//.test(head)) host = new URL(head).hostname.toLowerCase();
  else if (VENDOR_SUFFIX[p.ats]) host = `${p.token}.${VENDOR_SUFFIX[p.ats]}`;
  if (!host) return { ok: true, why: "" };
  if (ATS_VENDOR_HOST.test(host)) {
    // Oracle Cloud pods have random names (iaziqy.fa.ocs.oraclecloud.com = Uber), so no tenant to compare.
    if (/\.oraclecloud\.com$/i.test(host)) return { ok: true, why: "" };
    const tenant = host.split(".")[0]!;
    return tenantPlausible(tenant, c) ? { ok: true, why: "" } : { ok: false, why: `tenant "${tenant}" doesn't look like ${c.name}` };
  }
  if (!c.domain) return { ok: true, why: "" };
  const rel = domainRelation(host, c.domain);
  return rel === "different" && !tenantPlausible(host.split(".").slice(-2)[0]!, c)
    ? { ok: false, why: `${host} is not ${c.domain}` }
    : { ok: true, why: "" };
}

/** Is this checked proposal good enough to become the company's registry entry? */
function acceptable(p: Ranked, check: BoardCheck, c: Candidate): { ok: boolean; why: string } {
  if (check.status !== "ok") return { ok: false, why: `${check.status}: ${check.detail}` };
  const plausible = tokenPlausible(p, c);
  if (!plausible.ok) return plausible;
  if (p.ats === "custom") return { ok: true, why: "careers page loads" };
  const { verdict, why } = judgeBoard(check, c);
  if (verdict === "mismatch") return { ok: false, why };
  const jobs = check.openJobs ?? 0;
  switch (p.via) {
    case "probe":
      return p.verdict === "match" ? { ok: verdict === "match" || jobs > 0, why } : { ok: jobs > 0, why: `${why} (exact-name token)` };
    case "workday-robots":
    case "eightfold-probe":
      return { ok: jobs > 0, why: p.evidence };
    default:
      // hint / detect / previous: the company itself (or we) pointed here; an empty board is still its board.
      return { ok: true, why: verdict === "match" ? why : p.via === "detect" ? `linked from careers page (${p.evidence.slice(0, 60)})` : why };
  }
}

function careersUrlFor(c: Candidate, ats: AtsType, token: string): string {
  const detect = loadDiscoveryCached(DETECT_FILE)[c.slug];
  const pageOk = (u: string): boolean => !detect?.pages || detect.pages.some((line) => line.startsWith("200 ") && line.includes(u));
  if (ats === "custom") return token;
  if (c.careersUrl && pageOk(c.careersUrl)) return c.careersUrl;
  if (detect?.careersUrl?.startsWith("https://")) return detect.careersUrl;
  return publicBoardUrl(ats, token);
}

function orderTags(tags: readonly string[]): string[] {
  return COMPANY_TAGS.filter((t) => tags.includes(t));
}

function buildEntry(c: Candidate, p: Ranked, check: BoardCheck, why: string, alternates: { p: Ranked; check: BoardCheck }[]): CompanyTarget {
  const isApi = p.ats !== "custom";
  const indiaJobs = typeof check.extra?.["indiaJobs"] === "number" ? (check.extra["indiaJobs"] as number) : null;
  let priority = candidatePriority(c);
  if (isApi && check.openJobs === 0) priority = 3;
  const token = p.ats === "smartrecruiters" && typeof check.extra?.["identifier"] === "string" ? (check.extra["identifier"] as string) : p.token;
  const extra: Record<string, unknown> = {
    // ats-api: a job API answered with a count · ats-page: ATS identified, its careers page loaded (no count)
    verifiedBy: !isApi ? "careers-page" : JOB_API_ATS.has(p.ats) && typeof check.openJobs === "number" ? "ats-api" : "ats-page",
    via: p.via,
    evidence: why.slice(0, 160),
    segment: c.segment,
  };
  if (check.name) extra["boardName"] = check.name;
  if (c.aka.length > 0) extra["aliases"] = c.aka;
  if (c.remote) extra["remote"] = true;
  if (indiaJobs !== null) extra["indiaJobs"] = indiaJobs;
  if (check.extra?.["workdayIndiaFacet"]) extra["workdayIndiaFacet"] = check.extra["workdayIndiaFacet"];
  if (alternates.length > 0) extra["altBoards"] = alternates.map((a) => ({ ats: a.p.ats, token: a.p.token, openJobs: a.check.openJobs }));
  return {
    slug: c.slug,
    name: c.name,
    domain: c.domain,
    ats: p.ats,
    token,
    careersUrl: careersUrlFor(c, p.ats, token),
    tags: orderTags(c.tags),
    hq: c.hq,
    indiaPresence: c.indiaPresence || (indiaJobs ?? 0) > 0,
    priority,
    verifiedAt: check.checkedAt,
    openJobs: isApi ? check.openJobs : null,
    extra,
  };
}

async function verifyCandidate(
  c: Candidate,
  previous: CompanyTarget | undefined,
): Promise<{ entry: CompanyTarget | null; rejected: RejectedEntry | null; transientOnly: boolean }> {
  const proposals = proposalsFor(c, previous);
  const tried: RejectedEntry["tried"] = [];
  const good: { p: Ranked; check: BoardCheck; why: string }[] = [];
  let transientOnly = proposals.length > 0;
  const portal = P09_PORTALS.has(c.slug);
  for (const p of proposals) {
    // Custom pages are only a fallback: don't spend requests on them once a real board was accepted
    // (except for P09 portal companies, whose entry IS the custom careers site).
    if (p.ats === "custom" && good.length > 0 && !portal) break;
    const tokenHost = /^https:\/\//.test(p.token) ? new URL(p.token.split("|")[0]!).hostname : "";
    const skipped = SKIP.has(p.ats) || (tokenHost !== "" && SKIP.has(vendorFamily(tokenHost) ?? ""));
    const check: BoardCheck = skipped
      ? { ats: p.ats, token: p.token, status: "error", openJobs: null, name: null, website: null, sample: "", detail: "skipped (--skip)", endpoint: "", checkedAt: new Date().toISOString() }
      : await checkBoard(fetcher, p.ats, p.token, { ttlMs, fresh: flags.has("fresh"), withName: p.via === "probe" });
    const verdict = acceptable(p, check, c);
    tried.push({ ats: p.ats, token: p.token, via: p.via, status: verdict.ok ? "ok" : check.status, detail: verdict.why.slice(0, 200) });
    if (check.status !== "error") transientOnly = false;
    if (verdict.ok) good.push({ p, check, why: verdict.why });
  }
  type Good = (typeof good)[number];
  const isApiBoard = (g: Good): boolean => JOB_API_ATS.has(g.p.ats) && typeof g.check.openJobs === "number";
  const apiGood = good.filter(isApiBoard);
  const pageGood = good.filter((g) => g.p.ats !== "custom" && !isApiBoard(g));
  const page = good.find((g) => g.p.ats === "custom");
  const curatedPortal = c.hints.find((h) => h.ats === "custom")?.token ?? null;
  // An enterprise job-API board we couldn't reach (rate-limited / --skip) but have strong evidence for.
  const pending = proposals.find((p, i) => {
    const t = tried[i];
    if (!t || t.status !== "error" || !["workday", "oracle", "eightfold"].includes(p.ats)) return false;
    return p.via === "hint" || (p.via === "detect" && (p.score ?? 0) >= 10 && tokenPlausible(p, c).ok);
  });
  const alt = (except?: Good): { p: Ranked; check: BoardCheck }[] =>
    [...apiGood, ...pageGood].filter((g) => g !== except).map(({ p, check }) => ({ p, check }));
  /** Lowest tier wins, unless the pool has a ≥ 5× bigger board (≥ 20 jobs) — e.g. a stale side board in the hint. */
  const pick = (pool: Good[]): Good => {
    const minTier = Math.min(...pool.map((g) => g.p.tier));
    let chosen = pool.find((g) => g.p.tier === minTier)!;
    for (const g of pool) {
      const a = chosen.check.openJobs ?? 0;
      const b = g.check.openJobs ?? 0;
      if (g !== chosen && b >= 20 && b >= 5 * Math.max(1, a)) chosen = g;
    }
    return chosen;
  };
  const stub = (p: { ats: AtsType; token: string }): BoardCheck => ({
    ats: p.ats, token: p.token, status: "ok", openJobs: null, name: null, website: null, sample: "", detail: "", endpoint: "", checkedAt: "",
  });
  /** Not verifiable right now: kept with verifiedAt null + verifiedBy "unverified"; the next verify run promotes it. */
  const unverified = (p: Ranked, why: string, more: Record<string, unknown>): CompanyTarget => {
    const entry = buildEntry(c, p, stub(p), why, alt());
    entry.verifiedAt = null;
    entry.openJobs = null;
    entry.extra = { ...entry.extra, verifiedBy: "unverified", ...more };
    return entry;
  };
  const customToken = curatedPortal ?? c.careersUrl ?? proposals.find((p) => p.ats === "custom")?.token ?? null;
  const portalNote = `careers portal not fetched: ${tried.filter((t) => t.ats === "custom").map((t) => t.detail).join("; ").slice(0, 120) || "n/a"}`;
  const done = (entry: CompanyTarget): { entry: CompanyTarget; rejected: null; transientOnly: false } => ({ entry, rejected: null, transientOnly: false });

  // 1. P09 portal companies: the custom careers site (P09 scrapes it); live ATS boards are kept in altBoards.
  if (portal && (page || customToken)) {
    const entry = page
      ? buildEntry(c, page.p, page.check, page.why, alt())
      : unverified({ ats: "custom", token: customToken!, via: "hint", evidence: "curated careers portal", tier: 7 }, portalNote, {});
    entry.extra = { ...entry.extra, scrapedBy: "@easyjobs/scraper-bigtech" };
    return done(entry);
  }
  // 2. A board with a real job API and a job count.
  if (apiGood.length > 0) {
    const chosen = pick(apiGood);
    return done(buildEntry(c, chosen.p, chosen.check, chosen.why, alt(chosen)));
  }
  // 3. A pending enterprise job-API board beats page-only platforms (they give no job count).
  if (pending) {
    const detail = tried[proposals.indexOf(pending)]?.detail ?? "transient error";
    return done(
      unverified(pending, pending.evidence, {
        pendingReason: `${pending.ats} endpoint not reachable during verification (${detail})`,
        ...(page ? { careersPageVerifiedAt: page.check.checkedAt } : {}),
      }),
    );
  }
  // 4. A page-only ATS (Phenom, SuccessFactors, Avature, iCIMS, Taleo, JSON-LD, Darwinbox, Keka, Zoho Recruit…).
  if (pageGood.length > 0) {
    const chosen = pick(pageGood);
    return done(buildEntry(c, chosen.p, chosen.check, chosen.why, alt(chosen)));
  }
  // 5. The careers page itself; or a curated / P09 portal that couldn't be fetched politely (robots.txt, bot walls).
  if (page) return done(buildEntry(c, page.p, page.check, page.why, []));
  if ((curatedPortal || P09_DISABLED.has(c.slug)) && customToken) {
    return done(unverified({ ats: "custom", token: customToken, via: "hint", evidence: "curated careers portal", tier: 7 }, portalNote, {}));
  }
  // 6. Nothing verifiable.
  const reason = proposals.length === 0 ? "no ATS board or careers page found" : tried.map((t) => `${t.ats}:${t.status}`).join(", ").slice(0, 200);
  return {
    entry: null,
    transientOnly,
    rejected: { slug: c.slug, name: c.name, domain: c.domain, reason: transientOnly ? `transient (retry later): ${reason}` : reason, tried, checkedAt: new Date().toISOString() },
  };
}

async function main(): Promise<void> {
  const previousList = readJsonFile<CompanyTarget[]>(COMPANIES_FILE, []);
  const previous = new Map(previousList.map((c) => [c.slug, c] as const));
  const previousRejected = new Map(readJsonFile<RejectedEntry[]>(REJECTED_FILE, []).map((r) => [r.slug, r] as const));
  const onlyAts = typeof flags.get("only") === "string" ? (String(flags.get("only")) as AtsType) : null;
  const slugs = typeof flags.get("slug") === "string" ? new Set(String(flags.get("slug")).split(",")) : null;

  const selected = candidates.filter((c) => {
    if (slugs && !slugs.has(c.slug)) return false;
    if (onlyAts) {
      const prev = previous.get(c.slug);
      const first = prev ? prev.ats : proposalsFor(c, undefined)[0]?.ats;
      if (first !== onlyAts) return false;
    }
    return true;
  });
  const partial = slugs !== null || onlyAts !== null;
  log.info(`verifying ${selected.length}/${candidates.length} candidates${partial ? " (partial run: others carried over)" : ""}`);

  const entries = new Map<string, CompanyTarget>();
  const rejected = new Map<string, RejectedEntry>();
  if (partial) {
    for (const [slug, e] of previous) entries.set(slug, e);
    for (const [slug, r] of previousRejected) rejected.set(slug, r);
  }
  let done = 0;
  const t0 = Date.now();
  await mapLimit(selected, Number(flags.get("concurrency") ?? 16), async (c) => {
    const prev = previous.get(c.slug);
    const r = await verifyCandidate(c, prev);
    if (r.entry) {
      const problems = validateCompanyTarget(r.entry);
      if (problems.length > 0) {
        rejected.set(c.slug, { slug: c.slug, name: c.name, domain: c.domain, reason: `invalid entry: ${problems.join("; ")}`, tried: [], checkedAt: new Date().toISOString() });
        entries.delete(c.slug);
      } else {
        entries.set(c.slug, r.entry);
        rejected.delete(c.slug);
      }
    } else if (r.transientOnly && prev) {
      // Network trouble only: keep the last good entry rather than dropping a live board.
      entries.set(c.slug, { ...prev, extra: { ...prev.extra, lastCheckFailedAt: new Date().toISOString() } });
    } else {
      entries.delete(c.slug);
      rejected.set(c.slug, r.rejected!);
    }
    if (++done % 100 === 0) log.info(`progress ${done}/${selected.length} · ${fetcher.stats.requests} requests (${fetcher.stats.cacheHits} cached) · ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  });

  // Entries whose candidate disappeared from the curated list are dropped (and reported).
  const known = new Set(candidates.map((c) => c.slug));
  for (const slug of [...entries.keys()]) if (!known.has(slug)) entries.delete(slug);
  for (const slug of [...rejected.keys()]) if (!known.has(slug)) rejected.delete(slug);

  const list = [...entries.values()].sort((a, b) => a.slug.localeCompare(b.slug));
  const rej = [...rejected.values()].sort((a, b) => a.slug.localeCompare(b.slug));
  writeJsonFile(COMPANIES_FILE, list);
  writeJsonFile(REJECTED_FILE, rej);
  writeSummary(list, rej);
  const api = list.filter((e) => e.extra?.["verifiedBy"] === "ats-api");
  log.info(
    `wrote ${list.length} companies (${api.length} verified via ATS API, ${api.filter((e) => (e.openJobs ?? 0) > 0).length} with open jobs; ${list.length - api.length} careers-page only) · ${rej.length} rejected`,
    { requests: fetcher.stats.requests, cacheHits: fetcher.stats.cacheHits },
  );
}

await main();
