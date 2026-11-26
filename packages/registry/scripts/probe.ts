/**
 * Probe public ATS APIs for candidates without a confirmed board.
 *
 *   pnpm --filter @easyjobs/registry probe [--slug x] [--segment s] [--limit n] [--all] [--retry] [--fresh]
 *                                          [--no-public] [--no-workday] [--no-eightfold] [--ats a,b] [--base-only]
 *                                          [--concurrency 12]
 *
 * 1. Public boards: slug variants (name, hyphenated, domain stem, core; then namehq/nameinc/name-india/nameindia)
 *    against greenhouse, lever, ashby, smartrecruiters, workable, recruitee. A hit is kept only when the board's
 *    company name / website / postings match the candidate (judgeBoard).
 * 2. Workday: for MNC-type candidates, tenant guesses × data centers via robots.txt (which lists the career
 *    sites), then the CXS job count for each site. robots.txt is meant for bots, so this stays polite.
 * 3. Eightfold: <tenant>.eightfold.ai/api/apply/v2/jobs?domain=<company domain> (allowed by its robots.txt).
 * Results → data/discovery/probe.json (read by verify.ts).
 */
import type { AtsType } from "@easyjobs/contract";
import { candidates, type Candidate } from "./candidates";
import { checkBoard, judgeBoard, type BoardCheck } from "./lib/checks";
import { createSaver, loadDiscovery, PROBE_FILE, type DiscoveryRecord, type Proposal } from "./lib/discovery";
import { Fetcher, mapLimit, parseArgs } from "./lib/fetcher";
import { domainStem, slugVariants } from "./lib/variants";
import { compactName, coreName } from "../src/normalize";

const PUBLIC_ATS: AtsType[] = ["greenhouse", "lever", "ashby", "smartrecruiters", "workable", "recruitee"];
/** Suffixed variants are only common on these. */
const SUFFIX_ATS: AtsType[] = ["greenhouse", "lever", "ashby"];
/** Workday data centers that exist in DNS (wd2/wd4/wd6/wd101 don't), most common first. */
const WORKDAY_DCS = ["wd5", "wd1", "wd3", "wd12", "wd10", "wd103", "wd501", "wd105", "wd108"];
const ENTERPRISE_TAGS = new Set(["mnc", "gcc", "bank", "big_tech", "indian_it", "consulting", "service"]);
const SITE_PREFER = /extern|career|jobs?$|global|professional|experienced|search|opportunit|^en-?us$/i;
const SITE_AVOID = /internal|employee|alumni|contingent|agency|referral|test|sandbox|staffing|supplier|vendor|talent_?community|recruitad/i;

const { flags } = parseArgs(process.argv.slice(2));
const fetcher = new Fetcher({ fresh: flags.has("fresh") });
const log = fetcher.log.child("probe");
const store = loadDiscovery(PROBE_FILE);
const saver = createSaver(PROBE_FILE, store);

function proposalFrom(check: BoardCheck, via: Proposal["via"], verdict: "match" | "unknown", why: string): Proposal {
  const token = check.ats === "smartrecruiters" && typeof check.extra?.["identifier"] === "string" ? (check.extra["identifier"] as string) : check.token;
  return { ats: check.ats, token, via, evidence: why, openJobs: check.openJobs, boardName: check.name, verdict, at: check.checkedAt };
}

async function probePublic(c: Candidate, tried: { n: number }): Promise<Proposal[]> {
  const { base, suffixed } = slugVariants(c);
  const stem = domainStem(c.domain);
  const strongTokens = new Set([compactName(c.name), stem, coreName(c.name).replace(/ /g, ""), c.domain].filter(Boolean) as string[]);
  const weak: Proposal[] = [];
  const only = typeof flags.get("ats") === "string" ? new Set(String(flags.get("ats")).split(",")) : null;
  const pub = PUBLIC_ATS.filter((a) => !only || only.has(a));
  const suf = flags.has("base-only") ? [] : SUFFIX_ATS.filter((a) => !only || only.has(a));
  const plan: [string, AtsType][] = [
    ...base.flatMap((v) => pub.map((a) => [v, a] as [string, AtsType])),
    ...suffixed.flatMap((v) => suf.map((a) => [v, a] as [string, AtsType])),
  ];
  // Some Ashby boards use the full domain as their slug (jobs.ashbyhq.com/kraken.com).
  if (c.domain && pub.includes("ashby")) plan.push([c.domain, "ashby"]);
  for (const [variant, ats] of plan) {
    tried.n++;
    const check = await checkBoard(fetcher, ats, variant, { withName: true });
    if (check.status !== "ok") continue;
    const { verdict, why } = judgeBoard(check, c);
    if (verdict === "match") return [proposalFrom(check, "probe", "match", why), ...weak];
    // No name/domain evidence (e.g. an empty Lever board): keep exact-name tokens with jobs as weak proposals.
    if (verdict === "unknown" && strongTokens.has(variant) && (check.openJobs ?? 0) > 0) weak.push(proposalFrom(check, "probe", "unknown", why));
  }
  return weak;
}

function workdayTenants(c: Candidate): string[] {
  const out = new Set<string>();
  const add = (s: string | null | undefined): void => {
    if (s && /^[a-z0-9-]{2,40}$/.test(s)) out.add(s);
  };
  add(compactName(c.name));
  add(domainStem(c.domain));
  const first = compactName(c.name.split(/\s+/)[0] ?? "");
  if (first.length >= 4) add(first);
  add(coreName(c.name).replace(/ /g, ""));
  return [...out].slice(0, 3);
}

function sitesFromRobots(txt: string): string[] {
  const sites = new Set<string>();
  for (const m of txt.matchAll(/^\s*(?:allow|disallow)\s*:\s*\/([A-Za-z0-9_.-]+)\/?\s*$/gim)) {
    if (/^allow/i.test(m[0].trim())) sites.add(m[1]!);
  }
  for (const m of txt.matchAll(/sitemap\s*:\s*https?:\/\/[^/\s]+\/([A-Za-z0-9_.-]+)\/sitemap\.xml/gi)) sites.add(m[1]!);
  return [...sites].filter((s) => !/^(?:wday|refreshFacet|static|assets|robots\.txt)$/i.test(s));
}

async function probeWorkday(c: Candidate, tried: { n: number }): Promise<Proposal[]> {
  for (const tenant of workdayTenants(c)) {
    for (const dc of WORKDAY_DCS) {
      tried.n++;
      const r = await fetcher.fetch(`https://${tenant}.${dc}.myworkdayjobs.com/robots.txt`, { robots: false, group: "workday", ttlMs: 7 * 86_400_000, retries: 1 });
      if (r.status !== 200 || !/user-agent/i.test(r.body)) continue;
      const sites = sitesFromRobots(r.body).slice(0, 8);
      if (sites.length === 0) continue;
      const checks: BoardCheck[] = [];
      for (const site of sites) {
        tried.n++;
        const check = await checkBoard(fetcher, "workday", `https://${tenant}.${dc}.myworkdayjobs.com/${site}`);
        if (check.status === "ok") checks.push(check);
      }
      const ranked = checks
        .map((ch) => {
          const site = ch.token.split("/").pop() ?? "";
          const bonus = (SITE_PREFER.test(site) ? 1.5 : 1) * (SITE_AVOID.test(site) ? 0.05 : 1);
          return { ch, score: ((ch.openJobs ?? 0) + 1) * bonus };
        })
        .sort((a, b) => b.score - a.score);
      const best = ranked[0];
      if (best && (best.ch.openJobs ?? 0) > 0) {
        const others = ranked.slice(1).map((r) => r.ch.token.split("/").pop());
        return [
          proposalFrom(best.ch, "workday-robots", "unknown", `robots.txt of ${tenant}.${dc} lists ${sites.join(", ")}${others.length ? `; other sites: ${others.join(", ")}` : ""}`),
        ];
      }
      return []; // tenant exists on this DC but has no live sites — don't try other DCs
    }
  }
  return [];
}

async function probeEightfold(c: Candidate, tried: { n: number }): Promise<Proposal[]> {
  if (!c.domain) return [];
  for (const tenant of [...new Set([compactName(c.name), domainStem(c.domain)].filter(Boolean) as string[])]) {
    tried.n++;
    const check = await checkBoard(fetcher, "eightfold", `https://${tenant}.eightfold.ai|${c.domain}`);
    if (check.status === "ok" && (check.openJobs ?? 0) > 0) return [proposalFrom(check, "eightfold-probe", "unknown", `${tenant}.eightfold.ai answers for ${c.domain}`)];
  }
  return [];
}

/** A non-custom hint whose board answers and isn't someone else's — then there's nothing to probe. */
async function hasWorkingHint(c: Candidate): Promise<boolean> {
  // Enterprise hints (Workday/Oracle/Eightfold/…) are verified by verify.ts at their own slow pace; such
  // companies are rarely on the public boards, so don't spend enterprise requests here.
  if (c.hints.some((h) => !["custom", "greenhouse", "lever", "ashby", "smartrecruiters", "workable", "recruitee"].includes(h.ats))) return true;
  for (const h of c.hints) {
    if (h.ats === "custom") continue;
    const check = await checkBoard(fetcher, h.ats, h.token);
    if (check.status === "ok" && judgeBoard(check, c).verdict !== "mismatch" && (check.openJobs ?? 1) > 0) return true;
  }
  return false;
}

async function main(): Promise<void> {
  const only = typeof flags.get("slug") === "string" ? new Set(String(flags.get("slug")).split(",")) : null;
  const segment = flags.get("segment");
  let list = candidates.filter((c) => (!only || only.has(c.slug)) && (typeof segment !== "string" || c.segment === segment));
  if (!flags.has("all") && !only) {
    list = list.filter((c) => {
      const prev = store[c.slug];
      if (prev && prev.status === "found" && prev.proposals.some((p) => p.verdict === "match")) return false;
      return !(prev && prev.status === "none" && !flags.has("retry"));
    });
    const keep = await mapLimit(list, 16, async (c) => (flags.has("with-hints") ? true : !(await hasWorkingHint(c))));
    list = list.filter((_c, i) => keep[i]);
  }
  const limit = Number(flags.get("limit") ?? 0);
  if (limit > 0) list = list.slice(0, limit);
  const doPublic = !flags.has("no-public");
  const doWorkday = !flags.has("no-workday");
  const doEightfold = !flags.has("no-eightfold");
  log.info(`probing ${list.length} candidates`, { public: doPublic, workday: doWorkday, eightfold: doEightfold });

  let found = 0;
  let done = 0;
  const t0 = Date.now();
  await mapLimit(list, Number(flags.get("concurrency") ?? 12), async (c) => {
    const tried = { n: 0 };
    const proposals: Proposal[] = [];
    try {
      if (doPublic) proposals.push(...(await probePublic(c, tried)));
      const enterprise = c.tags.some((t) => ENTERPRISE_TAGS.has(t));
      const strong = proposals.some((p) => p.verdict === "match");
      if (!strong && enterprise && doWorkday) proposals.push(...(await probeWorkday(c, tried)));
      if (!strong && enterprise && doEightfold && proposals.length === 0) proposals.push(...(await probeEightfold(c, tried)));
      // Merge with earlier passes (e.g. an Eightfold-only pass must not erase public-board finds).
      const prev = store[c.slug];
      const merged = [...proposals];
      for (const p of prev?.proposals ?? []) if (!merged.some((m) => m.ats === p.ats && m.token === p.token)) merged.push(p);
      const rec: DiscoveryRecord = { slug: c.slug, at: new Date().toISOString(), status: merged.length > 0 ? "found" : "none", proposals: merged, tried: tried.n + (prev?.tried ?? 0) };
      store[c.slug] = rec;
      if (proposals.length > 0) {
        found++;
        log.info(`✓ ${c.slug}: ${proposals.map((p) => `${p.ats}:${p.token} (${p.openJobs ?? "?"} jobs, ${p.verdict})`).join(" · ")}`);
      }
    } catch (e) {
      store[c.slug] = { slug: c.slug, at: new Date().toISOString(), status: "error", proposals, tried: tried.n, detail: e instanceof Error ? e.message : String(e) };
    }
    saver.touch();
    if (++done % 25 === 0) {
      log.info(`progress ${done}/${list.length} · found ${found} · ${fetcher.stats.requests} requests (${fetcher.stats.cacheHits} cached) · ${((Date.now() - t0) / 1000).toFixed(0)}s`);
    }
  });
  saver.flush();
  log.info(`done: ${found}/${list.length} candidates have a board`, { requests: fetcher.stats.requests, cacheHits: fetcher.stats.cacheHits, errors: fetcher.stats.errors });
}

await main();
