/**
 * Smart search: detects known tokens in free text ("react intern in bangalore 2026 batch") and turns them
 * into SearchQuery filters. Whole-word, case-insensitive, longest phrase first; never matches inside other
 * words ("internal" ≠ intern, "punekar" ≠ pune).
 */
import { LABELS, type SearchQuery } from "@easyjobs/contract";
import { tagLabel } from "@/lib/labels";

export type SmartKey = "level" | "type" | "mode" | "location" | "batch" | "company" | "tag";

export interface SmartToken {
  /** SearchQuery key the token was mapped to */
  key: SmartKey;
  /** Value added to that key, e.g. "intern", "Bengaluru", 2026, "razorpay" */
  value: string | number;
  /** Chip label, e.g. "Internship", "Bengaluru", "2026 batch", "Razorpay" */
  label: string;
  /** The phrase as typed (e.g. "bangalore"); a dropped connector such as "in" is not included */
  match: string;
}

export interface SmartParseResult {
  /** Remaining free text, whitespace-normalised ("" when nothing is left) */
  q: string;
  tokens: SmartToken[];
  /** Filters to merge into the current query (arrays, deduped) */
  patch: Partial<Pick<SearchQuery, SmartKey>>;
}

export interface SmartCompany {
  slug: string;
  name: string;
}

/** alias (lowercase, single-spaced) → canonical city name. Canonical names map to themselves. */
export const CITY_ALIASES: Record<string, string> = {
  bengaluru: "Bengaluru", bangalore: "Bengaluru", blr: "Bengaluru", banglore: "Bengaluru", bengalooru: "Bengaluru",
  hyderabad: "Hyderabad", hyd: "Hyderabad", secunderabad: "Hyderabad",
  pune: "Pune", poona: "Pune",
  gurugram: "Gurugram", gurgaon: "Gurugram", ggn: "Gurugram",
  noida: "Noida", "greater noida": "Noida",
  delhi: "Delhi", "new delhi": "Delhi", "delhi ncr": "Delhi",
  mumbai: "Mumbai", bombay: "Mumbai", "navi mumbai": "Mumbai",
  chennai: "Chennai", madras: "Chennai",
  kolkata: "Kolkata", calcutta: "Kolkata",
  ahmedabad: "Ahmedabad", amdavad: "Ahmedabad",
  kochi: "Kochi", cochin: "Kochi",
  thiruvananthapuram: "Thiruvananthapuram", trivandrum: "Thiruvananthapuram",
  mysuru: "Mysuru", mysore: "Mysuru",
  vadodara: "Vadodara", baroda: "Vadodara",
  visakhapatnam: "Visakhapatnam", vizag: "Visakhapatnam", vishakhapatnam: "Visakhapatnam",
  jaipur: "Jaipur", chandigarh: "Chandigarh", indore: "Indore", coimbatore: "Coimbatore",
  lucknow: "Lucknow", nagpur: "Nagpur", bhubaneswar: "Bhubaneswar",
  // Global cities present in listings
  singapore: "Singapore", london: "London", dublin: "Dublin", "san francisco": "San Francisco",
  seattle: "Seattle", "new york": "New York", nyc: "New York", berlin: "Berlin", amsterdam: "Amsterdam", toronto: "Toronto",
};

const normalizePhrase = (s: string): string => s.toLowerCase().replace(/[\s_-]+/g, " ").trim();

/** Canonical city for an alias ("bangalore" → "Bengaluru"), or null. "remote" is not a city. */
export function canonicalCity(input: string): string | null {
  const key = normalizePhrase(input).replace(/[.,]+$/, "");
  const direct = CITY_ALIASES[key];
  if (direct) return direct;
  // "Bengaluru, IN" / "Pune, Maharashtra" → try the part before the first comma.
  const head = key.split(",")[0]?.trim();
  return head && head !== key ? (CITY_ALIASES[head] ?? null) : null;
}

/* ─────────────────────────── Rules ─────────────────────────── */

interface Rule {
  /** Lowercase words; the special word "#year" matches 2015–2035 */
  words: string[];
  key: SmartKey;
  /** Fixed value, or null for "use the matched year" (batch rules) */
  value: string | number | null;
  label: string | null;
}

const phrase = (text: string): string[] => normalizePhrase(text).split(" ");

function phraseRules(key: SmartKey, value: string, label: string, phrases: string[]): Rule[] {
  return phrases.map((p) => ({ words: phrase(p), key, value, label }));
}

const STATIC_RULES: Rule[] = [
  ...phraseRules("level", "intern", "Internship", ["intern", "interns", "internship", "internships"]),
  ...phraseRules("level", "fresher", "Fresher", [
    "fresher", "freshers", "new grad", "new grads", "new graduate", "new graduates", "graduate trainee", "graduate trainees",
  ]),
  ...phraseRules("level", "entry", "Entry level", ["entry level"]),
  ...phraseRules("mode", "remote", LABELS.workMode.remote, ["remote", "wfh", "work from home"]),
  ...phraseRules("mode", "hybrid", LABELS.workMode.hybrid, ["hybrid"]),
  ...phraseRules("type", "full_time", LABELS.jobType.full_time, ["full time", "fulltime"]),
  ...phraseRules("type", "part_time", LABELS.jobType.part_time, ["part time", "parttime"]),
  ...phraseRules("tag", "off-campus", tagLabel("off-campus"), ["off campus", "offcampus"]),
  ...phraseRules("tag", "walk-in", tagLabel("walk-in"), ["walk in", "walkin", "walk ins", "walkins"]),
  ...Object.entries(CITY_ALIASES).map(([alias, city]): Rule => ({ words: phrase(alias), key: "location", value: city, label: city })),
  ...["#year batch", "batch #year", "batch of #year", "#year passout", "#year passouts", "#year pass out", "#year pass outs", "class of #year"].map(
    (p): Rule => ({ words: p.split(" "), key: "batch", value: null, label: null }),
  ),
];

const LOCATION_CONNECTORS = new Set(["in", "at", "near"]);
const FILLER_WORDS = new Set([
  "jobs", "job", "roles", "role", "openings", "opening", "vacancy", "vacancies", "hiring", "drive", "drives", "opportunities",
]);
const EDGE_CONNECTORS = new Set(["in", "at", "for", "near", "and", "with"]);

const isYear = (w: string): boolean => /^\d{4}$/.test(w) && Number(w) >= 2015 && Number(w) <= 2035;

interface Word {
  /** lowercase, punctuation-trimmed */
  norm: string;
  start: number;
  end: number;
}

/** Split into words on whitespace, hyphens and separators — keeping "c++", "c#", "node.js" intact. */
function splitWords(text: string): Word[] {
  const words: Word[] = [];
  const re = /[^\s,;/|()[\]{}"!?–—-]+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const raw = m[0];
    const lead = raw.length - raw.replace(/^[.'’:]+/, "").length;
    const core = raw.replace(/^[.'’:]+/, "").replace(/[.'’:]+$/, "");
    if (!core) continue;
    words.push({ norm: core.toLowerCase(), start: m.index + lead, end: m.index + lead + core.length });
  }
  return words;
}

interface Match {
  start: number;
  length: number;
  token: SmartToken;
  /** extra word index consumed before the match (a location connector) */
  connector: number | null;
}

function ruleMatchesAt(rule: Rule, words: Word[], at: number): number | null {
  if (at + rule.words.length > words.length) return null;
  let year: number | null = null;
  for (let i = 0; i < rule.words.length; i++) {
    const want = rule.words[i] as string;
    const got = (words[at + i] as Word).norm;
    if (want === "#year") {
      if (!isYear(got)) return null;
      year = Number(got);
    } else if (want !== got) return null;
  }
  return year ?? 0;
}

/** Detect tokens in `text`; `companies` (e.g. from suggest()) enables company detection. */
export function parseSmartQuery(text: string, companies: SmartCompany[] = []): SmartParseResult {
  const words = splitWords(text);
  const rules: Rule[] = [...STATIC_RULES];
  for (const c of companies) {
    if (!c.slug || !c.name) continue;
    const variants = new Set([normalizePhrase(c.name), normalizePhrase(c.slug)]);
    for (const v of variants) {
      if (v.replace(/\s/g, "").length < 3) continue;
      rules.push({ words: v.split(" "), key: "company", value: c.slug.toLowerCase(), label: c.name });
    }
  }

  // Collect every candidate match, then accept longest-first without overlaps.
  const candidates: Match[] = [];
  for (let at = 0; at < words.length; at++) {
    for (const rule of rules) {
      const year = ruleMatchesAt(rule, words, at);
      if (year === null) continue;
      const first = words[at] as Word;
      const last = words[at + rule.words.length - 1] as Word;
      const value = rule.value ?? year;
      candidates.push({
        start: at,
        length: rule.words.length,
        connector: null,
        token: {
          key: rule.key,
          value,
          label: rule.label ?? `${value} batch`,
          match: text.slice(first.start, last.end),
        },
      });
    }
  }
  candidates.sort((a, b) => b.length - a.length || a.start - b.start);
  const used = new Array<boolean>(words.length).fill(false);
  const accepted: Match[] = [];
  for (const m of candidates) {
    let free = true;
    for (let i = m.start; i < m.start + m.length; i++) if (used[i]) free = false;
    if (!free) continue;
    for (let i = m.start; i < m.start + m.length; i++) used[i] = true;
    accepted.push(m);
  }
  // Drop a directly preceding "in" / "at" / "near" before a location.
  for (const m of accepted) {
    const prev = m.start - 1;
    if (m.token.key === "location" && prev >= 0 && !used[prev] && LOCATION_CONNECTORS.has((words[prev] as Word).norm)) {
      used[prev] = true;
      m.connector = prev;
    }
  }
  accepted.sort((a, b) => a.start - b.start);

  // Tokens + patch (deduped by key/value).
  const tokens: SmartToken[] = [];
  const seen = new Set<string>();
  const patch: Partial<Pick<SearchQuery, SmartKey>> = {};
  for (const { token } of accepted) {
    const id = `${token.key}:${String(token.value).toLowerCase()}`;
    if (seen.has(id)) continue;
    seen.add(id);
    tokens.push(token);
    addToPatch(patch, token);
  }

  // Remaining text: remove consumed word spans, filler words and edge connectors.
  let rest = "";
  let cursor = 0;
  words.forEach((w, i) => {
    if (!used[i]) return;
    rest += text.slice(cursor, w.start) + " ";
    cursor = w.end;
  });
  rest += text.slice(cursor);
  let parts = rest.split(/\s+/).filter((p) => /[\p{L}\p{N}]/u.test(p));
  const bare = (p: string): string => p.toLowerCase().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}+#]+$/gu, "");
  parts = parts.filter((p) => !FILLER_WORDS.has(bare(p)));
  while (parts.length > 0 && EDGE_CONNECTORS.has(bare(parts[0] as string))) parts.shift();
  while (parts.length > 0 && EDGE_CONNECTORS.has(bare(parts[parts.length - 1] as string))) parts.pop();
  const q = parts.join(" ").replace(/^[\s,;:|–—-]+|[\s,;:|–—-]+$/g, "").trim();

  return { q, tokens, patch };
}

function addToPatch(patch: Partial<Pick<SearchQuery, SmartKey>>, token: SmartToken): void {
  switch (token.key) {
    case "batch":
      patch.batch = [...(patch.batch ?? []), Number(token.value)];
      break;
    case "level":
      patch.level = [...(patch.level ?? []), token.value as NonNullable<SearchQuery["level"]>[number]];
      break;
    case "type":
      patch.type = [...(patch.type ?? []), token.value as NonNullable<SearchQuery["type"]>[number]];
      break;
    case "mode":
      patch.mode = [...(patch.mode ?? []), token.value as NonNullable<SearchQuery["mode"]>[number]];
      break;
    case "location":
      patch.location = [...(patch.location ?? []), String(token.value)];
      break;
    case "company":
      patch.company = [...(patch.company ?? []), String(token.value)];
      break;
    case "tag":
      patch.tag = [...(patch.tag ?? []), String(token.value)];
      break;
  }
}

function union<T>(a: readonly T[] | undefined, b: readonly T[] | undefined): T[] | undefined {
  if (!b || b.length === 0) return a ? [...a] : undefined;
  const out = [...(a ?? [])];
  for (const v of b) if (!out.includes(v)) out.push(v);
  return out;
}

/** Merge a parse result into a query: union of each list, q = remaining text (or undefined), page reset to 1. */
export function applySmartPatch(query: SearchQuery, result: SmartParseResult): SearchQuery {
  const { patch } = result;
  return {
    ...query,
    q: result.q || undefined,
    level: union(query.level, patch.level),
    type: union(query.type, patch.type),
    mode: union(query.mode, patch.mode),
    location: union(query.location, patch.location),
    batch: union(query.batch, patch.batch),
    company: union(query.company, patch.company),
    tag: union(query.tag, patch.tag),
    page: 1,
  };
}
