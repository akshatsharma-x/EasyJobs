import { SKILL_GROUPS, SKILL_SOURCE, type SkillGroup } from "./data/skills";
import { asString, asStringList, cleanLine, isRecord, titleCase } from "./text";

export type { SkillGroup } from "./data/skills";

type Rule = "" | "C" | "U" | "L";

export interface SkillDef {
  name: string;
  group: SkillGroup;
  soft: boolean;
  order: number;
}

interface AliasEntry {
  tokens: string[];
  skill: SkillDef;
  rule: Rule;
}

/* ─────────────────────────── Tokenizer ─────────────────────────── */

/** Tokens keep inner dots and trailing ++ / + / # so "node.js", ".net", "c++", "c#" survive. */
const TOKEN_RE = /\.?[a-z0-9]+(?:\.[a-z0-9]+)*(?:\+\+|\+|#)?/gi;

interface Tokens {
  text: string;
  lower: string[];
  orig: string[];
  start: number[];
  end: number[];
}

const ALIAS_TOKENS = new Set<string>();

/**
 * Regex-based on purpose: RegExp.exec flattens rope strings (from concatenation/entity decoding) once, while a
 * charCodeAt loop over a rope re-walks it on every access and becomes super-linear.
 */
function tokenize(text: string): Tokens {
  const t: Tokens = { text, lower: [], orig: [], start: [], end: [] };
  const lowered = text.toLowerCase();
  // Same length ⇒ 1:1 character mapping, so tokens can be sliced from the lower-cased copy.
  const aligned = lowered.length === text.length;
  TOKEN_RE.lastIndex = 0;
  for (let m = TOKEN_RE.exec(text); m !== null; m = TOKEN_RE.exec(text)) {
    let orig = m[0];
    let lower = aligned ? lowered.slice(m.index, m.index + orig.length) : orig.toLowerCase();
    if (lower.endsWith("+") && !lower.endsWith("++") && !ALIAS_TOKENS.has(lower)) {
      orig = orig.slice(0, -1);
      lower = lower.slice(0, -1);
    }
    t.orig.push(orig);
    t.lower.push(lower);
    t.start.push(m.index);
    t.end.push(m.index + orig.length);
  }
  return t;
}

function aliasTokens(alias: string): string[] {
  const out: string[] = [];
  TOKEN_RE.lastIndex = 0;
  for (let m = TOKEN_RE.exec(alias); m !== null; m = TOKEN_RE.exec(alias)) out.push(m[0].toLowerCase());
  return out;
}

/* ─────────────────────────── Dictionary ─────────────────────────── */

const FIRST_INDEX = new Map<string, AliasEntry[]>();
const BY_KEY = new Map<string, SkillDef>();
const BY_NAME = new Map<string, SkillDef>();

(function build(): void {
  let order = 0;
  const pending: { tokens: string[]; skill: SkillDef; rule: Rule }[] = [];
  for (const group of SKILL_GROUPS) {
    for (const line of SKILL_SOURCE[group].split("\n")) {
      const sep = line.indexOf(" :: ");
      if (sep < 0) continue;
      const name = line.slice(0, sep).trim();
      const skill: SkillDef = { name, group, soft: group === "soft", order: order++ };
      BY_NAME.set(name.toLowerCase(), skill);
      const seenKeys = new Set<string>();
      for (const rawAlias of line.slice(sep + 4).split("|")) {
        const a = rawAlias.trim();
        if (!a) continue;
        const prefix = a.charAt(0);
        const rule: Rule = prefix === "~" ? "C" : prefix === "=" ? "U" : prefix === "!" ? "L" : "";
        const tokens = aliasTokens(rule ? a.slice(1) : a);
        if (tokens.length === 0) continue;
        seenKeys.add(tokens.join(" "));
        pending.push({ tokens, skill, rule });
      }
      const nameTokens = aliasTokens(name);
      if (nameTokens.length > 0 && !seenKeys.has(nameTokens.join(" "))) pending.push({ tokens: nameTokens, skill, rule: "" });
    }
  }
  for (const p of pending) for (const tok of p.tokens) if (tok.endsWith("+")) ALIAS_TOKENS.add(tok);
  for (const p of pending) {
    const key = p.tokens.join(" ");
    if (!BY_KEY.has(key)) BY_KEY.set(key, p.skill);
    const first = p.tokens[0] as string;
    const list = FIRST_INDEX.get(first);
    if (list) list.push(p);
    else FIRST_INDEX.set(first, [p]);
  }
  for (const list of FIRST_INDEX.values()) list.sort((a, b) => b.tokens.length - a.tokens.length);
})();

/** Group ids (1-based) stored per token while matching, so context rules can ask "is the neighbour an ML skill?". */
const GROUP_ID = new Map<SkillGroup, number>(SKILL_GROUPS.map((g, i) => [g, i + 1]));
const ML_GROUPS = new Set<number>(["ml", "data"].map((g) => GROUP_ID.get(g as SkillGroup) as number));

/** Number of canonical skills in the dictionary. */
export const SKILL_COUNT = BY_NAME.size;

/* ─────────────────────────── Context rules ─────────────────────────── */

const CONJ = new Set(["and", "or", "&"]);
const STRONG_NEXT = new Set([
  "programming", "language", "languages", "lang", "developer", "developers", "development", "engineer", "engineers",
  "backend", "microservices", "code", "codebase", "stack", "framework", "expertise", "experience", "skills", "skill",
  "proficiency", "knowledge", "scripting", "programmer", "programmers", "services", "apis", "sdk", "applications",
  "expert", "specialist", "formulas", "functions", "dashboards", "reports", "reporting", "modules", "certification",
]);
const STRONG_PREV = new Set(["in", "using", "with", "like", "eg", "e.g", "as"]);
/** "AI" is mostly company boilerplate ("data, AI and advanced technology"): only an ML/data neighbour ("AI/ML") counts. */
const NEEDS_ML_NEIGHBOR = new Set(["Artificial Intelligence"]);
/** Only short language names benefit from "experience in X" — "in Spring 2026" must not become a skill. */
const STRONG_PREV_OK = new Set(["C", "R", "Go", "Excel", "Swift", "Julia", "Artificial Intelligence", "Oracle Database"]);
const NEG_NEXT = new Set([
  "suite", "level", "grade", "class", "section", "type", "block", "wing", "to", "live", "getter", "getters", "ahead",
  "above", "beyond", "back", "through", "along", "out", "into", "further", "green", "first", "extra", "the", "a", "an",
  "get", "forward", "over", "off", "down", "up", "around", "d", "s", "t", "corp", "drive",
]);

const isListGap = (g: string): boolean => g.length <= 6 && /^[\s,/|;&+()[\]]*$/.test(g) && /[,/|;&+()[\]]/.test(g);
const isTitleSepGap = (g: string): boolean => g.length <= 6 && /^\s+[-–—|]\s+$|^\s*[|:,(]\s*$/.test(g);

/** Gap between consecutive alias tokens: ≤3 chars of space, "-", "/", "&", ".", "(" or ")" — checked without slicing. */
function phraseGap(t: Tokens, a: number, b: number): boolean {
  const from = t.end[a] as number;
  const to = t.start[b] as number;
  if (to - from > 3) return false;
  for (let i = from; i < to; i++) {
    const c = t.text.charCodeAt(i);
    // space, tab, newline, CR, "-", "/", "&", ".", "(", ")"
    if (c !== 32 && c !== 9 && c !== 10 && c !== 13 && c !== 45 && c !== 47 && c !== 38 && c !== 46 && c !== 40 && c !== 41) return false;
  }
  return true;
}

function gapBetween(t: Tokens, a: number, b: number): string {
  return t.text.slice(t.end[a] as number, t.start[b] as number);
}

function neighborIsSkill(t: Tokens, i: number, dir: -1 | 1, skillAt: Uint8Array, mlOnly = false): boolean {
  const ok = (k: number): boolean => (skillAt[k] ?? 0) > 0 && (!mlOnly || ML_GROUPS.has(skillAt[k] as number));
  const n = t.lower.length;
  const j = i + dir;
  if (j < 0 || j >= n) return false;
  const gap = dir < 0 ? gapBetween(t, j, i) : gapBetween(t, i, j);
  if (CONJ.has(t.lower[j] as string) && /^\s+$/.test(gap)) {
    const k = j + dir;
    if (k < 0 || k >= n) return false;
    const gap2 = dir < 0 ? gapBetween(t, k, j) : gapBetween(t, j, k);
    return gap2.length <= 3 && /^[\s,]*$/.test(gap2) && ok(k);
  }
  return isListGap(gap) && ok(j);
}

function contextOk(t: Tokens, i: number, last: number, skill: SkillDef, skillAt: Uint8Array, inTitle: boolean): boolean {
  const n = t.lower.length;
  const after = last + 1 < n ? gapBetween(t, last, last + 1) : "";
  const nextTok = last + 1 < n ? (t.lower[last + 1] as string) : "";
  if (/^[-'’&]/.test(after) && after.length <= 2) return false;
  if (nextTok && NEG_NEXT.has(nextTok) && !isListGap(after)) return false;
  const mlOnly = NEEDS_ML_NEIGHBOR.has(skill.name);
  if (neighborIsSkill(t, i, -1, skillAt, mlOnly) || neighborIsSkill(t, last, 1, skillAt, mlOnly)) return true;
  if (mlOnly && !inTitle) return false;
  if (nextTok && STRONG_NEXT.has(nextTok) && /^\s+$/.test(after)) return true;
  const prevTok = i > 0 ? (t.lower[i - 1] as string) : "";
  const before = i > 0 ? gapBetween(t, i - 1, i) : "";
  if (STRONG_PREV_OK.has(skill.name) && STRONG_PREV.has(prevTok) && /^\s+$/.test(before) && (after === "" || /^\s*[,.;:)/]/.test(after))) {
    return true;
  }
  if (inTitle) {
    const beforeOk = i === 0 || isTitleSepGap(before) || /\(\s*$/.test(before);
    const afterOk = last + 1 >= n || isTitleSepGap(after) || /^\s*[)/,]/.test(after);
    if ((beforeOk && afterOk) || (i > 0 && isTitleSepGap(before) && last + 1 >= n)) return i > 0 || last + 1 < n;
  }
  return false;
}

function caseOk(orig: string, rule: Rule): boolean {
  if (rule === "") return true;
  const c = orig.charAt(0) === "." ? orig.charAt(1) : orig.charAt(0);
  if (rule === "U") return /[A-Z]/.test(orig) && orig === orig.toUpperCase();
  return c >= "A" && c <= "Z";
}

/* ─────────────────────────── Matching ─────────────────────────── */

interface Hit {
  skill: SkillDef;
  count: number;
  inTitle: boolean;
  first: number;
}

const MAX_SCAN = 40_000;

function scan(text: string, inTitle: boolean, hits: Map<string, Hit>, offset: number): void {
  if (!text) return;
  const t = tokenize(text.length > MAX_SCAN ? text.slice(0, MAX_SCAN) : text);
  const n = t.lower.length;
  if (n === 0) return;
  const noCase = !/[A-Z]/.test(t.text);
  const skillAt = new Uint8Array(n);
  const deferred: { i: number; entry: AliasEntry }[] = [];

  const record = (skill: SkillDef, i: number, len: number): void => {
    const gid = GROUP_ID.get(skill.group) ?? 1;
    for (let k = i; k < i + len; k++) skillAt[k] = gid;
    const h = hits.get(skill.name);
    if (h) {
      h.count++;
      h.inTitle ||= inTitle;
    } else hits.set(skill.name, { skill, count: 1, inTitle, first: offset + i });
  };

  for (let i = 0; i < n; i++) {
    const cands = FIRST_INDEX.get(t.lower[i] as string);
    if (!cands) continue;
    for (const entry of cands) {
      const len = entry.tokens.length;
      if (i + len > n) continue;
      let ok = true;
      for (let k = 1; k < len; k++) {
        if (t.lower[i + k] !== entry.tokens[k] || !phraseGap(t, i + k - 1, i + k)) {
          ok = false;
          break;
        }
      }
      if (!ok) continue;
      const rule: Rule = noCase && entry.rule !== "" ? "L" : entry.rule;
      if (rule === "L") {
        if (noCase || caseOk(t.orig[i] as string, "C")) deferred.push({ i, entry });
        break;
      }
      if (!caseOk(t.orig[i] as string, rule)) continue;
      record(entry.skill, i, len);
      i += len - 1;
      break;
    }
  }
  // Context-dependent aliases resolve to a fixpoint: "react, node, mongodb" in all-lower-case text.
  for (let round = 0, changed = true; changed && round < 4; round++) {
    changed = false;
    for (const d of deferred) {
      const last = d.i + d.entry.tokens.length - 1;
      if (skillAt[d.i] !== 0) continue;
      if (contextOk(t, d.i, last, d.entry.skill, skillAt, inTitle)) {
        record(d.entry.skill, d.i, d.entry.tokens.length);
        changed = true;
      }
    }
  }
}

export interface SkillMatch {
  name: string;
  group: SkillGroup;
  count: number;
  inTitle: boolean;
  soft: boolean;
}

export interface SkillInput {
  title?: string | null;
  description?: string | null;
  department?: string | null;
}

export const MAX_SKILLS = 12;

/** All skills found, ranked: title presence → hard before soft → frequency → first occurrence. */
export function extractSkillsDetailed(input: SkillInput | string): SkillMatch[] {
  const src: SkillInput = typeof input === "string" ? { description: input } : isRecord(input) ? input : {};
  const hits = new Map<string, Hit>();
  scan(asString(src.title), true, hits, 0);
  scan(asString(src.department), false, hits, 100_000);
  scan(asString(src.description), false, hits, 200_000);
  return [...hits.values()]
    .sort(
      (a, b) =>
        Number(b.inTitle) - Number(a.inTitle) ||
        Number(a.skill.soft) - Number(b.skill.soft) ||
        b.count - a.count ||
        a.first - b.first,
    )
    .map((h) => ({ name: h.skill.name, group: h.skill.group, count: h.count, inTitle: h.inTitle, soft: h.skill.soft }));
}

/** Up to 12 canonical skill names from title/department/description (title skills first, then by frequency). */
/** Soft skills are kept only for jobs with few hard skills, and at most this many ("Communication" is in a third of all postings). */
const MAX_SOFT = 2;
const SOFT_ONLY_BELOW_HARD = 6;

export function extractSkills(input: SkillInput | string, max = MAX_SKILLS): string[] {
  const all = extractSkillsDetailed(input);
  const hard = all.filter((m) => !m.soft);
  const soft = hard.length < SOFT_ONLY_BELOW_HARD ? all.filter((m) => m.soft).slice(0, MAX_SOFT) : [];
  return [...hard, ...soft]
    .slice(0, max)
    .map((m) => m.name);
}

/** Canonical name for a skill label ("ReactJS" → "React", "MS-Excel" → "Excel"); null if unknown. */
export function canonicalizeSkill(label: string): string | null {
  const s = cleanLine(label);
  if (!s) return null;
  const byName = BY_NAME.get(s.toLowerCase());
  if (byName) return byName.name;
  const key = aliasTokens(s).join(" ");
  const direct = BY_KEY.get(key);
  if (direct) return direct.name;
  const found = extractSkillsDetailed({ title: s });
  return found.length === 1 ? (found[0] as SkillMatch).name : null;
}

export function skillGroupOf(name: string): SkillGroup | null {
  return BY_NAME.get(name.toLowerCase())?.group ?? null;
}

const JUNK_SKILL = /^(?:n\/?a|none|nil|na|any|other|others|etc|-+|\d+)$/i;

/** Clean scraper-provided skill hints: canonicalize known ones, keep tidy unknown ones, dedupe, cap at 12. */
export function cleanSkillList(input: unknown, max = MAX_SKILLS): string[] {
  const raw = typeof input === "string" ? input.split(/\s*[,;|]\s*/) : asStringList(input);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const s = cleanLine(item).replace(/^[•*\-–\s]+|[\s.,;:]+$/g, "");
    if (!s || s.length > 40 || JUNK_SKILL.test(s)) continue;
    const name = canonicalizeSkill(s) ?? (s === s.toLowerCase() ? titleCase(s) : s);
    const k = name.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(name);
    if (out.length >= max) break;
  }
  return out;
}
