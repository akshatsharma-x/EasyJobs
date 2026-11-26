import { COMPANY_SOURCE } from "./data/companies";
import { companyDomainFromUrl, hostOf, parseHttpUrl, registrableDomain } from "./url";
import { asString, bag, cleanLine, keyOf, titleCase } from "./text";

interface CompanyAlias {
  name: string;
  domain: string | null;
}

const LEGAL_SUFFIX =
  /(?<![\s,])[\s,]*(?:\(?\s*(?:pvt\.?|private)\s*\)?\s*(?:ltd\.?|limited)|\(\s*p\s*\)\s*(?:ltd\.?|limited)|pte\.?\s*(?:ltd\.?|limited)|pty\.?\s*(?:ltd\.?|limited)|(?:ltd|limited|llp|l\.l\.p\.?|llc|l\.l\.c\.?|inc|incorporated|corp|corporation|plc|p\.l\.c\.?|gmbh|ag|s\.?a\.?s?|b\.?v\.?|n\.?v\.?|s\.?p\.?a\.?|s\.?r\.?l\.?|a\/s|oy|ab|k\.?k\.?|ltda|opc|co)\.?|&\s*co\.?|and\s+co\.?|company\s+limited)\s*$/i;
const REGION_SUFFIX =
  /(?<![\s,\-–])[\s,\-–]*\(?\s*(?:india|india\s+private|india\s+pvt|in|bangalore|bengaluru|hyderabad|pune|chennai|mumbai|gurgaon|gurugram|noida|global|global\s+services|global\s+technology\s+centre|technology\s+centre|technology\s+center|development\s+centre|development\s+center|gcc|r\s*&\s*d|r\s+and\s+d|labs?|services|solutions|technologies|technology|software|systems|tech)\s*\)?\s*$/i;

const ALIASES = new Map<string, CompanyAlias>();
for (const line of COMPANY_SOURCE.split("\n")) {
  const parts = line.split("|").map((p) => p.trim());
  if (parts.length < 3 || !parts[0]) continue;
  const alias: CompanyAlias = { name: parts[0], domain: parts[1] || null };
  ALIASES.set(companyKey(parts[0]), alias);
  for (const a of (parts[2] as string).split(";")) {
    const k = companyKey(a);
    if (k && !ALIASES.has(k)) ALIASES.set(k, alias);
  }
}

/** Number of canonical companies with aliases (for docs/tests). */
export const COMPANY_ALIAS_COUNT = new Set([...ALIASES.values()].map((a) => a.name)).size;

function stripLegal(s: string): string {
  let out = s.trim();
  for (let i = 0; i < 4; i++) {
    const next = out.replace(LEGAL_SUFFIX, "").trim();
    if (next === out || !next) break;
    out = next;
  }
  return out;
}

/** Matching key for company names: legal suffixes dropped, folded, "&" → "and", punctuation removed. */
export function companyKey(name: string): string {
  return keyOf(stripLegal(cleanLine(name)));
}

function lookupAlias(name: string): CompanyAlias | null {
  const base = stripLegal(name);
  const direct = ALIASES.get(keyOf(base));
  if (direct) return direct;
  // "Google India Private Limited", "Microsoft India (R&D)", "Samsung R&D Institute" → strip region words and retry.
  let s = base;
  for (let i = 0; i < 3; i++) {
    const next = stripLegal(s.replace(REGION_SUFFIX, "")).trim();
    if (!next || next === s) break;
    s = next;
    const hit = ALIASES.get(keyOf(s));
    if (hit) return hit;
  }
  return null;
}

/** Canonical company info: alias-resolved name and known domain. */
export function resolveCompany(input: unknown): { name: string; domain: string | null; known: boolean } {
  const cleaned = cleanLine(input).slice(0, 300).replace(/\s*\((?:hiring|urgent|apply now)\)\s*$/i, "");
  if (!cleaned) return { name: "", domain: null, known: false };
  const alias = lookupAlias(cleaned);
  if (alias) return { name: alias.name, domain: alias.domain, known: true };
  let name = stripLegal(cleaned).replace(/\s*\(\s*(?:india|in)\s*\)\s*$/i, "").replace(/[\s,]+$/g, "") || cleaned;
  if (/[A-Z]/.test(name) && !/[a-z]/.test(name) && name.replace(/[^A-Z]/g, "").length > 4) {
    name = name.replace(/[A-Za-z][A-Za-z0-9&.'’-]*/g, (w) => (w.length <= 3 ? w.toUpperCase() : titleCase(w)));
  }
  return { name, domain: null, known: false };
}

/**
 * "Amazon Development Centre (India) Pvt. Ltd." → "Amazon" · "Tata Consultancy Services Limited" → "TCS" ·
 * "Acme Technologies Pvt Ltd" → "Acme Technologies". Empty input → "".
 */
export function cleanCompanyName(input: unknown): string {
  return resolveCompany(input).name;
}

/** Lower-case registrable domain from "https://www.Razorpay.com/careers" / "razorpay.com" / null. */
export function cleanDomain(input: unknown): string | null {
  const s = asString(input).trim().toLowerCase();
  if (!s) return null;
  const u = parseHttpUrl(/^[a-z]+:\/\//.test(s) ? s : `https://${s}`);
  if (!u) return null;
  const host = hostOf(u);
  if (!/^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/.test(host) || /^\d+(?:\.\d+){3}$/.test(host)) return null;
  return registrableDomain(host);
}

/** Company domain: explicit hint > registry > alias table > the apply/source URL when it is the company's own site. */
export function deriveCompanyDomain(opts: {
  hint?: unknown;
  registry?: string | null;
  alias?: string | null;
  urls?: readonly (string | null | undefined)[];
}): string | null {
  const explicit = cleanDomain(opts.hint) ?? cleanDomain(opts.registry) ?? (opts.alias ? cleanDomain(opts.alias) : null);
  if (explicit) return explicit;
  for (const u of opts.urls ?? []) {
    const d = companyDomainFromUrl(u);
    if (d) return d;
  }
  return null;
}

function envToken(): string | null {
  const env = typeof process !== "undefined" ? process.env : undefined;
  const t = env?.LOGO_DEV_TOKEN?.trim();
  return t ? t : null;
}

/** Hosts whose logo URLs expire or need cookies — don't store them. */
const EPHEMERAL_LOGO_HOSTS = /(?:^|\.)(?:licdn\.com|fbcdn\.net|googleusercontent\.com|cdninstagram\.com)$/;

export interface LogoOptions {
  /** Defaults to env LOGO_DEV_TOKEN. Pass null to force the Google favicon. */
  token?: string | null;
  /** Logo URL provided by the source (RawJob.companyLogoUrl). */
  sourceLogoUrl?: string | null;
}

/**
 * LOGO_DEV_TOKEN set → https://img.logo.dev/<domain>?token=…&size=128; otherwise a stable source logo
 * (if any), else the Google favicon https://www.google.com/s2/favicons?domain=<domain>&sz=128. null if no domain/logo.
 */
export function companyLogoUrl(domainInput: unknown, optsInput: LogoOptions = {}): string | null {
  const opts = bag(optsInput);
  const domain = cleanDomain(domainInput);
  const token = opts.token === undefined ? envToken() : opts.token;
  if (domain && token) return `https://img.logo.dev/${domain}?token=${encodeURIComponent(token)}&size=128`;
  const src = parseHttpUrl(opts.sourceLogoUrl);
  if (src && src.protocol === "https:" && !EPHEMERAL_LOGO_HOSTS.test(hostOf(src))) return src.toString();
  if (domain) return `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;
  return null;
}
