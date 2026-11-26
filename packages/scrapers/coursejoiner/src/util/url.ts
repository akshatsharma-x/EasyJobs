/** URL helpers: parsing, registrable domain, wrapper unwrapping, tracking-param stripping. */

/** Multi-label public suffixes we care about (India-first). Not a full PSL — good enough for brand matching. */
const MULTI_SUFFIXES = new Set([
  "co.in", "net.in", "org.in", "firm.in", "gen.in", "ind.in", "ac.in", "edu.in", "res.in", "gov.in", "nic.in", "mil.in",
  "co.uk", "org.uk", "ac.uk", "gov.uk", "com.au", "net.au", "org.au", "co.nz", "com.sg", "com.my", "co.jp", "co.kr",
  "com.br", "com.mx", "co.za", "com.cn", "com.hk", "com.tw", "com.tr", "com.sa", "co.id", "com.ph", "com.vn", "com.ar",
  "com.eg", "com.pk", "com.bd", "com.np", "com.lk", "ae.org", "com.ng", "co.ke",
]);

/** Hosting platforms where the first label is a tenant (treated as part of the registrable domain). */
const TENANT_SUFFIXES = new Set(["blogspot.com", "wordpress.com", "github.io", "netlify.app", "vercel.app", "pages.dev", "herokuapp.com"]);

export function parseUrl(input: string | null | undefined, base?: string): URL | null {
  if (!input) return null;
  try {
    const u = new URL(input.trim(), base);
    return u.protocol === "http:" || u.protocol === "https:" ? u : null;
  } catch {
    return null;
  }
}

export function hostOf(url: string): string {
  return parseUrl(url)?.hostname.toLowerCase().replace(/^www\d?\./, "") ?? "";
}

/** "jobs.ea.com" → "ea.com" · "careers.tcs.co.in" → "tcs.co.in" · "foo.blogspot.com" → "foo.blogspot.com". */
export function registrableDomain(host: string): string {
  const parts = host.toLowerCase().replace(/\.$/, "").split(".").filter(Boolean);
  if (parts.length <= 2) return parts.join(".");
  const last2 = parts.slice(-2).join(".");
  if (MULTI_SUFFIXES.has(last2) || TENANT_SUFFIXES.has(last2)) return parts.slice(-3).join(".");
  return last2;
}

/** The brand label of a host: "careers.nttdata.com" → "nttdata", "tcs.co.in" → "tcs". */
export function brandLabel(host: string): string {
  const reg = registrableDomain(host);
  return reg.split(".")[0] ?? "";
}

/** True if `host` equals or is a subdomain of `domain`. */
export function hostMatches(host: string, domain: string): boolean {
  const h = host.toLowerCase().replace(/^www\./, "");
  const d = domain.toLowerCase().replace(/^www\./, "");
  return h === d || h.endsWith(`.${d}`);
}

const TRACKING_PARAM = /^(utm_[a-z_]+|gclid|fbclid|msclkid|mc_cid|mc_eid|_hsenc|_hsmi|igshid|yclid|dclid|ref_src|spm|_ga|_gl|gh_src|lever-source|lever-origin|lever-via|trid|publisher|jclickid|jcl|cmpid|campaignid|trackingid|refid|alternatechannel|ebp|recommendedflavor)$/i;
/** Channel-attribution params, dropped only when their value is a channel name or a number. */
const SOURCE_PARAM = /^(source|sourceid|source_id|src|from|ref|referral|referrer|channel)$/i;
const SOURCE_VALUE = /^(?:\d+|linkedin|indeed|naukri|glassdoor|google|facebook|twitter|x|telegram|whatsapp|instagram|coursejoiner|freshers?\w*|offcampus\w*|kickcharm|job ?boards?|jobboard|social|seo\w*|homepage|cluster|jddesktop|jobsearch\w*|career ?site|website|email|sms|share|copy ?link|portal|campaign\w*|external|ext)$/i;

/** Host-specific params that only encode search context. */
const HOST_PARAMS: { host: RegExp; drop: RegExp | "all"; path?: RegExp }[] = [
  { host: /(^|\.)linkedin\.com$/i, path: /^\/jobs\/view\//i, drop: "all" },
  { host: /(^|\.)naukri\.com$/i, drop: /^(src|sid|xp|px|searchid|from|experience)$/i },
  { host: /(^|\.)internshala\.com$/i, drop: /^(referral|ref|source|utm_.*)$/i },
  { host: /(^|\.)indeed\.(?:com|co\.in)$/i, drop: /^(from|tk|vjs|advn|sjdu|adid|xkcb|xpse|xfps)$/i },
  { host: /(^|\.)amazon\.jobs$/i, drop: /^(cmpid|ref|src|source)$/i },
];

/** Remove marketing/tracking query params; keep everything that may identify the job. */
export function stripTracking(input: string): string {
  const u = parseUrl(input);
  if (!u) return input;
  const host = u.hostname.toLowerCase();
  const rule = HOST_PARAMS.find((r) => r.host.test(host) && (!r.path || r.path.test(u.pathname)));
  const keys = [...u.searchParams.keys()];
  let changed = false;
  for (const k of keys) {
    const value = u.searchParams.get(k) ?? "";
    const drop =
      TRACKING_PARAM.test(k) ||
      (rule !== undefined && (rule.drop === "all" || rule.drop.test(k))) ||
      (SOURCE_PARAM.test(k) && SOURCE_VALUE.test(value.trim()));
    if (drop) {
      u.searchParams.delete(k);
      changed = true;
    }
  }
  if (!changed) return u.toString();
  return u.toString().replace(/\?$/, "");
}

/** Query params that commonly carry the real destination in redirect/wrapper URLs. */
const WRAPPER_PARAMS = ["url", "u", "q", "dest", "destination", "redirect", "redirect_url", "redirect_uri", "target", "link", "to", "out", "goto", "ued", "murl", "r", "lnk"];
/** Affiliate / click-tracking redirectors that carry the destination in a query param. */
const WRAPPER_HOSTS = /(^|\.)(?:viglink\.com|skimresources\.com|linksynergy\.com|awin1\.com|linksredirect\.com|cuelinks\.com|anrdoezrs\.net|dpbolvw\.net|jdoqocy\.com|kqzyfj\.com|tkqlhce\.com|go2cloud\.org|shareasale\.com|impact\.com|ojrq\.net|sjv\.io)$/i;

/**
 * Unwraps "wrapper" URLs that embed the real destination in a query param, e.g.
 * google.com/url?q=…, google.com/search?q=https://…, l.facebook.com/l.php?u=…, linkedin.com/redir/redirect?url=….
 * Generic: any URL whose wrapper param holds an absolute http(s) URL on another host and whose path looks like a redirect.
 */
export function unwrapWrapperUrl(input: string): string {
  let current = input;
  for (let depth = 0; depth < 3; depth++) {
    const u = parseUrl(current);
    if (!u) return current;
    const host = u.hostname.toLowerCase();
    const path = u.pathname.toLowerCase();
    const isGoogle = /(^|\.)google\.[a-z.]+$/.test(host) && (path === "/url" || path === "/search" || path === "/amp/s/" || path.startsWith("/amp/s/"));
    const looksRedirect =
      isGoogle ||
      WRAPPER_HOSTS.test(host) ||
      /^(?:redirect|redir|out|go|click|track|clicks|links?)\./.test(host) ||
      /(^|\.)(l\.facebook\.com|lm\.facebook\.com|l\.instagram\.com|out\.reddit\.com|href\.li|t\.umblr\.com|safelinks\.protection\.outlook\.com)$/.test(host) ||
      /\/(redir|redirect|out|outbound|go|goto|exit|link|away|click|track)(\/|\.php|$)/.test(path);
    if (!looksRedirect) return current;
    if (isGoogle && path.startsWith("/amp/s/")) {
      const rest = u.pathname.slice("/amp/s/".length);
      const next = parseUrl(`https://${rest}`);
      if (!next) return current;
      current = next.toString();
      continue;
    }
    let next: string | null = null;
    for (const p of WRAPPER_PARAMS) {
      const v = u.searchParams.get(p);
      if (v && /^https?:\/\//i.test(v.trim())) {
        next = v.trim();
        break;
      }
    }
    if (!next || !parseUrl(next)) return current;
    current = next;
  }
  return current;
}

/** Normalize an href found in content: resolve relative, decode stray entities, unwrap wrappers, drop tracking. */
export function cleanHref(href: string, base: string): string | null {
  const raw = href.trim().replace(/&amp;/g, "&").replace(/^<|>$/g, "");
  if (!raw || /^(mailto|tel|javascript|data|sms|whatsapp|tg):/i.test(raw) || raw.startsWith("#")) return null;
  const u = parseUrl(raw, base);
  if (!u) return null;
  return stripTracking(unwrapWrapperUrl(u.toString()));
}

/** True when the path looks like a specific posting (has an id-like segment) rather than a landing page. */
export function looksJobSpecific(url: string): boolean {
  const u = parseUrl(url);
  if (!u) return false;
  const path = decodeURIComponent(u.pathname);
  const query = u.search;
  if (/[?&](gh_jid|jobid|job_id|jid|requisitionid|reqid|req_id|id|jobreqid|postingid|job|opening|vacancy|jk)=\w{3,}/i.test(query)) return true;
  if (/\b(R|JR|REQ|J)[-_]?\d{3,}\b/i.test(path)) return true;
  if (/\/\d{4,}(\/|$|-)/.test(path) || /[-_]\d{5,}(\/|$)/.test(path) || /[a-z]\d{7,}(\/|$)/i.test(path)) return true;
  if (/\/(?:internships?|jobs?)\/(?:detail|details|view|listing)\/[^/]{6,}/i.test(path)) return true;
  if (/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(path)) return true;
  if (/\/(job|jobs|job-detail|jobdetail|jobdetails|job-listings|positions?|openings?|requisitions?|vacanc(y|ies)|careers\/job|postings?)\/[^/]{6,}/i.test(path)) return true;
  return false;
}

/** True when the URL is just a homepage. */
export function isRootUrl(url: string): boolean {
  const u = parseUrl(url);
  if (!u) return false;
  return (u.pathname === "/" || u.pathname === "") && !u.search;
}
