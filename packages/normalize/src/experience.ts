import { asString, NUMBER_WORDS } from "./text";

export interface ExperienceRange {
  /** Years; 0.5 = six months */
  min: number | null;
  max: number | null;
}

export interface ParseExperienceOptions {
  /**
   * Strict mode for free text (descriptions): a years phrase only counts when it is clearly about
   * required experience ("3+ years of experience", "Experience: 2-4 yrs"), never "a 2-year bond" or
   * "we have 25 years of experience".
   */
  strict?: boolean;
}

const NUM = String.raw`(\d{1,2}(?:\.\d{1,2})?)`;
const YRS = String.raw`(?:years?|yrs?|yr)\.?`;
const MOS = String.raw`(?:months?|mos?|mths?)\.?`;
const DASH = String.raw`\s*(?:-|to|~|or)\s*`;

const RE_RANGE_MIXED = new RegExp(String.raw`\b${NUM}\s*${MOS}${DASH}${NUM}\s*${YRS}`, "i");
const RE_RANGE_MONTHS = new RegExp(String.raw`\b${NUM}${DASH}${NUM}\s*${MOS}`, "i");
const RE_RANGE = new RegExp(String.raw`\b${NUM}\s*(?:${YRS})?${DASH}${NUM}\s*\+?\s*${YRS}`, "i");
const RE_BETWEEN = new RegExp(String.raw`\bbetween\s+${NUM}\s*(?:${YRS})?\s*(?:and|&|-)\s*${NUM}\s*${YRS}`, "i");
const RE_PLUS = new RegExp(String.raw`\b${NUM}\s*(?:\+\s*${YRS}|${YRS}\s*\+|${YRS}\s+(?:or\s+more|and\s+(?:above|more)|plus|minimum|min\.?|or\s+above|&\s*above))`, "i");
const RE_ATLEAST = new RegExp(String.raw`(?:\b(?:at\s*least|atleast|minimum(?:\s+of)?|min\.?|over|more\s+than|above|greater\s+than|in\s+excess\s+of)|>\s*=?)\s*${NUM}\s*\+?\s*${YRS}`, "i");
const RE_UPTO = new RegExp(String.raw`(?:\b(?:up\s*to|upto|max(?:imum)?(?:\s+of)?|less\s+than|under|not\s+more\s+than|below)|<\s*=?)\s*${NUM}\s*${YRS}`, "i");
const RE_UPTO_MONTHS = new RegExp(String.raw`(?:\b(?:up\s*to|upto|max(?:imum)?(?:\s+of)?|less\s+than|under)|<\s*=?)\s*${NUM}\s*${MOS}`, "i");
const RE_SINGLE = new RegExp(String.raw`\b${NUM}\s*\+?\s*${YRS}`, "i");
const RE_SINGLE_MONTHS = new RegExp(String.raw`\b${NUM}\s*${MOS}`, "i");
const RE_BARE_RANGE = /^\s*(\d{1,2}(?:\.\d)?)\s*(?:-|to|–)\s*(\d{1,2}(?:\.\d)?)\s*$/i;
const RE_BARE_NUM = /^\s*(\d{1,2}(?:\.\d)?)\s*\+?\s*$/;

const RE_FRESHER = /\bfresh(?:er|ers|ers?\s*graduates?)\b|\bnew\s+grad(?:uate)?s?\b|\brecent\s+grad(?:uate)?s?\b/i;
const RE_EXPERIENCED = /\b(?:experienced|exp\.?\s*(?:candidates|professionals))\b/i;
const RE_NO_EXP =
  /\b(?:no|zero|0)\s+(?:prior\s+|previous\s+|work\s+)?experience\s*(?:is\s+)?(?:required|needed|necessary|mandatory)?|(?:^|[.!?•:;\n(]\s*|\b(?:prior|previous|work|any)\s+)experience\s+(?:is\s+)?not\s+(?:required|needed|necessary|mandatory)\b|\bno\s+experience\b/i;

const EXP_CONTEXT = /\b(?:experience|exp\b|exp\.|expertise|professional|industry|relevant|hands[\s-]?on|work(?:ing)?\s+in|background\s+in|track\s+record)/i;
const BAD_CONTEXT =
  /\b(?:bond|agreement|contract(?:ual)?\s+period|service\s+(?:agreement|period|commitment)|warranty|old|age[ds]?|aged|of\s+age|tenure|lease|guarantee|in\s+business|founded|established|since|legacy|heritage|history|we\s+have|we've|our\s+(?:team|company|firm|clients)|with\s+over|for\s+over|boasts?|celebrat\w*|anniversary|journey|existence|ago|duration|period\s+of|span\s+of|program(?:me)?|course|degree|graduat\w*|internship\s+of|validity|last|next|within|every|per|each)\b/i;
const EXP_WORD = /\b(?:experience|exp\b|exp\.|expertise)/i;
const AFTER_BAD =
  /\b(?:old|age|bond|agreement|ago|warranty|program(?:me)?|course|degree|contract|service|b\.?\s?tech|b\.?\s?e\b|graduation|study|studies|bachelor|master)/i;
/** "5+ years in/of/as/building …" — the phrase itself states experience even without the word. */
const EXP_AFTER = /^\s*(?:of\s+(?!age\b)|in\s+(?!the\s+(?:last|next|past)\b)|with\b|as\s+an?\b|working\b|building\b|developing\b|designing\b|leading\b|managing\b|hands[\s-]?on\b|post[\s-]qualification|relevant\b|professional\b|industry\b|exp\b|exp\.|experience\b)/i;
/** "3-5 years", "3.5 years to 8 years", "8yrs -14yrs", "2+ yrs": a unit may follow either number. */
const STRICT_CANDIDATE =
  /(?<![\d.,])\d{1,2}(?:\.\d{1,2})?\s*(?:(?:years?|yrs?|yr)\.?\s*)?(?:\+\s*)?(?:(?:-|–|—|−|to|~|and|&)\s*\d{1,2}(?:\.\d{1,2})?\s*)?\+?\s*(?:years?|yrs?|yr|months?|mos?)\b\.?\s*\+?/gi;
/** Number words before a unit ("two years") need the full prepare() pass; digits don't. */
const WORD_YEARS = /\b(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty)\s*\+?\s*(?:(?:-|–|to)\s*\w+\s*)?(?:years?|yrs?|months?)\b/i;

const MAX_YEARS = 40;
const CLAUSE_END = /[\n\r•▪●◦·]|[.;!?](?:\s|$)/;

function num(s: string | undefined): number | null {
  if (s === undefined) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function finalize(min: number | null, max: number | null): ExperienceRange | null {
  let lo = min !== null ? round1(min) : null;
  let hi = max !== null ? round1(max) : null;
  if (lo !== null && (lo < 0 || lo > MAX_YEARS)) return null;
  if (hi !== null && (hi < 0 || hi > MAX_YEARS + 10)) return null;
  if (lo !== null && hi !== null && lo > hi) [lo, hi] = [hi, lo];
  if (lo === null && hi === null) return null;
  return { min: lo, max: hi };
}

function prepare(text: string): string {
  return text
    .replace(/[–—−]/g, "-")
    .replace(/\b(zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty)(?=\s*\+?\s*(?:(?:-|to)\s*\w+\s*)?(?:years?|yrs?|months?|mos?)\b)/gi, (w) =>
      String(NUMBER_WORDS[w.toLowerCase()] ?? w),
    )
    .replace(/\bfreshers?\s*(?:-|to)\s*(?=\d)/gi, "0 - ")
    .replace(/(\d)\s*(?:yrs?|years?)\s*(?:-|to)\s*(\d)/gi, "$1 - $2");
}

interface Found {
  index: number;
  length: number;
  range: ExperienceRange;
}

function matchOne(s: string): Found | null {
  const tries: [RegExp, (m: RegExpExecArray) => ExperienceRange | null][] = [
    [RE_RANGE_MIXED, (m) => finalize((num(m[1]) ?? 0) / 12, num(m[2]))],
    [RE_BETWEEN, (m) => finalize(num(m[1]), num(m[2]))],
    [RE_RANGE, (m) => finalize(num(m[1]), num(m[2]))],
    [RE_RANGE_MONTHS, (m) => finalize((num(m[1]) ?? 0) / 12, (num(m[2]) ?? 0) / 12)],
    [RE_UPTO, (m) => finalize(0, num(m[1]))],
    [RE_UPTO_MONTHS, (m) => finalize(0, (num(m[1]) ?? 0) / 12)],
    [RE_ATLEAST, (m) => finalize(num(m[1]), null)],
    [RE_PLUS, (m) => finalize(num(m[1]), null)],
    [RE_SINGLE, (m) => {
      const n = num(m[1]);
      return n === 0 ? finalize(0, 0) : finalize(n, null);
    }],
    [RE_SINGLE_MONTHS, (m) => {
      const n = num(m[1]);
      return n === null || n > 36 ? null : finalize(n === 0 ? 0 : n / 12, n === 0 ? 0 : null);
    }],
  ];
  let best: Found | null = null;
  for (const [re, build] of tries) {
    const m = re.exec(s);
    if (!m) continue;
    const range = build(m);
    if (!range) continue;
    // Earliest match wins; among equal starts the more specific (earlier in this list) wins.
    if (!best || m.index < best.index) best = { index: m.index, length: m[0].length, range };
  }
  return best;
}

function strictMatches(s: string): ExperienceRange | null {
  if (!/y(?:ea)?rs?|months?|mos?\b/i.test(s)) return null;
  // Each candidate is judged on its own context, so "a 2 year bond" can't leak into the next phrase.
  STRICT_CANDIDATE.lastIndex = 0;
  let checked = 0;
  for (let m = STRICT_CANDIDATE.exec(s); m !== null && checked < 40; m = STRICT_CANDIDATE.exec(s)) {
    checked++;
    const start = m.index;
    const end = start + m[0].length;
    // Judge context within the current clause only.
    // A newline or bullet always ends a clause ("2-3 month sales cycles\n• Experience with …" are two clauses).
    const before = s.slice(Math.max(0, start - 45), start).split(CLAUSE_END).pop() ?? "";
    const after = s.slice(end, end + 45).split(CLAUSE_END)[0] ?? "";
    const after25 = after.slice(0, 25);
    const hasContext = EXP_CONTEXT.test(before) || EXP_CONTEXT.test(after) || EXP_AFTER.test(after);
    if (!hasContext) continue;
    if (BAD_CONTEXT.test(before.slice(-30))) continue;
    if (!EXP_WORD.test(before) && !EXP_WORD.test(after25) && AFTER_BAD.test(after25)) continue;
    // Prefix keeps qualifiers ("minimum", "up to", "between") but not other numbers; suffix keeps "or more".
    const prefix = s.slice(Math.max(0, start - 28), start).replace(/\d/g, " ");
    const suffix = s.slice(end, end + 20).replace(/\d/g, " ");
    const found = matchOne(prepare(prefix + m[0] + suffix));
    if (!found) continue;
    if (found.range.min !== null && found.range.min >= 25) continue;
    return found.range;
  }
  return null;
}

/**
 * "0-2 Yrs" → {0,2} · "2+ years" → {2,null} · "1 to 3 years" → {1,3} · "minimum 3 years" → {3,null}
 * "Freshers" → {0,0} · "fresher/experienced" → {0,null} · "6 months - 1 year" → {0.5,1} · "up to 2 years" → {0,2}
 * Returns null when nothing experience-like is found.
 */
export function parseExperience(input: unknown, opts: ParseExperienceOptions = {}): ExperienceRange | null {
  const raw = asString(input);
  if (!raw.trim()) return null;
  const capped = raw.length > 50_000 ? raw.slice(0, 50_000) : raw;
  if (opts.strict) {
    // Descriptions: scan the raw text (only small windows are normalized) unless number words need prepare().
    const numeric = strictMatches(WORD_YEARS.test(capped) ? prepare(capped) : capped);
    if (numeric) return numeric;
    return RE_NO_EXP.test(capped) ? { min: 0, max: 0 } : null;
  }
  const text = prepare(capped);

  if (!opts.strict) {
    const bare = RE_BARE_RANGE.exec(text);
    if (bare) return finalize(num(bare[1]), num(bare[2]));
    const bareNum = RE_BARE_NUM.exec(text);
    if (bareNum) {
      const n = num(bareNum[1]);
      return n === 0 ? finalize(0, 0) : finalize(n, null);
    }
  }

  const fresher = RE_FRESHER.test(text);
  const experienced = RE_EXPERIENCED.test(text);
  const noExp = RE_NO_EXP.test(text);
  const numeric = opts.strict ? strictMatches(text) : (matchOne(text)?.range ?? null);

  if (numeric) {
    // "Freshers or 1-3 years" / "Fresher/2+ yrs": freshers are eligible too.
    if ((fresher || noExp) && !opts.strict && numeric.min !== null && numeric.min > 0) return { min: 0, max: numeric.max };
    return numeric;
  }
  if (opts.strict) {
    if (noExp) return { min: 0, max: 0 };
    return null;
  }
  if (fresher && experienced) return { min: 0, max: null };
  if (fresher || noExp) return { min: 0, max: 0 };
  return null;
}
