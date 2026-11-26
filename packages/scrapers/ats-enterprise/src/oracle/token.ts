import { attr } from "../lib/html";

export interface OracleSite {
  /** REST host origin, e.g. "https://eeho.fa.us2.oraclecloud.com" */
  apiBase: string;
  siteNumber: string;
  lang: string;
  /** Public site base that "/job/{id}" is appended to (vanity domain when the company uses one). */
  publicBase: string;
  /** First DNS label of the REST host ("eeho") — scopes requisition ids. */
  pod: string;
}

export interface OracleTokenParts {
  url: URL;
  /** Path site code (equals siteNumber on oraclecloud hosts; may be a vanity code like "Honeywell"). */
  siteCode: string | null;
  lang: string;
  /** true when the token is already a canonical https://*.oraclecloud.com/hcmUI/CandidateExperience URL. */
  canonical: boolean;
}

export function parseOracleToken(token: string): OracleTokenParts {
  let url: URL;
  try {
    url = new URL(token.trim());
  } catch {
    throw new Error(`oracle: token is not a URL: "${token}"`);
  }
  const m = /\/(?:hcmUI\/CandidateExperience\/)?([a-z]{2}(?:-[A-Za-z]{2,4})?)\/sites\/([^/?#]+)/i.exec(url.pathname);
  const canonical = /\.oraclecloud\.com$/i.test(url.hostname) && /\/hcmUI\/CandidateExperience\//i.test(url.pathname) && Boolean(m);
  return { url, siteCode: m?.[2] ? decodeURIComponent(m[2]) : null, lang: m?.[1] ?? "en", canonical };
}

const podOf = (apiBase: string): string => new URL(apiBase).hostname.split(".")[0] ?? new URL(apiBase).hostname;

/** Canonical oraclecloud token → site, without any network call. */
export function siteFromCanonical(parts: OracleTokenParts): OracleSite {
  if (!parts.siteCode) throw new Error(`oracle: no /sites/{siteNumber} in "${parts.url.toString()}"`);
  const apiBase = parts.url.origin;
  return {
    apiBase,
    siteNumber: parts.siteCode,
    lang: parts.lang,
    publicBase: `${apiBase}/hcmUI/CandidateExperience/${parts.lang}/sites/${parts.siteCode}`,
    pod: podOf(apiBase),
  };
}

/**
 * Vanity career domains (careers.ti.com/en/sites/CX, careers.honeywell.com/en/sites/Honeywell) are
 * Oracle CX front-ends; the page declares the REST host and the real site number:
 *   data-apibaseurl="https://edbz.fa.us2.oraclecloud.com:443" data-sitenumber="CX" data-vanitybaseurl="https://careers.ti.com/"
 */
export function siteFromPage(html: string, pageUrl: string, parts: OracleTokenParts): OracleSite | null {
  const tag = /<[^>]+data-apibaseurl\s*=[^>]*>/i.exec(html)?.[0];
  if (!tag) return null;
  const api = attr(tag, "data-apibaseurl");
  const siteNumber = attr(tag, "data-sitenumber");
  if (!api || !siteNumber) return null;
  let apiBase: string;
  try {
    const u = new URL(api);
    apiBase = `${u.protocol}//${u.hostname}${u.port && u.port !== "443" ? `:${u.port}` : ""}`;
  } catch {
    return null;
  }
  const vanity = attr(tag, "data-vanitybaseurl");
  const page = new URL(pageUrl);
  const siteCode = parts.siteCode ?? siteNumber;
  const publicOrigin = vanity ? new URL(vanity).origin : page.origin;
  const publicBase = /\.oraclecloud\.com$/i.test(new URL(publicOrigin).hostname)
    ? `${apiBase}/hcmUI/CandidateExperience/${parts.lang}/sites/${siteNumber}`
    : `${publicOrigin}/${parts.lang}/sites/${siteCode}`;
  return { apiBase, siteNumber, lang: parts.lang, publicBase, pod: podOf(apiBase) };
}
