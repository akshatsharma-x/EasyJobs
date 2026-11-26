/**
 * Re-sanitisation of descriptionHtml at the API trust boundary (normalize already sanitises; we never trust it).
 */
import sanitizeHtml from "sanitize-html";

const MAX_HTML_INPUT = 200_000;

const BLOCK_TO_P = ["div", "section", "article", "header", "footer", "main", "aside"];

const OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    "p", "br", "ul", "ol", "li", "strong", "b", "em", "i", "u", "h2", "h3", "h4", "a", "blockquote", "code", "pre",
    "table", "thead", "tbody", "tfoot", "tr", "th", "td", "hr",
  ],
  allowedAttributes: { a: ["href", "title", "rel", "target"], th: ["colspan", "rowspan"], td: ["colspan", "rowspan"] },
  allowedSchemes: ["http", "https", "mailto"],
  allowedSchemesAppliedToAttributes: ["href"],
  allowProtocolRelative: false,
  disallowedTagsMode: "discard",
  nonTextTags: ["script", "style", "textarea", "option", "noscript", "iframe", "object", "embed", "svg", "math", "template", "head", "title", "button", "select", "form"],
  transformTags: {
    h1: "h2",
    h5: "h4",
    h6: "h4",
    ...Object.fromEntries(BLOCK_TO_P.map((t) => [t, "p"])),
    a: (_tagName, attribs) => ({
      tagName: "a",
      attribs: {
        ...(attribs.href ? { href: attribs.href } : {}),
        ...(attribs.title ? { title: attribs.title } : {}),
        rel: "nofollow noopener noreferrer",
        target: "_blank",
      },
    }),
  },
  // Drop empty paragraphs / list items / headings (common in ATS exports).
  exclusiveFilter: (frame) =>
    ["p", "li", "h2", "h3", "h4", "strong", "b", "em", "i", "u"].includes(frame.tag) && !frame.text.trim() && !frame.mediaChildren.length,
};

const ENTITY: Record<string, string> = { lt: "<", gt: ">", amp: "&", quot: '"', apos: "'", nbsp: " " };
function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const code = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : m;
    }
    return ENTITY[e.toLowerCase()] ?? m;
  });
}

/** Allow-list sanitiser. Returns null for empty output. Decodes entity-escaped HTML (e.g. Greenhouse "&lt;p&gt;"). */
export function sanitizeDescription(html: string | null | undefined): string | null {
  if (!html) return null;
  let input = html.length > MAX_HTML_INPUT ? html.slice(0, MAX_HTML_INPUT) : html;
  if (!/<[a-z!/]/i.test(input) && /&lt;\/?[a-z]/i.test(input)) input = decodeEntities(input);
  const out = sanitizeHtml(input, OPTIONS)
    .replace(/(?:<br \/>\s*){3,}/g, "<br /><br />")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return out.length > 0 ? out : null;
}

/** Plain text from (sanitised) HTML, keeping paragraph/list breaks. */
export function htmlToPlainText(html: string): string {
  const withBreaks = html
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/(p|li|h[2-4]|tr|blockquote|pre)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ");
  const text = sanitizeHtml(withBreaks, { allowedTags: [], allowedAttributes: {} });
  return decodeEntities(text)
    .replace(/[ \t\f\v ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** ≤ max chars, cut at a sentence end when possible, else at a word boundary. */
export function summarizeText(text: string, max = 280): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const slice = clean.slice(0, max);
  const sentenceEnd = Math.max(slice.lastIndexOf(". "), slice.lastIndexOf("! "), slice.lastIndexOf("? "));
  if (sentenceEnd > max * 0.5) return slice.slice(0, sentenceEnd + 1);
  const space = slice.lastIndexOf(" ");
  return `${slice.slice(0, space > max * 0.5 ? space : max - 1).replace(/[,;:\s]+$/, "")}…`;
}
