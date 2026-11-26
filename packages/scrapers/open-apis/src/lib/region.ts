import {
  CITY_CODE_RE,
  GLOBAL_CITY_RE,
  INDIA_RE,
  INDIA_REGION_RE,
  NA_TIMEZONE_RE,
  NON_INDIA_REGION_RE,
  OTHER_COUNTRY_RE,
  US_STATE_RE,
} from "./places";

/**
 * Who can apply to a remote role, as far as the text tells us.
 * india     – India is explicitly allowed
 * anywhere  – worldwide / no location restriction
 * asia      – a region that contains India (APAC, Asia, …)
 * restricted – limited to places that exclude India
 * unknown   – no usable signal
 */
export type RemoteScope = "india" | "anywhere" | "asia" | "restricted" | "unknown";

export const ELIGIBLE_SCOPES: readonly RemoteScope[] = ["india", "anywhere", "asia"];

const ANYWHERE_RE =
  /(?<![\p{L}])(?:world[- ]?wide|anywhere|global(?:ly)?|international(?:ly)?|everywhere|all countries|any (?:country|location|where|time ?zone)|no (?:location|geo(?:graphic(?:al)?)?) restrictions?|location[- ]independent|fully distributed)(?![\p{L}])/iu;
/** Asia sub-regions that exclude India ("Southeast Asia", "SEA", "East Asia", …). */
const NON_INDIA_ASIA_RE = /(?<![\p{L}])(?:south[- ]?east|east|central|west(?:ern)?|w\.?|se|e\.?) asia(?![\p{L}])|(?<![\p{L}])sea(?![\p{L}])/giu;

function mentionsNonIndiaPlace(text: string): boolean {
  return (
    OTHER_COUNTRY_RE.test(text) ||
    NON_INDIA_REGION_RE.test(text) ||
    US_STATE_RE.test(text) ||
    NA_TIMEZONE_RE.test(text) ||
    GLOBAL_CITY_RE.test(text) ||
    CITY_CODE_RE.test(text)
  );
}

/** Classifies one location / region string ("Worldwide", "USA Only", "APAC", "Remote - India"). */
export function classifyRegion(raw: string | null | undefined): RemoteScope {
  const text = (raw ?? "").replace(/[\u{1F1E6}-\u{1F1FF}]/gu, " ").trim();
  if (!text) return "unknown";
  if (INDIA_RE.test(text)) return "india";
  // "APAC" / "Asia" include India, but "Southeast Asia" / "East Asia" / "SEA" do not.
  if (INDIA_REGION_RE.test(text.replace(NON_INDIA_ASIA_RE, " "))) return "asia";
  const restricted = mentionsNonIndiaPlace(text);
  if (ANYWHERE_RE.test(text)) return restricted ? "restricted" : "anywhere";
  return restricted ? "restricted" : "unknown";
}

const SCOPE_RANK: Record<RemoteScope, number> = { india: 5, anywhere: 4, asia: 3, restricted: 2, unknown: 1 };

/** Most permissive scope across several location strings (any India mention wins). */
export function bestScope(scopes: RemoteScope[]): RemoteScope {
  return scopes.reduce<RemoteScope>((best, s) => (SCOPE_RANK[s] > SCOPE_RANK[best] ? s : best), "unknown");
}

/** In prose the country is written "US"/"U.S."; a lowercase "us" is the pronoun ("join us", "contact us"). */
export function withoutPronounUs(text: string): string {
  return text.replace(/\b(?:us|Us)\b/g, " ");
}

/** Classifies free text (title fragments, description captures) — pronoun-safe. */
export function classifyProse(text: string): RemoteScope {
  return classifyRegion(withoutPronounUs(text));
}

/** Region abbreviations that exclude India, matched case-sensitively in titles ("SEA P2P BD", "Head of EEA Legal"). */
const TITLE_ABBR_RE = /(?<![\p{L}\p{N}])(?:US|USA|U\.S\.|UK|EU|EEA|EMEA|LATAM|DACH|ANZ|SEA|AMER|CET|EST|PST|CST|MST)(?![\p{L}\p{N}])/u;
/** Ambiguous as words, so only trusted inside a fragment/tail, not anywhere in a title. */
const AMBIGUOUS_TITLE_WORDS = new Set(["america", "georgia", "jordan", "turkey", "chad", "panama", "cuba", "sea", "us", "eu"]);
const TITLE_NAME_RE = new RegExp([OTHER_COUNTRY_RE.source, NON_INDIA_REGION_RE.source].join("|"), "giu");

/**
 * A region named in the title that excludes India — "Engineer (US)", "AE - Singapore", "Specialist (PST)",
 * "U.S. Based", "Remote US", "SEA Business Developer". Returns the offending fragment or null.
 */
export function titleRestriction(title: string): string | null {
  // A title that itself names India / APAC / Asia is not restricted. ("Global" is not an escape: it is
  // usually an adjective — "Senior Global Partner Specialist - USA".)
  if (INDIA_RE.test(title) || INDIA_REGION_RE.test(title.replace(NON_INDIA_ASIA_RE, " "))) return null;
  const fragments: string[] = [];
  for (const m of title.matchAll(/[([]([^)\]]{1,60})[)\]]/g)) fragments.push(m[1] ?? "");
  const tail = /(?:\s[-–—|:]\s*|,\s*)([^-–—|:,()]{2,40})$/.exec(title.replace(/[([][^)\]]*[)\]]\s*$/, "").trim());
  if (tail?.[1]) fragments.push(tail[1]);
  const inline =
    /\b(?:(?:US|U\.S\.|USA|UK|EU|EMEA|LATAM|Canada|Europe|Americas?)[- ](?:only|based|remote|residents?|citizens?)|remote[- ](?:US|USA|UK|EU|Canada|Europe|LATAM|Americas))\b/i.exec(
      title,
    );
  if (inline) fragments.push(inline[0]);
  for (const f of fragments) {
    if (classifyProse(f) === "restricted") return f.trim();
  }
  const abbr = TITLE_ABBR_RE.exec(title);
  if (abbr) return abbr[0];
  for (const name of title.matchAll(TITLE_NAME_RE)) {
    if (!AMBIGUOUS_TITLE_WORDS.has(name[0].toLowerCase())) return name[0];
  }
  return null;
}

/** Places (excluding India) used by residency phrases. Ends with a letter-boundary so "U.S." works. */
const PLACE = String.raw`(?:the\s+)?(?:U\.S\.A\.?|U\.S\.?|USA|US|United States(?: of America)?|America|Canada|North America|Latin America|LATAM|UK|U\.K\.?|United Kingdom|Great Britain|EU|E\.U\.?|European Union|EEA|Europe|EMEA|Germany|France|Spain|Netherlands|Poland|Ireland|Australia|New Zealand|Brazil|Mexico|Argentina|Colombia|Philippines|Singapore|Japan|Israel|Switzerland|Portugal|Italy|Sweden|Denmark|Norway|Finland|Romania|Ukraine|South Africa|Nigeria|Kenya|Pakistan|Turkey|Türkiye)(?![\p{L}])`;

const rx = (source: string): RegExp => new RegExp(source, "iu");

const RESTRICTION_PATTERNS: readonly RegExp[] = [
  rx(String.raw`\b(?:must|should|need to|needs to|required to|have to|has to)\s+(?:be\s+)?(?:currently\s+)?(?:legally\s+)?(?:reside|residing|live|living|located|based|be based|be located)\s+(?:in|within)\s+${PLACE}`),
  rx(String.raw`\b(?:authori[sz]ed|eligible|eligibility|permitted|legally able)\s+to\s+work\s+(?:in|within|for)\s+${PLACE}`),
  rx(String.raw`\b(?:open|available|limited|restricted)\s+(?:only\s+)?to\s+(?:candidates|applicants|residents|people|those|individuals|citizens)\s+(?:who\s+(?:are|live)\s+)?(?:based\s+|located\s+|residing\s+|living\s+)?(?:in|within|of)\s+${PLACE}`),
  rx(String.raw`\bwe\s+(?:are\s+)?(?:only|can only|can't|cannot|are unable to|are not able to)\s+(?:hire|hiring|employ|consider|accept|support)\b[^.]{0,60}?\b(?:in|from|outside(?: of)?)\s+${PLACE}`),
  rx(String.raw`(?<![\p{L}])${PLACE}[- ](?:based\s+)?(?:only|residents only|citizens only|citizenship required|persons only)\b`),
  /\bU\.?S\.? (?:persons|citizens?|citizenship)(?![\p{L}])|\bsecurity clearance\b|\bITAR\b/iu,
  rx(String.raw`\b(?:remote|work from home|wfh)\s*(?:\(|-|–|—|,|within|in)\s*${PLACE}\s*(?:only)?\)?`),
  rx(String.raw`\bthis\s+(?:is\s+a\s+)?(?:role|position|job|opportunity)\s+(?:is\s+)?(?:a\s+)?(?:fully\s+)?(?:remote\s+)?(?:role\s+|position\s+)?(?:based|located)\s+in\s+${PLACE}`),
];

/**
 * Phrases whose captured place list is open-ended ("open to candidates who reside in Atlanta, Georgia; …",
 * "Work Location: …", "This role can be filled in European, Middle East … time zones"). The capture is
 * classified; only "restricted" counts.
 */
const CAPTURE_PATTERNS: readonly RegExp[] = [
  /\b(?:open|available|limited|restricted)\s+(?:only\s+)?to\s+(?:candidates|applicants|residents|people|individuals|those)\s+(?:who\s+(?:currently\s+)?(?:reside|live|are\s+(?:located|based))\s+)?(?:(?:based|located|residing|living)\s+)?(?:in|within|from)?\s*([^.;:!?]{2,140})/iu,
  /\b(?:role|position|job|opportunity)\s+(?:can|could|will|may|must|is to)\s+(?:only\s+)?be\s+(?:filled|based|located|performed|done|hired)\s+(?:in|from|within)\s+([^.;:!?]{2,140})/iu,
  /\bwork\s+location\s*:\s*([^.;!?]{2,180})/iu,
  /\b(?:we\s+are|we're|we)\s+(?:only\s+)?(?:hiring|recruiting|accepting applications|considering candidates)\s+(?:only\s+)?(?:in|from)\s+([^.;:!?]{2,120})/iu,
  /\bcandidates?\s+(?:must|should|need\s+to)\s+(?:be\s+)?(?:based|located|residing|living)\s+in\s+([^.;:!?]{2,120})/iu,
];

/** Context that cancels a restriction match ("…based in the US or India", "…or anywhere"). */
const ESCAPE_HATCH_RE = new RegExp(`${INDIA_RE.source}|${INDIA_REGION_RE.source}|${ANYWHERE_RE.source}`, "iu");

/** Strong "must be based in X" phrasing in a description, where X excludes India. Returns the phrase or null. */
export function descriptionRestriction(text: string | null | undefined): string | null {
  if (!text) return null;
  const sample = text.length > 20_000 ? text.slice(0, 20_000) : text;
  for (const re of RESTRICTION_PATTERNS) {
    const m = re.exec(sample);
    if (!m) continue;
    const around = sample.slice(Math.max(0, m.index - 80), m.index + m[0].length + 80);
    if (ESCAPE_HATCH_RE.test(withoutPronounUs(around))) continue;
    return m[0].trim();
  }
  for (const re of CAPTURE_PATTERNS) {
    const m = re.exec(sample);
    const captured = m?.[1]?.trim();
    if (!m || !captured) continue;
    if (classifyProse(captured) === "restricted") return m[0].trim().slice(0, 160);
  }
  return null;
}

export interface RemoteAssessment {
  scope: RemoteScope;
  eligible: boolean;
  /** Why it was rejected (for debug logs/extra). */
  reason?: string;
}

/**
 * Combines location strings, title and description into one decision.
 * `unknownMeans` lets a source treat "no region given" as anywhere (e.g. a board whose default is worldwide).
 */
export function assessRemote(input: {
  locations: (string | null | undefined)[];
  title?: string;
  descriptionText?: string | null;
  unknownMeans?: "anywhere" | "unknown";
}): RemoteAssessment {
  let scope = bestScope(input.locations.map(classifyRegion));
  if (scope === "unknown" && input.unknownMeans === "anywhere") scope = "anywhere";
  if (scope === "restricted") return { scope, eligible: false, reason: "location excludes India" };
  if (scope === "india") return { scope, eligible: true };
  const fromTitle = input.title ? titleRestriction(input.title) : null;
  if (fromTitle) return { scope: "restricted", eligible: false, reason: `title restricts to "${fromTitle}"` };
  const fromText = descriptionRestriction(input.descriptionText);
  if (fromText) return { scope: "restricted", eligible: false, reason: `description restricts: "${fromText}"` };
  return { scope, eligible: ELIGIBLE_SCOPES.includes(scope), reason: scope === "unknown" ? "no region given" : undefined };
}

/** Hint fields shared by every eligible remote-board job ("tag them remote"). */
export function remoteHints(
  scope: RemoteScope,
  regionHint?: string,
): { locations: string[]; isRemote: true; workMode: "remote"; tags: string[] } {
  return { locations: [remoteLocationLabel(scope, regionHint)], isRemote: true, workMode: "remote", tags: ["remote"] };
}

/** Location string we emit for an eligible remote role (readable by the normalizer: "Remote (India)"). */
export function remoteLocationLabel(scope: RemoteScope, regionHint?: string): string {
  switch (scope) {
    case "india":
      return "Remote (India)";
    case "asia":
      return /apac|asia[- ]pacific/i.test(regionHint ?? "") ? "Remote (APAC)" : "Remote (Asia)";
    case "anywhere":
      return "Remote (Anywhere)";
    default:
      return "Remote";
  }
}
