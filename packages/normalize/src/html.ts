import sanitizeHtml from "sanitize-html";
import { normalizeHttpUrl } from "./url";
import { asString, decodeEntities, flatten, truncateWords } from "./text";

const MAX_HTML = 150_000;

const ALLOWED_TAGS = [
  "p", "br", "ul", "ol", "li", "strong", "b", "em", "i", "h2", "h3", "h4", "a", "blockquote", "code", "pre",
  "table", "thead", "tbody", "tfoot", "tr", "th", "td",
];
const BLOCK_TAGS = new Set(["p", "ul", "ol", "li", "h2", "h3", "h4", "blockquote", "pre", "table", "thead", "tbody", "tfoot", "tr", "th", "td"]);
const DROP_WITH_CONTENT = [
  "style", "script", "noscript", "iframe", "frame", "frameset", "object", "embed", "svg", "math", "canvas", "video",
  "audio", "template", "head", "title", "textarea", "select", "option", "button", "form", "input", "map", "picture",
];
const DIV_LIKE = ["div", "section", "article", "header", "footer", "main", "aside", "center", "dd", "dt", "figcaption", "address", "summary", "details", "fieldset"];

export interface SanitizeOptions {
  /** Base for resolving relative links (the posting's sourceUrl). Unresolvable relative links are unwrapped. */
  baseUrl?: string | null;
}

/** Greenhouse (and some feeds) send HTML escaped once or twice: "&lt;p&gt;…". */
function looksEscaped(s: string): boolean {
  return /&(?:amp;){0,3}lt;\/?[a-z][a-z0-9]{0,20}(?:\s|&(?:amp;){0,3}gt;|\/)/i.test(s) && !/<\/?[a-z][a-z0-9]{0,20}[\s>/]/i.test(s);
}

const hasTags = (s: string): boolean => /<\/?[a-z][a-z0-9]{0,20}(?:\s[^<>]*)?\/?>/i.test(s);

function escapeText(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const BULLET = /^\s*(?:[•·▪▫◦●○■□►▶➢➤✓✔✅☑*\-–—]|\d{1,2}[.)])\s+/;

/** Plain text → simple HTML: blank-line paragraphs, bullet lines → <ul>, single newlines → <br>. */
export function textToHtml(input: unknown): string | null {
  const text = asString(input).replace(/\r\n?/g, "\n").trim();
  if (!text) return null;
  const out: string[] = [];
  for (const block of text.split(/\n\s*\n+/)) {
    const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);
    let i = 0;
    while (i < lines.length) {
      if (BULLET.test(lines[i] as string)) {
        const items: string[] = [];
        while (i < lines.length && BULLET.test(lines[i] as string)) items.push((lines[i++] as string).replace(BULLET, ""));
        out.push(`<ul>${items.map((it) => `<li>${escapeText(it)}</li>`).join("")}</ul>`);
      } else {
        const para: string[] = [];
        while (i < lines.length && !BULLET.test(lines[i] as string)) para.push(escapeText(lines[i++] as string));
        out.push(`<p>${para.join("<br>")}</p>`);
      }
    }
  }
  return out.join("");
}

/** Static options (built once): per-call closures/transforms are the expensive part of sanitize-html. */
const SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: ALLOWED_TAGS,
  allowedAttributes: { a: ["href"] },
  allowedSchemes: ["http", "https", "mailto"],
  allowedSchemesAppliedToAttributes: ["href"],
  allowProtocolRelative: false,
  disallowedTagsMode: "discard",
  nonTextTags: DROP_WITH_CONTENT,
};

const DIV_LIKE_SET = new Set(DIV_LIKE);
const ANY_TAG = /<(\/?)([a-z][a-z0-9]*)\b([^<>]*)>/gi;

/**
 * One linear rewrite before sanitize-html (which still enforces the allowlist afterwards):
 * div-like blocks → <p>, h1 → h2, h5/h6 → h4, attributes dropped from every tag except <a>.
 */
function prepass(html: string): string {
  return html.replace(ANY_TAG, (whole, slash: string, rawName: string, attrs: string) => {
    const name = rawName.toLowerCase();
    if (name === "a") return whole;
    const mapped = DIV_LIKE_SET.has(name) ? "p" : name === "h1" ? "h2" : name === "h5" || name === "h6" ? "h4" : name;
    if (mapped === name && attrs.length === 0) return whole;
    return `<${slash}${mapped}${/\/\s*$/.test(attrs) ? "/" : ""}>`;
  });
}

const ODD_SPACES = new RegExp(`[${String.fromCharCode(0xa0, 0x2007, 0x202f)}]`, "g");
const ZERO_WIDTH = new RegExp(`[${String.fromCharCode(0x200b, 0x200c, 0x200d, 0x2060, 0xfeff)}]`, "g");
const HAS_ODD = new RegExp(`[${String.fromCharCode(0xa0, 0x2007, 0x202f, 0x200b, 0x200c, 0x200d, 0x2060, 0xfeff)}]`);

function escapeAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Resolve relative hrefs against the posting URL and add rel/target; unusable links become bare <a> (unwrapped by tidy). */
function rewriteLinks(html: string, baseUrl: string | null): string {
  return html.replace(/<a href="([^"]*)">/g, (_m, rawHref: string) => {
    const href = decodeEntities(rawHref).trim();
    const url = normalizeHttpUrl(href, baseUrl) ?? (/^mailto:[^\s@]+@[^\s@]+$/i.test(href) ? href : null);
    return url ? `<a href="${escapeAttr(url)}" rel="nofollow noopener noreferrer" target="_blank">` : "<a>";
  });
}

const HAS_EMPTY = /<(strong|b|em|i|code|a|li|ul|ol|h[2-4]|blockquote|pre|p)(?:\s[^>]*)?>\s*<\/\1>/;
const RE_EMPTY_INLINE = /<(strong|b|em|i|code|a)(?:\s[^>]*)?>\s*<\/\1>/g;
const RE_EMPTY_BLOCK = /<li>\s*<\/li>|<(ul|ol|h[2-4]|blockquote|pre|p)>\s*<\/\1>/g;

/**
 * Linear pass over sanitized HTML: closes <p> before block elements (div→p nesting), drops empty
 * paragraphs/list items/inline tags and collapses runs of <br>. Safe because the input is sanitized.
 */
interface Tidied {
  html: string;
  /** Plain text built from the same token pass (entities still encoded). */
  text: string;
}

function tidy(input: string): Tidied {
  const html = flatten(input);
  const out: string[] = [];
  const txt: string[] = [];
  let pOpen = false;
  let pStart = 0;
  let pText = false;
  let pendingBr = 0;
  let inPre = 0;
  /** true right after a block boundary (or at start): whitespace and <br> are dropped there. */
  let atBlock = true;
  const closeP = (): void => {
    if (!pOpen) return;
    if (pText) out.push("</p>");
    else out.length = pStart;
    pOpen = false;
  };
  const flushBr = (): void => {
    if (pendingBr > 0 && !atBlock) out.push(pendingBr > 1 ? "<br><br>" : "<br>");
    pendingBr = 0;
  };
  const TAG = /<(\/?)([a-z0-9]+)[^>]*>/iy;
  const n = html.length;
  for (let pos = 0; pos < n; ) {
    let text: string | null = null;
    let m: RegExpExecArray | null = null;
    if (html.charCodeAt(pos) === 60 /* < */) {
      TAG.lastIndex = pos;
      m = TAG.exec(html);
      if (m) pos = TAG.lastIndex;
      else {
        text = "<";
        pos++;
      }
    } else {
      const lt = html.indexOf("<", pos);
      const end = lt < 0 ? n : lt;
      text = html.slice(pos, end);
      pos = end;
    }
    if (text !== null) {
      if (inPre === 0) {
        text = text.replace(/\s+/g, " ");
        if (text === " ") {
          if (!atBlock && pendingBr === 0) out.push(" ");
          continue;
        }
        if (atBlock || pendingBr > 0) text = text.replace(/^ /, "");
      }
      flushBr();
      if (text.trim()) pText = true;
      out.push(text);
      txt.push(text);
      atBlock = false;
      continue;
    }
    if (!m) continue;
    const closing = m[1] === "/";
    const name = (m[2] as string).toLowerCase();
    if (name === "br") {
      pendingBr++;
      txt.push("\n");
      continue;
    }
    if (name === "p") {
      pendingBr = 0;
      txt.push("\n\n");
      closeP();
      if (!closing) {
        pOpen = true;
        pStart = out.length;
        pText = false;
        out.push("<p>");
      }
      atBlock = true;
      continue;
    }
    if (BLOCK_TAGS.has(name)) {
      pendingBr = 0;
      txt.push(name === "li" ? (closing ? "" : "\n• ") : name === "td" || name === "th" ? " " : "\n\n");
      closeP();
      if (name === "pre") inPre += closing ? -1 : 1;
      if (out.length > 0 && out[out.length - 1] === " ") out.pop();
      out.push(closing ? `</${name}>` : m[0]);
      atBlock = true;
      continue;
    }
    flushBr();
    out.push(m[0]);
    atBlock = false;
  }
  closeP();
  let s = out.join("");
  if (s.includes("<a>")) s = s.replace(/<a>([^<]*(?:<(?!\/a>)[^<]*)*)<\/a>/g, "$1");
  // Cleanup passes only when there is something to clean (one cheap check each).
  for (let i = 0; i < 3 && HAS_EMPTY.test(s); i++) s = s.replace(RE_EMPTY_INLINE, "").replace(RE_EMPTY_BLOCK, "");
  if (/\s<\//.test(s)) s = s.replace(/\s+(<\/(?:p|li|h[2-4]|td|th|blockquote)>)/g, "$1");
  return { html: s.trim(), text: txt.join("") };
}

const SPACE_RUN = new RegExp(`[\t \f\v${String.fromCharCode(0xa0, 0x2007, 0x202f)}]+`, "g");

const BASIC_ENTITIES: Readonly<Record<string, string>> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&#x27;": "'", "&apos;": "'" };

/**
 * Text from sanitize-html output only contains the entities its escaper writes (&amp; &lt; &gt; &quot; &#39;),
 * so a five-entity decoder is exact here and much cheaper than a full HTML entity decoder.
 */
function finishText(encoded: string): string {
  const decoded = encoded.includes("&") ? encoded.replace(/&(?:amp|lt|gt|quot|#39|#x27|apos);/g, (e) => BASIC_ENTITIES[e] ?? e) : encoded;
  return decoded
    .replace(SPACE_RUN, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/(?:^|\n)•\s*(?=\n|$)/g, "")
    .trim();
}

/**
 * Allowlist sanitizer (sanitize-html): p, br, ul/ol/li, strong/b, em/i, h2–h4, a[href] (+rel/target), blockquote,
 * code, pre, basic tables. Decodes escaped HTML (Greenhouse), drops styles/scripts/iframes/images (tracking pixels),
 * converts plain text to paragraphs, collapses empty paragraphs. Returns null when nothing is left.
 */
export function sanitizeDescription(input: unknown, opts: SanitizeOptions = {}): string | null {
  return sanitizeWithText(input, opts)?.html ?? null;
}

/** sanitizeDescription + its plain text in one pass (what normalizeJob uses). */
export function sanitizeWithText(input: unknown, opts: SanitizeOptions = {}): { html: string; text: string } | null {
  let html = asString(input);
  if (!html.trim()) return null;
  if (html.length > MAX_HTML) html = html.slice(0, MAX_HTML);
  for (let i = 0; i < 2 && looksEscaped(html); i++) html = decodeEntities(html);
  if (!hasTags(html)) {
    const asHtml = textToHtml(decodeEntities(html));
    if (!asHtml) return null;
    html = asHtml;
  }
  let sanitized = sanitizeHtml(prepass(html), SANITIZE_OPTIONS);
  if (HAS_ODD.test(sanitized)) sanitized = sanitized.replace(ODD_SPACES, " ").replace(ZERO_WIDTH, "");
  const tidied = tidy(rewriteLinks(sanitized, opts.baseUrl ?? null));
  const text = finishText(tidied.text);
  return text ? { html: tidied.html, text } : null;
}

const SKIP_CONTENT = new Set(["script", "style", "noscript", "head", "title", "template", "svg", "iframe", "object", "textarea", "select"]);
const BREAK_BEFORE = new Set(["p", "div", "section", "article", "header", "footer", "h1", "h2", "h3", "h4", "h5", "h6", "ul", "ol", "table", "tr", "blockquote", "pre", "dl", "dt", "dd", "hr", "main", "aside"]);

/** HTML → readable plain text (linear scan, no regex backtracking): blocks → blank lines, li → "• ", br → newline. */
export function htmlToText(input: unknown): string {
  let html = asString(input);
  if (!html) return "";
  if (html.length > MAX_HTML) html = html.slice(0, MAX_HTML);
  if (looksEscaped(html)) html = decodeEntities(html);
  const lower = /<(?:script|style|noscript|head|title|template|svg|iframe|object|textarea|select)/i.test(html) ? html.toLowerCase() : "";
  const out: string[] = [];
  const n = html.length;
  let i = 0;
  let nextGt = -2; // cached position of the next ">" (-1 = none left), keeps stray "<" runs linear
  while (i < n) {
    const lt = html.indexOf("<", i);
    if (lt < 0) {
      out.push(html.slice(i));
      break;
    }
    if (lt > i) out.push(html.slice(i, lt));
    if (html.startsWith("<!--", lt)) {
      const end = html.indexOf("-->", lt + 4);
      i = end < 0 ? n : end + 3;
      continue;
    }
    if (nextGt !== -1 && nextGt <= lt) nextGt = html.indexOf(">", lt + 1);
    const gt = nextGt;
    const m = gt > 0 ? /^<(\/?)([a-z][a-z0-9]*)/i.exec(html.slice(lt, Math.min(gt + 1, lt + 40))) : null;
    if (!m || gt < 0) {
      out.push("<");
      i = lt + 1;
      continue;
    }
    const closing = m[1] === "/";
    const name = (m[2] as string).toLowerCase();
    if (!closing && SKIP_CONTENT.has(name)) {
      const end = (lower || html.toLowerCase()).indexOf(`</${name}`, gt + 1);
      i = end < 0 ? n : Math.max(gt + 1, html.indexOf(">", end) + 1 || n);
      continue;
    }
    if (name === "br") out.push("\n");
    else if (name === "li" && !closing) out.push("\n• ");
    else if (name === "li") {
      /* closing </li>: the next item adds its own line break */
    }
    else if (name === "td" || name === "th") out.push(closing ? " " : "\t");
    else if (BREAK_BEFORE.has(name)) out.push("\n\n");
    i = gt + 1;
  }
  return decodeEntities(out.join(""))
    .replace(/\r/g, "")
    .replace(/[\t \u{00A0}\u{2007}\u{202F}\f\v]+/gu, " ")
    .replace(/[\u{200B}-\u{200D}\u{2060}\u{FEFF}]/gu, "")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/(?:^|\n)•\s*(?=\n|$)/g, "")
    .trim();
}

/* ─────────────────────────── summarize ─────────────────────────── */

const ROLE_HEADING =
  /^(?:about\s+(?:the|this)\s+(?:role|job|position|opportunity|internship|team)|(?:the\s+)?role(?:\s+(?:overview|summary|description|purpose))?|job\s+(?:description|summary|overview|purpose|profile)|position\s+(?:summary|overview|description)|overview|summary|what\s+you(?:'ll|\s+will)\s+(?:do|be\s+doing)|your\s+role|the\s+opportunity|role\s+and\s+responsibilities|key\s+responsibilities|responsibilities|about\s+the\s+internship|description|jd|job\s+details?)\s*[:\-–]?$/i;
const ABBREV_G =
  /\b(?:e\.g|i\.e|etc|vs|approx|incl|dept|sr|jr|mr|mrs|ms|dr|prof|st|no|nos|pvt|ltd|inc|co|corp|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec|b\.tech|m\.tech|b\.e|m\.e|b\.sc|m\.sc|b\.com|m\.com|ph\.d|u\.s|u\.k|a\.m|p\.m)\./gi;
const PLACEHOLDER = "\u{E000}";

/** Section headings ("PREFERRED QUALIFICATIONS", "Who you are", "Requirements:") are not summary sentences. */
function isHeading(line: string): boolean {
  if (line.length > 70 || /^•/.test(line)) return false;
  if (/[:：]$/.test(line)) return true;
  if (/[.!?]$/.test(line) || /[:：]\s*\S/.test(line)) return false; // sentences and "Label: value" lines
  if (/[A-Z]/.test(line) && !/[a-z]/.test(line)) return true;
  return line.split(/\s+/).length <= 5;
}

/** ≤ max chars of plain text, sentence-aware, starting at the role description when one is marked. */
export function summarize(input: unknown, max = 280): string | null {
  const full = asString(input).trim();
  if (!full) return null;
  // Only the first few KB matter for a 280-char summary (after skipping to the role section).
  const text = full.length > 8000 ? full.slice(0, 8000) : full;
  const lines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const ROLE_GATE = /^[•#*\s]*(?:about|role|job|position|overview|summary|what|your|the|key|responsibilities|description|jd)/i;
  let start = lines.findIndex((l) => l.length <= 70 && ROLE_GATE.test(l) && ROLE_HEADING.test(l.replace(/^[•#*\s]+/, "")));
  start = start >= 0 && start < lines.length - 1 ? start + 1 : 0;
  const section = lines.slice(start, start + 12);
  const kept = section.filter((l) => !isHeading(l));
  const body = (kept.length > 0 ? kept : section)
    .map((l) => l.replace(/^•\s*/, "").replace(/[\s;,]+$/, ""))
    .map((l) => (/[.!?:]$/.test(l) ? l : `${l}.`))
    .join(" ")
    .slice(0, 1200)
    .replace(/\s+/g, " ")
    .trim();
  if (!body) return null;
  const protectedText = body.replace(ABBREV_G, (m) => m.replace(/\./g, PLACEHOLDER));
  const sentences = protectedText.split(/(?<=[.!?])\s+(?=[A-Z0-9"“'(₹$])/).map((s) => s.split(PLACEHOLDER).join("."));
  let out = "";
  for (const s of sentences) {
    const next = out ? `${out} ${s}` : s;
    if (next.length > max) break;
    out = next;
  }
  if (!out) out = truncateWords(sentences[0] ?? body, max);
  return out.length > max ? truncateWords(out, max) : out;
}
