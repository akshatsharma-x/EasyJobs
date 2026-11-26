/**
 * One cheap request per board that proves it exists and counts open jobs.
 * Used by probe.ts (discovery) and verify.ts (re-verification). Results are cached in .cache/checks/.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { AtsType } from "@easyjobs/contract";
import { ATS_VENDOR_HOST } from "../../src/ats";
import { coreName, normalizeDomain, namesMatch, registrableDomain } from "../../src/normalize";
import { CACHE_DIR, parseJson, type Fetcher, type FetchResult } from "./fetcher";

export type CheckStatus = "ok" | "not_found" | "error" | "blocked";

export interface BoardCheck {
  ats: AtsType;
  token: string;
  status: CheckStatus;
  openJobs: number | null;
  /** Company name as the ATS reports it. */
  name: string | null;
  /** Company website as the ATS reports it. */
  website: string | null;
  /** Titles / URLs / description snippets — evidence for name & domain matching. */
  sample: string;
  detail: string;
  endpoint: string;
  checkedAt: string;
  extra?: Record<string, unknown>;
}

export interface CheckOptions {
  /** Also fetch the board's HTML page when the API doesn't report a company name (probe). */
  withName?: boolean;
  /** Ignore the check cache. */
  fresh?: boolean;
  /** Check-cache TTL (default 20 h). */
  ttlMs?: number;
}

const JSON_HEADERS = { accept: "application/json" };
const CHECK_DIR = join(CACHE_DIR, "checks");

/* ─────────────────────────── helpers ─────────────────────────── */

function isUrl(token: string): boolean {
  return /^https?:\/\//i.test(token);
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, " ").replace(/&nbsp;|&#160;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&#39;|&#x27;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_m, d: string) => String.fromCharCode(Number(d)));
}

function htmlTitle(html: string): string | null {
  const m = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  return m ? decodeEntities(m[1]!).replace(/\s+/g, " ").trim() || null : null;
}

function base(ats: AtsType, token: string, endpoint: string): BoardCheck {
  return { ats, token, status: "error", openJobs: null, name: null, website: null, sample: "", detail: "", endpoint, checkedAt: new Date().toISOString() };
}

function fromFailure(c: BoardCheck, r: FetchResult): BoardCheck {
  if (r.robotsBlocked) return { ...c, status: "blocked", detail: "robots.txt disallows the endpoint" };
  if (r.status === 0) return { ...c, status: "error", detail: `network: ${r.error ?? "unknown"}` };
  if (r.status === 404 || r.status === 410 || r.status === 422) return { ...c, status: "not_found", detail: `HTTP ${r.status}` };
  if (r.status === 401 || r.status === 403) return { ...c, status: "blocked", detail: `HTTP ${r.status}` };
  return { ...c, status: "error", detail: `HTTP ${r.status}` };
}

function ok(c: BoardCheck, openJobs: number | null, detail: string, more: Partial<BoardCheck> = {}): BoardCheck {
  return { ...c, ...more, status: "ok", openJobs, detail };
}

function hostOf(u: string): string | null {
  try {
    return new URL(u).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/** Public, human-facing board URL for an entry (used as careersUrl when the candidate has none). */
export function publicBoardUrl(ats: AtsType, token: string): string {
  if (ats === "eightfold") return `${token.split("|")[0]}/careers`;
  if (isUrl(token)) return token;
  switch (ats) {
    case "greenhouse":
      return `https://job-boards.greenhouse.io/${token}`;
    case "lever":
      return token.startsWith("eu:") ? `https://jobs.eu.lever.co/${token.slice(3)}` : `https://jobs.lever.co/${token}`;
    case "ashby":
      return `https://jobs.ashbyhq.com/${token}`;
    case "smartrecruiters":
      return `https://jobs.smartrecruiters.com/${token}`;
    case "workable":
      return `https://apply.workable.com/${token}/`;
    case "recruitee":
      return `https://${token}.recruitee.com/`;
    case "bamboohr":
      return `https://${token}.bamboohr.com/careers`;
    case "personio":
      return `https://${token}.jobs.personio.de/`;
    case "breezy":
      return `https://${token}.breezy.hr/`;
    case "teamtailor":
      return `https://${token}.teamtailor.com/jobs`;
    case "freshteam":
      return `https://${token}.freshteam.com/jobs`;
    case "zoho_recruit":
      return `https://${token}.zohorecruit.com/jobs/Careers`;
    case "keka":
      return `https://${token}.keka.com/careers/`;
    case "darwinbox":
      return `https://${token}.darwinbox.in/ms/candidate/careers`;
    default:
      return token;
  }
}

/* ─────────────────────────── per-ATS checks ─────────────────────────── */

type Checker = (f: Fetcher, token: string, opts: CheckOptions) => Promise<BoardCheck>;

const greenhouse: Checker = async (f, token) => {
  const url = `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(token)}/jobs`;
  const c = base("greenhouse", token, url);
  const r = await f.fetch(url, { robots: false, group: "greenhouse", headers: JSON_HEADERS });
  if (r.status !== 200) return fromFailure(c, r);
  const d = parseJson<{ jobs?: { title?: string; company_name?: string; absolute_url?: string }[]; meta?: { total?: number } }>(r.body);
  if (!d || !Array.isArray(d.jobs)) return { ...c, detail: "unexpected JSON" };
  let name = d.jobs.find((j) => j.company_name)?.company_name ?? null;
  if (!name) {
    const b = await f.fetch(`https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(token)}`, { robots: false, group: "greenhouse", headers: JSON_HEADERS });
    name = parseJson<{ name?: string }>(b.body)?.name ?? null;
  }
  const hosts = [...new Set(d.jobs.map((j) => hostOf(j.absolute_url ?? "")).filter(Boolean))].slice(0, 5);
  const sample = [...hosts, ...d.jobs.slice(0, 15).map((j) => j.title ?? "")].join(" | ");
  return ok(c, d.meta?.total ?? d.jobs.length, `${d.meta?.total ?? d.jobs.length} jobs`, { name, sample, extra: { jobHosts: hosts } });
};

const lever: Checker = async (f, token, opts) => {
  const eu = token.startsWith("eu:");
  const site = eu ? token.slice(3) : token;
  const url = `https://api.${eu ? "eu." : ""}lever.co/v0/postings/${encodeURIComponent(site)}?mode=json`;
  const c = base("lever", token, url);
  const r = await f.fetch(url, { robots: false, group: "lever", headers: JSON_HEADERS });
  if (r.status !== 200) return fromFailure(c, r);
  const d = parseJson<{ text?: string; hostedUrl?: string; descriptionPlain?: string; additionalPlain?: string }[]>(r.body);
  if (!Array.isArray(d)) return { ...c, detail: "unexpected JSON" };
  let name: string | null = null;
  if (opts.withName) {
    const h = await f.fetch(`https://jobs.${eu ? "eu." : ""}lever.co/${encodeURIComponent(site)}`, { group: "lever-html" });
    if (h.status === 200) name = htmlTitle(h.body);
  }
  const sample = [
    ...d.slice(0, 15).map((p) => p.text ?? ""),
    ...d.slice(0, 3).map((p) => `${p.descriptionPlain ?? ""} ${p.additionalPlain ?? ""}`.slice(0, 1500)),
  ].join(" | ");
  return ok(c, d.length, `${d.length} postings`, { name, sample });
};

const ashby: Checker = async (f, token, opts) => {
  const url = `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(decodeURIComponent(token))}`;
  const c = base("ashby", token, url);
  const r = await f.fetch(url, { robots: false, group: "ashby", headers: JSON_HEADERS });
  if (r.status !== 200) return fromFailure(c, r);
  const d = parseJson<{ jobs?: { title?: string; isListed?: boolean; descriptionPlain?: string; jobUrl?: string }[] }>(r.body);
  if (!d || !Array.isArray(d.jobs)) return { ...c, detail: "unexpected JSON" };
  const listed = d.jobs.filter((j) => j.isListed !== false);
  let name: string | null = null;
  let website: string | null = null;
  if (opts.withName) {
    // jobs.ashbyhq.com/robots.txt disallows /api/ — so read the public board page, never the GraphQL API.
    const h = await f.fetch(`https://jobs.ashbyhq.com/${encodeURIComponent(decodeURIComponent(token))}`, { group: "ashby-html" });
    if (h.status === 200) {
      const org = h.body.match(/"organization"\s*:\s*\{[^{}]*?"name"\s*:\s*"((?:[^"\\]|\\.)*)"[^{}]*?"publicWebsite"\s*:\s*(?:"((?:[^"\\]|\\.)*)"|null)/);
      if (org) {
        name = parseJson<string>(`"${org[1]}"`) ?? org[1]!;
        website = org[2] ? parseJson<string>(`"${org[2]}"`) ?? org[2]! : null;
      } else {
        name = htmlTitle(h.body)?.replace(/\s+jobs$/i, "") ?? null;
      }
    }
  }
  const sample = [...listed.slice(0, 15).map((j) => j.title ?? ""), ...listed.slice(0, 3).map((j) => (j.descriptionPlain ?? "").slice(0, 1500))].join(" | ");
  return ok(c, listed.length, `${listed.length} listed jobs`, { name, website, sample });
};

const smartrecruiters: Checker = async (f, token) => {
  const url = `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(token)}/postings?limit=1`;
  const c = base("smartrecruiters", token, url);
  const r = await f.fetch(url, { robots: false, group: "smartrecruiters", headers: JSON_HEADERS });
  if (r.status !== 200) return fromFailure(c, r);
  const d = parseJson<{ totalFound?: number; content?: { name?: string; company?: { name?: string; identifier?: string } }[] }>(r.body);
  if (!d || typeof d.totalFound !== "number") return { ...c, detail: "unexpected JSON" };
  // SmartRecruiters answers 200 + totalFound 0 for ANY identifier, so 0 can't prove the board exists.
  if (d.totalFound === 0) return { ...c, status: "not_found", detail: "0 postings (SmartRecruiters returns 200 for unknown identifiers)" };
  const first = d.content?.[0];
  return ok(c, d.totalFound, `${d.totalFound} postings`, {
    name: first?.company?.name ?? null,
    sample: [first?.name ?? "", first?.company?.identifier ?? ""].join(" | "),
    // Identifiers are case-insensitive; keep the canonical spelling ("Freshworks", "BoschGroup").
    extra: first?.company?.identifier ? { identifier: first.company.identifier } : undefined,
  });
};

const workable: Checker = async (f, token) => {
  const url = `https://apply.workable.com/api/v1/widget/accounts/${encodeURIComponent(token)}`;
  const c = base("workable", token, url);
  const r = await f.fetch(url, { robots: false, group: "workable", headers: JSON_HEADERS });
  if (r.status !== 200) return fromFailure(c, r);
  const d = parseJson<{ name?: string; description?: string | null; jobs?: { title?: string; url?: string }[] }>(r.body);
  if (!d || !Array.isArray(d.jobs)) return { ...c, detail: "unexpected JSON" };
  // Workable answers 200 for never-used accounts ({"name":"Visa","description":null,"jobs":[]}); those aren't boards.
  if (d.jobs.length === 0 && !d.description) return { ...c, status: "not_found", name: d.name ?? null, detail: "empty placeholder account" };
  const sample = [stripHtml(d.description ?? "").slice(0, 1500), ...d.jobs.slice(0, 15).map((j) => j.title ?? "")].join(" | ");
  return ok(c, d.jobs.length, `${d.jobs.length} jobs`, { name: d.name ?? null, sample });
};

const recruitee: Checker = async (f, token) => {
  const origin = isUrl(token) ? new URL(token).origin : `https://${token}.recruitee.com`;
  const url = `${origin}/api/offers/`;
  const c = base("recruitee", token, url);
  const r = await f.fetch(url, { robots: false, group: "recruitee", headers: JSON_HEADERS });
  if (r.status !== 200) return fromFailure(c, r);
  const d = parseJson<{ offers?: { title?: string; company_name?: string; careers_url?: string }[] }>(r.body);
  if (!d || !Array.isArray(d.offers)) return { ...c, detail: "unexpected JSON" };
  return ok(c, d.offers.length, `${d.offers.length} offers`, {
    name: d.offers.find((o) => o.company_name)?.company_name ?? null,
    sample: d.offers.slice(0, 15).map((o) => `${o.title ?? ""} ${o.careers_url ?? ""}`).join(" | "),
  });
};

const bamboohr: Checker = async (f, token) => {
  const url = `https://${token}.bamboohr.com/careers/list`;
  const c = base("bamboohr", token, url);
  const r = await f.fetch(url, { group: "bamboohr", headers: JSON_HEADERS });
  if (r.status !== 200) return fromFailure(c, r);
  if (hostOf(r.finalUrl) !== `${token}.bamboohr.com`) return { ...c, status: "not_found", detail: `redirected to ${r.finalUrl}` };
  const d = parseJson<{ meta?: { totalCount?: number }; result?: { jobOpeningName?: string }[] }>(r.body);
  if (!d || !Array.isArray(d.result)) return { ...c, detail: "unexpected JSON" };
  return ok(c, d.meta?.totalCount ?? d.result.length, `${d.result.length} openings`, {
    sample: d.result.slice(0, 15).map((j) => j.jobOpeningName ?? "").join(" | "),
  });
};

const personio: Checker = async (f, token) => {
  const url = `https://${token}.jobs.personio.de/xml`;
  const c = base("personio", token, url);
  const r = await f.fetch(url, { robots: false, group: "personio" });
  if (r.status !== 200) return fromFailure(c, r);
  if (!/<workzag-jobs/i.test(r.body)) return { ...c, status: "not_found", detail: "no XML feed" };
  const n = (r.body.match(/<position>/g) ?? []).length;
  const names = [...r.body.matchAll(/<name>([^<]*)<\/name>/g)].slice(0, 15).map((m) => m[1]);
  const sub = r.body.match(/<subcompany>([^<]+)<\/subcompany>/)?.[1] ?? null;
  return ok(c, n, `${n} positions`, { name: sub, sample: names.join(" | ") });
};

const breezy: Checker = async (f, token) => {
  const url = `https://${token}.breezy.hr/json`;
  const c = base("breezy", token, url);
  const r = await f.fetch(url, { robots: false, group: "breezy", headers: JSON_HEADERS });
  if (r.status !== 200) return fromFailure(c, r);
  const d = parseJson<{ name?: string; company?: { name?: string } }[]>(r.body);
  if (!Array.isArray(d)) return { ...c, status: "not_found", detail: "no JSON feed" };
  return ok(c, d.length, `${d.length} positions`, {
    name: d.find((p) => p.company?.name)?.company?.name ?? null,
    sample: d.slice(0, 15).map((p) => p.name ?? "").join(" | "),
  });
};

/** HTML-only platforms: the page must load; job links are counted when they are recognisable. */
function htmlChecker(ats: AtsType, pageUrl: (token: string) => string, jobLink?: RegExp, countRe?: RegExp[]): Checker {
  return async (f, token) => {
    const url = pageUrl(token);
    const c = base(ats, token, url);
    // Company careers sites are rate-limited per host ("html:<host>"); vendor hosts use their vendor's gate.
    const r = await f.fetch(url, { group: `html:${hostOf(url) ?? ""}` });
    if (r.status < 200 || r.status >= 300) return fromFailure(c, r);
    const expected = hostOf(url);
    const final = hostOf(r.finalUrl);
    if (expected && final && registrableDomain(expected) !== registrableDomain(final) && SUBDOMAIN_FAMILY.has(ats)) {
      return { ...c, status: "not_found", detail: `redirected to ${r.finalUrl}` };
    }
    let openJobs: number | null = null;
    for (const re of countRe ?? []) {
      const m = r.body.match(re);
      if (m) {
        openJobs = Number(m[1]);
        break;
      }
    }
    if (openJobs === null && jobLink) {
      const links = new Set([...r.body.matchAll(jobLink)].map((m) => m[0]));
      if (links.size > 0) openJobs = links.size;
    }
    const title = htmlTitle(r.body);
    return ok(c, openJobs, `page OK (${r.status})${openJobs !== null ? `, ${openJobs} jobs` : ""}`, {
      name: null,
      sample: `${title ?? ""} | ${stripHtml(r.body).slice(0, 2000)}`,
      extra: { finalUrl: r.finalUrl, title },
    });
  };
}

const SUBDOMAIN_FAMILY = new Set<AtsType>(["teamtailor", "freshteam", "zoho_recruit", "keka", "darwinbox"]);

const teamtailor = htmlChecker(
  "teamtailor",
  (t) => (isUrl(t) ? `${new URL(t).origin}/jobs` : `https://${t}.teamtailor.com/jobs`),
  /\/jobs\/\d+-[a-z0-9-]+/gi,
);
const freshteam = htmlChecker("freshteam", (t) => (isUrl(t) ? t : `https://${t}.freshteam.com/jobs`), /\/jobs\/[A-Za-z0-9_-]{6,}\/[a-z0-9-]+/gi);
const zohoRecruit = htmlChecker("zoho_recruit", (t) => (isUrl(t) ? t : `https://${t}.zohorecruit.com/jobs/Careers`));
const keka = htmlChecker("keka", (t) => (isUrl(t) ? t : `https://${t}.keka.com/careers/`));
const darwinbox = htmlChecker("darwinbox", (t) => (isUrl(t) ? t : `https://${t}.darwinbox.in/ms/candidate/careers`));

export interface WorkdayFacetValue {
  descriptor?: string;
  id?: string;
  count?: number;
  facetParameter?: string;
  values?: WorkdayFacetValue[];
}

export function workdayIndiaFacet(facets: WorkdayFacetValue[]): { parameter: string; id: string; jobs: number } | null {
  const walk = (list: WorkdayFacetValue[], param: string | undefined): { parameter: string; id: string; jobs: number } | null => {
    for (const f of list) {
      const p = f.facetParameter ?? param;
      if (f.values) {
        const hit = walk(f.values, p);
        if (hit) return hit;
      } else if (p && /country|locationhierarchy1/i.test(p) && /^india$/i.test(f.descriptor ?? "") && f.id) {
        return { parameter: p, id: f.id, jobs: f.count ?? 0 };
      }
    }
    return null;
  };
  return walk(facets, undefined);
}

export function parseWorkdayToken(token: string): { origin: string; tenant: string; site: string } | null {
  const m = token.match(/^https:\/\/(([a-z0-9-]+)\.wd\d+\.myworkdayjobs\.com)\/([A-Za-z0-9_.-]+)$/);
  return m ? { origin: `https://${m[1]}`, tenant: m[2]!, site: m[3]! } : null;
}

const workday: Checker = async (f, token) => {
  const p = parseWorkdayToken(token);
  if (!p) return { ...base("workday", token, token), detail: "bad token" };
  const url = `${p.origin}/wday/cxs/${p.tenant}/${p.site}/jobs`;
  const c = base("workday", token, url);
  const r = await f.fetch(url, {
    method: "POST",
    group: "workday",
    headers: { ...JSON_HEADERS, "content-type": "application/json" },
    body: JSON.stringify({ appliedFacets: {}, limit: 1, offset: 0, searchText: "" }),
  });
  if (r.status !== 200) return fromFailure(c, r);
  const d = parseJson<{ total?: number; jobPostings?: { title?: string; externalPath?: string }[]; facets?: WorkdayFacetValue[] }>(r.body);
  if (!d || typeof d.total !== "number") return { ...c, detail: "unexpected JSON" };
  let openJobs = d.total;
  const facets = d.facets ?? [];
  if (d.total >= 2000) {
    // Workday caps `total` at 2000; exclusive facets (time type / worker type) carry the real size.
    for (const fct of facets) {
      if (!/timeType|workerSubType/i.test(fct.facetParameter ?? "") || !fct.values) continue;
      const sum = fct.values.reduce((s, v) => s + (v.count ?? 0), 0);
      openJobs = Math.max(openJobs, sum);
    }
  }
  const india = workdayIndiaFacet(facets);
  return ok(c, openJobs, `${openJobs} jobs${india ? ` (${india.jobs} in India)` : ""}`, {
    sample: (d.jobPostings ?? []).map((j) => `${j.title ?? ""} ${j.externalPath ?? ""}`).join(" | "),
    extra: india ? { workdayIndiaFacet: { parameter: india.parameter, id: india.id }, indiaJobs: india.jobs } : undefined,
  });
};

export function parseOracleToken(token: string): { origin: string; site: string } | null {
  const m = token.match(/^(https:\/\/[a-z0-9.-]+)\/hcmUI\/CandidateExperience\/[a-z]{2}(?:-[A-Z]{2})?\/sites\/([A-Za-z0-9_-]+)$/);
  return m ? { origin: m[1]!, site: m[2]! } : null;
}

const oracle: Checker = async (f, token) => {
  const p = parseOracleToken(token);
  if (!p) return { ...base("oracle", token, token), detail: "bad token" };
  const url = `${p.origin}/hcmRestApi/resources/latest/recruitingCEJobRequisitions?onlyData=true&finder=findReqs;siteNumber=${p.site},limit=1`;
  const c = base("oracle", token, url);
  const r = await f.fetch(url, { group: "oracle", headers: JSON_HEADERS });
  if (r.status !== 200) return fromFailure(c, r);
  const d = parseJson<{ items?: { TotalJobsCount?: number; requisitionList?: { Title?: string }[] }[] }>(r.body);
  const total = d?.items?.[0]?.TotalJobsCount;
  if (typeof total !== "number") return { ...c, detail: "unexpected JSON" };
  if (total === 0) return { ...c, status: "not_found", detail: "0 requisitions on this site number" };
  return ok(c, total, `${total} requisitions`, { sample: (d?.items?.[0]?.requisitionList ?? []).map((x) => x.Title ?? "").join(" | ") });
};

const eightfold: Checker = async (f, token) => {
  const [hostUrl, domain] = token.split("|") as [string, string | undefined];
  const url = `${hostUrl}/api/apply/v2/jobs?domain=${encodeURIComponent(domain ?? "")}&start=0&num=1`;
  const c = base("eightfold", token, url);
  if (!domain) return { ...c, detail: "bad token" };
  const r = await f.fetch(url, { group: "eightfold", headers: JSON_HEADERS });
  if (r.status !== 200) return fromFailure(c, r);
  const d = parseJson<{ count?: number; positions?: { name?: string; location?: string }[]; branding?: { companyName?: string } }>(r.body);
  if (!d || typeof d.count !== "number") return { ...c, status: "not_found", detail: "no Eightfold jobs API at this host/domain" };
  if (d.count === 0) return { ...c, status: "not_found", detail: "0 positions for this domain" };
  return ok(c, d.count, `${d.count} positions`, {
    name: d.branding?.companyName ?? null,
    sample: (d.positions ?? []).map((x) => `${x.name ?? ""} ${x.location ?? ""}`).join(" | "),
  });
};

/** URL-token platforms (successfactors/phenom/icims/avature/taleo/jsonld/custom): the careers site must load. */
const PHENOM_COUNT = [/"totalHits"\s*:\s*(\d+)/, /"totalJobs"\s*:\s*(\d+)/, /"jobsCount"\s*:\s*(\d+)/];
const careersSite = (ats: AtsType): Checker => htmlChecker(ats, (t) => t, undefined, ats === "phenom" ? PHENOM_COUNT : [/"totalJobs"\s*:\s*(\d+)/]);

const CHECKERS: Record<AtsType, Checker> = {
  greenhouse,
  lever,
  ashby,
  smartrecruiters,
  workable,
  recruitee,
  bamboohr,
  personio,
  breezy,
  teamtailor,
  freshteam,
  zoho_recruit: zohoRecruit,
  keka,
  darwinbox,
  workday,
  oracle,
  eightfold,
  successfactors: careersSite("successfactors"),
  phenom: careersSite("phenom"),
  icims: careersSite("icims"),
  avature: careersSite("avature"),
  taleo: careersSite("taleo"),
  jsonld: careersSite("jsonld"),
  custom: careersSite("custom"),
};

/** Checks one board, using the check cache unless `fresh`. Transient errors are never cached. */
export async function checkBoard(f: Fetcher, ats: AtsType, token: string, opts: CheckOptions = {}): Promise<BoardCheck> {
  const key = createHash("sha1").update(`${ats}\n${token}\n${opts.withName ? 1 : 0}`).digest("hex");
  const dir = join(CHECK_DIR, ats);
  const file = join(dir, `${key}.json`);
  const ttl = opts.ttlMs ?? 20 * 3_600_000;
  if (!opts.fresh && existsSync(file)) {
    try {
      const hit = JSON.parse(readFileSync(file, "utf8")) as BoardCheck;
      if (Date.now() - Date.parse(hit.checkedAt) < ttl) return hit;
    } catch {
      /* re-check */
    }
  }
  let result: BoardCheck;
  try {
    result = await CHECKERS[ats](f, token, opts);
  } catch (e) {
    result = { ...base(ats, token, ""), detail: `exception: ${e instanceof Error ? e.message : String(e)}` };
  }
  result.sample = result.sample.slice(0, 6000);
  if (result.status !== "error") {
    mkdirSync(dir, { recursive: true });
    writeFileSync(file, JSON.stringify(result));
  }
  return result;
}

/* ─────────────────────────── does this board belong to the company? ─────────────────────────── */

export type Verdict = "match" | "mismatch" | "unknown";

export interface CompanyLike {
  name: string;
  domain: string | null;
  /** Other names the company trades or registers under ("Dreamplug Technologies" for CRED). */
  aka?: readonly string[];
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const CAREERS_AFFIX = /^(?:careersat|lifeat|workat|joinus|careers?|jobs?|life|join|work|team|talent|hiring)?(.+?)(?:careers?|jobs?|hiring|talent|team|life|hq|global|india|group|inc)?$/;

/**
 * How a host relates to the company's domain: "same" (equal, or a careers brand domain such as
 * pinterestcareers.com / careersatdoordash.com), "neutral" (same name, other TLD: cohere.ai vs cohere.com —
 * could be either), "different" (circleci.com is not circle.com).
 */
export function domainRelation(host: string, companyDomain: string): "same" | "neutral" | "different" {
  const reg = registrableDomain(host);
  const dom = registrableDomain(companyDomain);
  if (reg === dom) return "same";
  const a = reg.split(".")[0] ?? reg;
  const b = dom.split(".")[0] ?? dom;
  if (a === b) return "neutral";
  const core = (x: string): string => x.match(CAREERS_AFFIX)?.[1] ?? x;
  if ((core(a) === b || core(b) === a) && Math.min(a.length, b.length) >= 4) return "same";
  return "different";
}

export function judgeBoard(check: BoardCheck, company: CompanyLike): { verdict: Verdict; why: string } {
  const names = [company.name, ...(company.aka ?? [])];
  const domain = company.domain ? registrableDomain(company.domain) : null;
  const site = normalizeDomain(check.website);
  const jobHosts = ((check.extra?.["jobHosts"] as string[] | undefined) ?? []).filter((h) => !ATS_VENDOR_HOST.test(h));
  const text = check.sample.toLowerCase();

  // 1. Positive domain evidence: the board itself points at the company's domain.
  const siteRel = site && domain ? domainRelation(site, domain) : null;
  if (siteRel === "same") return { verdict: "match", why: `website ${site}` };
  const hostRels = domain ? jobHosts.map((h) => domainRelation(h, domain)) : [];
  if (hostRels.includes("same")) return { verdict: "match", why: `job URLs on ${domain}` };
  if (domain && text.includes(domain)) return { verdict: "match", why: `"${domain}" in postings` };
  // 2. Negative domain evidence beats a name match (a same-named company elsewhere).
  if (siteRel === "different") return { verdict: "mismatch", why: `board website is ${site}, not ${domain}` };
  if (hostRels.length > 0 && hostRels.every((r) => r === "different")) return { verdict: "mismatch", why: `job URLs on ${jobHosts[0]}, not ${domain}` };
  // 3. Name evidence: only meaningful when the board actually has postings (empty boards are often squatted).
  const nameHit = check.name && names.some((n) => namesMatch(n, check.name!));
  if (nameHit && check.openJobs === 0) return { verdict: "unknown", why: `empty board named "${check.name}"` };
  if (nameHit) return { verdict: "match", why: `name "${check.name}"${siteRel === "neutral" ? ` (website ${site})` : ""}` };
  // A board that names a different company isn't rescued by a passing mention in its text ("Klyomuse" ≠ Clio).
  if (check.name) return { verdict: "mismatch", why: `board belongs to "${check.name}"` };
  for (const n of names) {
    const clean = n.trim();
    if (clean.replace(/[^a-z0-9]/gi, "").length < 4) continue;
    if (new RegExp(`(^|[^a-z0-9])${escapeRe(clean.toLowerCase())}($|[^a-z0-9])`).test(text)) return { verdict: "match", why: `"${clean}" in postings` };
  }
  if (check.name) return { verdict: "mismatch", why: `board belongs to "${check.name}"` };
  return { verdict: "unknown", why: "no name/domain evidence" };
}

function squash(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Does an ATS tenant label ("synopsys" in synopsys.avature.net) plausibly belong to the company? */
export function tenantPlausible(tenant: string, c: { slug: string; name: string; domain: string | null; aka: readonly string[] }): boolean {
  const t = squash(tenant);
  if (t.length < 2) return false;
  const names = [c.name, ...c.aka];
  const keys = [c.slug, c.domain?.split(".")[0] ?? "", ...names, ...names.map((n) => coreName(n))].map(squash).filter((k) => k.length >= 2);
  return keys.some((k) => {
    if (k === t) return true;
    const [short, long] = k.length <= t.length ? [k, t] : [t, k];
    return short.length >= 3 && short.length >= 0.4 * long.length && long.includes(short);
  });
}
