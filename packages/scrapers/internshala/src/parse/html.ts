import * as cheerio from "cheerio";
import { absoluteUrl, cleanText } from "./text";

const KEEP = new Set(["p", "br", "ul", "ol", "li", "strong", "b", "em", "i", "u", "a", "h3", "h4", "blockquote"]);
const DROP = "script, style, iframe, img, svg, button, input, select, textarea, form, noscript, object, embed, video, audio";
const BLOCK_RE = /<(p|ul|ol|li|h3|h4|blockquote)\b/i;

/**
 * Reduce an HTML fragment to simple, attribute-free formatting (p, br, lists, b/i/u, a[href]).
 * Unknown tags are unwrapped (their text is kept); scripts, media and icon-font `<i>` tags are removed.
 * The full sanitisation happens later in @easyjobs/normalize — this just keeps scraper output tidy.
 */
export function cleanFragment(html: string | null | undefined): string {
  if (!html || !html.trim()) return "";
  const $ = cheerio.load(`<div id="__root">${html}</div>`, null, false);
  const root = $("#__root");
  root.find(DROP).remove();
  root.find("i[class*='ic-']").remove();
  // Deepest first, so unwrapping a parent never orphans an unprocessed child.
  for (const el of root.find("*").toArray().reverse()) {
    const node = $(el);
    const tag = (el.tagName ?? "").toLowerCase();
    if (!KEEP.has(tag)) {
      node.replaceWith(node.contents());
      continue;
    }
    const href = tag === "a" ? absoluteUrl(node.attr("href"), { keepQuery: true }) : null;
    for (const name of Object.keys(el.attribs ?? {})) node.removeAttr(name);
    if (tag === "a") {
      if (href) node.attr("href", href);
      else node.replaceWith(node.contents());
    }
  }
  // Drop empty paragraphs / list items and collapse runs of <br>.
  root.find("p, li").each((_, el) => {
    const node = $(el);
    if (!cleanText(node.text()) && node.find("br").length === node.children().length) node.remove();
  });
  return (root.html() ?? "")
    .replace(/[ \t\r\f\v\u00a0]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{2,}/g, "\n")
    .replace(/(\s*<br\s*\/?>\s*){3,}/gi, "<br><br>")
    .replace(/^(\s*<br\s*\/?>\s*)+|(\s*<br\s*\/?>\s*)+$/gi, "")
    .replace(/<(p|li|h3|h4|ul|ol)>\s+/g, "<$1>")
    .replace(/\s+<\/(p|li|h3|h4|ul|ol)>/g, "</$1>")
    .trim();
}

/** cleanFragment, wrapped in a <p> when the result has no block-level elements. */
export function cleanBlock(html: string | null | undefined): string {
  const inner = cleanFragment(html);
  if (!inner) return "";
  return BLOCK_RE.test(inner) ? inner : `<p>${inner}</p>`;
}

/** Plain text of an HTML fragment, with <br>/<p>/<li> boundaries turned into line breaks. */
export function fragmentText(html: string | null | undefined): string {
  if (!html) return "";
  const withBreaks = html.replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|li|h\d|div)>/gi, "\n");
  const $ = cheerio.load(`<div id="__root">${withBreaks}</div>`, null, false);
  return $("#__root")
    .text()
    .split("\n")
    .map((line) => cleanText(line))
    .filter(Boolean)
    .join("\n");
}
