import { XMLParser } from "fast-xml-parser";

/**
 * XML parser for job feeds. Values stay strings (ids like "1289877" must not become numbers), CDATA is
 * merged into text, XML entities are decoded (so RSS's escaped HTML becomes HTML), and the listed element
 * paths are always arrays. fast-xml-parser never resolves external entities.
 */
export function createFeedParser(arrayPaths: string[]): XMLParser {
  const arrays = new Set(arrayPaths);
  return new XMLParser({
    ignoreAttributes: true,
    parseTagValue: false,
    parseAttributeValue: false,
    trimValues: true,
    processEntities: true,
    htmlEntities: true,
    isArray: (_name, jpath) => arrays.has(String(jpath)),
  });
}

/** Text content of a parsed node (string, or an object holding "#text"). */
export function xmlText(node: unknown): string | null {
  if (typeof node === "string") return node.trim() || null;
  if (typeof node === "number") return String(node);
  if (node && typeof node === "object" && "#text" in node) return xmlText((node as Record<string, unknown>)["#text"]);
  return null;
}
