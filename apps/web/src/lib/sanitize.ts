import { FilterXSS, escapeAttrValue } from "xss";

/**
 * Defence-in-depth sanitiser for job descriptions (the API already sends sanitised HTML).
 * Isomorphic (no DOM needed). Allow-list only; h1/h2 are demoted to h3 because the page owns h1/h2.
 */
const filter = new FilterXSS({
  whiteList: {
    p: [], br: [], hr: [], strong: [], b: [], em: [], i: [], u: [], s: [], small: [], sup: [], sub: [],
    ul: [], ol: [], li: [], h1: [], h2: [], h3: [], h4: [], h5: [], h6: [], blockquote: [], code: [], pre: [],
    table: [], thead: [], tbody: [], tr: [], th: [], td: [], span: [], div: [],
    a: ["href", "title"],
  },
  stripIgnoreTag: true,
  stripIgnoreTagBody: ["script", "style", "iframe", "object", "embed", "noscript", "template", "svg", "math"],
  css: false,
  onTag(tag, html, options) {
    if (tag === "h1" || tag === "h2") return options.isClosing ? "</h3>" : "<h3>";
    if (tag === "h5" || tag === "h6") return options.isClosing ? "</h4>" : "<h4>";
    return undefined;
  },
  onTagAttr(tag, name, value) {
    if (tag === "a" && name === "href") {
      const v = value.trim();
      if (!/^(https?:|mailto:)/i.test(v)) return "";
      return `href="${escapeAttrValue(v)}" target="_blank" rel="nofollow noopener noreferrer"`;
    }
    return undefined;
  },
});

export function sanitizeHtml(html: string | null | undefined): string {
  if (!html) return "";
  return filter.process(html).trim();
}
