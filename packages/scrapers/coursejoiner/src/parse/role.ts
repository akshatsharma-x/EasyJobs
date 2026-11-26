/** Role/title extraction and cleanup. */
import type { ContentModel } from "./dom";
import { companyKey, tokenMatchesCompany } from "./company";
import { foldText, normalizeSpace, stripEmoji } from "../util/text";
import { CITY_RE } from "./geo";

/** A word that makes a phrase a job title. */
export const ROLE_NOUN = new RegExp(
  String.raw`\b(?:intern(?:ship)?s?|trainee(?:s|ship)?|apprentice(?:ship)?s?|engineers?|developers?|analysts?|associates?|executives?|managers?|specialists?|consultants?|officers?|representatives?|assistants?|programmers?|scientists?|administrators?|admin|architects?|leads?|designers?|writers?|technicians?|operators?|accountants?|auditors?|advisors?|advisers?|agents?|coordinators?|testers?|editors?|marketers?|researchers?|fellows?|teachers?|tutors?|faculty|nurses?|pharmacists?|chemists?|clerks?|cashiers?|drivers?|guards?|supervisors?|directors?|head|sde(?:[-\s]?(?:i{1,3}|[123]))?|swe|sdet|qa|devops|sre|support|counsel(?:l)?ors?|recruiters?|strategists?|planners?|investigators?|instructors?|trainers?|technologists?|mechanics?|electricians?|stewards?|crew|pilots?|attendants?|controllers?|economists?|actuar(?:y|ies)|underwriters?|bankers?|tellers?|copywriters?|translators?|interpreters?|photographers?|videographers?|animators?|artists?|producers?|journalists?|reporters?|moderators?|annotators?|transcriptionists?|telecallers?|tele[\s-]?callers?|data entry|voice process|chat process|non[\s-]?voice|graduate engineer trainee|get|mts|member of technical staff|staff|partner|expert|ambassador|helper|lecturer|professor|cook|chef|picker|packer|loader|delivery|rider|merchandiser|surveyor|draftsman|draughtsman|welder|fitter|machinist|inspector|navigator)\b`,
  "i",
);

export function looksLikeRole(text: string): boolean {
  const t = normalizeSpace(text);
  if (!t || t.length > 110) return false;
  if (/^(?:click|apply|register|visit|check|read|join|download|official|https?:)/i.test(t)) return false;
  return ROLE_NOUN.test(t);
}

/** Phrases that are metadata, not part of a job title (location, mode, pay, eligibility, CTA). */
const META_CHUNK = new RegExp(
  String.raw`\b(?:apply|now|today|asap|hybrid|remote|on-?site|onsite|wfh|work from home|lpa|lakh|lacs?|ctc|stipend|salary|per month|batch|graduates? only|freshers?|eligible|eligibility|any (?:graduate|stream|degree)|last date|deadline|multiple locations?|pan[\s-]?india|across india|india|location|cities|\d{1,2}\s*(?:months?|weeks?)|full[\s-]?time|part[\s-]?time)\b|₹|\brs\.?\s*\d|\binr\b|\/\s*month|\b20\d\d\b|${CITY_RE.source}`,
  "i",
);

const TRAILING_CITY = new RegExp(String.raw`\s+\b(?:in|at)\s+(?:${CITY_RE.source})(?:\s*(?:,|\/|&|and)\s*(?:${CITY_RE.source}))*\s*$`, "i");

/** Clean a role candidate ("Software Engineering Intern, 2027" → "Software Engineering Intern"). */
export function cleanRole(raw: string, company?: string | null): string {
  let s = normalizeSpace(stripEmoji(raw));
  s = s.replace(/^(?:apply\s+(?:for|on|to)\s+(?:the\s+)?|open\s+the\s+|role\s*[:–-]\s*|position\s*[:–-]\s*|post\s*[:–-]\s*)/i, "");
  // Leading requisition codes ("M00I0: Intern – Professional", "JR12345 - Analyst").
  s = s.replace(/^(?=[A-Z0-9-]*\d)[A-Z0-9-]{4,12}\s*[:–—-]\s+/, "");
  // "Internship Programme 2026 opens" → "Intern"
  s = s.replace(/\b(intern(?:ship)?)\s+program(?:me)?s?\b/gi, "$1");
  s = s.replace(/\s+\b(?:opens?|opened|announced|released|out|started|begins|is live|live|launched)\s*$/i, "");
  // Remove listing/portal noise.
  s = s.replace(/\b(?:listing|job page|job post(?:ing)?|job description|jd)\b(?:\s+on\s+\w+)?/gi, " ");
  s = s.replace(/\bon\s+(?:naukri|linkedin|indeed|amazon\.jobs|workday|the official portal|official portal|superset|unstop|internshala|zimyo)\b/gi, " ");
  s = s.replace(/\((?:\s*(?:req(?:uisition)?|job)?\s*(?:id|no\.?)?\s*[:#]?\s*[A-Z]{0,3}[-_]?\d{4,}[\w-]*\s*)\)/gi, " ");
  s = s.replace(/\b(?:req(?:uisition)?|job\s*id|id)\s*[:#]?\s*[A-Z]{0,3}[-_]?\d{4,}[\w-]*\b/gi, " ");
  s = s.replace(/\b[A-Z]{1,3}[-_]?\d{5,}(?:-\d+)?\b/g, " ");
  s = s.replace(/\b\d{5,}\b/g, " ");
  s = s.replace(/\((?:[^)]*\b(?:20\d\d|batch|graduates?|remote|hybrid|onsite|months?)\b[^)]*)\)/gi, " ");
  s = s.replace(/\(\s*(?:alternate|alternative|another|second|2nd|backup|new|old|main|official)?\s*(?:link|listing|posting|url)?\s*\d*\s*\)/gi, " ");
  s = s.replace(/\s*[-–—|,]?\s*\b(?:apply\s+(?:now|online|today|here|asap)|apply)\b.*$/i, "");
  s = s.replace(/\s+\b(?:(?:is\s+|now\s+)?open(?:s|ed)?|available)\s+(?:for|to)\b.*$/i, "");
  s = s.replace(/\s+\bfor\s+(?:freshers?|graduates?|college students|students|engineering students|ug|pg|any (?:graduate|stream)|b\.?\s?tech|be|mba|ca|women|bachelor(?:'?s|’s)?|master(?:'?s|’s)?)\b.*$/i, "");
  s = s.replace(/\s+\b(?:now\s+)?open(?:\s+now)?\s*$/i, "");
  s = s.replace(TRAILING_CITY, "");
  s = s.replace(/,?\s*\b20\d\d(?:\s*[-–]\s*\d{2,4})?\b/g, "");
  s = s.replace(/\b(?:vacanc(?:y|ies)|jobs?|hiring|recruitment|openings?|opportunit(?:y|ies)|posts?|positions?|role|roles|drive|notification)\s*$/i, "");
  s = s.replace(/\s+\b(?:naukri|linkedin|req(?:uisition)?|job\s*id|id|ref)\b[\s:#·•-]*$/i, "");
  if (company) s = stripCompanyPrefix(s, company);
  s = s.replace(/\bInternship\b/g, "Intern").replace(/\binternship\b/g, "intern");
  s = s.replace(/\s{2,}/g, " ").replace(/^[\s,:;|–—·•-]+|[\s,:;|–—·•(-]+$/g, "").trim();
  s = s.replace(/\(\s*\)/g, "").trim();
  if (s === s.toLowerCase() || (s === s.toUpperCase() && s.length > 6)) s = titleCase(s);
  if (s.length > 100) s = s.slice(0, 100).replace(/\s+\S*$/, "");
  return s;
}

/** "Honeywell Intern (Bachelor’s)" → "Intern (Bachelor’s)": drops a leading company name (exact name/acronym match only). */
export function stripCompanyPrefix(s: string, company: string): string {
  const key = companyKey(company);
  const words = s.split(/\s+/);
  for (let n = Math.min(5, words.length - 1); n >= 1; n--) {
    const prefix = foldText(words.slice(0, n).join(" ")).replace(/ /g, "");
    const exact = prefix === key.concat || key.acronyms.includes(prefix) || (prefix.length >= 4 && key.concat.startsWith(prefix) && n < words.length);
    if (!exact) continue;
    const rest = words.slice(n).join(" ").replace(/^[\s:–—-]+/, "");
    if (ROLE_NOUN.test(rest)) return rest;
  }
  return s;
}

function titleCase(s: string): string {
  return s
    .toLowerCase()
    .replace(/\b([a-z])([a-z]*)/g, (_, a: string, b: string) => {
      const w = a + b;
      if (/^(?:and|or|of|for|the|in|at|to|a|an|on|with)$/.test(w)) return w;
      if (/^(?:it|hr|qa|ai|ml|ui|ux|sde|swe|sql|aws|bpo|mts|get|ii|iii|iv)$/.test(w)) return w.toUpperCase();
      return a.toUpperCase() + b;
    })
    .replace(/^([a-z])/, (c) => c.toUpperCase());
}

/** Keep comma chunks until one is clearly metadata ("Software Engineering Intern, Hybrid, Hyderabad" → first chunk). */
function cutMeta(segment: string): string {
  const pre = segment.replace(/\s*\((?:[^)]*\b(?:20\d\d|batch|graduates?|remote|hybrid|onsite|months?|stipend|lpa)\b[^)]*)\)/gi, " ");
  const chunks = pre.split(/\s*,\s*/);
  const kept: string[] = [];
  for (const c of chunks) {
    if (kept.length > 0 && META_CHUNK.test(c)) break;
    if (kept.length === 0 && META_CHUNK.test(c) && !ROLE_NOUN.test(c)) continue;
    kept.push(c);
  }
  return kept.join(", ");
}

const HIRING_FOR = /\b(?:hiring|recruitment|recruiting|hires?|openings?|vacanc(?:y|ies)|drive|walk[\s-]?ins?|off[\s-]?campus|internships?|jobs?|is looking)\b[^|]*?\bfor\s+(?:the\s+)?(?:role\s+of\s+|post\s+of\s+|position\s+of\s+|profile\s+of\s+)?(?:an?\s+)?([^|]+)/i;

/** Role from the post title (site-agnostic heuristics). */
export function roleFromTitle(title: string, company: string | null): string | null {
  const t = normalizeSpace(stripEmoji(title));
  const segments = t.split(/\s*(?:\||:|;|\s[–—]\s|\s-\s)\s*/).map((s) => s.trim()).filter(Boolean);
  // 1) "… Hiring Freshers for Graduate Trainee | Any Graduates"
  const hf = HIRING_FOR.exec(t);
  if (hf?.[1]) {
    const cand = cleanRole(cutMeta(hf[1].split(/\s*(?:\||\s[–—]\s)\s*/)[0] ?? ""), company);
    if (looksLikeRole(cand)) return cand;
  }
  // 2) later segments with a role noun ("EA Internship 2027 | Software Engineering Intern, Hybrid, …")
  for (const seg of segments.slice(1)) {
    if (!ROLE_NOUN.test(seg)) continue;
    const cand = cleanRole(cutMeta(seg), company);
    if (looksLikeRole(cand) && !/^(?:interns?|internship)$/i.test(cand)) return cand;
  }
  // 3) first segment minus company & boundary words ("Oracle Support Engineer 2026", "Amazon SDE 1 2026")
  const first = segments[0] ?? "";
  if (company) {
    const key = companyKey(company);
    const words = first.split(/\s+/);
    let start = 0;
    for (let n = 1; n <= Math.min(5, words.length); n++) {
      const prefix = foldText(words.slice(0, n).join(" ")).replace(/ /g, "");
      if (prefix === key.concat || key.acronyms.includes(prefix) || (n === 1 && tokenMatchesCompany(prefix, key) && prefix.length >= key.concat.length)) {
        start = n;
        break;
      }
    }
    const rest = words.slice(start).join(" ");
    const stripped = rest
      .replace(/\b(?:off[\s-]?campus(?:\s+drive)?|recruitment|hiring|walk[\s-]?in(?:\s+drive)?|drive|careers?|notification|jobs?|vacanc(?:y|ies)|20\d\d)\b/gi, " ")
      .trim();
    if (ROLE_NOUN.test(stripped)) {
      const cand = cleanRole(cutMeta(stripped), company);
      if (looksLikeRole(cand)) return cand;
    }
  }
  // 4) any segment that has a role noun, incl. "Talent Acquisition Internship Open for Any Stream"
  for (const seg of segments) {
    if (!ROLE_NOUN.test(seg)) continue;
    const cand = cleanRole(cutMeta(seg), company);
    if (looksLikeRole(cand)) return cand;
  }
  return null;
}

const BODY_ROLE_PATTERNS = [
  /\bfor\s+the\s+(?:position|role|post|profile)\s+of\s+([^.;:()]{3,70})/i,
  /\b(?:applications?|candidates)\s+for\s+(?:the\s+|its\s+)?([^.;:()]{3,70}?)\s+(?:role|position|post|profile|programme|program|vacanc(?:y|ies))\b/i,
  /\b(?:is|are)\s+hiring\s+(?:for\s+)?(?:an?\s+|the\s+)?([^.;:()]{3,60}?)\s+(?:role|position|post|in|at|for|to|with)\b/i,
  /\b(?:is|are)\s+looking\s+for\s+(?:an?\s+|the\s+)?([^.;:()]{3,60}?)\s+(?:in|at|for|to|with|who|role|position)\b/i,
];

/** Role from the first paragraphs of the body. */
export function roleFromBody(model: ContentModel, company: string | null): string | null {
  for (const line of model.lines.slice(0, 15)) {
    if (line.headingLevel > 0 || line.cells || /^(read more|also read)/i.test(line.text)) continue;
    for (const re of BODY_ROLE_PATTERNS) {
      const m = re.exec(line.text);
      if (!m?.[1]) continue;
      const cand = cleanRole(cutMeta(m[1]), company);
      if (looksLikeRole(cand)) return cand;
    }
  }
  return null;
}

/** Normalize a KV role value ("Software Engineering Intern, 2027"). */
export function roleFromValue(value: string, company: string | null): string | null {
  const cand = cleanRole(cutMeta(value.split(/\s*[|;]\s*/)[0] ?? value), company);
  return cand && cand.length >= 2 ? cand : null;
}

/** Role named by an apply-link anchor ("Specialist Programmer (Trainee) listing on Naukri"). */
export function roleFromAnchor(text: string, company: string | null): string | null {
  if (!looksLikeRole(text.replace(/^apply\s+(?:for|on|to)\s+/i, ""))) return null;
  const cand = cleanRole(text, company);
  return looksLikeRole(cand) ? cand : null;
}
