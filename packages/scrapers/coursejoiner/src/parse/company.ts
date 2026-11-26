/** Company name extraction (KV, "About X", title, tags, lead sentences) + company↔URL matching. */
import type { WpTerm } from "../wp/types";
import type { ContentModel } from "./dom";
import type { KeyValue } from "./labels";
import { foldText, normalizeSpace, stripEmoji } from "../util/text";
import { urlNameTokens } from "./hosts";

/* ───────────── company key & URL matching ───────────── */

const LEGAL_WORDS = new Set([
  "private", "pvt", "limited", "ltd", "llp", "llc", "inc", "incorporated", "corporation", "corp", "co", "company", "plc",
  "gmbh", "ag", "sa", "bv", "nv", "pte", "pty", "the",
]);
/** Dropped only at the end of a name ("Amazon India" → amazon), never at the start ("Indian Army"). */
const TRAILING_GENERIC = new Set(["india", "indian", "global", "international", "group", "technologies", "technology", "solutions", "services"]);
const ACRONYM_SKIP = new Set(["of", "and", "the", "for", "in", "at"]);

export interface CompanyKey {
  name: string;
  concat: string;
  acronyms: string[];
  tokens: string[];
}

export function companyKey(name: string): CompanyKey {
  const parens = [...name.matchAll(/\(([^)]{2,12})\)/g)].map((m) => foldText(m[1] ?? "").replace(/ /g, ""));
  const base = name.replace(/\([^)]*\)/g, " ").replace(/\.(com|in|co|io|ai)\b/gi, " ");
  const words = foldText(base).split(" ").filter(Boolean);
  const core = words.filter((w) => !LEGAL_WORDS.has(w));
  while (core.length > 1 && TRAILING_GENERIC.has(core[core.length - 1]!) && !ACRONYM_SKIP.has(core[core.length - 2]!)) core.pop();
  const kept = core.length > 0 ? core : words;
  const significant = kept.filter((w) => !ACRONYM_SKIP.has(w));
  const concat = kept.join("");
  const acronyms = new Set<string>(parens.filter((p) => p.length >= 2));
  if (significant.length >= 2) acronyms.add(significant.map((w) => w[0]).join(""));
  if (kept.length >= 2) acronyms.add(kept.map((w) => w[0]).join(""));
  const tokens = significant.filter((w) => w.length >= 4);
  return { name, concat, acronyms: [...acronyms].filter((a) => a.length >= 2), tokens };
}

/** True when a token (host label / ATS tenant / path slug part) plausibly names the company. */
export function tokenMatchesCompany(token: string, key: CompanyKey): boolean {
  const t = token.toLowerCase();
  if (!t || !key.concat) return false;
  if (t === key.concat) return true;
  if (key.acronyms.includes(t)) return true;
  if (key.concat.length >= 3 && t.startsWith(key.concat) && t.length - key.concat.length <= 8) return true;
  if (t.length >= 4 && key.concat.startsWith(t)) return true;
  if (key.concat.length >= 5 && t.includes(key.concat)) return true;
  if (key.tokens.some((w) => w === t && w.length >= 4)) return true;
  return false;
}

export function urlMatchesCompany(url: string, keys: CompanyKey | CompanyKey[] | null): boolean {
  const list = keys === null ? [] : Array.isArray(keys) ? keys : [keys];
  if (list.length === 0) return false;
  const tokens = urlNameTokens(url);
  return list.some((key) => tokens.some((t) => tokenMatchesCompany(t, key)));
}

/* ───────────── candidate extraction ───────────── */

/** Words that may trail a company name in titles but are really role/department/season words. */
const TRAILING_NOISE = new Set([
  "intern", "interns", "internship", "internships", "trainee", "trainees", "traineeship", "apprentice", "apprentices", "apprenticeship",
  "engineer", "engineers", "engineering", "developer", "developers", "analyst", "analysts", "associate", "associates", "executive",
  "executives", "manager", "managers", "specialist", "consultant", "officer", "officers", "representative", "assistant", "programmer",
  "scientist", "administrator", "architect", "lead", "designer", "writer", "technician", "operator", "accountant", "auditor",
  "support", "sales", "marketing", "hr", "it", "ai", "ml", "data", "software", "finance", "financial", "desk", "service", "process",
  "voice", "customer", "care", "graduate", "graduates", "fresher", "freshers", "sde", "swe", "qa", "test", "testing", "research",
  "product", "project", "program", "programme", "business", "operations", "ops", "technical", "junior", "senior", "sr", "jr",
  "entry", "level", "summer", "winter", "spring", "fall", "autumn", "paid", "unpaid", "virtual", "remote", "online", "offline",
  "hybrid", "mega", "bulk", "new", "latest", "industrial", "management", "cyber", "security", "cloud", "devops", "full", "stack",
  "frontend", "backend", "web", "mobile", "digital", "content", "social", "media", "talent", "acquisition", "legal", "audit",
  "tax", "risk", "banking", "network", "system", "systems", "dev", "development", "design", "creative", "video", "editor",
  "i", "ii", "iii", "iv", "1", "2", "3", "4", "cs", "ece", "eee", "mba", "ca", "nqt", "sp", "dse", "get", "b", "tech", "be", "btech", "mtech", "work", "from", "home", "wfh",
]);

const ROLE_ENDING = /\b(?:interns?|internships?|trainees?|apprentices?|engineers?|developers?|analysts?|associates?|executives?|managers?|specialists?|consultants?|officers?|representatives?|assistants?|programmers?|scientists?|administrators?|architects?|designers?|writers?|technicians?|operators?|accountants?|auditors?|sde|swe|freshers?|graduates?)$/i;

const BAD_COMPANY =/^(?:government|govt|central government|state government|remote|work from home|wfh|online|free|latest|top|best|paid|virtual|summer|winter|apply|apply for|jobs?|internships?|freshers?|graduates?|students?|multiple|various|mega|bulk|urgent|new|hot|today|daily|india|indian|pan india|all india|off campus|walk ?in|exclusive|breaking|official|direct|unknown|n\/?a|company|organization|organisation|employer|na|several|many|top companies|it companies|mnc|mncs|startups?)$/i;

const TITLE_BOUNDARY = new RegExp(
  String.raw`\b(?:(?:summer|winter|spring|fall|autumn|paid|unpaid|virtual|remote|online|offline|free|mega|bulk|global|national|work from home|wfh|research|industrial|direct|urgent)\s+)*` +
    String.raw`(?:internships?|interns?|jobs?|recruitments?|hiring|careers?|off[\s-]?campus|on[\s-]?campus|pool[\s-]?campus|walk[\s-]?ins?|walkin|drives?|` +
    String.raw`apprentice(?:ship)?s?|trainee(?:ship)?s?|vacanc(?:y|ies)|notification|placements?|fellowships?|program(?:me)?s?|opportunit(?:y|ies)|openings?|is hiring|hires|recruiting|registrations?)\b|\b20\d\d(?:[-–]\d\d)?\b|\s[|:;–—]\s?`,
  "i",
);

export interface CompanyCandidate {
  name: string;
  source: "kv" | "about" | "title" | "tag" | "sentence" | "link";
  score: number;
}

export function cleanCompanyName(raw: string): string {
  let s = normalizeSpace(stripEmoji(raw))
    .replace(/^(?:m\/s\.?|about|the company|company)\s+/i, "")
    .replace(/\s*[,;|].*$/, "")
    .replace(/\s+(?:company|organization|organisation)\s*$/i, "")
    .replace(/\.(?:com|in|co\.in|io|ai)$/i, "")
    .replace(/[\s:–—-]+$/, "")
    .replace(/^[\s:–—-]+/, "");
  // "Electronic Arts (EA)" → "Electronic Arts"; "Cisco (Silicon One Engineering Team)" → "Cisco".
  const withoutParen = s.replace(/\s*\([^)]*\)\s*$/, "").trim();
  if (withoutParen.length >= 2) s = withoutParen;
  if (s.length > 70) s = s.slice(0, 70).replace(/\s+\S*$/, "");
  return s;
}

function plausibleCompany(name: string): boolean {
  if (!name || name.length < 2 || name.length > 70) return false;
  if (BAD_COMPANY.test(name)) return false;
  if (!/[A-Za-z]/.test(name)) return false;
  if (name.split(/\s+/).length > 7) return false;
  if (/^(?:for|in|at|on|with|by|and|or)\b/i.test(name)) return false;
  return true;
}

function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0;
  const re = new RegExp(`(?<![a-z0-9])${needle.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![a-z0-9])`, "g");
  return (haystack.match(re) ?? []).length;
}

/**
 * "Cisco Finance Analyst" → "Cisco" and "FedEx Data Analyst" → "FedEx" (role phrases stripped), while keeping
 * multi-word names the body uses on their own ("Mahindra Finance HR Fresher" → "Mahindra Finance").
 */
function trimTrailingRoleWords(phrase: string, bodyLower: string): string {
  const words = phrase.split(/\s+/).filter(Boolean);
  let coreLen = words.length;
  while (coreLen > 1 && (TRAILING_NOISE.has(foldText(words[coreLen - 1] ?? "")) || /^\d+$/.test(words[coreLen - 1] ?? ""))) coreLen--;
  if (coreLen === words.length) return phrase;
  const core = words.slice(0, coreLen).join(" ");
  const coreFreq = countOccurrences(bodyLower, core);
  if (coreFreq === 0) return core;
  for (let n = words.length; n > coreLen; n--) {
    const v = words.slice(0, n).join(" ");
    if (ROLE_ENDING.test(v)) continue; // never a company name
    const next = words[n];
    if (!next) {
      // The full title phrase is repeated by AI-written bodies; require it to dominate.
      if (countOccurrences(bodyLower, v) >= Math.max(2, 0.6 * coreFreq)) return v;
      continue;
    }
    // Occurrences of the shorter form that are not just the longer role phrase ("FedEx Data" inside "FedEx Data Analyst").
    const standalone = countOccurrences(bodyLower, v) - countOccurrences(bodyLower, `${v} ${next}`);
    if (standalone >= Math.max(2, 0.3 * coreFreq)) return v;
  }
  return core;
}

/** Company phrase from a post title (site-agnostic). */
export function companyFromTitle(title: string, bodyLower: string): string | null {
  const t = normalizeSpace(stripEmoji(title));
  // "Urgent opening in Tech Mahindra for …", "Walk-in drive at Wipro …"
  const inAt = /\b(?:opening|openings|vacanc(?:y|ies)|jobs?|hiring|recruitment|internships?|drive|walk[\s-]?in)\s+(?:in|at|@)\s+([A-Z][\w&.'’-]*(?:\s+[A-Z][\w&.'’-]*){0,4})/.exec(t);
  const m = TITLE_BOUNDARY.exec(t);
  let phrase = m && m.index > 0 ? t.slice(0, m.index) : "";
  phrase = phrase.replace(/[\s,:;|–—-]+$/, "").replace(/^(?:latest|urgent|exclusive|breaking|big news|good news)\s*[:!-]?\s*/i, "");
  if ((!phrase || !plausibleCompany(cleanCompanyName(phrase))) && inAt?.[1]) phrase = inAt[1];
  if (!phrase) return null;
  const trimmed = trimTrailingRoleWords(phrase, bodyLower);
  const cleaned = cleanCompanyName(trimmed);
  return plausibleCompany(cleaned) ? cleaned : null;
}

const TAG_SUFFIX = /-(?:internships?|interns?|jobs?|recruitment|hiring|apprenticeships?|apprentice|off-campus(?:-drive)?|walk-in(?:-drive)?|trainee(?:ship)?|careers?|vacanc(?:y|ies)|placements?|programs?|programmes?|fellowships?|work-from-home(?:-jobs?)?|drive)(?:-20\d\d)?(?:-\d+)?$/;

/** "firstcry-internship-2026" → matching title words ("FirstCry"). */
export function companyFromTags(tags: WpTerm[], title: string): string | null {
  const titleWords = normalizeSpace(stripEmoji(title)).split(/\s+/);
  for (const tag of tags) {
    const m = TAG_SUFFIX.exec(tag.slug);
    if (!m) continue;
    const prefix = tag.slug.slice(0, m.index).replace(/-20\d\d$/, "");
    if (!prefix || prefix.length < 2) continue;
    // Find consecutive title words whose slug equals the prefix.
    for (let i = 0; i < titleWords.length; i++) {
      let acc = "";
      for (let j = i; j < Math.min(titleWords.length, i + 6); j++) {
        acc = foldText(titleWords.slice(i, j + 1).join(" ")).replace(/ /g, "-");
        if (acc === prefix) return cleanCompanyName(titleWords.slice(i, j + 1).join(" "));
        if (!prefix.startsWith(acc)) break;
      }
    }
    const fromSlug = prefix.split("-").map((w) => (w.length <= 3 ? w.toUpperCase() : w[0]!.toUpperCase() + w.slice(1))).join(" ");
    if (plausibleCompany(fromSlug)) return fromSlug;
  }
  return null;
}

const ABOUT = /^about\s+(?:the\s+)?(?:company\s*[:–-]\s*)?(.+?)\s*[:?.!]*$/i;
const ABOUT_SKIP = /^(?:the\s+)?(?:role|job|jobs|internship|program(?:me)?|position|company|us|course|drive|opportunity|this\b|recruitment|hiring|vacancy|post|employer|organi[sz]ation|walk|off campus|apprenticeship|traineeship|fellowship|scheme|exam|test|selection|team|author|coursejoiner)/i;

export function companyFromAbout(model: ContentModel): string | null {
  for (const line of model.lines) {
    const isHeadingLike = line.headingLevel > 0 || (line.text.length <= 60 && /^about\s/i.test(line.text));
    if (!isHeadingLike || line.inFaq) continue;
    const m = ABOUT.exec(line.text);
    if (!m) continue;
    const inner = normalizeSpace(m[1] ?? "");
    if (!inner || ABOUT_SKIP.test(inner) || /\b20\d\d\b/.test(inner) || /\b(internship|job|recruitment|hiring|drive)\b/i.test(inner)) continue;
    const cleaned = cleanCompanyName(inner);
    if (plausibleCompany(cleaned)) return cleaned;
  }
  return null;
}

const LEAD_SENTENCE = /\b([A-Z][\w&.'’-]*(?:\s+(?:of\s+|&\s+)?[A-Z][\w&.'’-]*){0,4})\s+(?:\([A-Z]{2,8}\)\s+)?(?:has\s+(?:opened|announced|released|invited|started|launched|begun)|is\s+(?:hiring|looking|inviting|recruiting|offering|seeking)|invites|announces|hires|opens)\b/;

export function companyFromLead(model: ContentModel): string | null {
  for (const line of model.lines.slice(0, 12)) {
    if (line.headingLevel > 0 || /^(read more|also read)/i.test(line.text)) continue;
    const text = line.text.replace(/^[A-Z][a-z]+(?:\s[A-Z][a-z]+)?:\s+/, ""); // "New Delhi: …" datelines
    const m = LEAD_SENTENCE.exec(text);
    if (!m?.[1]) continue;
    const cleaned = cleanCompanyName(m[1]);
    if (plausibleCompany(cleaned) && !/^(?:the|this|our|we|it|they|candidates?|students?|applicants?)$/i.test(cleaned)) return cleaned;
  }
  return null;
}

function agrees(a: string, b: string): boolean {
  const fa = foldText(a).replace(/ /g, "");
  const fb = foldText(b).replace(/ /g, "");
  if (!fa || !fb) return false;
  return fa === fb || fa.includes(fb) || fb.includes(fa) || companyKey(a).acronyms.includes(fb) || companyKey(b).acronyms.includes(fa);
}

export interface CompanyResult {
  name: string | null;
  source: CompanyCandidate["source"] | null;
  candidates: CompanyCandidate[];
  confidence: number;
}

export function extractCompany(input: {
  kv: Partial<Record<string, KeyValue>>;
  model: ContentModel;
  title: string;
  tags: WpTerm[];
  bodyLower: string;
}): CompanyResult {
  const candidates: CompanyCandidate[] = [];
  const kv = input.kv["company"];
  if (kv) {
    const cleaned = cleanCompanyName(kv.value);
    if (plausibleCompany(cleaned)) candidates.push({ name: cleaned, source: "kv", score: 100 });
  }
  const about = companyFromAbout(input.model);
  if (about) candidates.push({ name: about, source: "about", score: 65 });
  const fromTitle = companyFromTitle(input.title, input.bodyLower);
  if (fromTitle) candidates.push({ name: fromTitle, source: "title", score: 60 });
  const fromTag = companyFromTags(input.tags, input.title);
  if (fromTag) candidates.push({ name: fromTag, source: "tag", score: 40 });
  const lead = companyFromLead(input.model);
  if (lead) candidates.push({ name: lead, source: "sentence", score: 45 });

  // Agreement bonuses.
  for (const c of candidates) {
    for (const o of candidates) if (o !== c && agrees(c.name, o.name)) c.score += o.source === "kv" ? 10 : 15;
  }
  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0];
  if (!best) return { name: null, source: null, candidates, confidence: 0 };
  // Prefer the title spelling when the title and the winner agree but the title is shorter & cleaner (e.g. "EA" vs "Electronic Arts (EA)" stays KV).
  const confidence = Math.min(1, best.score / 100);
  return { name: best.name, source: best.source, candidates, confidence };
}
