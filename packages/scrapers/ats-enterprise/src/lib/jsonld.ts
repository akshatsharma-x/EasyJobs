import type { JobType, Salary, WorkMode } from "@easyjobs/contract";
import { toIso } from "./dates";
import { absoluteUrl, cleanText, extractBalancedJson, normalizeDescriptionHtml } from "./html";
import { countryNames, mapEmploymentType, uniqStrings } from "./mapping";

export type JsonObject = Record<string, unknown>;

export const isObject = (v: unknown): v is JsonObject => typeof v === "object" && v !== null && !Array.isArray(v);
const asArray = (v: unknown): unknown[] => (v === undefined || v === null ? [] : Array.isArray(v) ? v : [v]);

/* ───────────────────────── Extraction ───────────────────────── */

/** Raw contents of every `<script type="application/ld+json">` block. */
export function extractJsonLdBlocks(html: string): string[] {
  const out: string[] = [];
  const re = /<script\b[^>]*\btype\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script\s*>/gi;
  for (const m of html.matchAll(re)) {
    const body = m[1]?.trim();
    if (body) out.push(body);
  }
  return out;
}

/** Inside JSON strings: escape raw control characters and repair invalid escapes (\' , \x …). */
function repairStrings(s: string): string {
  let out = "";
  let inString = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i] as string;
    if (!inString) {
      if (ch === '"') inString = true;
      out += ch;
      continue;
    }
    if (ch === "\\") {
      const next = s[i + 1];
      if (next !== undefined && '"\\/bfnrtu'.includes(next)) {
        out += ch + next;
        i++;
      } else if (next === "'") {
        out += "'";
        i++;
      } else {
        out += "\\\\";
      }
      continue;
    }
    if (ch === '"') {
      inString = false;
      out += ch;
      continue;
    }
    const code = ch.charCodeAt(0);
    if (code < 0x20) {
      out += ch === "\n" ? "\\n" : ch === "\r" ? "\\r" : ch === "\t" ? "\\t" : `\\u${code.toString(16).padStart(4, "0")}`;
      continue;
    }
    out += ch;
  }
  return out;
}

/** Remove trailing commas before } or ] (outside strings). */
function removeTrailingCommas(s: string): string {
  let out = "";
  let inString = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i] as string;
    if (inString) {
      out += ch;
      if (ch === "\\") {
        out += s[i + 1] ?? "";
        i++;
      } else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    if (ch === ",") {
      const rest = /^\s*([}\]])/.exec(s.slice(i + 1, i + 200));
      if (rest) continue;
    }
    out += ch;
  }
  return out;
}

const tryParse = (s: string): unknown => {
  try {
    return JSON.parse(s) as unknown;
  } catch {
    return undefined;
  }
};

/**
 * JSON.parse with repairs for what career sites really ship: HTML comments / CDATA wrappers,
 * trailing semicolons, raw newlines inside strings, invalid escapes, trailing commas and several
 * concatenated objects in one script block. Returns undefined when nothing can be salvaged.
 */
export function parseJsonLenient(text: string): unknown {
  const s = text
    .trim()
    .replace(/^<!--/, "")
    .replace(/-->$/, "")
    .replace(/^\/\/\s*<!\[CDATA\[/, "")
    .replace(/\/\/\s*\]\]>$/, "")
    .replace(/^<!\[CDATA\[/, "")
    .replace(/\]\]>$/, "")
    .trim()
    .replace(/;+\s*$/, "");
  if (!s) return undefined;
  const direct = tryParse(s);
  if (direct !== undefined) return direct;
  const repaired = removeTrailingCommas(repairStrings(s));
  const fixed = tryParse(repaired);
  if (fixed !== undefined) return fixed;
  // Several top-level values ("{…}{…}" or "{…}\n{…}").
  const values: unknown[] = [];
  let i = 0;
  while (i < repaired.length) {
    const start = repaired.slice(i).search(/[{[]/);
    if (start < 0) break;
    const raw = extractBalancedJson(repaired, i + start);
    if (!raw) break;
    const v = tryParse(raw);
    if (v !== undefined) values.push(v);
    i += start + raw.length;
  }
  return values.length > 0 ? values : undefined;
}

/** Every object with an @type, walking arrays, @graph and nested values (mainEntity, itemListElement…). */
export function collectTypedNodes(data: unknown, maxDepth = 8): JsonObject[] {
  const out: JsonObject[] = [];
  const seen = new Set<unknown>();
  const walk = (v: unknown, depth: number): void => {
    if (depth > maxDepth || v === null || typeof v !== "object" || seen.has(v)) return;
    seen.add(v);
    if (Array.isArray(v)) {
      for (const x of v) walk(x, depth + 1);
      return;
    }
    const obj = v as JsonObject;
    if (obj["@type"] !== undefined) out.push(obj);
    for (const [k, x] of Object.entries(obj)) {
      if (k === "description") continue;
      walk(x, depth + 1);
    }
  };
  walk(data, 0);
  return out;
}

const typeNames = (node: JsonObject): string[] =>
  asArray(node["@type"])
    .filter((t): t is string => typeof t === "string")
    .map((t) => t.replace(/^https?:\/\/schema\.org\//i, "").replace(/^schema:/i, "").trim().toLowerCase());

export const isJobPosting = (node: JsonObject): boolean => typeNames(node).includes("jobposting");

export interface JsonLdScan {
  postings: JsonObject[];
  blocks: number;
  /** Blocks that could not be parsed even after repairs. */
  malformed: number;
}

/** All schema.org JobPosting nodes in an HTML document. */
export function findJobPostings(html: string): JsonLdScan {
  const blocks = extractJsonLdBlocks(html);
  const postings: JsonObject[] = [];
  let malformed = 0;
  for (const block of blocks) {
    const data = parseJsonLenient(block);
    if (data === undefined) {
      malformed++;
      continue;
    }
    for (const node of collectTypedNodes(data)) if (isJobPosting(node)) postings.push(node);
  }
  return { postings, blocks: blocks.length, malformed };
}

/* ───────────────────────── Mapping ───────────────────────── */

export interface JobPostingFields {
  title: string;
  descriptionHtml: string | null;
  /** JobPosting.url, absolutized against the page. */
  url: string | null;
  postedAt: string | null;
  validThrough: string | null;
  employmentTypeRaw: string | null;
  jobType?: JobType;
  locations: string[];
  isRemote?: boolean;
  workMode?: WorkMode;
  salary: Salary | null;
  salaryRaw: string | null;
  experienceRaw: string | null;
  experienceMin: number | null;
  degrees: string[];
  skills: string[];
  department: string | null;
  hiringOrganization: string | null;
  companyLogoUrl: string | null;
  identifier: string | null;
  directApply: boolean | null;
}

const text = (v: unknown): string => (typeof v === "string" || typeof v === "number" ? cleanText(String(v)) : "");
const nameOf = (v: unknown): string => (isObject(v) ? text(v.name ?? v["@value"] ?? v.value) : text(v));

function num(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string") return null;
  const cleaned = v.replace(/[,\s]/g, "").replace(/[^\d.]/g, "");
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function countryLabel(v: unknown): string {
  const raw = nameOf(v);
  if (/^[A-Za-z]{2}$/.test(raw)) {
    const { names } = countryNames(raw);
    // Prefer the plain ICU name ("United States") over aliases like "USA".
    const icu = names.find((n) => n.length > 3) ?? names[0];
    return icu ?? raw.toUpperCase();
  }
  return raw;
}

/** PostalAddress / Place / string → "City, Region, Country". */
export function formatAddress(addr: unknown): string | null {
  if (typeof addr === "string") return cleanText(addr) || null;
  if (!isObject(addr)) return null;
  const locality = text(addr.addressLocality);
  let region = text(addr.addressRegion);
  const country = countryLabel(addr.addressCountry);
  // Region codes like "09" or "B" carry no meaning for readers or the normalizer.
  if (/^\d+$/.test(region) || region.length < 2 || region.toLowerCase() === locality.toLowerCase()) region = "";
  const parts = uniqStrings([locality, region, country]);
  if (parts.length > 0) return parts.join(", ");
  return text(addr.name) || null;
}

function placeStrings(place: unknown): string[] {
  if (typeof place === "string") return [cleanText(place)].filter(Boolean);
  if (!isObject(place)) return [];
  const addresses = asArray(place.address ?? (place.addressLocality || place.addressCountry ? place : undefined));
  const out = addresses.map(formatAddress).filter((s): s is string => Boolean(s));
  if (out.length === 0 && text(place.name)) out.push(text(place.name));
  return out;
}

const UNIT: Record<string, { period: Salary["period"]; factor: number }> = {
  HOUR: { period: "hour", factor: 1 },
  HOURLY: { period: "hour", factor: 1 },
  DAY: { period: "year", factor: 260 },
  DAILY: { period: "year", factor: 260 },
  WEEK: { period: "year", factor: 52 },
  WEEKLY: { period: "year", factor: 52 },
  MONTH: { period: "month", factor: 1 },
  MONTHLY: { period: "month", factor: 1 },
  YEAR: { period: "year", factor: 1 },
  YEARLY: { period: "year", factor: 1 },
  ANNUAL: { period: "year", factor: 1 },
  ANNUALLY: { period: "year", factor: 1 },
  ANNUM: { period: "year", factor: 1 },
};

/**
 * schema.org baseSalary (MonetaryAmount + QuantitativeValue, or bare numbers) → Salary.
 * Placeholders (empty currency/unit, zero values) yield null; a salary is never guessed.
 */
export function parseBaseSalary(baseSalary: unknown, fallbackCurrency?: unknown): { salary: Salary | null; raw: string | null } {
  for (const amount of asArray(baseSalary)) {
    let currency = "";
    let min: number | null = null;
    let max: number | null = null;
    let unitText = "";
    if (isObject(amount)) {
      currency = text(amount.currency ?? amount.salaryCurrency ?? fallbackCurrency).toUpperCase();
      const value = amount.value;
      if (isObject(value)) {
        min = num(value.minValue ?? value.value);
        max = num(value.maxValue ?? value.value);
        unitText = text(value.unitText ?? amount.unitText);
      } else {
        min = max = num(value);
        unitText = text(amount.unitText);
      }
    } else {
      min = max = num(amount);
      currency = text(fallbackCurrency).toUpperCase();
    }
    if (min !== null && min <= 0) min = null;
    if (max !== null && max <= 0) max = null;
    if (min === null && max === null) continue;
    if (min !== null && max !== null && min > max) [min, max] = [max, min];
    const unitKey = unitText.toUpperCase().replace(/[^A-Z]/g, "");
    const raw = [currency || null, min !== null && max !== null && min !== max ? `${min}–${max}` : String(min ?? max), unitText ? `per ${unitText}` : null]
      .filter(Boolean)
      .join(" ");
    const unit = UNIT[unitKey];
    if (!/^[A-Z]{3}$/.test(currency) || !unit) return { salary: null, raw };
    const scale = (n: number | null): number | null => (n === null ? null : Math.round(n * unit.factor * 100) / 100);
    return { salary: { min: scale(min), max: scale(max), currency, period: unit.period, raw }, raw };
  }
  return { salary: null, raw: null };
}

function parseExperience(v: unknown): { raw: string | null; min: number | null } {
  for (const item of asArray(v)) {
    if (typeof item === "string" || typeof item === "number") {
      const raw = cleanText(String(item)).slice(0, 300);
      if (raw) return { raw, min: null };
    }
    if (isObject(item)) {
      const months = num(item.monthsOfExperience);
      if (months !== null && months >= 0) return { raw: `${months} months`, min: Math.round((months / 12) * 10) / 10 };
      const desc = text(item.description ?? item.name);
      if (desc) return { raw: desc.slice(0, 300), min: null };
    }
  }
  return { raw: null, min: null };
}

function parseEducation(v: unknown): string[] {
  const out: string[] = [];
  for (const item of asArray(v)) {
    if (typeof item === "string") {
      const s = cleanText(item);
      if (s && s.length <= 160) out.push(s);
    } else if (isObject(item)) {
      const s = text(item.credentialCategory ?? item.educationalLevel ?? item.name);
      if (s) out.push(s);
    }
  }
  return uniqStrings(out).slice(0, 8);
}

function parseSkills(v: unknown): string[] {
  const values = asArray(v).flatMap((x) => (typeof x === "string" ? x.split(/[,;|\n]/) : [nameOf(x)]));
  return uniqStrings(values.map((s) => s.trim()).filter((s) => s.length > 0 && s.length <= 60)).slice(0, 30);
}

/** schema.org JobPosting node → RawJob-ready fields. */
export function jobPostingToFields(node: JsonObject, pageUrl: string, now: Date = new Date()): JobPostingFields {
  const employmentValues = asArray(node.employmentType).map(text).filter(Boolean);
  const locationType = asArray(node.jobLocationType).map(text).join(" ");
  const telecommute = /telecommute|remote/i.test(locationType);
  const physical = uniqStrings(asArray(node.jobLocation).flatMap(placeStrings));
  const applicantRegions = uniqStrings(asArray(node.applicantLocationRequirements).map((r) => (isObject(r) ? nameOf(r) || formatAddress(r.address) : text(r))));
  const locations = telecommute
    ? uniqStrings([...physical, ...(applicantRegions.length > 0 ? applicantRegions.map((r) => `Remote - ${r}`) : physical.length === 0 ? ["Remote"] : [])])
    : physical;
  const { salary, raw: salaryRaw } = parseBaseSalary(node.baseSalary ?? node.estimatedSalary, node.salaryCurrency);
  const experience = parseExperience(node.experienceRequirements);
  const org = node.hiringOrganization;
  const logo = isObject(org) ? (isObject(org.logo) ? text(org.logo.url ?? org.logo.contentUrl) : text(org.logo)) : "";
  const identifier = isObject(node.identifier) ? text(node.identifier.value ?? node.identifier.name) : text(node.identifier);
  const occupational = text(node.occupationalCategory);
  const department = text(node.department) || (occupational && !/^\d{2}-\d{4}/.test(occupational) ? occupational : "") || text(node.industry);
  const posted = toIso(node.datePosted, now);
  return {
    title: text(node.title ?? node.name),
    descriptionHtml: normalizeDescriptionHtml(typeof node.description === "string" ? node.description : null),
    url: absoluteUrl(typeof node.url === "string" ? node.url : null, pageUrl),
    postedAt: posted && Date.parse(posted) > now.getTime() ? now.toISOString() : posted,
    validThrough: toIso(node.validThrough, now),
    employmentTypeRaw: employmentValues.length > 0 ? employmentValues.join(", ") : null,
    jobType: mapEmploymentType(...employmentValues),
    locations,
    ...(telecommute ? { isRemote: true, workMode: "remote" as const } : {}),
    salary,
    salaryRaw,
    experienceRaw: experience.raw,
    experienceMin: experience.min,
    degrees: parseEducation(node.educationRequirements),
    skills: parseSkills(node.skills),
    department: department ? department.slice(0, 120) : null,
    hiringOrganization: nameOf(org) || null,
    companyLogoUrl: absoluteUrl(logo || null, pageUrl),
    identifier: identifier || null,
    directApply: typeof node.directApply === "boolean" ? node.directApply : null,
  };
}
