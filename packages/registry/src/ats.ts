/**
 * ATS fingerprints and token rules (prompts.md §0.6). Pure and isomorphic: no I/O.
 *
 *   detectAts({ url, html })      → ranked { ats, token } candidates found in a careers page
 *   detectAtsFromUrl(url)         → the board a single URL points at ("https://jobs.lever.co/cred/…" → lever/cred)
 *   isValidToken(ats, token)      → token format check per ATS
 */
import { ATS_TYPES, type AtsType } from "@easyjobs/contract";

export interface AtsDetection {
  ats: AtsType;
  token: string;
  /** The URL/snippet that matched (trimmed). */
  evidence: string;
  /** Higher = stronger signal. URL-level hits score ≥ 100. */
  score: number;
}

export interface DetectInput {
  /** Final page URL after redirects. */
  url: string;
  /** Redirect chain / other URLs that led here. */
  urls?: string[];
  html?: string | null;
  /** Extra first-party script bodies to scan. */
  scripts?: string[];
  /** Company domain, used for Eightfold tokens when the page does not name its domain. */
  domainHint?: string | null;
}

/* ─────────────────────────── Token formats ─────────────────────────── */

const SUBDOMAIN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const HTTPS_URL = /^https:\/\/[a-z0-9.-]+\.[a-z]{2,}(?::\d+)?(?:[/?#][^\s]*)?$/i;

/** ATS types whose token is a subdomain/account (or a full https careers URL when non-standard). */
export const SUBDOMAIN_ATS: readonly AtsType[] = [
  "workable", "recruitee", "bamboohr", "breezy", "teamtailor", "personio", "freshteam", "zoho_recruit", "keka", "darwinbox",
];

/** ATS types whose token is a careers-site URL. */
export const URL_ATS: readonly AtsType[] = ["successfactors", "phenom", "icims", "avature", "taleo", "jsonld", "custom"];

export const TOKEN_RULES: Record<AtsType, { pattern: RegExp; description: string }> = {
  greenhouse: { pattern: /^[a-z0-9][a-z0-9_-]*$/, description: "lowercase board token" },
  lever: { pattern: /^(?:eu:)?[a-z0-9][a-z0-9._-]*$/, description: "site name, optional eu: prefix" },
  ashby: { pattern: /^[A-Za-z0-9][A-Za-z0-9._%-]*$/, description: "job-board name" },
  smartrecruiters: { pattern: /^[A-Za-z0-9][A-Za-z0-9._-]*$/, description: "company identifier" },
  workable: { pattern: SUBDOMAIN, description: "account slug" },
  recruitee: { pattern: SUBDOMAIN, description: "subdomain" },
  bamboohr: { pattern: SUBDOMAIN, description: "subdomain" },
  personio: { pattern: SUBDOMAIN, description: "subdomain" },
  breezy: { pattern: SUBDOMAIN, description: "subdomain" },
  teamtailor: { pattern: SUBDOMAIN, description: "subdomain" },
  freshteam: { pattern: SUBDOMAIN, description: "subdomain" },
  zoho_recruit: { pattern: SUBDOMAIN, description: "subdomain" },
  keka: { pattern: SUBDOMAIN, description: "subdomain" },
  darwinbox: { pattern: SUBDOMAIN, description: "subdomain" },
  workday: {
    pattern: /^https:\/\/[a-z0-9-]+\.wd\d+\.myworkdayjobs\.com\/[A-Za-z0-9_.-]+$/,
    description: "https://<tenant>.wd<N>.myworkdayjobs.com/<site>",
  },
  oracle: {
    pattern: /^https:\/\/[a-z0-9.-]+\/hcmUI\/CandidateExperience\/[a-z]{2}(?:-[A-Z]{2})?\/sites\/[A-Za-z0-9_-]+$/,
    description: "https://<host>/hcmUI/CandidateExperience/<lang>/sites/<siteNumber>",
  },
  eightfold: { pattern: /^https:\/\/[a-z0-9.-]+\.[a-z]{2,}\|[a-z0-9.-]+\.[a-z]{2,}$/, description: "https://<host>|<domain>" },
  successfactors: { pattern: HTTPS_URL, description: "careers site URL" },
  phenom: { pattern: HTTPS_URL, description: "careers site URL" },
  icims: { pattern: HTTPS_URL, description: "careers site URL" },
  avature: { pattern: HTTPS_URL, description: "careers site URL" },
  taleo: { pattern: HTTPS_URL, description: "careers site URL" },
  jsonld: { pattern: HTTPS_URL, description: "careers site or sitemap URL" },
  custom: { pattern: HTTPS_URL, description: "careers URL" },
};

export function isAtsType(value: unknown): value is AtsType {
  return typeof value === "string" && (ATS_TYPES as readonly string[]).includes(value);
}

export function isValidToken(ats: AtsType, token: string): boolean {
  if (typeof token !== "string" || token.length === 0 || token.length > 300 || /\s/.test(token)) return false;
  if (SUBDOMAIN_ATS.includes(ats) && HTTPS_URL.test(token)) return true; // non-standard host → full URL
  return TOKEN_RULES[ats].pattern.test(token);
}

/* ─────────────────────────── Fingerprint rules ─────────────────────────── */

interface Rule {
  ats: AtsType;
  re: RegExp;
  /** Base score per occurrence. */
  score: number;
  /** Builds the token from the match; return null to ignore the match. */
  token: (m: RegExpExecArray, ctx: RuleContext) => string | null;
}

interface RuleContext {
  pageUrl: URL | null;
  haystack: string;
  domainHint: string | null;
}

const RESERVED = {
  greenhouse: new Set(["embed", "v1", "api", "assets", "images", "static", "favicon.ico", "robots.txt", "users", "job_app", "job_board", "boards", "jobs", "internal", "sitemap.xml", "careers", "j", "privacy"]),
  lever: new Set(["assets", "static", "robots.txt", "favicon.ico", "v0", "api", "_next", "sitemap.xml", "jobs", "lever", "search"]),
  ashby: new Set(["api", "static", "embed", "b", "meeting", "_next", "favicon.ico", "robots.txt", "sitemap.xml", "jobs", "careers"]),
  smartrecruiters: new Set(["oneclick-ui", "ni", "static", "sr-jobs", "embed", "api", "favicon.ico", "robots.txt", "widget", "js", "css", "img", "sitemap", "company", "en", "jobs"]),
  workable: new Set(["api", "j", "static", "assets", "www", "apply", "resources", "help", "jobs", "careers-page", "workable", "favicon.ico", "robots.txt", "blog", "status", "marketplace", "widget", "integrations"]),
  sub: new Set(["www", "app", "api", "cdn", "assets", "help", "support", "blog", "status", "static", "docs", "marketing", "partners", "marketplace", "resources", "community", "developer", "developers", "careers-cdn", "attachments", "images", "img", "media", "mail", "email", "go", "info", "about", "login", "auth", "accounts", "my", "dashboard", "admin", "jobs", "hire", "web", "demo", "career", "careers", "integrations", "scripts", "documentation", "status", "s3", "files", "content"]),
  workdaySite: new Set(["wday", "robots.txt", "favicon.ico", "siteMap.xml", "sitemap.xml", "refreshFacet", "assets", "static", "login", "userHome", "intro"]),
};

const LOCALE_SEGMENT = /^[a-z]{2}(?:[-_][a-z]{2,4})?$/i;

/** Locale-ish path segments Workday puts in front of the site name. */
function workdaySiteFrom(seg1: string, seg2: string | undefined): string | null {
  let site = seg1;
  if (LOCALE_SEGMENT.test(seg1) && seg1.length <= 7 && seg2) site = seg2;
  if (!site || RESERVED.workdaySite.has(site) || (LOCALE_SEGMENT.test(site) && site.length <= 5)) return null;
  if (!/^[A-Za-z0-9_.-]+$/.test(site) || /\.(?:js|css|png|svg|ico|xml|json)$/i.test(site)) return null;
  return site;
}

function cleanSub(sub: string): string | null {
  const s = sub.toLowerCase();
  if (RESERVED.sub.has(s) || !SUBDOMAIN.test(s)) return null;
  return s;
}

function pageOrigin(ctx: RuleContext): string | null {
  return ctx.pageUrl ? ctx.pageUrl.origin : null;
}

/** Careers site root for URL-token platforms: origin + a locale base path ("/us/en", "/global/en") when present. */
export function careersSiteBase(url: URL): string {
  const m = url.pathname.match(/^\/((?:[a-z]{2}|global)\/[a-z]{2})(?:\/|$)/i);
  return m ? `${url.origin}/${m[1]}` : `${url.origin}/`;
}

function nearbyEightfoldDomain(ctx: RuleContext): string | null {
  const m =
    ctx.haystack.match(/\/api\/apply\/v2\/jobs[^"'\s<>]*?[?&]domain=([a-z0-9.-]+\.[a-z]{2,})/i) ??
    ctx.haystack.match(/[?&]domain=([a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,})(?=[&"'\s<#]|$)/im) ??
    ctx.haystack.match(/["']domain["']\s*:\s*["']([a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,})["']/i);
  return m ? m[1]!.toLowerCase() : ctx.domainHint;
}

const RULES: Rule[] = [
  /* Greenhouse */
  {
    ats: "greenhouse",
    re: /(?:job-)?boards(?:\.eu)?\.greenhouse\.io\/embed\/job_(?:board|app)(?:\/js)?\?[^"'\s<>]*?\bfor=([A-Za-z0-9_-]+)/gi,
    score: 14,
    token: (m) => m[1]!.toLowerCase(),
  },
  {
    ats: "greenhouse",
    re: /(?:job-)?boards(?:\.eu)?\.greenhouse\.io\/([A-Za-z0-9_-]+)(?=[/?#"'\s<>)\\]|$)/gi,
    score: 10,
    token: (m) => (RESERVED.greenhouse.has(m[1]!.toLowerCase()) ? null : m[1]!.toLowerCase()),
  },
  {
    ats: "greenhouse",
    re: /(?:boards-)?api(?:\.eu)?\.greenhouse\.io\/v1\/boards\/([A-Za-z0-9_-]+)/gi,
    score: 14,
    token: (m) => m[1]!.toLowerCase(),
  },
  /* Lever */
  {
    ats: "lever",
    re: /jobs\.(eu\.)?lever\.co\/([A-Za-z0-9._-]+)(?=[/?#"'\s<>)\\]|$)/gi,
    score: 10,
    token: (m) => (RESERVED.lever.has(m[2]!.toLowerCase()) ? null : `${m[1] ? "eu:" : ""}${m[2]!.toLowerCase()}`),
  },
  {
    ats: "lever",
    re: /api\.(eu\.)?lever\.co\/v0\/postings\/([A-Za-z0-9._-]+)/gi,
    score: 14,
    token: (m) => `${m[1] ? "eu:" : ""}${m[2]!.toLowerCase()}`,
  },
  /* Ashby */
  {
    ats: "ashby",
    re: /jobs\.ashbyhq\.com\/([A-Za-z0-9._%-]+)(?=[/?#"'\s<>)\\]|$)/gi,
    score: 10,
    token: (m) => (RESERVED.ashby.has(m[1]!.toLowerCase()) ? null : m[1]!),
  },
  {
    ats: "ashby",
    re: /api\.ashbyhq\.com\/posting-api\/job-board\/([A-Za-z0-9._%-]+)/gi,
    score: 14,
    token: (m) => m[1]!,
  },
  /* SmartRecruiters */
  {
    ats: "smartrecruiters",
    re: /(?:jobs|careers)\.smartrecruiters\.com\/([A-Za-z0-9._-]+)(?=[/?#"'\s<>)\\]|$)/gi,
    score: 10,
    token: (m) => (RESERVED.smartrecruiters.has(m[1]!.toLowerCase()) ? null : m[1]!),
  },
  {
    ats: "smartrecruiters",
    re: /smartrecruiters\.com\/oneclick-ui\/company\/([A-Za-z0-9._-]+)/gi,
    score: 12,
    token: (m) => m[1]!,
  },
  {
    ats: "smartrecruiters",
    re: /api\.smartrecruiters\.com\/v1\/companies\/([A-Za-z0-9._-]+)/gi,
    score: 14,
    token: (m) => m[1]!,
  },
  /* Workable */
  {
    ats: "workable",
    re: /apply\.workable\.com\/(?:api\/v[13]\/(?:widget\/)?accounts\/)?([A-Za-z0-9_-]+)(?=[/?#"'\s<>)\\]|$)/gi,
    score: 10,
    token: (m) => (RESERVED.workable.has(m[1]!.toLowerCase()) ? null : m[1]!.toLowerCase()),
  },
  {
    ats: "workable",
    re: /\b([a-z0-9][a-z0-9-]*)\.workable\.com(?!\/api)/gi,
    score: 6,
    token: (m) => (RESERVED.workable.has(m[1]!.toLowerCase()) ? null : cleanSub(m[1]!)),
  },
  /* Recruitee / BambooHR / Personio / Breezy / Teamtailor / Freshteam / Keka / Darwinbox */
  { ats: "recruitee", re: /\b([a-z0-9][a-z0-9-]*)\.recruitee\.com/gi, score: 10, token: (m) => (m[1]!.toLowerCase() === "recruitee" ? null : cleanSub(m[1]!)) },
  { ats: "bamboohr", re: /\b([a-z0-9][a-z0-9-]*)\.bamboohr\.com/gi, score: 10, token: (m) => cleanSub(m[1]!) },
  { ats: "personio", re: /\b([a-z0-9][a-z0-9-]*)\.jobs\.personio\.(?:de|com)/gi, score: 10, token: (m) => cleanSub(m[1]!) },
  { ats: "breezy", re: /\b([a-z0-9][a-z0-9-]*)\.breezy\.hr/gi, score: 10, token: (m) => cleanSub(m[1]!) },
  { ats: "teamtailor", re: /\b([a-z0-9][a-z0-9-]*)\.teamtailor\.com/gi, score: 10, token: (m) => cleanSub(m[1]!) },
  {
    ats: "teamtailor",
    re: /teamtailor-cdn\.com|powered by teamtailor|data-teamtailor/gi,
    score: 3,
    token: (_m, ctx) => (ctx.pageUrl && !/teamtailor\.com$/i.test(ctx.pageUrl.hostname) ? pageOrigin(ctx) : null),
  },
  { ats: "freshteam", re: /\b([a-z0-9][a-z0-9-]*)\.freshteam\.com/gi, score: 10, token: (m) => cleanSub(m[1]!) },
  { ats: "keka", re: /\b([a-z0-9][a-z0-9-]*)\.keka\.com\/careers/gi, score: 12, token: (m) => cleanSub(m[1]!) },
  { ats: "keka", re: /\b([a-z0-9][a-z0-9-]*)\.kekahire\.com/gi, score: 8, token: (m) => cleanSub(m[1]!) },
  {
    ats: "darwinbox",
    re: /\b([a-z0-9][a-z0-9-]*)\.darwinbox\.(in|com)(?=[/"'\s<>)\\]|$)/gi,
    score: 10,
    token: (m) => {
      const sub = cleanSub(m[1]!);
      if (!sub) return null;
      return m[2]!.toLowerCase() === "in" ? sub : `https://${sub}.darwinbox.com/ms/candidate/careers`;
    },
  },
  /* Zoho Recruit */
  {
    ats: "zoho_recruit",
    re: /\b([a-z0-9][a-z0-9-]*)\.zohorecruit\.(com|in|eu|com\.au|jp|com\.cn)(?=[/"'\s<>)\\]|$)/gi,
    score: 10,
    token: (m) => {
      const sub = cleanSub(m[1]!);
      if (!sub) return null;
      return m[2]!.toLowerCase() === "com" ? sub : `https://${sub}.zohorecruit.${m[2]!.toLowerCase()}/jobs/Careers`;
    },
  },
  {
    ats: "zoho_recruit",
    re: /ZohoRecruit&(?:amp;)?_hn=|zrecruit-careers|recruit\.zoho\.(?:com|in|eu)\/(?:recruit\/)?(?:Portal|careers)/gi,
    score: 6,
    token: (_m, ctx) => (ctx.pageUrl && !/zohorecruit\./i.test(ctx.pageUrl.hostname) ? `${ctx.pageUrl.origin}/` : null),
  },
  /* Workday */
  {
    ats: "workday",
    re: /\b([a-z0-9-]+)\.(wd\d+)\.myworkdayjobs\.com\/(?:wday\/cxs\/[a-z0-9-]+\/)?([A-Za-z0-9_.-]+)(?:\/([A-Za-z0-9_.-]+))?/gi,
    score: 12,
    token: (m) => {
      const site = workdaySiteFrom(m[3]!, m[4]);
      return site ? `https://${m[1]!.toLowerCase()}.${m[2]!.toLowerCase()}.myworkdayjobs.com/${site}` : null;
    },
  },
  {
    ats: "workday",
    re: /\b(wd\d+)\.myworkdaysite\.com\/(?:[a-z]{2}-[A-Za-z]{2}\/)?recruiting\/([a-z0-9-]+)\/([A-Za-z0-9_.-]+)/gi,
    score: 12,
    token: (m) => {
      const site = workdaySiteFrom(m[3]!, undefined);
      return site ? `https://${m[2]!.toLowerCase()}.${m[1]!.toLowerCase()}.myworkdayjobs.com/${site}` : null;
    },
  },
  /* Oracle Recruiting Cloud */
  {
    ats: "oracle",
    re: /(https?:\/\/[a-z0-9.-]+)\/hcmUI\/CandidateExperience\/([a-z]{2}(?:-[A-Za-z]{2})?)\/sites\/([A-Za-z0-9_-]+)/gi,
    score: 12,
    token: (m) => `${m[1]!.toLowerCase().replace(/^http:/, "https:")}/hcmUI/CandidateExperience/en/sites/${m[3]!}`,
  },
  /* SAP SuccessFactors */
  {
    ats: "successfactors",
    re: /\b(career\d*\.(?:successfactors|sapsf)\.(?:com|eu|cn))\/career\?(?:[^"'\s<>]*?&(?:amp;)?)?company=([A-Za-z0-9_-]+)/gi,
    score: 12,
    token: (m) => `https://${m[1]!.toLowerCase()}/career?company=${m[2]!}`,
  },
  {
    ats: "successfactors",
    re: /\b([a-z0-9-]+\.jobs2web\.com)/gi,
    score: 8,
    token: (m) => `https://${m[1]!.toLowerCase()}/`,
  },
  {
    ats: "successfactors",
    re: /rmkcdn\.successfactors\.com|jobs2web|\bj2w\.(?:init|config)|data-careersite-propertyid/gi,
    score: 5,
    token: (_m, ctx) => (ctx.pageUrl ? careersSiteBase(ctx.pageUrl) : null),
  },
  /* Eightfold */
  {
    ats: "eightfold",
    re: /\b([a-z0-9-]+\.eightfold\.ai)(?=[/"'\s<>)\\]|$)/gi,
    score: 10,
    token: (m, ctx) => {
      const host = m[1]!.toLowerCase();
      if (/^(?:www|app|static|cdn|assets|help|docs)\.eightfold\.ai$/.test(host)) return null;
      const domain = nearbyEightfoldDomain(ctx);
      return domain ? `https://${host}|${domain}` : null;
    },
  },
  {
    ats: "eightfold",
    re: /\/api\/apply\/v2\/jobs|eightfold\.ai|vscdn\.net\/images\/careers/gi,
    score: 4,
    token: (_m, ctx) => {
      if (!ctx.pageUrl) return null;
      const domain = nearbyEightfoldDomain(ctx);
      return domain ? `https://${ctx.pageUrl.hostname.toLowerCase()}|${domain}` : null;
    },
  },
  /* Phenom */
  {
    ats: "phenom",
    re: /\bphApp\b|phenompeople|cdn\.phenom\.com|data-ph-id|phenom-cms/g,
    score: 6,
    token: (_m, ctx) => (ctx.pageUrl ? careersSiteBase(ctx.pageUrl) : null),
  },
  /* iCIMS */
  {
    ats: "icims",
    re: /\b((?:[a-z0-9-]+\.)?[a-z0-9-]+\.icims\.com)(?=[/"'\s<>)\\]|$)/gi,
    score: 10,
    token: (m) => {
      const host = m[1]!.toLowerCase();
      if (/^(?:www|cdn|static|community|developer|developers|login|help|care|assets)\.icims\.com$/.test(host)) return null;
      return `https://${host}/jobs`;
    },
  },
  /* Avature */
  {
    ats: "avature",
    re: /\b([a-z0-9-]+\.avature\.net)(\/[A-Za-z0-9_-]+)?/gi,
    score: 10,
    token: (m) => {
      const host = m[1]!.toLowerCase();
      if (/^(?:www|cdn|static|assets)\.avature\.net$/.test(host)) return null;
      const path = m[2] && !/^\/(?:_|assets|static|js|css|img|images|portal\.(?:js|css))/i.test(m[2]) ? m[2] : "";
      return `https://${host}${path}`;
    },
  },
  {
    ats: "avature",
    re: /avatureCDN|powered by avature|\bavature\b/gi,
    score: 3,
    token: (_m, ctx) => (ctx.pageUrl && !/avature\.net$/i.test(ctx.pageUrl.hostname) ? careersSiteBase(ctx.pageUrl) : null),
  },
  /* Taleo */
  {
    ats: "taleo",
    re: /\b([a-z0-9-]+\.taleo\.net)\/careersection\/([A-Za-z0-9_.-]+)/gi,
    score: 12,
    token: (m) => `https://${m[1]!.toLowerCase()}/careersection/${m[2]!}/jobsearch.ftl`,
  },
  {
    ats: "taleo",
    re: /\b([a-z0-9-]+\.taleo\.net)(?=[/"'\s<>)\\]|$)/gi,
    score: 6,
    token: (m) => (/^(?:www|cdn)\.taleo\.net$/i.test(m[1]!) ? null : `https://${m[1]!.toLowerCase()}/`),
  },
  /* schema.org JobPosting on the page itself */
  {
    ats: "jsonld",
    re: /"@type"\s*:\s*"JobPosting"/g,
    score: 4,
    token: (_m, ctx) => (ctx.pageUrl ? ctx.pageUrl.href : null),
  },
];

/* ─────────────────────────── Detection ─────────────────────────── */

function safeUrl(u: string): URL | null {
  try {
    return new URL(u);
  } catch {
    return null;
  }
}

/** Undo the encodings URLs typically hide behind in HTML/JS: \/ , &amp; , %2F, /. */
export function unescapeForScan(text: string): string {
  let s = text
    .replace(/\\u002[fF]/g, "/")
    .replace(/\\\//g, "/")
    .replace(/&amp;/gi, "&")
    .replace(/&#x2[fF];|&#47;/g, "/")
    .replace(/&quot;/gi, '"');
  if (/%2F|%3A/i.test(s)) s += "\n" + s.replace(/%2F/gi, "/").replace(/%3A/gi, ":").replace(/%3F/gi, "?").replace(/%3D/gi, "=").replace(/%26/gi, "&");
  return s;
}

function runRules(text: string, ctx: RuleContext, bonus: number, out: Map<string, AtsDetection & { hits: number }>): void {
  for (const rule of RULES) {
    rule.re.lastIndex = 0;
    let m: RegExpExecArray | null;
    let perRule = 0;
    while ((m = rule.re.exec(text)) !== null) {
      if (m[0].length === 0) rule.re.lastIndex++;
      if (++perRule > 200) break;
      const token = rule.token(m, ctx);
      if (!token || !isValidToken(rule.ats, token)) continue;
      const key = `${rule.ats}\u0000${token}`;
      const prev = out.get(key);
      const add = rule.score + bonus;
      if (prev) {
        prev.hits++;
        if (prev.hits <= 5 || bonus > 0) prev.score += add;
      } else {
        const start = Math.max(0, m.index - 20);
        out.set(key, { ats: rule.ats, token, evidence: text.slice(start, m.index + m[0].length + 20).replace(/\s+/g, " ").trim(), score: add, hits: 1 });
      }
    }
  }
}

/** All ATS boards a careers page points at, strongest first. */
export function detectAts(input: DetectInput): AtsDetection[] {
  const pageUrl = safeUrl(input.url);
  const found = new Map<string, AtsDetection & { hits: number }>();
  const html = input.html ? unescapeForScan(input.html) : "";
  const scripts = (input.scripts ?? []).map(unescapeForScan).join("\n");
  const haystack = `${html}\n${scripts}`;
  const ctx: RuleContext = { pageUrl, haystack, domainHint: input.domainHint ?? null };
  // URLs we were redirected through are the strongest evidence.
  for (const u of [...new Set([...(input.urls ?? []), input.url])]) runRules(u, ctx, 100, found);
  if (html) runRules(html, ctx, 0, found);
  if (scripts) runRules(scripts, { ...ctx }, 0, found);
  return [...found.values()]
    .map(({ hits: _hits, ...d }) => d)
    .sort((a, b) => b.score - a.score || a.ats.localeCompare(b.ats) || a.token.localeCompare(b.token));
}

/** The single board a URL belongs to, or null. Only URL-shaped evidence counts (no page markers). */
export function detectAtsFromUrl(url: string): AtsDetection | null {
  const u = safeUrl(/^[a-z]+:\/\//i.test(url) ? url : `https://${url}`);
  if (!u) return null;
  const found = new Map<string, AtsDetection & { hits: number }>();
  const ctx: RuleContext = { pageUrl: u, haystack: u.href, domainHint: null };
  runRules(unescapeForScan(u.href), ctx, 100, found);
  const best = [...found.values()]
    .filter((d) => !["jsonld", "phenom", "teamtailor"].includes(d.ats) || d.score >= 110)
    .sort((a, b) => b.score - a.score)[0];
  if (!best) return null;
  const { hits: _hits, ...d } = best;
  return d;
}

/** Hosts that belong to an ATS vendor rather than to the company (never a company domain). */
export const ATS_VENDOR_HOST = /(?:^|\.)(?:greenhouse\.io|lever\.co|ashbyhq\.com|smartrecruiters\.com|workable\.com|recruitee\.com|bamboohr\.com|personio\.(?:de|com)|breezy\.hr|teamtailor\.com|myworkdayjobs\.com|myworkdaysite\.com|oraclecloud\.com|successfactors\.(?:com|eu)|sapsf\.(?:com|eu)|jobs2web\.com|eightfold\.ai|phenompeople\.com|icims\.com|avature\.net|taleo\.net|zohorecruit\.(?:com|in|eu)|keka\.com|darwinbox\.(?:in|com)|freshteam\.com|kekahire\.com)$/i;
