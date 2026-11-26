/**
 * Free-text query → tsquery SQL.
 *  - websearch syntax ("quoted phrases", -negation, OR) parsed into term groups; each term/phrase becomes
 *    websearch_to_tsquery(...) so synonyms and both text configs can be attached per term
 *  - synonym expansion (sde ↔ software engineer, ml ↔ machine learning, bangalore ↔ bengaluru, …)
 *  - prefix matching on the last token while typing ("devel" → developer)
 *  - every term matches both the 'simple' lexemes (title/company/skills/meta) and 'english' stems (description)
 * Token normalisation mirrors the SQL function ej_search_norm (parity is tested).
 */
import { sql, type SQL } from "drizzle-orm";

/** Bidirectional synonym groups (lower case; multi-word phrases allowed). */
export const SYNONYM_GROUPS: readonly (readonly string[])[] = [
  ["sde", "swe", "software engineer", "software developer", "software development engineer"],
  ["ml", "machine learning"],
  ["ai", "artificial intelligence"],
  ["frontend", "front end", "front-end"],
  ["backend", "back end", "back-end"],
  ["fullstack", "full stack", "full-stack"],
  ["fresher", "freshers", "new grad", "graduate trainee", "graduate engineer trainee"],
  ["intern", "internship", "trainee"],
  ["wfh", "remote", "work from home"],
  ["bangalore", "bengaluru"],
  ["gurgaon", "gurugram"],
  ["bombay", "mumbai"],
  ["madras", "chennai"],
  ["calcutta", "kolkata"],
  ["trivandrum", "thiruvananthapuram"],
  ["cochin", "kochi"],
  ["mysore", "mysuru"],
  ["js", "javascript"],
  ["ts", "typescript"],
  ["golang", "go developer"],
  ["k8s", "kubernetes"],
  ["qa", "quality assurance", "tester"],
  ["sre", "site reliability"],
  ["ux", "user experience"],
  ["hr", "human resources"],
  ["devops", "dev ops"],
  ["dotnet", ".net"],
  ["nodejs", "node.js"],
];

const SYNONYMS: Map<string, readonly string[]> = (() => {
  const m = new Map<string, readonly string[]>();
  for (const group of SYNONYM_GROUPS) for (const phrase of group) m.set(phrase, group);
  return m;
})();
const MAX_PHRASE_WORDS = 3;

/** JS mirror of SQL ej_search_norm (Postgres \m / \M ≈ the look-arounds below). */
export function normalizeSearchText(input: string): string {
  return input
    .toLowerCase()
    .replace(/c\+\+/g, " cpp ")
    .replace(/(?<![a-z0-9_])c#/g, " csharp ")
    .replace(/(?<![a-z0-9_])f#/g, " fsharp ")
    .replace(/\.net(?![a-z0-9_])/g, " dotnet ")
    .replace(/([a-z0-9]+)\.js(?![a-z0-9_])/g, "$1js $1");
}

const stripAccents = (s: string): string => s.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
/** Characters with meaning in tsquery syntax are removed (to_tsquery input must be safe). */
const TSQUERY_SPECIALS = /[&|!():*<>'\\"]/g;

export interface TermGroup {
  /** OR of alternatives; each alternative is a phrase (words AND-ed, or adjacent when `phrase`). */
  alternatives: string[];
  phrase: boolean;
  negated: boolean;
  /** Raw last token typed without a trailing space → also match it as a prefix. */
  prefix: string | null;
  /** Join with the next group by OR instead of AND. */
  orNext: boolean;
}

export interface ParsedText {
  groups: TermGroup[];
  /** Plain words eligible for typo correction (non-negated, ≥ 3 chars). */
  words: string[];
  /** Lower-cased, operator-free string for the trigram fallback. */
  plain: string;
}

/** Parse q (already trimmed/capped by parseSearchQuery). */
export function parseText(q: string | undefined): ParsedText {
  const input = stripAccents((q ?? "").trim()).toLowerCase();
  const typingLast = input.length > 0 && !/\s$/.test(q ?? "") && !input.endsWith('"');
  type Tok = { text: string; quoted: boolean; negated: boolean; isOr: boolean };
  const toks: Tok[] = [];
  for (const m of input.matchAll(/(-?)"([^"]*)"?|(\S+)/g)) {
    if (m[2] !== undefined) {
      const text = m[2].replace(TSQUERY_SPECIALS, " ").trim();
      if (text) toks.push({ text, quoted: true, negated: m[1] === "-", isOr: false });
      continue;
    }
    let raw = m[3] ?? "";
    if (raw === "or") {
      toks.push({ text: raw, quoted: false, negated: false, isOr: true });
      continue;
    }
    const negated = raw.length > 1 && raw.startsWith("-");
    if (negated) raw = raw.slice(1);
    const text = raw.replace(TSQUERY_SPECIALS, " ").replace(/^[^\p{L}\p{N}.#+]+|[^\p{L}\p{N}+#]+$/gu, "").trim();
    if (text) toks.push({ text, quoted: false, negated, isOr: false });
  }

  const groups: TermGroup[] = [];
  const words: string[] = [];
  let i = 0;
  while (i < toks.length) {
    const t = toks[i]!;
    if (t.isOr) {
      if (groups.length > 0) groups[groups.length - 1]!.orNext = true;
      i++;
      continue;
    }
    if (t.quoted || t.negated) {
      groups.push({ alternatives: [t.text], phrase: t.quoted, negated: t.negated, prefix: null, orNext: false });
      i++;
      continue;
    }
    // Greedy longest synonym phrase over consecutive plain tokens.
    let matched: { len: number; group: readonly string[] } | null = null;
    for (let n = Math.min(MAX_PHRASE_WORDS, toks.length - i); n >= 1; n--) {
      const slice = toks.slice(i, i + n);
      if (slice.some((s) => s.quoted || s.negated || s.isOr)) continue;
      const group = SYNONYMS.get(slice.map((s) => s.text).join(" "));
      if (group) {
        matched = { len: n, group };
        break;
      }
    }
    const isLast = (len: number): boolean => i + len === toks.length;
    if (matched) {
      const lastTok = toks[i + matched.len - 1]!;
      groups.push({
        alternatives: [...matched.group],
        phrase: false,
        negated: false,
        prefix: typingLast && isLast(matched.len) && lastTok.text.length >= 2 ? lastTok.text : null,
        orNext: false,
      });
      i += matched.len;
      continue;
    }
    groups.push({
      alternatives: [t.text],
      phrase: false,
      negated: false,
      prefix: typingLast && isLast(1) && t.text.length >= 2 ? t.text : null,
      orNext: false,
    });
    if (t.text.length >= 3) words.push(t.text);
    i++;
  }
  const plain = toks
    .filter((t) => !t.isOr && !t.negated)
    .map((t) => t.text)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
  return { groups, words, plain };
}

/**
 * One term or phrase → websearch_to_tsquery in both configs ('simple' lexemes for title/company/skills/meta,
 * 'english' stems for the description). The parser has already removed operators, so websearch syntax reduces
 * to AND of words (or a phrase when quoted).
 */
function alternativeSql(text: string, phrase: boolean): SQL {
  const normalized = normalizeSearchText(text).replace(/\s+/g, " ").trim();
  const input = phrase ? `"${normalized}"` : normalized;
  return sql`(websearch_to_tsquery('simple', ${input}) || websearch_to_tsquery('english', ${input}))`;
}

function prefixSql(token: string): SQL | null {
  const words = normalizeSearchText(token)
    .split(/\s+/)
    .map((w) => w.replace(/[^\p{L}\p{N}]/gu, ""))
    .filter(Boolean);
  if (words.length === 0) return null;
  const last = words[words.length - 1]!;
  const rest = words.slice(0, -1).join(" ");
  const pre = sql`to_tsquery('simple', ${`${last}:*`})`;
  return rest ? sql`(websearch_to_tsquery('simple', ${rest}) && ${pre})` : pre;
}

/** SQL expression producing the tsquery for the parsed text, with optional typo corrections OR-ed in. */
export function tsqueryExpr(parsed: ParsedText, corrections: ReadonlyMap<string, string> = new Map()): SQL | null {
  if (parsed.groups.length === 0) return null;
  const parts: SQL[] = parsed.groups.map((g) => {
    const alts: SQL[] = g.alternatives.map((a) => alternativeSql(a, g.phrase));
    for (const a of g.alternatives) {
      const fix = corrections.get(a);
      if (fix) alts.push(alternativeSql(fix, false));
    }
    if (g.prefix) {
      const p = prefixSql(g.prefix);
      if (p) alts.push(p);
    }
    const body = sql.join(alts, sql` || `);
    return g.negated ? sql`(!! (${body}))` : sql`(${body})`;
  });
  let expr = parts[0]!;
  for (let k = 1; k < parts.length; k++) {
    expr = parsed.groups[k - 1]!.orNext ? sql`(${expr} || ${parts[k]!})` : sql`(${expr} && ${parts[k]!})`;
  }
  return expr;
}
