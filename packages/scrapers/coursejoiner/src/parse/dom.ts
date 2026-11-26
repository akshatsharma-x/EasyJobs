/**
 * Turns post HTML into an ordered list of "lines" (paragraphs, list items, headings, table rows — split on <br>),
 * each with its section heading and the links it contains (with surrounding text). Every extractor works on this model.
 */
import * as cheerio from "cheerio";
import type { CheerioAPI } from "cheerio";
import type { AnyNode, Element, Text } from "domhandler";
import { cleanHref } from "../util/url";
import { normalizeSpace } from "../util/text";

export interface LinkRef {
  /** Cleaned absolute URL (wrappers unwrapped, tracking params removed). Shorteners are resolved later. */
  href: string;
  text: string;
  /** Text of block-styled parts inside the anchor (card-style links: ["Role title", "Job ID … · Apply"]). */
  parts: string[];
  lineIdx: number;
  /** Text of the same line before / after the anchor. */
  before: string;
  after: string;
  /** Rendered as a button (wp-block-button, .btn, …). */
  isButton: boolean;
  /** Cell index when the link sits in a table row. */
  cellIdx?: number;
  /** Order of appearance in the document. */
  order: number;
}

export interface Cell {
  text: string;
  links: LinkRef[];
  isHeader: boolean;
}

export interface Line {
  idx: number;
  /** "p", "li", "h2", "tr", "div", … */
  tag: string;
  /** 1–6 for headings, 0 otherwise. */
  headingLevel: number;
  text: string;
  /** Nearest preceding h2–h4 heading text ("" before the first heading). */
  section: string;
  links: LinkRef[];
  cells?: Cell[];
  tableIdx?: number;
  rowIdx?: number;
  /** Inside an FAQ block (Rank Math / Yoast FAQ). */
  inFaq: boolean;
}

export interface ContentModel {
  $: CheerioAPI;
  lines: Line[];
  links: LinkRef[];
}

const SKIP_TAGS = new Set(["script", "style", "noscript", "iframe", "svg", "form", "button", "select", "textarea", "input", "object", "embed", "video", "audio", "canvas", "map", "template"]);
const LEAF_BLOCKS = new Set(["p", "dt", "dd", "pre", "figcaption", "caption", "address"]);
const HEADINGS = new Set(["h1", "h2", "h3", "h4", "h5", "h6"]);
const INLINE = new Set([
  "a", "abbr", "b", "bdi", "bdo", "br", "cite", "code", "data", "del", "dfn", "em", "font", "i", "img", "ins", "kbd", "label",
  "mark", "q", "s", "samp", "small", "span", "strong", "sub", "sup", "time", "u", "var", "wbr", "big", "center", "tt",
]);

function isElement(node: AnyNode): node is Element {
  return node.type === "tag" || node.type === "script" || node.type === "style";
}

function isTocContainer(el: Element): boolean {
  const cls = el.attribs?.class ?? "";
  const id = el.attribs?.id ?? "";
  return (
    el.tagName === "nav" ||
    /\b(rank-math-toc-block|ez-toc-container|ez-toc-v\d|lwptoc|toc_container|wp-block-table-of-contents|table-of-contents|simpletoc|toc-wrapper)\b/i.test(cls) ||
    /^(rank-math-toc|ez-toc-container|toc_container|toc)$/i.test(id)
  );
}

function isFaqContainer(el: Element): boolean {
  const cls = el.attribs?.class ?? "";
  const id = el.attribs?.id ?? "";
  return id === "rank-math-faq" || /\b(rank-math-block|wp-block-yoast-faq-block|schema-faq|faq-section|ez-faq)\b/i.test(cls);
}

const BUTTON_CLASS = /\b(wp-block-button__link|wp-element-button|btn|button|maxbutton|su-button|elementor-button)\b/i;
const BLOCK_STYLE = /display\s*:\s*(?:block|flex|grid)/i;

function nodeText(node: AnyNode): string {
  if (node.type === "text") return (node as Text).data;
  if (!isElement(node) || SKIP_TAGS.has(node.tagName)) return "";
  return node.children.map(nodeText).join(node.tagName === "br" ? " " : "");
}

/** Splits an anchor's content at block-level children ("<a><span style=display:block>Title</span><span …>Meta</span></a>"). */
function anchorParts(a: Element): string[] {
  const parts: string[] = [];
  let current = "";
  for (const child of a.children) {
    const isBlock = isElement(child) && (/^(div|p|li|h[1-6]|br)$/.test(child.tagName) || BLOCK_STYLE.test(child.attribs?.style ?? ""));
    if (isBlock) {
      if (normalizeSpace(current)) parts.push(normalizeSpace(current));
      current = "";
      const t = normalizeSpace(nodeText(child));
      if (t) parts.push(t);
    } else current += nodeText(child);
  }
  if (normalizeSpace(current)) parts.push(normalizeSpace(current));
  return parts;
}

export function buildContentModel(html: string, baseUrl: string): ContentModel {
  const $ = cheerio.load(html, null, false);
  const lines: Line[] = [];
  const links: LinkRef[] = [];
  let section = "";
  let tableCounter = 0;
  let order = 0;

  const isButtonish = (el: Element): boolean => BUTTON_CLASS.test(`${el.attribs?.class ?? ""} ${$(el).parent().attr("class") ?? ""}`);

  /** Splits inline nodes at <br> (also inside inline wrappers such as <strong>) and emits one line per segment. */
  function emitInline(nodes: AnyNode[], tag: string, inFaq: boolean): void {
    const segments: AnyNode[][] = [[]];
    const push = (node: AnyNode): void => {
      if (isElement(node) && node.tagName === "br") {
        segments.push([]);
        return;
      }
      if (isElement(node) && INLINE.has(node.tagName) && node.tagName !== "a" && $(node).find("br").length > 0) {
        for (const child of node.children) push(child);
        return;
      }
      segments[segments.length - 1]!.push(node);
    };
    for (const n of nodes) push(n);
    for (const seg of segments) {
      const line = makeLine(seg, tag, inFaq);
      if (line) lines.push(line);
    }
  }

  function makeLine(nodes: AnyNode[], tag: string, inFaq: boolean): Line | null {
    let text = "";
    const pending: { ref: LinkRef; end: number }[] = [];
    const lineIdx = lines.length;
    const walk = (node: AnyNode): void => {
      if (node.type === "text") {
        text += (node as Text).data;
        return;
      }
      if (!isElement(node) || SKIP_TAGS.has(node.tagName) || node.tagName === "img") return;
      if (node.tagName === "br") {
        text += " ";
        return;
      }
      if (node.tagName === "a") {
        const before = normalizeSpace(text);
        if (text && !/\s$/.test(text)) text += " ";
        const start = text.length;
        for (const c of node.children) walk(c);
        const href = cleanHref(node.attribs?.href ?? "", baseUrl);
        if (href) {
          pending.push({
            ref: { href, text: normalizeSpace(text.slice(start)), parts: anchorParts(node), lineIdx, before: before.slice(-160), after: "", isButton: isButtonish(node), order: order++ },
            end: text.length,
          });
        }
        return;
      }
      for (const c of node.children) walk(c);
      if (/^(td|th|div|p|li|tr|ul|ol)$/.test(node.tagName) || /display\s*:\s*(?:block|flex|grid)/i.test(node.attribs?.style ?? "")) text += " ";
    };
    for (const n of nodes) walk(n);
    const finalText = normalizeSpace(text);
    if (!finalText && pending.length === 0) return null;
    const lineLinks = pending.map(({ ref, end }) => {
      ref.after = normalizeSpace(text.slice(end)).slice(0, 120);
      return ref;
    });
    links.push(...lineLinks);
    return { idx: lineIdx, tag, headingLevel: 0, text: finalText, section, links: lineLinks, inFaq };
  }

  function emitRow(tr: Element, tableIdx: number, rowIdx: number, inFaq: boolean): void {
    const cells: Cell[] = [];
    const rowLinks: LinkRef[] = [];
    const lineIdx = lines.length;
    $(tr)
      .children("td,th")
      .each((ci, cellEl) => {
        const start = lines.length;
        const linkStart = links.length;
        emitInline(cellEl.children, "td", inFaq);
        const produced = lines.splice(start); // fold cell lines into the row line
        const cellLinks = links.slice(linkStart);
        for (const l of cellLinks) {
          l.lineIdx = lineIdx;
          l.cellIdx = ci;
        }
        rowLinks.push(...cellLinks);
        cells.push({
          text: normalizeSpace(produced.map((l) => l.text).join(" ")),
          links: cellLinks,
          isHeader: cellEl.tagName === "th" || $(tr).parent().is("thead"),
        });
      });
    if (cells.every((c) => !c.text && c.links.length === 0)) return;
    lines.push({ idx: lineIdx, tag: "tr", headingLevel: 0, text: cells.map((c) => c.text).join(" | "), section, links: rowLinks, cells, tableIdx, rowIdx, inFaq });
  }

  function walkContainer(children: AnyNode[], inFaq: boolean): void {
    let buffer: AnyNode[] = [];
    const flush = (): void => {
      if (buffer.length > 0) emitInline(buffer, "div", inFaq);
      buffer = [];
    };
    for (const node of children) {
      if (node.type === "text") {
        buffer.push(node);
        continue;
      }
      if (!isElement(node)) continue;
      const tag = node.tagName.toLowerCase();
      if (SKIP_TAGS.has(tag)) continue;
      if (INLINE.has(tag)) {
        buffer.push(node);
        continue;
      }
      flush();
      if (isTocContainer(node)) continue;
      const faq = inFaq || isFaqContainer(node);
      if (HEADINGS.has(tag)) {
        const text = normalizeSpace($(node).text());
        if (!text) continue;
        const level = Number(tag.slice(1));
        if (level >= 2 && level <= 4) section = text;
        const idx = lines.length;
        const headingLinks: LinkRef[] = [];
        $(node)
          .find("a")
          .each((_, a) => {
            const href = cleanHref(a.attribs?.href ?? "", baseUrl);
            if (!href) return;
            const ref: LinkRef = { href, text: normalizeSpace($(a).text()), parts: anchorParts(a), lineIdx: idx, before: "", after: "", isButton: false, order: order++ };
            headingLinks.push(ref);
            links.push(ref);
          });
        lines.push({ idx, tag, headingLevel: level, text, section, links: headingLinks, inFaq: faq });
        continue;
      }
      if (tag === "table") {
        const tableIdx = tableCounter++;
        $(node)
          .find("tr")
          .each((ri, tr) => {
            if ($(tr).closest("table")[0] !== node) return; // keep outermost table rows only
            emitRow(tr, tableIdx, ri, faq);
          });
        continue;
      }
      if (tag === "li") {
        const groups: AnyNode[][] = [[]];
        const nested: AnyNode[] = [];
        for (const c of node.children) {
          if (isElement(c) && (c.tagName === "ul" || c.tagName === "ol")) nested.push(c);
          else if (isElement(c) && (c.tagName === "p" || c.tagName === "div")) {
            groups.push([...c.children]);
            groups.push([]);
          } else groups[groups.length - 1]!.push(c);
        }
        for (const g of groups) if (g.length > 0) emitInline(g, "li", faq);
        walkContainer(nested, faq);
        continue;
      }
      if (LEAF_BLOCKS.has(tag)) {
        emitInline(node.children, tag, faq);
        continue;
      }
      walkContainer(node.children, faq);
    }
    flush();
  }

  walkContainer($.root().contents().toArray(), false);
  // Re-number (heading folding may have shifted indexes) and fix link line pointers.
  lines.forEach((line, i) => {
    line.idx = i;
    for (const l of line.links) l.lineIdx = i;
  });
  return { $, lines, links };
}

/** Text of all lines, newline-separated (handy for regex scans). */
export function modelText(model: ContentModel, filter?: (l: Line) => boolean): string {
  return model.lines.filter((l) => (filter ? filter(l) : true)).map((l) => l.text).join("\n");
}

const JUNK_LINE_START = /^(?:read more|also read|related|check also|see also|must read|recommended|you may also like|join (?:our|us|the)|follow us|subscribe|instant job updates)\b/i;

/**
 * True for lines that are navigation, not content: "Read More: …", related-post links, social prompts —
 * i.e. lines whose text is (almost) entirely anchors pointing at `selfHost`.
 */
export function isJunkLine(line: Line, selfHost: string): boolean {
  if (JUNK_LINE_START.test(line.text)) return true;
  if (line.links.length === 0) return false;
  const internal = line.links.filter((l) => {
    try {
      const h = new URL(l.href).hostname.toLowerCase().replace(/^www\./, "");
      return h === selfHost || h.endsWith(`.${selfHost}`);
    } catch {
      return false;
    }
  });
  if (internal.length === 0) return false;
  const anchorChars = internal.reduce((n, l) => n + l.text.length, 0);
  return anchorChars >= line.text.length * 0.7;
}
