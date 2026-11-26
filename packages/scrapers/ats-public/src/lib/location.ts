/**
 * Location string helpers. Scrapers emit raw location strings (the normalizer canonicalises them),
 * but when an ATS gives structured parts we compose "City, Region, Country" so the country is never lost.
 */
import { clean } from "./text";

const regionNames = new Intl.DisplayNames(["en"], { type: "region" });

/** ISO alpha-2 → English name, built once from ICU. */
const NAME_BY_CODE = new Map<string, string>();
/** lower-cased name/alias → ISO alpha-2 */
const CODE_BY_NAME = new Map<string, string>();

const EXTRA_ALIASES: Record<string, string[]> = {
  US: ["USA", "U.S.", "U.S.A.", "United States of America", "America"],
  GB: ["UK", "U.K.", "Great Britain", "Britain", "England", "Scotland", "Wales", "Northern Ireland"],
  AE: ["UAE", "U.A.E."],
  NL: ["Holland", "The Netherlands"],
  KR: ["Korea", "Republic of Korea"],
  CZ: ["Czech Republic"],
  TR: ["Turkey", "Türkiye"],
  RU: ["Russian Federation"],
  VN: ["Viet Nam"],
  HK: ["Hong Kong SAR"],
  MO: ["Macau"],
  TW: ["Republic of China"],
  CI: ["Ivory Coast"],
  CD: ["DR Congo", "DRC"],
};

/** Display regions that are not ISO 3166-1 countries (or are deprecated aliases such as UK → GB). */
const NOT_COUNTRIES = /^(AA|Q[M-Z]|X[A-Z]|ZZ|EU|EZ|UN|UK)$/;

for (let a = 65; a <= 90; a++) {
  for (let b = 65; b <= 90; b++) {
    const code = String.fromCharCode(a, b);
    if (NOT_COUNTRIES.test(code)) continue;
    let name: string | undefined;
    try {
      name = regionNames.of(code);
    } catch {
      name = undefined;
    }
    if (!name || name === code || /unknown/i.test(name)) continue;
    NAME_BY_CODE.set(code, name);
    CODE_BY_NAME.set(name.toLowerCase(), code);
  }
}
for (const [code, aliases] of Object.entries(EXTRA_ALIASES)) {
  for (const alias of aliases) CODE_BY_NAME.set(alias.toLowerCase(), code);
}

/** "in" / "IN" / "India" / "USA" → "IN" / "US"; unknown → null. */
export function countryCode(input: unknown): string | null {
  const s = clean(input);
  if (!s) return null;
  const alias = CODE_BY_NAME.get(s.toLowerCase());
  if (alias) return alias; // also catches "UK" → GB
  if (/^[a-z]{2}$/i.test(s)) {
    const code = s.toUpperCase();
    return NAME_BY_CODE.has(code) ? code : null;
  }
  return null;
}

/** "in" → "India"; "India" → "India"; "USA" → "USA" (names are kept as given). */
export function countryName(input: unknown): string | null {
  const s = clean(input);
  if (!s) return null;
  if (/^[a-z]{2}$/i.test(s)) {
    const code = countryCode(s);
    return code ? (NAME_BY_CODE.get(code) ?? null) : null;
  }
  return s;
}

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** True if `text` already names the country (by name, alias or upper-case ISO code). */
export function mentionsCountry(text: string, country: string): boolean {
  const code = countryCode(country);
  const names = new Set<string>([country]);
  if (code) {
    const name = NAME_BY_CODE.get(code);
    if (name) names.add(name);
    for (const alias of EXTRA_ALIASES[code] ?? []) names.add(alias);
  }
  for (const n of names) {
    if (n.length <= 3 && n === n.toUpperCase()) continue; // codes handled case-sensitively below
    if (new RegExp(`(^|[^\\p{L}])${escapeRe(n)}($|[^\\p{L}])`, "iu").test(text)) return true;
  }
  const codes = [code, ...[...names].filter((n) => n.length <= 3 && n === n.toUpperCase())].filter(Boolean) as string[];
  return codes.some((c) => new RegExp(`(^|[^A-Za-z])${escapeRe(c)}($|[^A-Za-z])`).test(text));
}

/** Text that spans several countries — never append a single country to it. */
const MULTI_REGION =
  /\b(emea|apac|apj|latam|amer|americas|europe|asia|africa|middle east|nordics?|dach|benelux|global|worldwide|anywhere|international|multiple|various|several)\b/i;

/** Appends ", <Country>" to a location string when the country is known and not already present. */
export function withCountry(text: string | null | undefined, country: unknown): string | null {
  const t = clean(text);
  const name = countryName(country);
  if (!t) return name;
  if (!name || MULTI_REGION.test(t) || mentionsCountry(t, name)) return t;
  return `${t}, ${name}`;
}

/** Joins non-empty parts with ", " and drops case-insensitive repeats ("Delhi, Delhi, India" → "Delhi, India"). */
export function joinLocation(parts: unknown[]): string | null {
  const out: string[] = [];
  for (const part of parts) {
    const s = clean(part);
    if (!s) continue;
    if (out.some((o) => o.toLowerCase() === s.toLowerCase())) continue;
    out.push(s);
  }
  return out.length > 0 ? out.join(", ") : null;
}

/** "Chennai, , India" → "Chennai, India". */
export function tidyLocation(text: unknown): string | null {
  const s = clean(text);
  if (!s) return null;
  return joinLocation(s.split(","));
}

/**
 * Drops a bare-country entry when a more specific location in the same country is listed
 * (["Philippines", "Makati City, NCR, Philippines"] → ["Makati City, NCR, Philippines"]).
 */
export function pruneLocations(locations: string[]): string[] {
  return locations.filter((loc) => {
    const code = countryCode(loc);
    if (!code) return true;
    return !locations.some((other) => other !== loc && other.includes(",") && countryCode(other.split(",").pop()) === code);
  });
}
