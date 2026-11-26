const NAMED_ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ensp: " ", emsp: " ", thinsp: " ",
  ndash: "–", mdash: "—", hellip: "…", lsquo: "‘", rsquo: "’", sbquo: "‚", ldquo: "“", rdquo: "”", bdquo: "„",
  bull: "•", middot: "·", copy: "©", reg: "®", trade: "™", euro: "€", pound: "£", yen: "¥", cent: "¢",
  deg: "°", plusmn: "±", times: "×", divide: "÷", laquo: "«", raquo: "»", sect: "§", para: "¶", shy: "",
  zwj: "", zwnj: "", lrm: "", rlm: "", iexcl: "¡", iquest: "¿", frac12: "½", frac14: "¼", frac34: "¾",
  aacute: "á", eacute: "é", iacute: "í", oacute: "ó", uacute: "ú", agrave: "à", egrave: "è", ograve: "ò",
  auml: "ä", euml: "ë", iuml: "ï", ouml: "ö", uuml: "ü", Auml: "Ä", Ouml: "Ö", Uuml: "Ü", szlig: "ß",
  ntilde: "ñ", Ntilde: "Ñ", ccedil: "ç", Ccedil: "Ç", Eacute: "É", acirc: "â", ecirc: "ê", ocirc: "ô",
  rarr: "→", larr: "←", hyphen: "-", dash: "-", colon: ":", comma: ",", period: ".", sol: "/", num: "#",
  lpar: "(", rpar: ")", excl: "!", quest: "?", semi: ";", equals: "=", plus: "+", percnt: "%", dollar: "$",
};

/** Decode HTML/XML character references (named, decimal, hex). Unknown names are left untouched. */
export function decodeEntities(input: string): string {
  if (!input.includes("&")) return input;
  return input.replace(/&(#x[0-9a-f]{1,6}|#\d{1,7}|[a-z][a-z0-9]{1,31});/gi, (match, code: string) => {
    if (code[0] === "#") {
      const n = code[1] === "x" || code[1] === "X" ? Number.parseInt(code.slice(2), 16) : Number.parseInt(code.slice(1), 10);
      if (!Number.isFinite(n) || n <= 0 || n > 0x10ffff || (n >= 0xd800 && n <= 0xdfff)) return match;
      return String.fromCodePoint(n);
    }
    const named = NAMED_ENTITIES[code] ?? NAMED_ENTITIES[code.toLowerCase()];
    return named ?? match;
  });
}

/** True when a string is HTML that was entity-escaped (e.g. "&lt;p&gt;Hello&lt;/p&gt;"). */
export function looksEscapedHtml(s: string): boolean {
  if (/<\/?(?:p|div|br|ul|li|span|strong|b|h[1-6])\b/i.test(s)) return false;
  // Single ("&lt;p&gt;") or double ("&amp;lt;p&amp;gt;") escaping.
  return /&(?:amp;)*lt;\/?[a-z][a-z0-9]*[\s\S]{0,200}?&(?:amp;)*gt;/i.test(s);
}

/**
 * Normalize a description from a source: decode entity-escaped HTML (once or twice, as some
 * feeds double-escape), trim, and return null when empty.
 */
export function normalizeDescriptionHtml(input: string | null | undefined): string | null {
  if (typeof input !== "string") return null;
  let s = input.trim();
  for (let i = 0; i < 3 && looksEscapedHtml(s); i++) s = decodeEntities(s).trim();
  if (!s) return null;
  const text = htmlToText(s);
  return text.length > 0 ? s : null;
}

const BLOCK_TAGS = /<\/?(?:p|div|br|li|ul|ol|h[1-6]|tr|table|section|article|header|footer|blockquote|pre|hr)\b[^>]*>/gi;

/** HTML → readable plain text (block tags become newlines, entities decoded, whitespace collapsed). */
export function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<(script|style|noscript|template)\b[\s\S]*?<\/\1>/gi, " ")
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(BLOCK_TAGS, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/\u00a0/g, " ")
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Decode entities, drop tags, collapse whitespace — for titles, locations, short labels. */
export function cleanText(input: unknown): string {
  if (typeof input !== "string" && typeof input !== "number") return "";
  const s = String(input);
  return decodeEntities(s.includes("<") ? s.replace(/<[^>]+>/g, " ") : s)
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Resolve `href` against `base`; returns null for non-http(s) or unparsable values. */
export function absoluteUrl(href: string | null | undefined, base: string): string | null {
  if (!href) return null;
  const raw = decodeEntities(href.trim());
  if (!raw || /^(?:javascript|mailto|tel|data):/i.test(raw)) return null;
  try {
    const u = new URL(raw, base);
    return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
}

/** Value of an attribute inside one start tag (`<a href="…" class=…>`). */
export function attr(tag: string, name: string): string | null {
  const re = new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'>]+))`, "i");
  const m = re.exec(tag);
  if (!m) return null;
  return decodeEntities(m[1] ?? m[2] ?? m[3] ?? "");
}

/** All `<a …>text</a>` links in a document, absolutized. */
export function extractLinks(html: string, base: string): { url: string; text: string }[] {
  const out: { url: string; text: string }[] = [];
  const re = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  for (const m of html.matchAll(re)) {
    const href = attr(m[1] ?? "", "href");
    const url = absoluteUrl(href, base);
    if (url) out.push({ url, text: cleanText(m[2] ?? "") });
  }
  return out;
}

/**
 * Parse the JSON value (object or array) that starts at `start` (index of "{" or "[") in `text`,
 * respecting strings and escapes. Used for blobs like `phApp.ddo = {...};` embedded in scripts.
 */
export function extractBalancedJson(text: string, start: number): string | null {
  const open = text[start];
  if (open !== "{" && open !== "[") return null;
  let depth = 0;
  let inString = false;
  let quote = "";
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (ch === "\\") i++;
      else if (ch === quote) inString = false;
      continue;
    }
    if (ch === '"' || ch === "'") {
      inString = true;
      quote = ch;
    } else if (ch === "{" || ch === "[") depth++;
    else if (ch === "}" || ch === "]") {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

/** Find `marker` (e.g. "phApp.ddo") followed by `=` and return the parsed JSON object/array after it. */
export function extractAssignedJson(text: string, marker: string): unknown {
  let from = 0;
  for (;;) {
    const i = text.indexOf(marker, from);
    if (i < 0) return undefined;
    const eq = /^\s*=\s*/.exec(text.slice(i + marker.length, i + marker.length + 20));
    if (eq) {
      const start = i + marker.length + eq[0].length;
      const raw = extractBalancedJson(text, start);
      if (raw) {
        try {
          return JSON.parse(raw) as unknown;
        } catch {
          /* keep looking */
        }
      }
    }
    from = i + marker.length;
  }
}
