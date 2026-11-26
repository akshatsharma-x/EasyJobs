/**
 * Small, allocation-light text helpers shared by every normalizer module.
 * All functions are pure and linear-time (no backtracking-prone regexes).
 */
import { decodeHTML } from "entities";

const ZERO_WIDTH_RE = /[\u{200B}-\u{200D}\u{2060}\u{FEFF}\u{00AD}]/gu;
const WS_RE = /[\s\u{00A0}\u{1680}\u{2000}-\u{200A}\u{2028}\u{2029}\u{202F}\u{205F}\u{3000}]+/gu;
/** Pictographs, flags, skin tones, tag chars, variation selectors, keycap combiner. */
const EMOJI_RE =
  /[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}\u{1F3FB}-\u{1F3FF}\u{E0020}-\u{E007F}\u{FE0E}\u{FE0F}\u{20E3}\u{200D}]/gu;

/** Coerce unknown input (garbage RawJob fields) to a string without throwing. */
export function asString(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

/** Coerce unknown input to a list of non-empty strings. */
export function asStringList(value: unknown): string[] {
  if (typeof value === "string") return value.trim() ? [value] : [];
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const v of value) {
    const s = asString(v).trim();
    if (s) out.push(s);
  }
  return out;
}

/** Collapse all whitespace (incl. NBSP and friends) to single spaces and drop zero-width chars. */
export function collapseWhitespace(s: string): string {
  return s.replace(ZERO_WIDTH_RE, "").replace(WS_RE, " ").trim();
}

/** Decode HTML entities only when there is something to decode. */
export function decodeEntities(s: string): string {
  return s.includes("&") ? decodeHTML(s) : s;
}

export function stripEmoji(s: string): string {
  return s.replace(EMOJI_RE, "");
}

/** Clean a short single-line string: entities, emoji, whitespace. */
export function cleanLine(value: unknown): string {
  return collapseWhitespace(stripEmoji(decodeEntities(asString(value))));
}

/** Lowercase + strip diacritics. Used for dictionary keys ("Zürich" → "zurich"). */
export function fold(s: string): string {
  // ASCII fast path: NFKD normalization is the expensive part and a no-op for plain ASCII.
  if (!/[^\u{0}-\u{7F}]/u.test(s)) return s.toLowerCase();
  return s.normalize("NFKD").replace(/[\u{0300}-\u{036F}]/gu, "").toLowerCase();
}

/** Lookup key: folded, "&"→"and", punctuation → spaces, collapsed. */
export function keyOf(s: string): string {
  return fold(s)
    .replace(/&/g, " and ")
    .replace(/[.'’`]/g, "")
    .replace(/[^a-z0-9+#]+/g, " ")
    .trim();
}

export function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const LOWER_WORDS = new Set(["a", "an", "and", "as", "at", "by", "for", "in", "of", "on", "or", "the", "to", "via", "with", "from"]);

/**
 * Title-case words, keeping known acronyms upper-case.
 * "SENIOR JAVA DEVELOPER - AWS" → "Senior Java Developer - AWS"
 */
export function titleCase(s: string, acronyms: ReadonlySet<string> = new Set()): string {
  let first = true;
  return s.replace(/[A-Za-z][A-Za-z0-9'’.&+#]*/g, (word) => {
    const upper = word.toUpperCase();
    const lower = word.toLowerCase();
    const wasFirst = first;
    first = false;
    if (acronyms.has(upper)) return upper;
    if (acronyms.has(word)) return word;
    if (!wasFirst && LOWER_WORDS.has(lower)) return lower;
    return lower.charAt(0).toUpperCase() + lower.slice(1);
  });
}

/** Truncate at a word boundary, appending "…" when cut. */
export function truncateWords(s: string, max: number): string {
  if (s.length <= max) return s;
  const cut = s.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,;:.\-–—|/]+$/, "")}…`;
}

/** Stable de-duplication preserving first occurrence. */
export function uniq<T>(items: Iterable<T>, key: (item: T) => string | number = (x) => String(x)): T[] {
  const seen = new Set<string | number>();
  const out: T[] = [];
  for (const item of items) {
    const k = key(item);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(item);
  }
  return out;
}

const FLATTEN_RE = /^/;
/**
 * Force V8 to flatten a rope (cons) string in place. charCodeAt loops over ropes re-walk the rope on every access;
 * RegExp execution flattens its subject once, after which character access is O(1).
 */
export function flatten(s: string): string {
  FLATTEN_RE.test(s);
  return s;
}

export function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** An input or options object from an untyped caller: the value itself when it is an object, else `{}`. */
export function bag<T extends object>(value: T | null | undefined): T {
  return (isRecord(value) ? value : {}) as T;
}

/** A usable reference time: `value` when it is a valid Date, else the current time. */
export function validNow(value: unknown): Date {
  return value instanceof Date && Number.isFinite(value.getTime()) ? value : new Date();
}

/** Number words used in experience/batch parsing. */
export const NUMBER_WORDS: Readonly<Record<string, number>> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, eighteen: 18, twenty: 20,
};
