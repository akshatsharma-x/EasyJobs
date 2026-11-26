/**
 * HTML helpers. Scrapers only assemble and decode HTML — sanitising is @easyjobs/normalize's job.
 */
import { decodeHTML } from "entities";
import { clean, cleanMultiline } from "./text";

/** Decodes HTML entities once ("&lt;p&gt;" → "<p>"). */
export function decodeEntities(value: string): string {
  return decodeHTML(value);
}

const ESCAPED_TAG = /&lt;\/?[a-z][a-z0-9]*(?:\s[^&]*?)?\/?&gt;/i;
const RAW_TAG = /<\/?[a-z][a-z0-9]*[\s/>]/i;

/** True for HTML that was entity-escaped as a whole (Greenhouse `content`). */
export function isEscapedHtml(value: string): boolean {
  return ESCAPED_TAG.test(value) && !RAW_TAG.test(value);
}

/** Decodes escaped HTML; leaves real HTML untouched (decoding it would turn literal "&lt;" text into tags). */
export function unescapeHtml(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  return isEscapedHtml(value) ? decodeEntities(value) : value;
}

export function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Plain text of an HTML fragment (block tags become line breaks). For hints/extra only. */
export function htmlToPlain(html: string | null | undefined): string | null {
  if (typeof html !== "string") return null;
  const text = html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6]|tr|ul|ol|section)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, " ");
  return cleanMultiline(decodeEntities(text));
}

/** True when the fragment has no visible text (e.g. "<p></p>", "<p>&nbsp;</p>"). */
export function isBlankHtml(html: string | null | undefined): boolean {
  if (typeof html !== "string") return true;
  if (/<(img|iframe|video|table)\b/i.test(html)) return false;
  return clean(htmlToPlain(html)) === null;
}

/** "<h3>Title</h3>\n<body>" or null when the body is blank. */
export function htmlSection(title: string | null | undefined, body: string | null | undefined): string | null {
  if (typeof body !== "string" || isBlankHtml(body)) return null;
  const t = clean(title);
  return t ? `<h3>${escapeHtml(t)}</h3>\n${body.trim()}` : body.trim();
}

/** Joins non-blank fragments with newlines; null when nothing is left. */
export function joinHtml(parts: (string | null | undefined)[]): string | null {
  const kept = parts.filter((p): p is string => typeof p === "string" && !isBlankHtml(p)).map((p) => p.trim());
  return kept.length > 0 ? kept.join("\n") : null;
}

/** Joins plain-text sections with blank lines; null when empty. */
export function joinText(parts: (string | null | undefined)[]): string | null {
  const kept = parts.map((p) => cleanMultiline(p)).filter((p): p is string => p !== null);
  return kept.length > 0 ? kept.join("\n\n") : null;
}
