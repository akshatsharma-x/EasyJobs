import { attr, cleanText } from "./html";
import type { JsonObject } from "./jsonld";

const VOID_TAGS = new Set(["meta", "link", "img", "br", "hr", "input", "source", "area", "base", "col", "embed", "param", "track", "wbr"]);

/** Inner HTML of the element whose start tag begins at `start` (nesting-aware for the same tag name). */
export function innerHtmlAt(html: string, start: number): string | null {
  const open = /^<([a-zA-Z][a-zA-Z0-9-]*)\b[^>]*>/.exec(html.slice(start, start + 2000));
  if (!open) return null;
  const tag = (open[1] ?? "").toLowerCase();
  const bodyStart = start + open[0].length;
  if (VOID_TAGS.has(tag) || open[0].endsWith("/>")) return "";
  const re = new RegExp(`<(/?)${tag}\\b[^>]*>`, "gi");
  re.lastIndex = bodyStart;
  let depth = 1;
  for (let m = re.exec(html); m; m = re.exec(html)) {
    if (m[0].endsWith("/>")) continue;
    depth += m[1] === "/" ? -1 : 1;
    if (depth === 0) return html.slice(bodyStart, m.index);
  }
  return null;
}

/**
 * schema.org JobPosting microdata (itemscope/itemprop), as used by SuccessFactors RMK career sites,
 * converted to a JSON-LD-shaped object so the same mapper handles both. Returns null if absent.
 */
export function extractMicrodataJobPosting(html: string): JsonObject | null {
  const scope = /<[a-zA-Z][^>]*itemtype\s*=\s*["']https?:\/\/schema\.org\/JobPosting["'][^>]*>/i.exec(html);
  if (!scope) return null;
  const body = innerHtmlAt(html, scope.index) ?? html.slice(scope.index);
  const out: JsonObject = { "@type": "JobPosting" };
  const locations: JsonObject[] = [];
  let current: JsonObject | null = null;
  const re = /<([a-zA-Z][a-zA-Z0-9-]*)\b[^>]*\bitemprop\s*=\s*["']([a-zA-Z]+)["'][^>]*>/g;
  for (const m of body.matchAll(re)) {
    const tag = m[0];
    const name = (m[1] ?? "").toLowerCase();
    const prop = m[2] ?? "";
    const content = attr(tag, "content");
    const value = (): string => {
      if (content !== null) return content;
      if (name === "a" || name === "link") return attr(tag, "href") ?? "";
      if (name === "time") return attr(tag, "datetime") ?? cleanText(innerHtmlAt(body, m.index ?? 0) ?? "");
      return cleanText(innerHtmlAt(body, m.index ?? 0) ?? "");
    };
    switch (prop) {
      case "addressLocality":
      case "addressRegion":
      case "addressCountry":
      case "postalCode": {
        // A new locality (or a repeated field) starts a new address.
        if (!current || (prop === "addressLocality" && current.addressLocality !== undefined) || current[prop] !== undefined) {
          current = {};
          locations.push(current);
        }
        current[prop] = value();
        break;
      }
      case "description": {
        if (out.description === undefined) out.description = content ?? innerHtmlAt(body, m.index ?? 0) ?? "";
        break;
      }
      case "hiringOrganization": {
        if (out.hiringOrganization === undefined && content !== null) out.hiringOrganization = { name: content };
        break;
      }
      case "name": {
        // Organization name nested in hiringOrganization scope.
        if (out.hiringOrganization === undefined && /itemprop=["']hiringOrganization/i.test(body.slice(Math.max(0, (m.index ?? 0) - 400), m.index))) {
          out.hiringOrganization = { name: value() };
        }
        break;
      }
      case "title":
      case "datePosted":
      case "validThrough":
      case "employmentType":
      case "industry":
      case "occupationalCategory":
      case "identifier":
      case "url":
      case "skills":
      case "experienceRequirements":
      case "educationRequirements":
      case "jobLocationType": {
        if (out[prop] === undefined) {
          const v = value();
          if (v) out[prop] = v;
        }
        break;
      }
      default:
        break;
    }
  }
  if (locations.length > 0) out.jobLocation = locations.map((address) => ({ "@type": "Place", address: { "@type": "PostalAddress", ...address } }));
  return typeof out.title === "string" && out.title.length > 0 ? out : null;
}
