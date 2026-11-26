import { COMPANY_TAGS, type CompanyTarget } from "@easyjobs/contract";
import { isAtsType, isValidToken, TOKEN_RULES } from "./ats";

export const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DOMAIN_RE = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/;

function isHttpsUrl(v: unknown): boolean {
  if (typeof v !== "string" || !v.startsWith("https://")) return false;
  try {
    return new URL(v).protocol === "https:";
  } catch {
    return false;
  }
}

/** Problems with one registry entry; [] means valid. */
export function validateCompanyTarget(t: unknown): string[] {
  if (!t || typeof t !== "object") return ["not an object"];
  const c = t as Partial<CompanyTarget> & Record<string, unknown>;
  const e: string[] = [];
  if (typeof c.slug !== "string" || !SLUG_RE.test(c.slug) || c.slug.length > 80) e.push(`slug must be kebab-case: ${String(c.slug)}`);
  if (typeof c.name !== "string" || c.name.trim().length === 0) e.push("name is required");
  if (c.domain !== null && (typeof c.domain !== "string" || !DOMAIN_RE.test(c.domain) || c.domain.startsWith("www."))) {
    e.push(`domain must be null or a bare lowercase host: ${String(c.domain)}`);
  }
  if (!isAtsType(c.ats)) e.push(`ats invalid: ${String(c.ats)}`);
  else if (typeof c.token !== "string" || !isValidToken(c.ats, c.token)) {
    e.push(`token "${String(c.token)}" does not match ${c.ats} format (${TOKEN_RULES[c.ats].description})`);
  } else if (/^https?:/i.test(c.token) && !isHttpsUrl(c.token.split("|")[0])) e.push("token URL must be https");
  if (!isHttpsUrl(c.careersUrl)) e.push(`careersUrl must be an https URL: ${String(c.careersUrl)}`);
  if (!Array.isArray(c.tags)) e.push("tags must be an array");
  else {
    for (const tag of c.tags) if (!(COMPANY_TAGS as readonly string[]).includes(tag)) e.push(`unknown tag: ${String(tag)}`);
    if (new Set(c.tags).size !== c.tags.length) e.push("duplicate tags");
  }
  if (c.hq !== null && (typeof c.hq !== "string" || c.hq.trim().length === 0)) e.push("hq must be null or a non-empty string");
  if (typeof c.indiaPresence !== "boolean") e.push("indiaPresence must be boolean");
  if (c.priority !== 1 && c.priority !== 2 && c.priority !== 3) e.push("priority must be 1, 2 or 3");
  if (c.verifiedAt !== undefined && c.verifiedAt !== null && (typeof c.verifiedAt !== "string" || Number.isNaN(Date.parse(c.verifiedAt)))) {
    e.push("verifiedAt must be null or ISO-8601");
  }
  if (c.openJobs !== undefined && c.openJobs !== null && (!Number.isInteger(c.openJobs) || c.openJobs < 0)) {
    e.push("openJobs must be null or a non-negative integer");
  }
  if (c.extra !== undefined && (c.extra === null || typeof c.extra !== "object" || Array.isArray(c.extra))) e.push("extra must be an object");
  return e;
}

/** Problems with the registry as a whole (each entry + uniqueness + ordering). */
export function validateRegistry(list: readonly CompanyTarget[]): string[] {
  const e: string[] = [];
  const seen = new Set<string>();
  list.forEach((c, i) => {
    for (const p of validateCompanyTarget(c)) e.push(`[${i}] ${c?.slug ?? "?"}: ${p}`);
    if (seen.has(c.slug)) e.push(`[${i}] duplicate slug ${c.slug}`);
    seen.add(c.slug);
    if (i > 0 && list[i - 1]!.slug.localeCompare(c.slug) >= 0) e.push(`[${i}] not sorted by slug: ${list[i - 1]!.slug} ≥ ${c.slug}`);
  });
  return e;
}
