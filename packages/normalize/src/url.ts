import { ATS_HOSTS, JOB_BOARD_HOSTS, MULTI_LABEL_SUFFIXES, NON_OFFICIAL_HOSTS } from "./data/hosts";
import { asString } from "./text";

/* ─────────────────────────── Parsing helpers ─────────────────────────── */

const PARSE_MEMO = new Map<string, URL | null>();

/**
 * Parse an absolute http(s) URL; tolerates "www.x.com/…" and "//x.com/…". Never throws.
 * Results for base-less string input are memoized and shared: callers must not mutate the returned URL.
 */
export function parseHttpUrl(input: unknown, base?: string | null): URL | null {
  if (!base && typeof input === "string") {
    const hit = PARSE_MEMO.get(input);
    if (hit !== undefined) return hit;
    const u = parseHttpUrlUncached(input, null);
    if (PARSE_MEMO.size >= 512) PARSE_MEMO.clear();
    PARSE_MEMO.set(input, u);
    return u;
  }
  return parseHttpUrlUncached(input, base ?? null);
}

function parseHttpUrlUncached(input: unknown, base: string | null): URL | null {
  let s = asString(input).trim().replace(/ /g, "%20");
  if (!s || s.length > 4000 || /\s/.test(s)) return null;
  if (s.startsWith("//")) s = `https:${s}`;
  else if (/^www\./i.test(s)) s = `https://${s}`;
  try {
    const u = base ? new URL(s, base) : new URL(s);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    if (!u.hostname || !u.hostname.includes(".")) return null;
    return u;
  } catch {
    return null;
  }
}

/** Absolute http(s) URL string or null (used for applyUrl / sourceUrl validation). */
export function normalizeHttpUrl(input: unknown, base?: string | null): string | null {
  const u = parseHttpUrl(input, base);
  return u ? u.toString() : null;
}

const HOST_MEMO = new Map<string, string>();

export function hostOf(url: string | URL | null | undefined): string {
  if (!url) return "";
  if (typeof url === "string") {
    const hit = HOST_MEMO.get(url);
    if (hit !== undefined) return hit;
    const u = parseHttpUrl(url);
    const host = u ? u.hostname.toLowerCase().replace(/^www\d*\./, "").replace(/\.$/, "") : "";
    if (HOST_MEMO.size >= 512) HOST_MEMO.clear();
    HOST_MEMO.set(url, host);
    return host;
  }
  return url.hostname.toLowerCase().replace(/^www\d*\./, "").replace(/\.$/, "");
}

function hostMatches(host: string, suffixes: readonly string[]): boolean {
  for (const sfx of suffixes) if (host === sfx || host.endsWith(`.${sfx}`)) return true;
  return false;
}

/** eTLD+1 approximation: "careers.google.com" → "google.com", "jobs.tcs.co.in" → "tcs.co.in". */
export function registrableDomain(hostInput: string): string {
  const host = hostInput.toLowerCase().replace(/^www\d*\./, "").replace(/\.$/, "");
  const labels = host.split(".").filter(Boolean);
  if (labels.length <= 2) return labels.join(".");
  const last2 = labels.slice(-2).join(".");
  return MULTI_LABEL_SUFFIXES.has(last2) ? labels.slice(-3).join(".") : last2;
}

export function isAtsHost(url: string | URL): boolean {
  return hostMatches(hostOf(url), ATS_HOSTS);
}
export function isJobBoardHost(url: string | URL): boolean {
  return hostMatches(hostOf(url), JOB_BOARD_HOSTS);
}
export function isNonOfficialHost(url: string | URL): boolean {
  const u = typeof url === "string" ? parseHttpUrl(url) : url;
  if (!u) return true;
  const host = hostOf(u);
  if (hostMatches(host, NON_OFFICIAL_HOSTS) || host.endsWith(".invalid") || host === "invalid") return true;
  // Google redirect links ("google.com/url?q=…") are wrappers, not postings.
  return host === "google.com" && u.pathname.startsWith("/url");
}
/** Official = an ATS board or a company's own site (not a job board, aggregator, shortener, social or form host). */
export function isOfficialHost(url: string | URL): boolean {
  const host = hostOf(url);
  if (!host) return false;
  return !isJobBoardHost(url) && !isNonOfficialHost(url);
}

/* ─────────────────────────── canonicalUrl ─────────────────────────── */

const TRACKING_PARAMS = new Set([
  "gclid", "gclsrc", "fbclid", "msclkid", "dclid", "yclid", "twclid", "ttclid", "li_fat_id", "mc_cid", "mc_eid",
  "_hsenc", "_hsmi", "hsctatracking", "igshid", "ref", "referrer", "referer", "ref_src", "refsrc", "src", "source",
  "sourcetype", "source_type", "gh_src", "lever-source", "lever-source[]", "lever-origin", "trk", "trkinfo",
  "trackingid", "refid", "tracking_id", "cmp", "campaign", "campaignid", "ccuid", "sid", "sessionid", "session",
  "jsessionid", "_ga", "_gl", "share", "shared", "shareid", "origin", "via", "clickid", "click_id", "affid", "aff_id",
  "affiliate", "channel", "medium", "jobsource", "jobboard", "iis", "iisn", "codes", "feed", "sc_cid", "cid",
  "ei", "ved", "usg", "sa", "rcm", "eid", "lipi", "midtoken", "midsig", "trackingcode", "applysource", "apply_source",
  "jobpipeline", "jobboardsource", "utm", "amp",
]);

function isTrackingParam(key: string): boolean {
  const k = key.toLowerCase();
  return k.startsWith("utm_") || k.startsWith("utm-") || TRACKING_PARAMS.has(k);
}

/**
 * Canonical URL: https, lower-case host without "www", no hash, no tracking params, remaining params sorted,
 * no trailing slash. Invalid input → trimmed lower-case string (never throws).
 */
export function canonicalUrl(input: unknown): string {
  const raw = asString(input).trim();
  const u = parseHttpUrl(raw);
  if (!u) return raw.toLowerCase();
  const host = hostOf(u);
  const port = u.port && u.port !== "443" && u.port !== "80" ? `:${u.port}` : "";
  let path = u.pathname.replace(/;jsessionid=[^/]*/i, "").replace(/\/{2,}/g, "/");
  if (path.length > 1) path = path.replace(/\/+$/, "");
  if (path === "/") path = "";
  const params = [...u.searchParams.entries()]
    .filter(([k, v]) => !isTrackingParam(k) && v !== "")
    .sort(([a, av], [b, bv]) => (a === b ? (av < bv ? -1 : av > bv ? 1 : 0) : a < b ? -1 : 1));
  const qs = new URLSearchParams(params).toString();
  // SPA hash routes ("#/jobs/123", "#!/job/abc") identify the page, unlike fragments ("#apply").
  const route = /^#!?\//.test(u.hash) ? u.hash.replace(/\/+$/, "") : "";
  return `https://${host}${port}${path}${qs ? `?${qs}` : ""}${route}`;
}

/** Drop only marketing/tracking params from an apply link (keeps everything an ATS may need). */
export function stripTracking(input: string): string {
  const shared = parseHttpUrl(input);
  if (!shared) return input;
  if (!/[?&](?:utm_|gclid|fbclid|msclkid|mc_cid|mc_eid|_hs|igshid)/i.test(shared.search)) return input;
  const u = new URL(shared.toString());
  let changed = false;
  for (const k of [...u.searchParams.keys()]) {
    const lk = k.toLowerCase();
    if (lk.startsWith("utm_") || ["gclid", "fbclid", "msclkid", "mc_cid", "mc_eid", "_hsenc", "_hsmi", "igshid"].includes(lk)) {
      u.searchParams.delete(k);
      changed = true;
    }
  }
  return changed ? u.toString() : input;
}

/* ─────────────────────────── canonicalJobKey ─────────────────────────── */

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

function param(u: URL, ...names: string[]): string | null {
  for (const [k, v] of u.searchParams) {
    if (names.includes(k.toLowerCase()) && v.trim()) return v.trim();
  }
  return null;
}

function seg(path: string): string[] {
  return path.split("/").filter(Boolean).map((s) => {
    try {
      return decodeURIComponent(s);
    } catch {
      return s;
    }
  });
}

type KeyRule = (u: URL, host: string) => string | null;

const RULES: readonly KeyRule[] = [
  // Greenhouse: gh_jid on any host (company sites embedding Greenhouse), boards, embeds, API.
  (u, host) => {
    const jid = param(u, "gh_jid");
    if (jid && /^\d{3,}$/.test(jid)) return `greenhouse:${jid}`;
    if (!host.endsWith("greenhouse.io")) return null;
    const m = /\/jobs\/(\d{3,})/.exec(u.pathname);
    if (m) return `greenhouse:${m[1]}`;
    const token = param(u, "token");
    if (token && /^\d{3,}$/.test(token)) return `greenhouse:${token}`;
    return null;
  },
  (u, host) => {
    if (!host.endsWith("lever.co")) return null;
    const m = UUID.exec(u.pathname);
    return m ? `lever:${m[0].toLowerCase()}` : null;
  },
  (u, host) => {
    const jid = param(u, "ashby_jid");
    if (jid && UUID.test(jid)) return `ashby:${(UUID.exec(jid) as RegExpExecArray)[0].toLowerCase()}`;
    if (!host.endsWith("ashbyhq.com")) return null;
    const m = UUID.exec(u.pathname);
    return m ? `ashby:${m[0].toLowerCase()}` : null;
  },
  (u, host) => {
    if (!host.endsWith("smartrecruiters.com")) return null;
    const m = /\/(?:postings\/)?(\d{9,})(?:[-/]|$)/.exec(u.pathname) ?? /\/postings\/([0-9a-f-]{36})/i.exec(u.pathname);
    return m ? `smartrecruiters:${(m[1] as string).toLowerCase()}` : null;
  },
  (u, host) => {
    if (!host.endsWith("workable.com")) return null;
    const m = /\/j\/([0-9A-F]{6,})/i.exec(u.pathname) ?? /\/view\/([0-9a-z-]{8,})/i.exec(u.pathname) ?? /\/jobs\/(\d{4,})/.exec(u.pathname);
    return m ? `workable:${(m[1] as string).toUpperCase()}` : null;
  },
  // Workday: <tenant>.wdN.myworkdayjobs.com/<site>/job/<loc>/<Title>_JR123456  (or myworkdaysite.com/recruiting/<tenant>/…)
  (u, host) => {
    const wd = /^([a-z0-9-]+)\.wd\d+\.myworkday(?:jobs|site)\.com$/.exec(host);
    const site = /(?:^|\.)myworkday(?:jobs|site)\.com$/.test(host);
    if (!wd && !site) return null;
    const parts = seg(u.pathname);
    let tenant = wd ? (wd[1] as string) : null;
    const ri = parts.indexOf("recruiting");
    if (ri >= 0 && parts[ri + 1]) tenant = (parts[ri + 1] as string).toLowerCase();
    if (!tenant) return null;
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i] as string;
      const us = p.lastIndexOf("_");
      if (us < 0) continue;
      let id = p.slice(us + 1);
      if (!/\d/.test(id) || id.length > 40) continue;
      id = id.replace(/^(.*\d.*)-\d{1,2}$/, "$1");
      return `workday:${tenant}:${id.toUpperCase()}`;
    }
    const jr = param(u, "jobreqid", "jobid");
    return jr ? `workday:${tenant}:${jr.toUpperCase()}` : null;
  },
  // Oracle Recruiting Cloud (CandidateExperience) incl. hash routes on careers.oracle.com.
  (u, host) => {
    const all = `${u.pathname}${u.hash}`;
    if (host.endsWith("oraclecloud.com") && /candidateexperience/i.test(all)) {
      const m = /\/(?:job|requisitions\/preview|requisitions)\/(\d{3,})/i.exec(all);
      return m ? `oracle:${host.split(".")[0]}:${m[1]}` : null;
    }
    if (host === "careers.oracle.com") {
      const m = /\/job\/(\d{3,})/i.exec(all);
      return m ? `oracle:oracle:${m[1]}` : null;
    }
    return null;
  },
  (u, host) => {
    if (host !== "amazon.jobs" && !host.endsWith(".amazon.jobs")) return null;
    const m = /\/jobs\/(\d{4,})/.exec(u.pathname);
    return m ? `amazon:${m[1]}` : null;
  },
  (u, host) => {
    if (host !== "google.com" && host !== "careers.google.com" && !host.endsWith(".google.com")) return null;
    if (!/careers|jobs/.test(u.pathname) && host !== "careers.google.com") return null;
    const m = /\/jobs\/results\/(\d{6,})/.exec(u.pathname);
    if (m) return `google:${m[1]}`;
    const jid = param(u, "jid");
    return jid && /^\d+$/.test(jid) ? `google:${jid}` : null;
  },
  (u, host) => {
    if (!host.endsWith("careers.microsoft.com") && host !== "jobs.careers.microsoft.com") return null;
    const m = /\/job\/(\d{5,})/.exec(u.pathname);
    if (m) return `microsoft:${m[1]}`;
    const pid = param(u, "pid");
    return pid && /^\d+$/.test(pid) ? `microsoft:${pid}` : null;
  },
  // Eightfold: /careers/job/<id> or /careers?pid=<id>&domain=<domain>
  (u, host) => {
    const path = /\/careers\/job\/(\d{6,})/.exec(u.pathname);
    const pid = param(u, "pid");
    if (!host.endsWith("eightfold.ai") && !path && !(pid && /\/careers/.test(u.pathname))) return null;
    const id = path ? path[1] : pid && /^\d+$/.test(pid) ? pid : null;
    if (!id) return null;
    const domain = (param(u, "domain") ?? host).toLowerCase();
    return `eightfold:${domain}:${id}`;
  },
  (u, host) => {
    if (!host.endsWith("internshala.com")) return null;
    const m = /\/(internship|job)s?\/detail\/([^/?#]+)/i.exec(u.pathname);
    if (!m) return null;
    const kind = (m[1] as string).toLowerCase();
    const slug = (m[2] as string).toLowerCase();
    // The trailing 10 digits are the Unix time of the latest (re)post, not a job id (P10 request #2):
    // a repost changes them, so key on the slug.
    const stable = slug.replace(/-?\d{10}$/, "") || slug;
    return `internshala:${kind}:${stable}`;
  },
  (u, host) => {
    if (!host.endsWith("linkedin.com")) return null;
    const m = /\/jobs\/view\/(?:[^/]*?-)?(\d{6,})/.exec(u.pathname);
    if (m) return `linkedin:${m[1]}`;
    const cur = param(u, "currentjobid");
    return cur && /^\d+$/.test(cur) ? `linkedin:${cur}` : null;
  },
  (u, host) => {
    if (!host.endsWith("naukri.com")) return null;
    const m = /-(\d{9,})(?:$|[/?#])/.exec(u.pathname) ?? /\/(\d{9,})(?:$|[/?#])/.exec(u.pathname);
    if (m) return `naukri:${m[1]}`;
    const id = param(u, "jobid", "jid");
    return id ? `naukri:${id}` : null;
  },
  (u, host) => {
    if (!host.endsWith("unstop.com") && !host.endsWith("dare2compete.com")) return null;
    const m = /-(\d{5,})(?:$|[/?#])/.exec(u.pathname) ?? /\/o\/([A-Za-z0-9]{4,})/.exec(u.pathname);
    return m ? `unstop:${m[1]}` : null;
  },
  // Superset (campus placements): the job profile id lives in the hash route.
  (u, host) => {
    if (!host.endsWith("joinsuperset.com")) return null;
    const m = UUID.exec(`${u.pathname}${u.search}${u.hash}`);
    return m ? `superset:${m[0].toLowerCase()}` : null;
  },
  // Other ATSs seen in the registry.
  (u, host) => {
    const sub = host.split(".")[0] ?? "";
    let m: RegExpExecArray | null;
    if (host.endsWith("recruitee.com") && (m = /\/o\/([^/?#]+)/.exec(u.pathname))) return `recruitee:${sub}:${m[1]}`;
    if (host.endsWith("bamboohr.com")) {
      const id = /\/(?:careers|jobs)\/(\d+)/.exec(u.pathname)?.[1] ?? param(u, "id");
      return id ? `bamboohr:${sub}:${id}` : null;
    }
    if (host.endsWith("breezy.hr") && (m = /\/p\/([0-9a-z]{6,})/i.exec(u.pathname))) return `breezy:${m[1]}`;
    if (host.endsWith("teamtailor.com") && (m = /\/jobs\/(\d+)/.exec(u.pathname))) return `teamtailor:${sub}:${m[1]}`;
    if (/personio\.(?:de|com)$/.test(host) && (m = /\/job\/(\d+)/.exec(u.pathname))) return `personio:${sub}:${m[1]}`;
    if (host.endsWith("icims.com") && (m = /\/jobs\/(\d+)/.exec(u.pathname))) return `icims:${host}:${m[1]}`;
    if (/successfactors\.(?:com|eu)$|sapsf\.(?:com|eu)$/.test(host)) {
      const id = param(u, "career_job_req_id", "jobreqid", "jobid");
      return id ? `successfactors:${(param(u, "company") ?? sub).toLowerCase()}:${id}` : null;
    }
    if (host.endsWith("taleo.net")) {
      const id = param(u, "job", "requisition");
      return id ? `taleo:${host}:${id}` : null;
    }
    if (host.endsWith("jobvite.com") && (m = /\/job\/([A-Za-z0-9]{6,})/.exec(u.pathname))) return `jobvite:${m[1]}`;
    if (host.endsWith("keka.com") && (m = /\/jobdetails\/(\d+)/i.exec(u.pathname))) return `keka:${sub}:${m[1]}`;
    if (/darwinbox\.(?:in|com)$/.test(host) && (m = /\/careers\/([0-9a-f]{8,})/i.exec(u.pathname))) return `darwinbox:${sub}:${m[1]}`;
    if (/zohorecruit\.(?:com|in|eu)$/.test(host)) {
      const id = /\/(\d{12,})(?:\/|$)/.exec(u.pathname)?.[1] ?? param(u, "jobid");
      return id ? `zoho_recruit:${id}` : null;
    }
    if (host.endsWith("freshteam.com") && (m = /\/jobs\/([A-Za-z0-9_-]{5,})/.exec(u.pathname))) return `freshteam:${sub}:${m[1]}`;
    if (host.endsWith("indeed.com") || host.endsWith("indeed.co.in")) {
      const jk = param(u, "jk", "vjk");
      return jk ? `indeed:${jk}` : null;
    }
    if (host.includes("glassdoor.")) {
      const id = param(u, "joblistingid", "jl") ?? /_JL(?:IN)?_?(\d{6,})/i.exec(u.pathname)?.[1] ?? null;
      return id ? `glassdoor:${id}` : null;
    }
    if (host.endsWith("wellfound.com") && (m = /\/jobs\/(\d+)/.exec(u.pathname))) return `wellfound:${m[1]}`;
    return null;
  },
];

/**
 * ATS-aware stable key for a job URL: "greenhouse:4012345", "lever:<uuid>", "workday:nvidia:JR1993026",
 * "amazon:2712345", "linkedin:3712345678", … Falls back to canonicalUrl(url).
 */
export function canonicalJobKey(input: unknown): string {
  return memo(KEY_MEMO, input, canonicalJobKeyUncached);
}

/* Small bounded memo: normalizeJob asks about the same apply URL several times (fingerprint, quality, …). */
const KEY_MEMO = new Map<string, string>();
const SPECIFIC_MEMO = new Map<string, boolean>();
function memo<T>(cache: Map<string, T>, input: unknown, fn: (s: string) => T): T {
  const s = asString(input);
  const hit = cache.get(s);
  if (hit !== undefined) return hit;
  const v = fn(s);
  if (cache.size >= 256) cache.clear();
  cache.set(s, v);
  return v;
}

function canonicalJobKeyUncached(input: string): string {
  const u = parseHttpUrl(input);
  if (!u) return canonicalUrl(input);
  const host = hostOf(u);
  for (const rule of RULES) {
    const key = rule(u, host);
    if (key) return key;
  }
  return canonicalUrl(u.toString());
}

/** True when canonicalJobKey recognised an ATS/job-board id (not just the canonical URL). */
export function isAtsJobKey(key: string): boolean {
  return /^[a-z_]+:/.test(key) && !key.startsWith("https://") && !key.startsWith("http://");
}

const GENERIC_SEGMENTS = new Set([
  "careers", "career", "jobs", "job", "join-us", "joinus", "join", "openings", "opportunities", "vacancies",
  "current-openings", "open-positions", "positions", "apply", "hiring", "campus", "university", "students",
  "graduates", "early-careers", "earlycareers", "about", "home", "index", "index.html", "index.php", "en", "en-us",
  "en-in", "en-gb", "us", "in", "search", "search-results", "jobsearch", "job-search", "all-jobs", "results", "life",
  "work-with-us", "workwithus", "team", "internships", "internship", "freshers", "lateral", "experienced",
]);
const GENERIC_SLUG_WORDS =
  /(?:^|[-_])(?:careers?|hiring|campus|drive|recruitment|programs?|programmes?|opportunities|openings|students|graduates|freshers|internships|registration|register|apply-now|job-openings|vacancies|walk-?in-drive|off-campus)(?:$|[-_])/i;
const ID_PARAM =
  /^(?:job|jobid|job_id|jobno|jid|gh_jid|pid|req|reqid|req_id|requisition|requisitionid|posting|postingid|opening|openingid|position|positionid|vacancy|vacancyid|vacancy_id|id|ad|adid|listing|listingid|jk|vjk|career_job_req_id|jobreqid|token|for|code)$/i;

/**
 * Does the URL point at ONE posting (vs. a generic careers/campus page)? Generic pages are shared by many
 * postings, so they must not be used as a dedupe key (they would merge different roles).
 */
export function isJobSpecificUrl(input: unknown): boolean {
  return memo(SPECIFIC_MEMO, input, isJobSpecificUrlUncached);
}

function isJobSpecificUrlUncached(input: string): boolean {
  const u = parseHttpUrl(input);
  if (!u) return false;
  if (isAtsJobKey(canonicalJobKey(u.toString()))) return true;
  for (const [k, v] of u.searchParams) if (ID_PARAM.test(k) && v.trim().length > 0) return true;
  const parts = seg(`${u.pathname}${u.hash.replace(/^#!?/, "/")}`);
  for (const p of parts) {
    if (/\d{5,}/.test(p) || UUID.test(p) || /(?:^|[-_])(?:jr|r|req|job|jid|vac|ref)[-_]?\d{3,}(?:$|[-_])/i.test(p)) return true;
  }
  const last = (parts[parts.length - 1] ?? "").toLowerCase();
  if (!last || GENERIC_SEGMENTS.has(last)) return false;
  if (GENERIC_SLUG_WORDS.test(last)) return false;
  return last.split(/[-_]+/).filter(Boolean).length >= 3 || last.length >= 24;
}

/** Company domain from a URL when it is the company's own site (not an ATS, job board, CDN or social host). */
export function companyDomainFromUrl(input: unknown): string | null {
  const u = parseHttpUrl(input);
  if (!u) return null;
  if (isAtsHost(u) || isJobBoardHost(u) || isNonOfficialHost(u)) return null;
  const host = hostOf(u);
  if (/(?:^|\.)(?:amazonaws\.com|cloudfront\.net|azurewebsites\.net|herokuapp\.com|vercel\.app|netlify\.app|github\.io|pages\.dev|appspot\.com|myshopify\.com|notion\.site)$/.test(host)) return null;
  if (host === "amazon.jobs" || host.endsWith(".amazon.jobs")) return "amazon.com";
  return registrableDomain(host) || null;
}
