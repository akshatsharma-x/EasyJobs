import { decodeHTML } from "entities";

/** Decode HTML entities ("&#8211;" → "–", "&amp;" → "&"). */
export function decodeEntities(input: string): string {
  return decodeHTML(input);
}

/** Collapse whitespace (incl. NBSP) and zero-width characters, then trim. */
export function normalizeSpace(input: string): string {
  return input
    .replace(/[\u200B-\u200D\uFEFF\u00AD]/g, "")
    .replace(/[\s\u00A0\u2007\u202F]+/g, " ")
    .trim();
}

/** Strip tags from a small HTML fragment and decode entities. Not for full documents. */
export function htmlFragmentToText(fragment: string): string {
  return normalizeSpace(decodeEntities(fragment.replace(/<[^>]*>/g, " ")));
}

/** Lowercase + strip accents + collapse non-alphanumerics to single spaces. */
export function foldText(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[\u0300-\u036F]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Remove emoji / pictographs / variation selectors. */
export function stripEmoji(input: string): string {
  return input.replace(/[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}\uFE0F\u20E3]/gu, "");
}

export function truncate(input: string, max: number): string {
  return input.length <= max ? input : `${input.slice(0, max - 1).trimEnd()}…`;
}

/** Unique, order-preserving, case-insensitive. */
export function uniqueCi(values: Iterable<string>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    const key = v.toLowerCase();
    if (!v || seen.has(key)) continue;
    seen.add(key);
    out.push(v);
  }
  return out;
}

/** Deterministic 32-bit FNV-1a hash → 8 hex chars (cache keys for non-secret data). */
export function hashString(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}
