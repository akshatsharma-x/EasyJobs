import { decodeHTML, escapeText } from "entities";

/** Decodes HTML entities (named, decimal, hex). */
export function decodeEntities(s: string): string {
  return s.includes("&") ? decodeHTML(s) : s;
}

/** HTML → readable plain text (block tags become line breaks, entities decoded, whitespace collapsed per line). */
export function htmlToPlain(html: string): string {
  const withBreaks = html
    .replace(/<\s*(script|style)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, " ")
    .replace(/<\s*br\s*\/?\s*>/gi, "\n")
    .replace(/<\s*\/?\s*(p|div|li|ul|ol|h[1-6]|tr|table|blockquote|pre|section|article)\b[^>]*>/gi, "\n")
    .replace(/<[^>]*>/g, " ");
  return decodeEntities(withBreaks)
    .split("\n")
    .map((line) => line.replace(/[\s\u200b]+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

/** Plain text → minimal safe HTML (paragraphs, escaped). */
export function textToHtml(text: string): string {
  return text
    .split(/\n{2,}|\r\n\r\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${escapeText(p).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

/** Strips tags from a short inline string (titles, labels) and decodes entities. */
export function stripInline(s: string): string {
  return decodeEntities(s.replace(/<[^>]*>/g, "")).replace(/[\s\u200b]+/g, " ").trim();
}

export interface HtmlLink {
  href: string;
  text: string;
}

/** All <a href> links in document order (href entity-decoded). */
export function extractLinks(html: string): HtmlLink[] {
  const out: HtmlLink[] = [];
  const re = /<a\b[^>]*?\bhref\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))[^>]*>([\s\S]*?)<\/a\s*>/gi;
  for (const m of html.matchAll(re)) {
    const href = decodeEntities((m[2] ?? m[3] ?? m[4] ?? "").trim());
    if (href) out.push({ href, text: stripInline(m[5] ?? "") });
  }
  return out;
}

/* ─────────────── Mojibake repair (UTF-8 bytes mis-decoded as Windows-1252) ─────────────── */

const CP1252_HIGH: Record<number, number> = {
  0x20ac: 0x80, 0x201a: 0x82, 0x0192: 0x83, 0x201e: 0x84, 0x2026: 0x85, 0x2020: 0x86, 0x2021: 0x87,
  0x02c6: 0x88, 0x2030: 0x89, 0x0160: 0x8a, 0x2039: 0x8b, 0x0152: 0x8c, 0x017d: 0x8e, 0x2018: 0x91,
  0x2019: 0x92, 0x201c: 0x93, 0x201d: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97, 0x02dc: 0x98,
  0x2122: 0x99, 0x0161: 0x9a, 0x203a: 0x9b, 0x0153: 0x9c, 0x017e: 0x9e, 0x0178: 0x9f,
};

function cp1252Byte(ch: string): number | null {
  const code = ch.codePointAt(0) ?? -1;
  if (code >= 0x80 && code <= 0xff) return code;
  return CP1252_HIGH[code] ?? null;
}

const CONTINUATION = "[\\u0080-\\u00bf\\u0152\\u0153\\u0160\\u0161\\u0178\\u017d\\u017e\\u0192\\u02c6\\u02dc\\u2013\\u2014\\u2018-\\u201e\\u2020-\\u2022\\u2026\\u2030\\u2039\\u203a\\u20ac\\u2122]";
const MOJIBAKE_RE = new RegExp(`[\\u00c2-\\u00f4]${CONTINUATION}{1,3}`, "g");
const utf8 = new TextDecoder("utf-8", { fatal: true });

/** Repairs sequences like "â€™" → "’" and "Â " → " " without touching valid text. */
export function fixMojibake(s: string): string {
  if (!/[\u00c2-\u00f4]/.test(s)) return s;
  return s.replace(MOJIBAKE_RE, (seq) => {
    const bytes: number[] = [];
    for (const ch of seq) {
      const b = cp1252Byte(ch);
      if (b === null) return seq;
      bytes.push(b);
    }
    try {
      return utf8.decode(new Uint8Array(bytes));
    } catch {
      return seq;
    }
  });
}
