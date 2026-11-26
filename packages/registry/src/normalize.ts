/**
 * Company-name normalization used by findCompany() and by the discovery scripts.
 *
 *   normalizeName("Amazon Development Centre (India) Pvt. Ltd.") → "amazon development centre"
 *   coreName("Palantir Technologies Inc.")                       → "palantir"
 *   compactName("J.P. Morgan")                                   → "jpmorgan"
 */

/** Legal-form words that never distinguish one company from another (stripped at the end). */
const LEGAL_SUFFIXES = new Set([
  "pvt", "private", "ltd", "limited", "llc", "llp", "lp", "inc", "incorporated", "corp", "corporation", "plc",
  "gmbh", "ag", "sa", "sas", "nv", "bv", "pte", "pty", "srl", "spa", "ab", "oy", "kk", "co", "se", "sarl", "ulc",
]);

/**
 * Generic trailing words: "HCL Technologies" ≈ "HCL", "Wipro Limited India" ≈ "Wipro".
 * Only used for the looser "core" key, and only stripped from the END while something distinctive remains.
 */
const GENERIC_WORDS = new Set([
  "technologies", "technology", "tech", "solutions", "services", "service", "software", "systems", "labs", "lab",
  "group", "holdings", "holding", "global", "international", "worldwide", "india", "indian", "digital",
  "consulting", "consultancy", "enterprises", "enterprise", "industries", "company", "companies", "and", "the",
  "networks", "network", "platforms", "platform", "online", "ventures", "hq", "io", "ai", "app", "apps", "inc",
  "development", "center", "centre", "centers", "centres", "operations", "capability", "innovation", "hub",
  "research", "engineering", "business", "it", "infotech", "infosystems", "corporate", "usa", "us", "uk",
]);

/** Words that may follow a known company name without changing which company it is ("Google India Pvt Ltd"). */
export const QUALIFIER_WORDS = new Set([
  ...GENERIC_WORDS,
  ...LEGAL_SUFFIXES,
  "bangalore", "bengaluru", "hyderabad", "pune", "chennai", "mumbai", "gurgaon", "gurugram", "noida", "delhi",
  "kolkata", "ahmedabad", "kochi", "jaipur", "coimbatore", "trivandrum", "thiruvananthapuram", "indore",
  "asia", "pacific", "apac", "emea", "americas", "europe", "north", "america", "singapore", "london",
  "careers", "career", "jobs", "job", "board", "hiring", "recruitment", "campus", "university", "students", "graduates",
  "gcc", "gdc", "gtc", "gbs", "ltd", "pvt", "of", "for", "in", "at",
]);

/** Lowercase, ASCII, punctuation-free, single-spaced; legal suffixes and parentheticals removed. */
export function normalizeName(input: string): string {
  let s = input
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ") // "(India)", "(formerly X)"
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/['’`]/g, "") // McDonald's → mcdonalds
    .replace(/\b([a-z])\.(?=[a-z]\b\.?)/g, "$1") // J.P. → jp, L.L.Bean → llbean
    .replace(/&/g, " and ")
    .replace(/\+/g, " plus ")
    .replace(/@/g, " at ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  if (s.startsWith("the ") && s.length > 4) s = s.slice(4);
  const words = s.split(" ").filter(Boolean);
  // "JPMorgan Chase & Co." → strip "co", then the dangling "and".
  while (words.length > 1 && (LEGAL_SUFFIXES.has(words[words.length - 1]!) || words[words.length - 1] === "and")) words.pop();
  return words.join(" ");
}

/** Looser key: also strips generic trailing words ("Technologies", "India", "Services"…). */
export function coreName(input: string): string {
  const words = normalizeName(input).split(" ").filter(Boolean);
  while (words.length > 1 && (GENERIC_WORDS.has(words[words.length - 1]!) || LEGAL_SUFFIXES.has(words[words.length - 1]!))) {
    words.pop();
  }
  // Leading articles / filler ("The", "And") never matter.
  while (words.length > 1 && (words[0] === "the" || words[0] === "and")) words.shift();
  return words.join(" ");
}

/** "Urban Company" → "urbancompany" (ATS tokens are usually this shape). */
export function compactName(input: string): string {
  return normalizeName(input).replace(/ /g, "");
}

/** Strips scheme, "www.", path; lowercases. Returns null if the input does not look like a host. */
export function normalizeDomain(input: string | null | undefined): string | null {
  if (!input) return null;
  let s = input.trim().toLowerCase();
  if (!s) return null;
  if (!/^[a-z][a-z0-9+.-]*:\/\//.test(s)) s = `https://${s}`;
  try {
    const host = new URL(s).hostname.replace(/^www\d?\./, "").replace(/\.$/, "");
    return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host) ? host : null;
  } catch {
    return null;
  }
}

/** Two-label public suffixes we care about (co.in, com.au…), for registrable-domain extraction. */
const SECOND_LEVEL_SUFFIXES = new Set([
  "co.in", "net.in", "org.in", "firm.in", "gen.in", "ind.in", "ac.in", "edu.in", "gov.in", "co.uk", "org.uk", "ac.uk",
  "com.au", "net.au", "org.au", "co.nz", "co.jp", "ne.jp", "co.kr", "com.sg", "com.br", "com.mx", "com.cn", "com.hk",
  "co.za", "com.tr", "co.il", "com.my", "com.ph", "co.id", "com.vn", "com.ar", "com.co", "com.pk", "com.bd",
]);

/** "careers.google.com" → "google.com", "jobs.tcs.co.in" → "tcs.co.in". */
export function registrableDomain(host: string): string {
  const labels = host.split(".");
  if (labels.length <= 2) return host;
  const last2 = labels.slice(-2).join(".");
  if (SECOND_LEVEL_SUFFIXES.has(last2)) return labels.slice(-3).join(".");
  return last2;
}

/** Jaro–Winkler similarity in [0, 1]. */
export function jaroWinkler(a: string, b: string): number {
  if (a === b) return 1;
  const la = a.length;
  const lb = b.length;
  if (la === 0 || lb === 0) return 0;
  const window = Math.max(0, Math.floor(Math.max(la, lb) / 2) - 1);
  const aMatch = new Array<boolean>(la).fill(false);
  const bMatch = new Array<boolean>(lb).fill(false);
  let matches = 0;
  for (let i = 0; i < la; i++) {
    const lo = Math.max(0, i - window);
    const hi = Math.min(lb - 1, i + window);
    for (let j = lo; j <= hi; j++) {
      if (bMatch[j] || a[i] !== b[j]) continue;
      aMatch[i] = true;
      bMatch[j] = true;
      matches++;
      break;
    }
  }
  if (matches === 0) return 0;
  let k = 0;
  let transpositions = 0;
  for (let i = 0; i < la; i++) {
    if (!aMatch[i]) continue;
    while (!bMatch[k]) k++;
    if (a[i] !== b[k]) transpositions++;
    k++;
  }
  const jaro = (matches / la + matches / lb + (matches - transpositions / 2) / matches) / 3;
  let prefix = 0;
  while (prefix < Math.min(4, la, lb) && a[prefix] === b[prefix]) prefix++;
  return jaro + prefix * 0.1 * (1 - jaro);
}

/**
 * Optimal-string-alignment (Damerau–Levenshtein) distance, or `max + 1` as soon as it must exceed `max`.
 * `substitutions: false` only counts insertions, deletions and adjacent transpositions.
 */
export function editDistance(a: string, b: string, max: number, substitutions = true): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const sub = substitutions ? 1 : max + 1;
  let prev2: number[] = [];
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const same = a[i - 1] === b[j - 1];
      let v = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + (same ? 0 : sub));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2]! + 1);
      cur.push(v);
      rowMin = Math.min(rowMin, v);
    }
    if (rowMin > max) return max + 1;
    prev2 = prev;
    prev = cur;
  }
  return Math.min(prev[b.length]!, max + 1);
}

/** Typo tolerance for company keys: ≥ 8 chars → 2 edits; 5–7 → 1 insertion/deletion/transposition; shorter → none. */
export function isLikelyTypo(query: string, key: string): boolean {
  const len = Math.min(query.length, key.length);
  if (len < 5 || query[0] !== key[0]) return false;
  if (len >= 8) return editDistance(query, key, 2) <= 2;
  return editDistance(query, key, 1, false) <= 1;
}

/**
 * Do two company names refer to the same company? Used to validate ATS boards found by probing
 * ("Palantir" ≈ "Palantir Technologies", "PhonePe" ≈ "PhonePe Private Limited").
 */
export function namesMatch(a: string, b: string): boolean {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  const ca = coreName(a);
  const cb = coreName(b);
  if (ca === cb) return true;
  if (ca.replace(/ /g, "") === cb.replace(/ /g, "")) return true; // "Share Chat" vs "ShareChat"
  // Whole-word containment where the extra words are only qualifiers ("Stripe" vs "Stripe Payments India").
  const wa = na.split(" ");
  const wb = nb.split(" ");
  const [short, long] = wa.length <= wb.length ? [wa, wb] : [wb, wa];
  if (short.join("").length >= 3 && long.slice(0, short.length).join(" ") === short.join(" ")) {
    if (long.slice(short.length).every((w) => QUALIFIER_WORDS.has(w))) return true;
  }
  const sa = ca.replace(/ /g, "");
  const sb = cb.replace(/ /g, "");
  return Math.min(sa.length, sb.length) >= 6 && jaroWinkler(sa, sb) >= 0.95;
}
