/** Builds descriptionHtml: only the job-relevant part of a post (no ads, share/Telegram blocks, TOC, FAQ, related posts). */
import * as cheerio from "cheerio";
import type { CheerioAPI } from "cheerio";
import type { AnyNode, Element } from "domhandler";
import { classifyUrl } from "./hosts";
import { cleanHref } from "../util/url";
import { normalizeSpace } from "../util/text";

const DROP_SELECTORS = [
  "script", "style", "noscript", "iframe", "svg", "form", "button", "input", "select", "textarea", "ins", "img", "picture",
  "video", "audio", "embed", "object", "canvas", "figure.wp-block-image", "figure.wp-block-embed", ".wp-block-embed",
  ".wp-block-buttons", ".adsbygoogle", "[class*='code-block']", "[class*='ai-placement']", ".sharedaddy", ".jp-relatedposts",
  ".yarpp-related", ".crp_related", ".addtoany_share_save_container", ".heateor_sss_sharing_container", ".essb_links",
  "#rank-math-toc", ".rank-math-toc-block", "#ez-toc-container", ".lwptoc", ".wp-block-table-of-contents", "nav",
  "#rank-math-faq", ".rank-math-block", ".wp-block-yoast-faq-block", ".schema-faq", ".wp-block-rank-math-faq-block",
].join(",");

const JUNK_CLASS = /\b(?:ad|ads|advert|advertisement|ad-slot|ad-container|social-share|share-buttons|share-links|newsletter|telegram|whatsapp|subscribe|related-posts?|also-read|wp-block-latest-posts)\b/i;

/** Headings that start a section we drop entirely (until the next heading of the same or higher level). */
const DROP_SECTION = /^(?:\d+[.)]\s*)?(?:frequently asked questions|faqs?\b|table of contents|related (?:posts|jobs|articles|internships)|similar (?:jobs|posts)|latest (?:jobs|posts|updates)|also read|you may also like|recommended|more (?:jobs|internships)|conclusion|final (?:words|thoughts)|disclaimer|join (?:us|our)|follow us|share this|(?:basic |common |top )?interview questions|tips for|preparation tips|how to prepare|documents required|important note|instant job updates|other (?:jobs|internships)|trending|important links)\b/i;

const JUNK_LINE = /^(?:read more|also read|related|check also|see also|must read|click here to join|join (?:our|us|the|official)|follow us|subscribe|share (?:this|on)|disclaimer|instant job updates|join telegram|join whatsapp|telegram (?:group|channel)|whatsapp (?:group|channel)|for (?:more|latest) (?:updates|jobs)|stay updated\s+(?:with|for|on)\s+(?:the\s+)?(?:latest|more|new|daily)\s+(?:jobs|updates|openings|notifications)|note\s*:\s*(?:we|this (?:website|site|post) is not))\b/i;
/** Editorial artifacts some blogs leave in published posts. */
const ARTIFACT_LINE = /\bplease verify\b.{0,80}\bbefore publishing\b|^submitted reference link\b/i;

function isHeading(el: Element): number {
  const m = /^h([1-6])$/.exec(el.tagName);
  return m ? Number(m[1]) : 0;
}

function isElement(n: AnyNode): n is Element {
  return n.type === "tag";
}

/** Remove a heading and its following siblings until a heading of the same or higher level. */
function dropSection($: CheerioAPI, heading: Element): void {
  const level = isHeading(heading);
  let next = heading.nextSibling;
  $(heading).remove();
  while (next) {
    const current: AnyNode = next;
    next = current.nextSibling;
    if (isElement(current)) {
      const h = isHeading(current);
      if (h > 0 && h <= level) break;
      // A nested heading of a same/higher level inside a wrapper ends the section too.
      const inner = $(current).find("h1,h2,h3,h4,h5,h6").toArray().find((e) => isHeading(e) <= level);
      if (inner) break;
    }
    $(current).remove();
  }
}

export interface DescriptionOptions {
  baseUrl: string;
  selfHost: string;
  extraBlogHosts?: string[];
}

export function cleanDescription(html: string, opts: DescriptionOptions): string | null {
  if (!html.trim()) return null;
  const $ = cheerio.load(html, null, false);
  $(DROP_SELECTORS).remove();
  $("[class]").each((_, el) => {
    if (JUNK_CLASS.test($(el).attr("class") ?? "")) $(el).remove();
  });

  // Section-level drops (FAQ, related posts, interview prep, conclusion…). Also "strong-only" pseudo headings.
  for (const h of $("h1,h2,h3,h4,h5,h6").toArray()) {
    if (!h.parent) continue;
    if (DROP_SECTION.test(normalizeSpace($(h).text()))) dropSection($, h);
  }

  // Blocks that are just links to other posts on the same blog ("related posts" lists, "Read More: …").
  const classify = (href: string | undefined): ReturnType<typeof classifyUrl> => {
    const clean = href ? cleanHref(href, opts.baseUrl) : null;
    return clean ? classifyUrl(clean, { selfHost: opts.selfHost, extraBlogHosts: opts.extraBlogHosts }) : "self";
  };
  $("li,p").each((_, el) => {
    if (!el.parent) return;
    const text = normalizeSpace($(el).text());
    if (!text) return;
    const internal = $(el)
      .find("a")
      .toArray()
      .filter((a) => ["self", "blog", "search"].includes(classify($(a).attr("href"))));
    const anchorChars = internal.reduce((n, a) => n + normalizeSpace($(a).text()).length, 0);
    if (internal.length > 0 && anchorChars >= text.length * 0.7) $(el).remove();
  });

  // Links: unwrap internal/social/messaging anchors to plain text (or drop the whole junk line), clean the rest.
  $("a").each((_, a) => {
    const href = cleanHref($(a).attr("href") ?? "", opts.baseUrl);
    const kind = href ? classifyUrl(href, { selfHost: opts.selfHost, extraBlogHosts: opts.extraBlogHosts }) : "self";
    if (!href || kind === "self" || kind === "blog" || kind === "search" || kind === "asset") {
      $(a).replaceWith($(a).text());
      return;
    }
    if (kind === "social" || kind === "messaging" || kind === "app_store" || kind === "maps") {
      $(a).closest("p,li").length > 0 ? $(a).closest("p,li").remove() : $(a).remove();
      return;
    }
    $(a).attr("href", href);
  });

  // Line-level junk.
  $("p,li,div,h2,h3,h4,h5,h6,blockquote").each((_, el) => {
    if (!el.parent) return;
    const text = normalizeSpace($(el).text());
    if (JUNK_LINE.test(text) || ARTIFACT_LINE.test(text)) $(el).remove();
  });

  // Lists that became empty or only contained related links.
  $("ul,ol").each((_, el) => {
    if (normalizeSpace($(el).text()).length === 0) $(el).remove();
  });

  // Attribute cleanup and unwrapping of presentational wrappers.
  $("span,font,center,u,mark,small,big,bdi,bdo").each((_, el) => {
    $(el).replaceWith($(el).contents());
  });
  $("*").each((_, node) => {
    if (!isElement(node)) return;
    const el = node;
    const keep: Record<string, string> = {};
    const attrs = el.attribs ?? {};
    if (el.tagName === "a" && attrs.href) {
      keep.href = attrs.href;
      keep.rel = "nofollow noopener";
      keep.target = "_blank";
    }
    if ((el.tagName === "td" || el.tagName === "th") && attrs.colspan) keep.colspan = attrs.colspan;
    if ((el.tagName === "td" || el.tagName === "th") && attrs.rowspan) keep.rowspan = attrs.rowspan;
    el.attribs = keep;
  });

  // Drop empty blocks (repeat to collapse nested empties).
  for (let pass = 0; pass < 3; pass++) {
    $("p,li,div,h1,h2,h3,h4,h5,h6,strong,b,em,i,sup,sub,blockquote,section,figure,table,tbody,thead,tr,td,th").each((_, el) => {
      if (normalizeSpace($(el).text()).length === 0 && $(el).find("br").length === $(el).find("*").length) $(el).remove();
    });
  }
  // Divs → keep children (sanitizers drop divs anyway); figure.wp-block-table → keep table.
  $("div,section,article,figure").each((_, el) => {
    $(el).replaceWith($(el).contents());
  });

  const out = ($.html() ?? "").replace(/\n{3,}/g, "\n\n").replace(/>\s+</g, "><").trim();
  return normalizeSpace($.root().text()).length >= 40 ? out : null;
}
