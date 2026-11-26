/**
 * findCompany() engine: slug → ATS URL → domain → name/alias → compact → core → qualified prefix → fuzzy.
 * Indexes are built once; lookups are O(1) except the fuzzy fallback (bounded, cached).
 */
import { slugify, type CompanyTarget } from "@easyjobs/contract";
import { ATS_VENDOR_HOST, detectAtsFromUrl } from "./ats";
import { coreName, editDistance, isLikelyTypo, normalizeDomain, normalizeName, QUALIFIER_WORDS, registrableDomain } from "./normalize";

export type MatchVia = "slug" | "ats" | "domain" | "name" | "alias" | "compact" | "core" | "prefix" | "fuzzy";

export interface CompanyMatch {
  company: CompanyTarget;
  via: MatchVia;
  /** 1 for exact keys; 1 − edits/length for fuzzy matches. */
  score: number;
}

export interface CompanyIndex {
  find(query: string | null | undefined): CompanyTarget | null;
  match(query: string | null | undefined): CompanyMatch | null;
}

export type AliasTable = Readonly<Record<string, readonly string[]>>;

interface Keyed {
  company: CompanyTarget;
  /** true when the key came from the display name / slug rather than an alias. */
  primary: boolean;
}

const TLD_WORDS = new Set(["com", "net", "org", "in", "io", "co", "ai", "app", "dev", "tech"]);
const FUZZY_MIN_LEN = 5;
const CACHE_MAX = 20_000;

function rank(a: Keyed, b: Keyed): number {
  if (a.primary !== b.primary) return a.primary ? -1 : 1;
  if (a.company.priority !== b.company.priority) return a.company.priority - b.company.priority;
  const oa = a.company.openJobs ?? -1;
  const ob = b.company.openJobs ?? -1;
  if (oa !== ob) return ob - oa;
  return a.company.slug.localeCompare(b.company.slug);
}

function push(map: Map<string, Keyed[]>, key: string, value: Keyed): void {
  if (!key) return;
  const list = map.get(key);
  if (!list) map.set(key, [value]);
  else if (!list.some((k) => k.company === value.company)) list.push(value);
  else if (value.primary) for (const k of list) if (k.company === value.company) k.primary = true;
}

function best(list: Keyed[] | undefined): Keyed | null {
  if (!list || list.length === 0) return null;
  return [...list].sort(rank)[0] ?? null;
}

function atsKeys(ats: string, token: string): string[] {
  const keys = [`${ats}:${token.toLowerCase()}`];
  const head = token.split("|")[0]!;
  if (/^https?:\/\//i.test(head)) {
    try {
      const u = new URL(head);
      keys.push(`${ats}-host:${u.hostname.toLowerCase()}`);
      const wd = u.hostname.match(/^([a-z0-9-]+)\.wd\d+\.myworkdayjobs\.com$/i);
      if (wd) keys.push(`workday-tenant:${wd[1]!.toLowerCase()}`);
    } catch {
      /* invalid URLs are caught by validation */
    }
  }
  return keys;
}

function looksLikeUrlOrDomain(q: string): boolean {
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(q) || (/^[^\s@]+\.[a-z]{2,}(?:[/:?#]\S*)?$/i.test(q) && !/\s/.test(q));
}

export function createCompanyIndex(companies: readonly CompanyTarget[], aliases: AliasTable = {}): CompanyIndex {
  const bySlug = new Map<string, CompanyTarget>();
  const byAts = new Map<string, CompanyTarget>();
  const byDomain = new Map<string, Keyed[]>();
  const byName = new Map<string, Keyed[]>();
  const byCompact = new Map<string, Keyed[]>();
  const byCore = new Map<string, Keyed[]>();
  const fuzzy: { key: string; entry: Keyed }[] = [];
  const cache = new Map<string, CompanyMatch | null>();

  for (const company of companies) {
    bySlug.set(company.slug, company);
    for (const key of atsKeys(company.ats, company.token)) if (!byAts.has(key)) byAts.set(key, company);

    const domains = new Set<string>();
    if (company.domain) domains.add(company.domain);
    const extraDomains = company.extra?.["domains"];
    if (Array.isArray(extraDomains)) for (const d of extraDomains) if (typeof d === "string") domains.add(d);
    for (const d of domains) {
      const norm = normalizeDomain(d);
      if (!norm) continue;
      push(byDomain, norm, { company, primary: d === company.domain });
      push(byDomain, registrableDomain(norm), { company, primary: d === company.domain });
    }
    // Careers hosts are indexed exactly (higher.gs.com, amazon.jobs) — never by registrable domain, so a careers page
    // on a shared platform (*.notion.site, *.github.io) can't claim the whole platform. Vendor hosts never count.
    const careersHost = normalizeDomain(company.careersUrl);
    if (careersHost && !ATS_VENDOR_HOST.test(careersHost)) push(byDomain, careersHost, { company, primary: false });

    const names: { text: string; primary: boolean }[] = [
      { text: company.name, primary: true },
      { text: company.slug.replace(/-/g, " "), primary: true },
      ...(aliases[company.slug] ?? []).map((text) => ({ text, primary: false })),
    ];
    const extraAliases = company.extra?.["aliases"];
    if (Array.isArray(extraAliases)) for (const a of extraAliases) if (typeof a === "string") names.push({ text: a, primary: false });

    for (const { text, primary } of names) {
      const entry: Keyed = { company, primary };
      const n = normalizeName(text);
      if (!n) continue;
      push(byName, n, entry);
      push(byCompact, n.replace(/ /g, ""), entry);
      const core = coreName(text);
      if (core.replace(/ /g, "").length >= 2) push(byCore, core, entry);
      const fk = core.replace(/ /g, "");
      if (fk.length >= FUZZY_MIN_LEN) fuzzy.push({ key: fk, entry });
    }
  }

  function viaName(list: Keyed[] | undefined, exactVia: MatchVia): CompanyMatch | null {
    const hit = best(list);
    if (!hit) return null;
    return { company: hit.company, via: exactVia === "name" && !hit.primary ? "alias" : exactVia, score: 1 };
  }

  function matchUrl(q: string): CompanyMatch | null {
    const det = detectAtsFromUrl(q);
    if (det) {
      for (const key of atsKeys(det.ats, det.token)) {
        const c = byAts.get(key);
        if (c) return { company: c, via: "ats", score: 1 };
      }
    }
    const host = normalizeDomain(q);
    if (host && !ATS_VENDOR_HOST.test(host)) {
      const hit = best(byDomain.get(host)) ?? best(byDomain.get(registrableDomain(host)));
      if (hit) return { company: hit.company, via: "domain", score: 1 };
    }
    // An ATS URL for a board we don't know: its token is usually the company name ("jobs.lever.co/cred").
    if (det && !/^https?:/i.test(det.token)) return matchName(det.token.replace(/^eu:/, ""));
    return null;
  }

  function matchName(q: string): CompanyMatch | null {
    const n = normalizeName(q);
    if (!n) return null;
    const exact = viaName(byName.get(n), "name");
    if (exact) return exact;
    const compact = viaName(byCompact.get(n.replace(/ /g, "")), "compact");
    if (compact) return compact;
    const core = coreName(q);
    const viaCore = viaName(byCore.get(core), "core");
    if (viaCore) return viaCore;

    // "Amazon Development Centre India" → "Amazon": a known name followed only by qualifier words.
    const words = n.split(" ");
    for (let k = words.length - 1; k >= 1; k--) {
      const rest = words.slice(k);
      if (!rest.every((w) => QUALIFIER_WORDS.has(w) || TLD_WORDS.has(w))) continue;
      const head = words.slice(0, k).join(" ");
      if (head.replace(/ /g, "").length < 2) continue;
      const hit = best(byName.get(head)) ?? best(byCompact.get(head.replace(/ /g, ""))) ?? best(byCore.get(head));
      if (hit) return { company: hit.company, via: "prefix", score: 1 };
    }

    // Typos: "Goldman Sach", "Razorpy", "Infsoys". Bounded edit distance; ambiguous ties → no match.
    const fk = core.replace(/ /g, "");
    if (fk.length < FUZZY_MIN_LEN) return null;
    let top: { entry: Keyed; dist: number } | null = null;
    let tie = false;
    for (const cand of fuzzy) {
      if (Math.abs(cand.key.length - fk.length) > 2 || !isLikelyTypo(fk, cand.key)) continue;
      const dist = editDistance(fk, cand.key, 2);
      if (!top || dist < top.dist) {
        top = { entry: cand.entry, dist };
        tie = false;
      } else if (dist === top.dist && cand.entry.company !== top.entry.company) {
        tie = true;
      }
    }
    if (!top || tie) return null;
    return { company: top.entry.company, via: "fuzzy", score: Number((1 - top.dist / Math.max(fk.length, 1)).toFixed(4)) };
  }

  function match(query: string | null | undefined): CompanyMatch | null {
    if (typeof query !== "string") return null;
    const q = query.trim();
    if (q.length === 0 || q.length > 300) return null;
    const cached = cache.get(q);
    if (cached !== undefined) return cached;

    let result: CompanyMatch | null = null;
    const lower = q.toLowerCase();
    const slugHit = bySlug.get(lower) ?? bySlug.get(slugify(q));
    if (slugHit && (bySlug.has(lower) || !looksLikeUrlOrDomain(q))) result = { company: slugHit, via: "slug", score: 1 };
    if (!result && looksLikeUrlOrDomain(q)) result = matchUrl(q);
    if (!result) result = matchName(q);

    if (cache.size >= CACHE_MAX) cache.clear();
    cache.set(q, result);
    return result;
  }

  return {
    match,
    find: (query) => match(query)?.company ?? null,
  };
}
