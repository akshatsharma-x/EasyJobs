/**
 * Parser for top-level comments of "Ask HN: Who is hiring?" threads.
 * Convention: first line "Company | Role | Location | REMOTE | Full-time | $salary | link", in any order.
 */
import type { JobType, WorkMode } from "@easyjobs/contract";
import { decodeEntities, extractLinks, htmlToPlain } from "../../lib/html";
import { applyLinkScore, companyDomainOf } from "../../lib/links";
import {
  CITY_ALIASES,
  CITY_CODE_RE,
  COUNTRY_CODES,
  GLOBAL_CITY_RE,
  INDIA_CITY_RE,
  INDIA_REGION_RE,
  NON_INDIA_REGION_RE,
  OTHER_COUNTRY_RE,
  US_STATE_CODES,
  US_STATE_RE,
} from "../../lib/places";
import { bestScope, classifyRegion, type RemoteScope } from "../../lib/region";
import { jobTypeFrom } from "../../lib/taxonomy";
import { toIso, uniq } from "../../lib/util";

export interface HnItem {
  id: number;
  created_at?: string;
  created_at_i?: number;
  author?: string | null;
  title?: string | null;
  text?: string | null;
  type?: string;
  parent_id?: number | null;
  children?: HnItem[];
}

export interface HnPost {
  commentId: number;
  company: string;
  companyNote?: string;
  ycBatch?: string;
  companyDomain: string | null;
  roles: string[];
  /** Per-role apply link when the post lists roles with their own links. */
  roleLinks: (string | undefined)[];
  titleInferred: boolean;
  locations: string[];
  remote: boolean;
  remoteRegions: string[];
  remoteScope: RemoteScope | null;
  workMode?: WorkMode;
  typeText: string;
  salaryRaw?: string;
  visa?: string;
  /** Best apply candidate for the whole post (unresolved). */
  bestLink?: string;
  links: string[];
  descriptionHtml: string;
  postedAt: string | null;
}

export type HnSkipReason = "deleted" | "closed" | "job-seeker" | "no-header" | "no-company";
export type HnParseResult = { post: HnPost } | { skip: HnSkipReason };

/* ─────────── detectors ─────────── */

const URL_ONLY_RE = /^(?:https?:\/\/\S+|(?:www\.)?[a-z0-9][a-z0-9-]*(?:\.[a-z0-9-]+)*\.[a-z]{2,}(?:\/\S*)?)$/i;
const SALARY_RE =
  /[$€£₹¥]\s?\d|\b(?:USD|EUR|GBP|INR|CHF|CAD|AUD|SGD|SEK|NOK|DKK|PLN|JPY)\s?\d|\d\s?(?:USD|EUR|GBP|INR|CHF|CAD|AUD|SGD|SEK|NOK|DKK|PLN|JPY)\b|\b\d{2,3}(?:[.,]\d+)?\s?[kK]\b|\b\d{1,3}(?:,\d{3})+\b|\b\d+(?:\.\d+)?\s?(?:LPA|lakhs?)\b|\/\s?(?:hr|hour|yr|year|mo|month)\b|\bper (?:hour|year|annum|month)\b/i;
const MODE_RE =
  /\b(?:remote|on-?site|on site|in[- ]office|in[- ]person|hybrid|wfh|work from home|distributed|office[- ]first|days? (?:a week |per week |\/ ?w(?:ee)?k )?in(?: the)? office)\b/i;
const REMOTE_RE = /\b(?:remote|wfh|work from home|distributed)\b/i;
const ONSITE_RE = /\b(?:on-?site|on site|in[- ]office|in[- ]person|office[- ]first|in(?: the)? office)\b/i;
const HYBRID_RE = /\bhybrid\b/i;
const TYPE_SRC =
  String.raw`\b(?:full[- ]?time|part[- ]?time|contract(?:or|s)?|contract[- ]to[- ]hire|freelance|internships?|interns?|co-?op|temporary|permanent|fte|1099|w-?2|cdi|cdd|hourly|seasonal|fixed[- ]term)\b`;
const TYPE_RE = new RegExp(TYPE_SRC, "i");
const TYPE_RE_G = new RegExp(TYPE_SRC, "gi");
const VISA_RE = /\b(?:visas?|sponsorship|sponsor|relocation|work authori[sz]ation|citizenship|citizens?|green card|clearance)\b/i;

const ROLE_NOUNS = [
  "engineer", "engineers", "engineering", "eng", "developer", "developers", "dev", "devs", "programmer", "programmers",
  "architect", "architects", "designer", "designers", "design", "scientist", "scientists", "researcher", "researchers",
  "research", "analyst", "analysts", "manager", "managers", "director", "directors", "head of", "lead", "leads", "vp",
  "vice president", "chief", "cto", "cfo", "coo", "cpo", "ciso", "cmo", "founding", "sre", "sres", "devops", "sdet",
  "sdets", "qa", "tester", "testers", "intern", "interns", "internship", "internships", "co-op", "apprentice", "fellow",
  "fellowship", "phd", "postdoc", "specialist", "specialists", "consultant", "consultants", "advocate", "advocates",
  "evangelist", "recruiter", "recruiters", "sourcer", "coordinator", "coordinators", "administrator", "administrators",
  "admin", "technician", "technicians", "operator", "strategist", "strategists", "marketer", "marketers", "marketing",
  "sales", "account executive", "ae", "aes", "sdr", "sdrs", "bdr", "bdrs", "representative", "representatives",
  "associate", "associates", "assistant", "accountant", "controller", "counsel", "attorney", "lawyer", "paralegal",
  "writer", "writers", "editor", "copywriter", "pm", "pms", "tpm", "tpms", "product", "operations", "ops", "support",
  "success", "csm", "csms", "member of technical staff", "mts", "staff", "principal", "hacker", "hackers", "artist",
  "artists", "animator", "illustrator", "producer", "teacher", "tutor", "instructor", "nurse", "physician", "clinician",
  "pharmacist", "therapist", "economist", "statistician", "mathematician", "physicist", "chemist", "biologist", "trader",
  "traders", "quant", "quants", "underwriter", "actuary", "auditor", "buyer", "planner", "machinist", "electrician",
  "mechanic", "technologist", "positions", "position", "roles", "role", "openings", "opportunities", "hires",
  "generalist", "generalists", "partner", "executive", "officer", "agent", "rep", "reps", "expert", "experts",
  "builder", "builders", "swe", "swes", "sde", "ml engineer", "full-stack", "fullstack", "frontend", "backend",
];
// No "-" escaping: "\-" is an invalid escape outside a character class in unicode-mode regexes.
const escapeNoun = (n: string): string => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const ROLE_RE = new RegExp(`(?<![\\p{L}\\p{N}])(?:${ROLE_NOUNS.map(escapeNoun).join("|")})(?![\\p{L}\\p{N}])`, "iu");

const CLOSED_RE =
  /\b(?:no longer (?:hiring|accepting|taking|looking|open)|(?:positions?|roles?|jobs?) (?:has|have) been filled|(?:positions?|roles?|jobs?) (?:is|are) (?:now )?(?:filled|closed)|hiring (?:is )?(?:closed|paused|on hold)|not hiring (?:anymore|any more|at the moment))\b|^\s*\[?(?:closed|filled)\b/i;
const SEEKER_RE = /\b(?:willing to relocate|résumé\/cv|resume\/cv|résumé:|resume:)/i;

/* ─────────── text helpers ─────────── */

/** HTML line → text, replacing auto-linked URLs (HN truncates their text with "...") by their href. */
function lineText(htmlLine: string): string {
  const withHrefs = htmlLine.replace(/<a\b[^>]*?href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, (_m, href: string, label: string) => {
    const h = decodeEntities(href);
    const l = decodeEntities(label.replace(/<[^>]*>/g, "")).trim();
    return /^https?:\/\//i.test(l) || l === h ? h : l;
  });
  return decodeEntities(withHrefs.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
}

const stripParens = (s: string): string => s.replace(/\([^)]*\)|\[[^\]]*\]/g, " ").replace(/\s+/g, " ").trim();
const parenContents = (s: string): string[] => [...s.matchAll(/\(([^)]*)\)/g)].map((m) => (m[1] ?? "").trim()).filter(Boolean);
/** Lowercase "us" is the pronoun; the country is written "US". */
const placeTest = (s: string): string => s.replace(/\b(?:us|Us)\b/g, " ");

export function looksLikePlace(s: string): boolean {
  const t = placeTest(s);
  return (
    GLOBAL_CITY_RE.test(t) ||
    INDIA_CITY_RE.test(t) ||
    OTHER_COUNTRY_RE.test(t) ||
    US_STATE_RE.test(t) ||
    NON_INDIA_REGION_RE.test(t) ||
    INDIA_REGION_RE.test(t) ||
    CITY_CODE_RE.test(s) ||
    /\b(?:NYC|SF|LA|DC|SoCal|NorCal)\b/.test(s)
  );
}

const QUALIFIER_RE = new RegExp(
  `^(?:${[...US_STATE_CODES, ...COUNTRY_CODES].join("|")}|USA|U\\.S\\.A?\\.?|United States|United Kingdom|Canada|Germany|France|Spain|Netherlands|The Netherlands|Switzerland|India|Japan|Australia|Belgium|Sweden|Poland|Portugal|Italy|Ireland|Israel|Brazil|Mexico|Saudi Arabia|UAE)$`,
);

const CITY_LIKE_STATE_RE = /^(?:new york|washington)\b/i;
const COUNTRY_NAME_RE = new RegExp(`^(?:the\\s+)?(?:${OTHER_COUNTRY_RE.source}|india)$`, "iu");
const CA_PROVINCES = /^(?:BC|ON|QC|AB|NS|MB|SK|NB|NL|PE|British Columbia|Ontario|Quebec|Alberta|Nova Scotia)$/;
const isQualifier = (part: string): boolean => {
  const p = part.trim();
  if (QUALIFIER_RE.test(p) || CA_PROVINCES.test(p) || COUNTRY_NAME_RE.test(p)) return true;
  if (p.split(/\s+/).every((t) => QUALIFIER_RE.test(t))) return true;
  return US_STATE_RE.test(p) && p.split(/\s+/).length <= 2 && !CITY_LIKE_STATE_RE.test(p);
};

/** Phrases that mention a country but are not a place ("Saudi nationals", "US work authorization"). */
const NOT_PLACE_RE =
  /\b(?:nationals?|citizens?|citizenship|candidates?|status|authori[sz]ation|required|fees?|visas?|sponsor\w*|speaking|speakers?|languages?|time ?zones?|hours|persons?|eligib\w+|residents?|laws?)\b/i;

/** "San Francisco, CA / New York, NY or Zurich" → ["San Francisco, CA", "New York, NY", "Zurich"]. */
export function splitPlaces(text: string): string[] {
  const out: string[] = [];
  const held: string[] = [];
  const chunks = text
    .replace(/\((?:[^)]*\b(?:days?|week|wk|preferred|only|near|hq|office)\b[^)]*)\)/gi, (m) => (/near/i.test(m) ? m : " "))
    .replace(/\([^)]*\)/g, (m) => `\u0001${held.push(m) - 1}\u0001`)
    .split(/\s*(?:\/|;|\s(?:or|and)\s|&|\+|·|—|–)\s*/i);
  const restore = (t: string): string => t.replace(/\u0001(\d+)\u0001/g, (_m, i: string) => held[Number(i)] ?? "");
  for (const chunk of chunks) {
    const parts = chunk.split(/\s*,\s*/).map((p) => restore(p).trim()).filter(Boolean);
    const merged: string[] = [];
    for (const p of parts) {
      if (merged.length > 0 && isQualifier(p)) merged[merged.length - 1] += `, ${p}`;
      else merged.push(p);
    }
    for (const m of merged) {
      const cleaned = m
        .replace(/\b(?:preferred|possible|required|only|ok|hq|offices?)\b/gi, " ")
        .replace(/^[\s:,.\-–—]+|[\s:,.\-–—]+$/g, "")
        .replace(/^(?:or|and|in|at)\s+|\s+(?:or|and)$/gi, "")
        .replace(/^\(([^()]*)$/, "$1")
        .replace(/^([^()]*)\)$/, "$1")
        .replace(/\s+/g, " ")
        .trim();
      if (!cleaned || cleaned.length > 60 || NOT_PLACE_RE.test(cleaned) || ROLE_RE.test(stripParens(cleaned)) || !looksLikePlace(cleaned)) continue;
      out.push(CITY_ALIASES[cleaned.toLowerCase()] ?? cleaned);
    }
  }
  return uniq(out);
}

/* ─────────── segment classification ─────────── */

interface ModeInfo {
  remote: boolean;
  onsite: boolean;
  hybrid: boolean;
  regions: string[];
  places: string[];
}

const MODE_RE_G = new RegExp(MODE_RE.source, "gi");
const MODE_FILLER_RE_G =
  /\b(?:\d+\s*(?:x|days?)\s*(?:\/|a|per)?\s*(?:week|wk)?|days?|fully|100%|only|preferred|possible|available|ok|in|at|based|with)\b/gi;

/**
 * A remote/onsite/hybrid segment. Remote regions come from "REMOTE (US)", "Remote - EU only" or, for a
 * remote-only segment without either, the remaining text ("North America, Europe REMOTE"); everything
 * else that looks like a place is an office location ("NYC or REMOTE (US)" → office NYC, remote US).
 */
function parseMode(seg: string): ModeInfo {
  const remote = REMOTE_RE.test(seg);
  const onsite = ONSITE_RE.test(seg);
  const hybrid = HYBRID_RE.test(seg);
  const regions: string[] = [];
  const consumed = new Set<string>();
  const isRegion = (t: string): boolean => classifyRegion(placeTest(t)) !== "unknown";
  for (const m of seg.matchAll(/\b(?:remote|wfh|distributed)\b\s*\(([^)]*)\)/gi)) {
    const inner = (m[1] ?? "").trim();
    if (inner && isRegion(inner)) {
      regions.push(inner);
      consumed.add(inner);
    }
  }
  const dash = /\bremote\s*[-–—:]\s*([\p{L} ,&.]{2,50}?)(?:\s+only)?\s*$/iu.exec(seg);
  if (dash?.[1] && isRegion(dash[1])) regions.push(dash[1].trim());
  const outside = stripParens(seg)
    .replace(MODE_RE_G, " ")
    .replace(MODE_FILLER_RE_G, " ")
    .replace(/[|]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^[\s\-–—,.:/]+|[\s\-–—,.:/]+$/g, "")
    .trim();
  const remoteOnly = remote && !onsite && !hybrid;
  const namesCities = GLOBAL_CITY_RE.test(outside) || CITY_CODE_RE.test(outside) || (INDIA_CITY_RE.test(outside) && !/^\W*india\W*$/i.test(outside));
  let outsideIsRegion = false;
  if (remoteOnly && regions.length === 0 && outside && outside.length <= 80 && !namesCities && isRegion(outside)) {
    regions.push(outside);
    outsideIsRegion = true;
  }
  // Places: keep qualifier parentheses ("London (UK)"), drop remote-region and note parentheses ("(3 days/wk)").
  let placeText = outsideIsRegion
    ? ""
    : seg
        .replace(/\(([^)]*)\)/g, (m: string, inner: string) =>
          consumed.has(inner.trim()) || MODE_RE.test(inner) || /\b(?:days?|week|wk|hours?|preferred|time ?zones?|only|possible|part)\b/i.test(inner) ? " " : m,
        )
        .replace(MODE_RE_G, " ")
        .replace(MODE_FILLER_RE_G, " ")
        .replace(/\s+/g, " ")
        .replace(/^[\s\-–—,.:]+|[\s\-–—,.:]+$/g, "")
        .trim();
  if (/^\([^()]*\)$/.test(placeText)) placeText = placeText.slice(1, -1);
  return { remote, onsite, hybrid, regions: uniq(regions), places: splitPlaces(placeText) };
}

/** True when a segment is only an employment type ("Full-time", "Contract, part-time", "Full time + Internships"). */
function isTypeOnly(seg: string): boolean {
  if (!TYPE_RE.test(seg)) return false;
  const rest = (stripParens(seg) || seg).replace(TYPE_RE_G, " ").replace(/[^\p{L}]+/gu, " ").trim();
  return rest.length === 0 || (!ROLE_RE.test(rest) && rest.split(/\s+/).length <= 3);
}

/** Just the employment-type words of a segment ("Full-Time MixRank processes…" → "Full-Time"). */
const typeWords = (seg: string): string => uniq(seg.match(TYPE_RE_G) ?? []).join(", ");

const SENTENCE_RE = /\b(?:is|are|we|we're|our|makes?|builds?|building|helps?|helping|looking|powers?|powering|offers?|provides?)\b/i;
/** A short phrase naming a job (not a tagline like "PostHog makes your product self-driving."). */
const hasRole = (seg: string): boolean => {
  const core = stripParens(seg) || seg;
  const words = core.split(/\s+/).length;
  if (words > 12 || (words > 4 && (/[.!?]$/.test(core.trim()) || SENTENCE_RE.test(core)))) return false;
  return ROLE_RE.test(core);
};

const TRAILING_SALARY_RE =
  /,?\s*(?:[$€£₹]\s?\d[\d.,]*\s?[kKmM]?(?:\s*(?:[-–—]|to)\s*[$€£₹]?\s?\d[\d.,]*\s?[kKmM]?)?\s*(?:\+\s*equity)?|\(\s*[$€£₹]?\d[\d.,]*\s?[kK]?\s*(?:[-–—]|to)\s*[$€£₹]?\d[\d.,]*\s?[kK]\s*\))\s*$/;

/** "/^Full-?stack Engineer$/i" (an HN in-joke) → "Full-stack Engineer". */
const unRegex = (role: string): string =>
  /^\/\^?.+\$?\/[a-z]*$/.test(role) ? role.replace(/^\/\^?/, "").replace(/\$?\/[a-z]*$/, "").replace(/[?*+\\]/g, "") : role;

function cleanRole(role: string): string {
  return unRegex(role.trim())
    .replace(TRAILING_SALARY_RE, "")
    .replace(/^(?:open\s+)?(?:roles?|positions?|hiring(?:\s+for)?|openings?)\s*:\s*/i, "")
    .replace(/^(?:[Nn]ow\s+)?[Hh]iring\s+(?:an?\s+)?(?=\p{Lu})/u, "")
    .replace(/^(?:and|or|&)\s+/i, "")
    .replace(/^[\s:;,.\-–—*•]+|[\s:;,\-–—*•]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const TEAM_WORD_RE =
  /^(?:engineering|product|design|data|sales|marketing|operations|ops|support|success|research|gtm|go-to-market|finance|legal|hr|people|growth|revenue|business|infra(?:structure)?|security|ai|ml|ai\/ml)$/i;

/** "Technical CSMs, SRE, Product Manager" → 3 roles; "Senior Engineer, Backend" stays one role. */
export function splitRoles(seg: string): string[] {
  const placeholders: string[] = [];
  const masked = seg.replace(/\([^)]*\)/g, (m) => `\u0000${placeholders.push(m) - 1}\u0000`);
  const parts = masked
    .split(/\s*(?:,|;|\s&\s|\s\+\s|\sand\s)\s*/i)
    .map((p) => p.replace(/\u0000(\d+)\u0000/g, (_m, i: string) => placeholders[Number(i)] ?? ""))
    .map(cleanRole)
    .filter(Boolean);
  const whole = cleanRole(seg.replace(/,?\s*(?:[$€£₹]\s?\d[\d.,]*\s?[kKmM]?\s*(?:[-–—]|to)\s*[$€£₹]?\s?\d[\d.,]*\s?[kKmM]?)\s*$/, ""));
  if (parts.every((p) => TEAM_WORD_RE.test(p))) return [`Multiple roles: ${whole}`];
  if (parts.length <= 1 || /\b(?:multiple|various|several|many)\b|\b(?:roles|positions|openings)\b/i.test(seg)) return [whole];
  const kept = parts.filter((p) => !(SALARY_RE.test(p) && /\d/.test(p) && !ROLE_RE.test(p)));
  const roleCount = kept.filter(hasRole).length;
  if (roleCount < 2) return [whole];
  parts.length = 0;
  parts.push(...kept);
  const merged: string[] = [];
  for (const p of parts) {
    if (!hasRole(p) && merged.length > 0) merged[merged.length - 1] += `, ${p}`;
    else merged.push(p);
  }
  return merged.slice(0, 8);
}

/** Roles listed in the body ("- Senior Backend Engineer: https://…", "Open roles: A, B, C"). */
function bodyRoles(html: string): { roles: string[]; links: (string | undefined)[] } {
  const roles: string[] = [];
  const links: (string | undefined)[] = [];
  const lines = html.split(/<p>|\n/i).slice(1, 60);
  for (const raw of lines) {
    const text = lineText(raw);
    const listed = /(?:open (?:roles|positions)|we(?:'re| are) hiring(?: for)?|hiring for|roles|positions)\s*:\s*([^.]{3,200})/i.exec(text);
    if (listed?.[1] && roles.length === 0) {
      for (const r of splitRoles(listed[1].replace(/https?:\/\/\S+/g, ""))) if (hasRole(r) && r.length <= 80) roles.push(r);
      if (roles.length > 1) {
        links.push(...roles.map(() => undefined));
        break;
      }
      roles.length = 0;
    }
    const bullet = /^(?:[-*•·]|\d+[.)])\s+(.{3,120})$/.exec(text);
    if (!bullet?.[1]) continue;
    const label = (bullet[1].split(/\s+\|\s+/)[0] ?? "").replace(/\s*[:\-–—]?\s*https?:\/\/\S+\s*$/, "").trim();
    if (label.length > 80 || /[.!?]$/.test(label) || !hasRole(label) || label.split(/\s+/).length > 10) continue;
    roles.push(cleanRole(label));
    links.push(extractLinks(raw)[0]?.href);
    if (roles.length >= 8) break;
  }
  return { roles, links };
}

/* ─────────── privacy ─────────── */

/** Role-based mailboxes are company contact points; anything else may be a person's address. */
const ROLE_MAILBOX_RE =
  /^(?:jobs?|careers?|hiring|hire|recruit\w*|talent|hr|apply|applications?|work|join|people|team|hello|hi|contact|info|engineering|eng|founders?|resumes?|cv)(?:[-+._][\w-]+)?$/i;
const EMAIL_RE = /\b([A-Z0-9._%+-]+)@([A-Z0-9-]+(?:\.[A-Z0-9-]+)+)\b/gi;

/**
 * Replaces personal-looking email addresses (and their mailto: links) in post HTML with a pointer to the HN post.
 * HN encodes "@" plainly but "/" as "&#x2F;", so this runs on the raw HTML. Role mailboxes (jobs@, careers@) stay.
 */
export function redactPersonalEmails(html: string): string {
  const masked = html.replace(/<a\b[^>]*href="mailto:([^"]+)"[^>]*>[\s\S]*?<\/a>/gi, (m, addr: string) => {
    const local = decodeEntities(addr).split("@")[0] ?? "";
    return ROLE_MAILBOX_RE.test(local) ? m : "[email in original post]";
  });
  return masked.replace(EMAIL_RE, (m, local: string) => (ROLE_MAILBOX_RE.test(local) ? m : "[email in original post]"));
}

/* ─────────── main ─────────── */

const HEADER_MIN_PIPES = 2;

function findHeader(html: string): string | null {
  const lines = html.split(/<p>/i).slice(0, 3).flatMap((p) => p.split(/\n/)).slice(0, 5);
  for (const l of lines) {
    const t = lineText(l);
    if ((t.match(/\|/g) ?? []).length >= HEADER_MIN_PIPES) return t;
  }
  return null;
}

function cleanCompany(seg: string): { name: string; note?: string; yc?: string; url?: string } {
  let s = seg;
  const yc = /\(\s*YC\s*([SWFX]\d{2}|[A-Z]\d{2})\s*\)/i.exec(s);
  if (yc) s = s.replace(yc[0], " ");
  const url = /\(?\s*(https?:\/\/[^\s)]+)\s*\)?/.exec(s);
  if (url) s = s.replace(url[0], " ");
  const notes = parenContents(s);
  s = stripParens(s).replace(/\s+(?:is hiring|hiring)\b.*$/i, "").replace(/^[\s*•-]+|[\s*•:,-]+$/g, "").trim();
  // "America First Policy Institute - Office for Fiscal and Regulatory Analysis" → the organisation.
  if (s.length > 50 && /\s[-–—]\s/.test(s)) s = s.split(/\s[-–—]\s/)[0]?.trim() ?? s;
  return { name: s, note: notes.join("; ") || undefined, yc: yc?.[1]?.toUpperCase(), url: url?.[1] };
}

const ORG_WORD_RE =
  /\b(?:labs?|ai|inc|llc|ltd|gmbh|corp|co|technologies|technology|tech|health|systems|group|capital|partners|studio|software|data|cloud|robotics|analytics|payments|bank|foundation|institute|university|company|ventures|security|energy|bio|games|media|works|network|solutions|industries|holdings|digital|global|research|startup|stealth|confidential)\b/i;

/** "Hemant Singh", "Erica Holloway" — two or three capitalised words with no organisation word. */
export function looksLikePersonName(name: string): boolean {
  const words = name.trim().split(/\s+/);
  if (words.length < 2 || words.length > 3) return false;
  if (ORG_WORD_RE.test(name) || /[0-9&.@/+]/.test(name)) return false;
  return words.every((w) => /^\p{Lu}\p{Ll}+(?:[-'’]\p{Lu}?\p{Ll}+)?$/u.test(w)) && PERSON_HINT_RE.test(name);
}

/** Common given names (Indian + Western) — a cheap guard so "Common Prefix" or "Search Atlas" aren't taken for people. */
const PERSON_HINT_RE = new RegExp(
  `^(?:${[
    "aarav", "abhishek", "aditya", "ajay", "akash", "amit", "anand", "anil", "ankit", "arjun", "arun", "ashish", "deepak",
    "gaurav", "harsh", "hemant", "karan", "kunal", "manish", "mohit", "nikhil", "pankaj", "pranav", "prateek", "rahul",
    "rajesh", "rakesh", "ravi", "rohit", "sachin", "sandeep", "sanjay", "saurabh", "shubham", "siddharth", "sumit",
    "suresh", "varun", "vikas", "vikram", "vinay", "vivek", "yash", "priya", "pooja", "neha", "anjali", "divya",
    "kavya", "shreya", "sneha", "aisha", "fatima", "john", "james", "robert", "michael", "william", "david", "richard",
    "joseph", "thomas", "charles", "daniel", "matthew", "anthony", "mark", "paul", "steven", "andrew", "kevin", "brian",
    "george", "edward", "ryan", "jacob", "jason", "eric", "adam", "alex", "alexander", "ben", "benjamin", "chris",
    "christopher", "max", "sam", "samuel", "tom", "nick", "nicholas", "peter", "luke", "jack", "tim", "mary", "patricia",
    "jennifer", "linda", "elizabeth", "barbara", "susan", "jessica", "sarah", "karen", "nancy", "lisa", "emily",
    "emma", "olivia", "sophia", "anna", "laura", "rachel", "rebecca", "amanda", "erica", "erika", "julia", "kate",
    "katie", "megan", "nicole", "hannah", "maria", "elena", "sara", "chloe", "grace", "lucy",
  ].join("|")})\\s`,
  "i",
);

/** Parses one top-level comment. Returns `{ skip }` for deleted, closed, job-seeker or unparseable posts. */
export function parseHnComment(c: HnItem): HnParseResult {
  const html = c.text ?? "";
  if (!html.trim()) return { skip: "deleted" };
  const intro = htmlToPlain(html.split(/<p>/i).slice(0, 2).join("\n")).slice(0, 600);
  if (CLOSED_RE.test(intro)) return { skip: "closed" };
  if (SEEKER_RE.test(intro)) return { skip: "job-seeker" };
  const header = findHeader(html);
  if (!header) return { skip: "no-header" };

  const segments = header
    .split("|")
    .map((s) => s.replace(/^[\s√✓✔•*·-]+|[\s*·]+$/g, "").trim())
    .filter(Boolean);
  let companySeg = segments[0] ?? "";
  let rest = segments.slice(1);
  // "Cologne, Germany | UMH | Product Engineer" — the place came first.
  const nameLike = (t: string): boolean => !hasRole(t) && !URL_ONLY_RE.test(t) && !MODE_RE.test(t) && !TYPE_RE.test(t) && !SALARY_RE.test(t) && !looksLikePlace(t);
  const purePlace = companySeg.length <= 40 && companySeg.split(/\s+/).length <= 5 && looksLikePlace(companySeg) && !hasRole(companySeg);
  if (purePlace && rest[0] && nameLike(rest[0])) {
    rest = [companySeg, ...rest.slice(1)];
    companySeg = segments[1] ?? "";
  }
  const company = cleanCompany(companySeg);
  if (!company.name || company.name.length > 60 || company.name.split(/\s+/).length > 8) return { skip: "no-company" };
  if (/^(?:seeking|hiring|we(?:'re| are) hiring|looking for|wanted|now hiring)\b/i.test(company.name)) return { skip: "no-company" };
  if (company.name.length > 25 && hasRole(company.name)) return { skip: "no-company" };

  const roles: string[] = [];
  const places: string[] = [];
  const regions: string[] = [];
  const typeParts: string[] = [];
  const salaryParts: string[] = [];
  const visaParts: string[] = [];
  const headerUrls: string[] = [];
  let remote = false;
  let onsite = false;
  let hybrid = false;
  let atCompany: string | undefined;

  for (const original of rest) {
    if (URL_ONLY_RE.test(original)) {
      headerUrls.push(/^https?:\/\//i.test(original) ? original : `https://${original}`);
      continue;
    }
    const embedded = original.match(/https?:\/\/[^\s)]+/g) ?? [];
    headerUrls.push(...embedded);
    const raw = embedded.reduce((t, u) => t.replace(u, " "), original).replace(/\s+[-–—:]\s*$/, "").replace(/\s+/g, " ").trim();
    if (!raw) continue;
    // A long trailing segment usually swallowed the first sentence of the description.
    const seg = raw.length > 90 ? raw.slice(0, 120).replace(/\([^)]*$/, "").trim() : raw;
    if (SALARY_RE.test(seg) && /\d/.test(seg)) {
      salaryParts.push(raw.length > 90 ? seg : raw);
      continue;
    }
    if (MODE_RE.test(seg) && !(hasRole(seg) && !MODE_RE.test(stripParens(seg)))) {
      const m = parseMode(seg);
      remote ||= m.remote;
      onsite ||= m.onsite;
      hybrid ||= m.hybrid;
      regions.push(...m.regions);
      places.push(...m.places);
      if (VISA_RE.test(seg)) visaParts.push(seg);
      continue;
    }
    if (isTypeOnly(seg)) {
      typeParts.push(typeWords(seg));
      continue;
    }
    if (VISA_RE.test(seg) && seg.split(/\s+/).length <= 6) {
      visaParts.push(seg);
      continue;
    }
    const at = /^(.{2,80}?)\s+@\s+([^@]{2,60})$/.exec(raw);
    if (at?.[1] && at[2] && hasRole(at[1])) {
      atCompany ??= at[2].trim();
      roles.push(...splitRoles(at[1]));
      continue;
    }
    if (raw.length <= 140 && hasRole(raw)) {
      if (MODE_RE.test(seg)) {
        const m = parseMode(seg);
        remote ||= m.remote;
        onsite ||= m.onsite;
        hybrid ||= m.hybrid;
        regions.push(...m.regions);
      }
      roles.push(...splitRoles(raw.replace(/\(\s*(?:remote|on-?site|hybrid)[^)]*\)/gi, " ")));
      continue;
    }
    if (looksLikePlace(seg)) {
      places.push(...splitPlaces(seg));
      continue;
    }
    if (VISA_RE.test(seg)) visaParts.push(seg);
    else if (TYPE_RE.test(seg)) typeParts.push(typeWords(seg));
  }

  // Privacy: a personal name as "company" is a job seeker's or recruiter's own post. Use the "@ Company"
  // employer when the post names one; otherwise skip it — we never store people's names or profile links.
  if (looksLikePersonName(company.name)) {
    if (!atCompany) return { skip: "job-seeker" };
    company.name = cleanCompany(atCompany).name;
  }
  let roleLinks: (string | undefined)[] = roles.map(() => undefined);
  let titleInferred = false;
  if (roles.length === 0) {
    const found = bodyRoles(html);
    if (found.roles.length > 0) {
      roles.push(...found.roles);
      roleLinks = found.links;
    } else {
      roles.push(/\bintern(ship)?s?\b/i.test(typeParts.join(" ")) ? "Internships" : "Multiple roles");
      roleLinks = [undefined];
      titleInferred = true;
    }
  }

  const links = uniq([
    ...headerUrls,
    ...(company.url ? [company.url] : []),
    ...extractLinks(html)
      .map((l) => l.href)
      .filter((h) => /^https?:\/\//i.test(h)),
  ]);
  const ranked = links
    .map((href, i) => ({ href, score: applyLinkScore(href), i }))
    .filter((l) => l.score >= 3)
    .sort((a, b) => b.score - a.score || a.i - b.i);
  const homepage = company.url ?? headerUrls[0] ?? links.find((l) => applyLinkScore(l) === 3);
  const scopes = regions.map((r) => classifyRegion(placeTest(r)));
  const workMode: WorkMode | undefined = hybrid ? "hybrid" : remote && !onsite ? "remote" : onsite && !remote ? "onsite" : undefined;

  return {
    post: {
      commentId: c.id,
      company: company.name,
      companyNote: company.note,
      ycBatch: company.yc,
      companyDomain: (homepage ? companyDomainOf(homepage) : null) ?? (ranked[0] ? companyDomainOf(ranked[0].href) : null),
      roles,
      roleLinks,
      titleInferred,
      locations: uniq(places).slice(0, 10),
      remote,
      remoteRegions: uniq(regions),
      remoteScope: remote ? (scopes.length > 0 ? bestScope(scopes) : "unknown") : null,
      workMode,
      typeText: typeParts.join(" | "),
      salaryRaw: salaryParts.join(" | ") || undefined,
      visa: visaParts.join(" | ") || undefined,
      bestLink: ranked[0]?.href,
      links,
      descriptionHtml: redactPersonalEmails(html),
      postedAt: toIso(c.created_at) ?? toIso(c.created_at_i),
    },
  };
}

/** Job type for one role: the role title wins ("AI Engineer Intern"), else the post's type segments. */
export function jobTypeForRole(role: string, typeText: string): JobType | undefined {
  if (/\bintern(ship)?s?\b/i.test(role)) return "internship";
  const withoutIntern = typeText.replace(/\binternships?\b|\binterns?\b/gi, " ");
  return jobTypeFrom(withoutIntern) ?? (/\bintern/i.test(typeText) && /^internships$/i.test(role) ? "internship" : undefined);
}
