/**
 * Small, dependency-free HTML helpers. Career sites hand us HTML fragments (descriptions),
 * occasionally entity-escaped HTML, or plain text with line breaks. Sanitising for display is
 * the normalizer's job (P03); here we only decode, convert and assemble.
 */

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—", hellip: "…",
  rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", bull: "•", middot: "·", copy: "©", reg: "®",
  trade: "™", euro: "€", pound: "£", rupee: "₹", inr: "₹", deg: "°", times: "×", laquo: "«", raquo: "»",
  shy: "", zwnj: "", zwj: "", ensp: " ", emsp: " ", thinsp: " ", iexcl: "¡", cent: "¢", yen: "¥",
  sect: "§", para: "¶", frac12: "½", frac14: "¼", frac34: "¾", eacute: "é", egrave: "è", aacute: "á",
  agrave: "à", oacute: "ó", uacute: "ú", iacute: "í", ntilde: "ñ", uuml: "ü", ouml: "ö", auml: "ä", ccedil: "ç",
};

/** Decodes named (common subset) and numeric HTML entities. Unknown entities are left as-is. */
export function decodeEntities(input: string): string {
  return input.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (m, body: string) => {
    if (body[0] === "#") {
      const code = body[1] === "x" || body[1] === "X" ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff) return m;
      try {
        return String.fromCodePoint(code);
      } catch {
        return m;
      }
    }
    const named = NAMED_ENTITIES[body.toLowerCase()];
    return named ?? m;
  });
}

export function escapeHtml(input: string): string {
  return input.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** True if the string looks like it contains HTML markup (not just text). */
export function looksLikeHtml(input: string): boolean {
  return /<\/?[a-z][a-z0-9]*(\s[^>]*)?\/?>/i.test(input);
}

/** Some APIs return HTML that is itself entity-escaped ("&lt;p&gt;…"). Decode once if so. */
export function unescapeHtmlIfEscaped(input: string): string {
  if (!looksLikeHtml(input) && /&lt;\/?[a-z]/i.test(input)) return decodeEntities(input);
  return input;
}

const BLOCK_TAGS = "p|div|section|article|header|footer|ul|ol|table|thead|tbody|tr|h[1-6]|blockquote|pre|dl|dt|dd|figure";

/** HTML → readable plain text: block structure becomes newlines, list items become "• ". */
export function htmlToText(html: string | null | undefined): string | null {
  if (!html) return null;
  let s = unescapeHtmlIfEscaped(String(html));
  s = s
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(script|style|noscript|template|svg|iframe)\b[\s\S]*?<\/\1\s*>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<li\b[^>]*>/gi, "\n• ")
    .replace(/<\/li\s*>/gi, "")
    .replace(/<\/?(td|th)\b[^>]*>/gi, " ")
    .replace(new RegExp(`<\\/?(${BLOCK_TAGS})\\b[^>]*>`, "gi"), "\n")
    .replace(/<[^>]+>/g, "");
  s = decodeEntities(s)
    .replace(/ /g, " ")
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return s.length > 0 ? s : null;
}

/** Plain text (with newlines / "- " or "• " bullets) → simple HTML paragraphs and lists. */
export function textToHtml(text: string | null | undefined): string | null {
  if (!text) return null;
  const blocks = String(text).replace(/\r\n?/g, "\n").trim().split(/\n{2,}/);
  const out: string[] = [];
  for (const block of blocks) {
    const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) continue;
    const bullet = /^([-*•●▪◦·]|\d+[.)])\s+/;
    if (lines.length > 1 && lines.every((l) => bullet.test(l))) {
      out.push(`<ul>${lines.map((l) => `<li>${escapeHtml(l.replace(bullet, ""))}</li>`).join("")}</ul>`);
    } else {
      out.push(`<p>${lines.map(escapeHtml).join("<br>")}</p>`);
    }
  }
  return out.length > 0 ? out.join("\n") : null;
}

/** Accepts HTML or plain text and always returns HTML (or null). */
export function ensureHtml(input: string | null | undefined): string | null {
  if (!input || !String(input).trim()) return null;
  const s = unescapeHtmlIfEscaped(String(input).trim());
  return looksLikeHtml(s) ? s : textToHtml(s);
}

export interface HtmlSection {
  title?: string | null;
  /** HTML or plain text */
  body: string | null | undefined;
}

/** Joins titled sections ("Basic qualifications", …) into one descriptionHtml. Empty sections are dropped. */
export function joinSections(sections: HtmlSection[]): string | null {
  const parts: string[] = [];
  for (const sec of sections) {
    const body = ensureHtml(sec.body);
    if (!body) continue;
    parts.push(sec.title ? `<h3>${escapeHtml(sec.title)}</h3>\n${body}` : body);
  }
  return parts.length > 0 ? parts.join("\n") : null;
}

/** Collapses whitespace and decodes entities in a short inline string (titles, locations). */
export function cleanInline(input: string | null | undefined): string {
  if (!input) return "";
  return decodeEntities(String(input).replace(/<[^>]+>/g, " "))
    .replace(/ /g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Extracts the text content of the first element matching a simple attribute pattern. */
export function extractBetween(html: string, start: RegExp, end: RegExp): string | null {
  const m = start.exec(html);
  if (!m) return null;
  const rest = html.slice(m.index + m[0].length);
  const e = end.exec(rest);
  return e ? rest.slice(0, e.index) : null;
}

/** All schema.org JobPosting objects from JSON-LD script blocks (handles @graph and arrays). */
export function extractJsonLdJobPostings(html: string): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  for (const m of html.matchAll(re)) {
    const raw = (m[1] ?? "").trim();
    if (!raw) continue;
    let data: unknown;
    try {
      data = JSON.parse(raw);
    } catch {
      try {
        data = JSON.parse(raw.replace(/[\u0000-\u001f]+/g, " "));
      } catch {
        continue;
      }
    }
    const stack: unknown[] = [data];
    while (stack.length > 0) {
      const node = stack.pop();
      if (Array.isArray(node)) {
        stack.push(...node);
        continue;
      }
      if (!node || typeof node !== "object") continue;
      const obj = node as Record<string, unknown>;
      const type = obj["@type"];
      if (type === "JobPosting" || (Array.isArray(type) && type.includes("JobPosting"))) out.push(obj);
      if (Array.isArray(obj["@graph"])) stack.push(...(obj["@graph"] as unknown[]));
    }
  }
  return out;
}

/** "BANGALORE" / "software engineering" → "Bangalore" / "Software Engineering". */
export function titleCase(input: string): string {
  return input.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());
}
