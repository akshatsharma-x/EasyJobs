import type { JobLocation, WorkMode } from "@easyjobs/contract";
import { WORK_MODES } from "@easyjobs/contract";
import {
  COUNTRIES,
  COUNTRY_CODES,
  COUNTRY_CURRENCY,
  GLOBAL_CITIES,
  INDIA_CITIES,
  SECONDARY_CITIES,
  STATES,
  type CityRow,
} from "./data/locations";
import { asString, asStringList, bag, cleanLine, keyOf, titleCase } from "./text";

/* ─────────────────────────── Indexes ─────────────────────────── */

export interface CityRecord {
  city: string;
  state: string | null;
  country: string;
}
interface StateRecord {
  state: string;
  country: string;
}

const CITY_INDEX = new Map<string, CityRecord[]>();
const STATE_NAME_INDEX = new Map<string, StateRecord[]>();
const STATE_CODE_INDEX = new Map<string, StateRecord[]>();
const COUNTRY_INDEX = new Map<string, string>();
const COUNTRY_NAMES = new Map<string, string>();

function pushIndex<T>(map: Map<string, T[]>, key: string, value: T): void {
  if (!key) return;
  const list = map.get(key);
  if (list) {
    if (!list.includes(value)) list.push(value);
  } else map.set(key, [value]);
}

function indexCities(rows: readonly CityRow[]): void {
  for (const [city, state, country, aliases] of rows) {
    const rec: CityRecord = { city, state, country };
    pushIndex(CITY_INDEX, keyOf(city), rec);
    if (aliases) for (const a of aliases.split("|")) pushIndex(CITY_INDEX, keyOf(a), rec);
  }
}
indexCities(INDIA_CITIES);
indexCities(GLOBAL_CITIES);
indexCities(SECONDARY_CITIES);

for (const [state, country, aliases] of STATES) {
  const rec: StateRecord = { state, country };
  pushIndex(STATE_NAME_INDEX, keyOf(state), rec);
  for (const a of aliases?.split("|") ?? []) {
    const k = keyOf(a);
    if (/^[a-z]{2,3}$/.test(k)) pushIndex(STATE_CODE_INDEX, k, rec);
    else pushIndex(STATE_NAME_INDEX, k, rec);
  }
}
for (const [code, name, aliases] of COUNTRIES) {
  COUNTRY_NAMES.set(code, name);
  COUNTRY_INDEX.set(keyOf(name), code);
  for (const a of aliases?.split("|") ?? []) COUNTRY_INDEX.set(keyOf(a), code);
}

/** Number of distinct canonical cities in the alias table (exposed for tests/docs). */
export const CITY_COUNTS = {
  india: new Set(INDIA_CITIES.map((r) => r[0])).size,
  global: new Set(GLOBAL_CITIES.map((r) => r[0])).size,
  aliases: CITY_INDEX.size,
};

export function countryName(code: string | null | undefined): string | null {
  return code ? (COUNTRY_NAMES.get(code) ?? null) : null;
}

/** Default ISO-4217 currency for a country (INR when unknown). */
export function currencyForCountry(code: string | null | undefined): string {
  return (code && COUNTRY_CURRENCY[code]) || "INR";
}

const STRIP_AFFIXES =
  /^(?:greater|city of|metro|metropolitan)\s+|\s+(?:area|metro area|metropolitan area|metropolitan region|metro region|region|district|city|urban|rural|east|west|north|south|central|division|cantonment|suburban|ncr)$/;

/** Resolve a city name or alias ("Bangalore", "Gurgaon", "Navi Mumbai") to its canonical record. */
export function lookupCity(name: string): CityRecord | null {
  return cityCandidates(keyOf(name))[0] ?? null;
}

function cityCandidates(key: string): CityRecord[] {
  if (!key) return [];
  const direct = CITY_INDEX.get(key);
  if (direct) return direct;
  const stripped = key.replace(STRIP_AFFIXES, "");
  if (stripped !== key) return CITY_INDEX.get(stripped) ?? [];
  return [];
}

/* ─────────────────────────── Work-mode vocabulary ─────────────────────────── */

const REMOTE_WORDS =
  /\b(?:remote(?:ly)?|wfh|work[\s-]*from[\s-]*home|work[\s-]*from[\s-]*anywhere|wfa|home[\s-]*based|home[\s-]*office|telecommut\w*|anywhere|worldwide|virtual|distributed|fully[\s-]*remote|100%\s*remote|remote[\s-]*first|remote[\s-]*friendly)\b/i;
const HYBRID_WORDS = /\bhybrid\b/i;
const ONSITE_WORDS = /\b(?:on[\s-]?site|in[\s-]?office|work[\s-]*from[\s-]*office|wfo|office[\s-]*based|in[\s-]*person|on[\s-]?premises?)\b/i;
const MODE_WORDS_G =
  /\b(?:fully[\s-]*remote|100%\s*remote|remote[\s-]*first|remote[\s-]*friendly|remote(?:ly)?|wfh|work[\s-]*from[\s-]*home|work[\s-]*from[\s-]*anywhere|wfa|home[\s-]*based|home[\s-]*office|telecommut\w*|anywhere|worldwide|virtual|distributed|hybrid|on[\s-]?site|in[\s-]?office|work[\s-]*from[\s-]*office|wfo|office[\s-]*based|in[\s-]*person|on[\s-]?premises?)\b/gi;
const PAN_INDIA_G = /\b(?:pan[\s-]*india|all[\s-]*(?:over[\s-]*)?india|across[\s-]*india|any(?:where|[\s-]*location)?[\s-]*in[\s-]*india|india[\s-]*wide|nation[\s-]*wide)\b/gi;
const MULTI_G =
  /\b(?:multiple|various|several|many|all|other|\d+)\s+(?:locations?|cities|offices|sites|places)\b|(?:[+&]|\band)\s*\d+\s*more\b|\bmore\s+locations\b/gi;
const REGION_RE =
  /^(?:emea|apac|apj|latam|amer|amers|americas|north america|south america|europe|eu|asia|asia pacific|middle east|mena|africa|nordics|dach|benelux|southeast asia|sea|anz|global|worldwide|international|world|earth)$/;
const FILLER_G =
  /\b(?:job\s+)?locations?\s*:|\b(?:based\s+(?:in|out\s+of)|located\s+in|within|across|preferred|only|or\s+nearby|near(?:by)?|country\s*:|city\s*:)\b|\b(?:candidates?\s+from)\b/gi;

const UNKNOWN_STOP = new Set(
  (
    "office|offices|hq|headquarters|head office|corporate office|corporate|campus|branch|site|field|location|locations|na|n a|tbd|tba|" +
    "any|flexible|other|others|various|multiple|home|global|international|nationwide|all|client location|client site|customer site|travel|" +
    "travelling|traveling|none|not specified|unspecified|to be decided|city|state|country|region|area|zone|sector|district|work|job|jobs|" +
    "full time|part time|internship|contract|permanent|temporary|not disclosed|confidential|negotiable|in|at|the|and|or|of|apply|" +
    "we|us|you|our|company|team|plant|factory|warehouse|store|stores|hub|in office|onsite|on site|remote|hybrid"
  ).split("|"),
);

/* ─────────────────────────── Parsing ─────────────────────────── */

interface Part {
  text: string;
  cities: CityRecord[];
  states: StateRecord[];
  country: string | null;
  region: boolean;
  /** An upper-case code that is both a state and a country code ("IN", "CA", "DE"). */
  ambiguousCode: boolean;
}

function classify(text: string): Part {
  const trimmed = text.trim();
  const part: Part = { text: trimmed, cities: [], states: [], country: null, region: false, ambiguousCode: false };
  if (/^[A-Z]{2,3}$/.test(trimmed)) {
    part.states = STATE_CODE_INDEX.get(trimmed.toLowerCase()) ?? [];
    part.country = COUNTRY_CODES[trimmed] ?? null;
    part.ambiguousCode = part.states.length > 0 && part.country !== null;
    // City abbreviations: "NYC", "SF", "DC", "BLR", "HYD".
    part.cities = CITY_INDEX.get(trimmed.toLowerCase()) ?? [];
    return part;
  }
  const key = keyOf(trimmed);
  if (!key) return part;
  if (REGION_RE.test(key)) {
    part.region = true;
    return part;
  }
  part.cities = cityCandidates(key);
  part.states = STATE_NAME_INDEX.get(key) ?? [];
  part.country = COUNTRY_INDEX.get(key) ?? null;
  return part;
}

const isKnown = (p: Part): boolean => p.cities.length > 0 || p.states.length > 0 || p.country !== null || p.region;

/** Classify one comma-part, splitting "X and Y" / "IN-KA-Bangalore" when the whole is unknown. */
function classifyExpanded(text: string, depth = 0): Part[] {
  const whole = classify(text);
  if (isKnown(whole) || depth > 2) return [whole];
  if (/\s(?:or|and|&)\s/i.test(text)) {
    const subs = text.split(/\s+(?:or|and|&)\s+/i).map((t) => t.trim()).filter(Boolean);
    if (subs.length > 1) return subs.flatMap((t) => classifyExpanded(t, depth + 1));
  }
  if (/[-–—]/.test(text)) {
    const subs = text.split(/\s*[-–—]\s*/).map((t) => t.trim()).filter(Boolean);
    if (subs.length > 1) {
      const parts = subs.map(classify);
      if (parts.some((p) => p.cities.length > 0) || parts.every(isKnown)) return parts;
    }
  }
  return [whole];
}

interface Draft {
  parts: string[];
  city: CityRecord[] | null;
  unknownCity: string | null;
  state: StateRecord[] | null;
  country: string | null;
}

function looksLikePlace(text: string): boolean {
  const t = text.trim();
  if (!/^[A-Za-z\u{00C0}-\u{024F}][A-Za-z\u{00C0}-\u{024F} .'’-]{1,38}$/u.test(t)) return false;
  if (t.split(/\s+/).length > 3) return false;
  if (/^[A-Z]{1,3}$/.test(t)) return false;
  return !UNKNOWN_STOP.has(keyOf(t));
}

function resolveDraft(d: Draft): JobLocation | null {
  const raw = d.parts.join(", ");
  const country = d.country;
  let state: StateRecord | null = null;
  if (d.state && d.state.length > 0) {
    const fitting = country ? d.state.filter((s) => s.country === country) : d.state;
    state = (fitting.length > 0 ? fitting : d.state)[0] ?? null;
  }
  if (d.city && d.city.length > 0) {
    const cands = d.city;
    const byState = d.state ? cands.find((c) => d.state?.some((s) => s.state === c.state && s.country === c.country)) : undefined;
    const byCountry = country ? cands.find((c) => c.country === country) : undefined;
    const pick = byState ?? byCountry ?? (cands[0] as CityRecord);
    const explicitState = d.state?.find((s) => s.country === pick.country)?.state ?? null;
    return { raw, city: pick.city, state: pick.state ?? explicitState, country: pick.country };
  }
  if (d.unknownCity) {
    return { raw, city: titleCase(d.unknownCity), state: state?.state ?? null, country: country ?? state?.country ?? null };
  }
  if (state) return { raw, city: null, state: state.state, country: country && country === state.country ? country : state.country };
  if (country) return { raw, city: null, state: null, country };
  return null;
}

const PIECE_SPLIT = /\s*,\s*|\s+[-–—|]\s+|\s*[()[\]{}]\s*/;
const cleanPiece = (t: string): string =>
  t
    .trim()
    .replace(/^(?:or|and|&)\s+|\s+(?:or|and|&)$/i, "")
    .replace(/^[-–—:.\s]+|[-–—:.\s]+$/g, "");

/** Groups comma-parts of one segment into locations: a city opens a location; states/countries refine it. */
function parseSegment(segment: string): JobLocation[] {
  const parts = segment
    .split(PIECE_SPLIT)
    .map(cleanPiece)
    .filter(Boolean)
    .flatMap((p) => classifyExpanded(p));
  const drafts: Draft[] = [];
  let open: Draft | null = null;
  let pendingState: StateRecord[] | null = null;
  let pendingCountry: string | null = null;
  const unknowns: string[] = [];

  for (const p of parts) {
    if (open && p.cities.length > 0) {
      const o: Draft = open;
      const sameCity = p.cities.some((c) => o.city?.some((x) => x.city === c.city && x.country === c.country));
      const stateFits = p.states.filter((s) => o.city?.some((c) => c.state === s.state && c.country === s.country));
      const countryFits = p.country !== null && (o.city?.some((c) => c.country === p.country) ?? false);
      if (sameCity || (stateFits.length > 0 && !o.state) || (countryFits && !o.country)) {
        if (stateFits.length > 0 && !o.state) o.state = stateFits;
        if (countryFits && !o.country) o.country = p.country;
        o.parts.push(p.text);
        continue;
      }
    } else if (open && (p.states.length > 0 || p.country !== null) && (!open.state || !open.country)) {
      const o: Draft = open;
      const cityCountries = new Set(o.city?.map((c) => c.country) ?? []);
      if (p.states.length > 0 && !o.state) {
        const fitting = p.states.filter((s) => cityCountries.size === 0 || cityCountries.has(s.country));
        if (fitting.length > 0) o.state = fitting;
      }
      if (p.country !== null && !o.country && (!p.ambiguousCode || cityCountries.has(p.country) || cityCountries.size === 0)) {
        o.country = p.country;
      }
      o.parts.push(p.text);
      continue;
    }
    if (p.cities.length > 0) {
      open = { parts: [p.text], city: p.cities, unknownCity: null, state: pendingState, country: pendingCountry };
      pendingState = null;
      pendingCountry = null;
      drafts.push(open);
      continue;
    }
    if (p.states.length > 0 || p.country !== null) {
      if (p.ambiguousCode) {
        // Stand-alone "IN"/"DE" → the country; "CA" → California (far more common than Canada as "CA").
        if (p.text === "CA") pendingState = p.states;
        else pendingCountry = p.country;
      } else {
        if (p.states.length > 0) pendingState = p.states;
        if (p.country !== null) pendingCountry = p.country;
      }
      continue;
    }
    if (!p.region && looksLikePlace(p.text)) unknowns.push(p.text);
  }

  if (drafts.length === 0) {
    const d: Draft = { parts: [segment.trim()], city: null, unknownCity: unknowns[0] ?? null, state: pendingState, country: pendingCountry };
    const loc = resolveDraft(d);
    return loc ? [loc] : [];
  }
  const out: JobLocation[] = [];
  for (const d of drafts) {
    const loc = resolveDraft(d);
    if (loc) out.push(loc);
  }
  return out;
}

export interface ParsedLocation {
  locations: JobLocation[];
  remote: boolean;
  hybrid: boolean;
  onsite: boolean;
  /** "Multiple locations", "Pan India", "+3 more" */
  multiple: boolean;
}

const has = (s: string, re: RegExp): boolean => s.search(re) >= 0;
const POSTAL_G = /\b\d{3}\s?\d{3}\b|\b\d{5}(?:-\d{4})?\b|\b[A-Z]\d[A-Z]\s?\d[A-Z]\d\b/g;
const SEGMENT_SPLIT = /\s*(?:[;|•·\n/\\]|\s\+\s)\s*/;

/** Parse ONE raw location string ("Bangalore/Hyderabad/Pune", "Remote - India", "IN, KA, Bangalore"). */
export function parseLocation(input: unknown): ParsedLocation {
  const raw = cleanLine(input).slice(0, 400);
  const result: ParsedLocation = { locations: [], remote: false, hybrid: false, onsite: false, multiple: false };
  if (!raw || /^(?:n\/?a|none|null|undefined|-+|tbd|tba|not (?:specified|disclosed|available)|location)$/i.test(raw)) return result;
  result.remote = has(raw, REMOTE_WORDS);
  result.hybrid = has(raw, HYBRID_WORDS);
  result.onsite = has(raw, ONSITE_WORDS);
  let s = raw;
  let panIndia = false;
  if (has(s, PAN_INDIA_G)) {
    panIndia = true;
    result.multiple = true;
    s = s.replace(PAN_INDIA_G, " , India , ");
  }
  if (has(s, MULTI_G)) {
    result.multiple = true;
    s = s.replace(MULTI_G, " , ");
  }
  s = s.replace(MODE_WORDS_G, " , ").replace(FILLER_G, " , ").replace(POSTAL_G, " ");
  const segments = s.split(SEGMENT_SPLIT).filter((x) => x.replace(/[\s,.\-–—:()]+/g, "").length > 0);
  const found: JobLocation[] = [];
  for (const seg of segments) found.push(...parseSegment(seg));
  const deduped = dedupeLocations(found);
  if (deduped.length === 1) (deduped[0] as JobLocation).raw = raw;
  if (deduped.length === 0 && (result.remote || result.multiple || result.hybrid || result.onsite || /\b(?:global|worldwide|emea|apac|latam|americas|europe)\b/i.test(raw))) {
    deduped.push({ raw, city: null, state: null, country: panIndia ? "IN" : null });
  }
  result.locations = deduped;
  return result;
}

function locKey(l: JobLocation): string {
  return `${l.city ?? ""}|${l.state ?? ""}|${l.country ?? ""}`;
}

/** Drops exact duplicates and country/state-only entries already covered by a more specific location. */
export function dedupeLocations(list: readonly JobLocation[]): JobLocation[] {
  const seen = new Map<string, JobLocation>();
  for (const l of list) {
    const k = locKey(l);
    if (!seen.has(k)) seen.set(k, { ...l });
  }
  const all = [...seen.values()];
  return all.filter((l) => {
    if (l.city) return true;
    if (l.state) return !all.some((o) => o !== l && o.city && o.state === l.state && o.country === l.country);
    if (l.country) return !all.some((o) => o !== l && (o.city || o.state) && o.country === l.country);
    return all.length === 1 || !all.some((o) => o !== l && (o.city || o.country));
  });
}

export interface NormalizedLocations {
  locations: JobLocation[];
  /** Work mode stated by the location strings themselves; null when they say nothing. */
  workMode: WorkMode | null;
  isRemote: boolean;
  multiple: boolean;
}

const MAX_LOCATIONS = 25;

/** Normalize RawJob.locations (string[]; a single string is accepted too). */
export function normalizeLocations(input: unknown): NormalizedLocations {
  const strings = typeof input === "string" ? [input] : asStringList(input);
  const all: JobLocation[] = [];
  let anyRemote = false;
  let anyHybrid = false;
  let anyOnsite = false;
  let multiple = false;
  for (const s of strings.slice(0, 60)) {
    const p = parseLocation(s);
    all.push(...p.locations);
    multiple ||= p.multiple;
    const mode = p.hybrid ? "hybrid" : p.remote ? "remote" : p.onsite ? "onsite" : null;
    if (mode === "remote") anyRemote = true;
    else if (mode === "hybrid") anyHybrid = true;
    else if (mode === "onsite") anyOnsite = true;
  }
  const workMode: WorkMode | null = anyRemote ? "remote" : anyHybrid ? "hybrid" : anyOnsite ? "onsite" : null;
  return { locations: dedupeLocations(all).slice(0, MAX_LOCATIONS), workMode, isRemote: workMode === "remote", multiple };
}

/** Is this text only place names / work-mode words? cleanTitle uses it to drop "- Bangalore" suffixes. */
export function isLocationOnly(text: string): boolean {
  const t = cleanLine(text);
  if (!t || t.length > 80 || /\d/.test(t)) return false;
  const hasMode = has(t, REMOTE_WORDS) || has(t, HYBRID_WORDS) || has(t, ONSITE_WORDS);
  const rest = t.replace(MODE_WORDS_G, " , ").replace(PAN_INDIA_G, " , India , ");
  const pieces = rest
    .split(/\s*[,;|/\\()[\]]\s*|\s+[-–—]\s+|\s+(?:or|and|&)\s+/i)
    .map(cleanPiece)
    .filter(Boolean);
  if (pieces.length === 0) return hasMode;
  return pieces.every((p) => isKnown(classify(p)));
}

/* ─────────────────────────── Work mode from all signals ─────────────────────────── */

const TITLE_REMOTE =
  /(?:^|[\s(\[|,–—-])(?:remote|wfh|work\s*from\s*home|work\s*from\s*anywhere|home[\s-]based)(?=$|[\s)\]|,–—-])(?!\s+(?:sensing|monitoring|support|desktop|access|patient|pilot|infrastructure|operations|server|device|services?)\b)/i;
const TITLE_HYBRID = /\bhybrid\b(?!\s+(?:cloud|app|apps|mobile|vehicle|ev|systems?|integration|car))/i;
const TITLE_ONSITE = /\b(?:on[\s-]?site|work\s*from\s*office|wfo|in[\s-]office)\b(?!\s+(?:support|engineer|technician|coordinator|services?))/i;

const DESC_NOT_REMOTE = /\b(?:not\s+(?:a\s+)?remote|no\s+remote|non[\s-]remote|remote\s+work\s+is\s+not|not\s+eligible\s+for\s+remote)\b/i;
const DESC_REMOTE =
  /\b(?:this\s+is\s+an?\s+(?:fully\s+|100%\s+)?remote|(?:role|position|job|opportunity)\s+is\s+(?:fully\s+|100%\s+)?remote|(?:fully|100%|completely|permanently)\s+remote|remote[\s-](?:first|only)\b|(?:work|job|location|work\s+mode|work\s+type|workplace(?:\s+type)?|mode\s+of\s+work)\s*:\s*remote|work[\s-]+from[\s-]+home\s+(?:job|role|position|opportunity|internship)|(?:this|the)\s+(?:is\s+a\s+)?work[\s-]+from[\s-]+home|\bwfh\s+(?:job|role|internship|opportunity)|remote\s+(?:role|position|job|opportunity|internship))\b/i;
const DESC_HYBRID =
  /\b(?:this\s+is\s+a\s+hybrid|(?:role|position|job)\s+is\s+hybrid|hybrid[\s-](?:role|position|model|work(?:ing)?|mode|setup|arrangement|schedule|policy|opportunity)|(?:work|location|work\s+mode|work\s+type|workplace(?:\s+type)?|mode\s+of\s+work)\s*:\s*hybrid|(?:[1-4]|one|two|three|four)\s+days?\s+(?:a|per|each)\s+week\s+(?:in|from|at)\s+(?:the|our)?\s*office)\b/i;
const DESC_ONSITE =
  /\b(?:this\s+is\s+an?\s+(?:on[\s-]?site|in[\s-]office|office[\s-]based)|(?:role|position|job)\s+is\s+(?:on[\s-]?site|office[\s-]based|in[\s-]office)|(?:work|location|work\s+mode|work\s+type|workplace(?:\s+type)?|mode\s+of\s+work)\s*:\s*(?:on[\s-]?site|office|work\s+from\s+office|wfo)|work[\s-]+from[\s-]+office|\bwfo\b|5\s+days\s+(?:a|per)\s+week\s+(?:in|from|at)\s+(?:the\s+)?office)\b/i;

export interface WorkModeInput {
  hint?: unknown;
  /** Precomputed normalizeLocations(...).workMode — avoids re-parsing the location strings. */
  locationWorkMode?: WorkMode | null;
  isRemoteHint?: unknown;
  locations?: unknown;
  title?: string | null;
  employmentTypeRaw?: string | null;
  /** RawJob.tags — "remote" / "wfh" / "hybrid" from the scraper. */
  tags?: unknown;
  description?: string | null;
}

export interface WorkModeResult {
  workMode: WorkMode | null;
  isRemote: boolean;
  source: "hint" | "location" | "title" | "employment_type" | "tags" | "description" | "none";
}

/** Text-only work mode detection (title-style rules). */
export function workModeFromText(input: string): WorkMode | null {
  if (!input) return null;
  const text = input.length > 2000 ? input.slice(0, 2000) : input;
  if (TITLE_HYBRID.test(text)) return "hybrid";
  if (TITLE_REMOTE.test(text)) return "remote";
  if (TITLE_ONSITE.test(text)) return "onsite";
  return null;
}

const MODE_ANCHOR = /remote|hybrid|office|on.?site|wfh|wfo|home|days?\s+(?:a|per|each)\s+week/gi;

/** Every description phrase contains an anchor word, so the phrase regexes only run on ±90-char windows around them. */
function modeWindows(text: string): string {
  const spans: [number, number][] = [];
  MODE_ANCHOR.lastIndex = 0;
  for (let m = MODE_ANCHOR.exec(text); m !== null && spans.length < 40; m = MODE_ANCHOR.exec(text)) {
    const a = Math.max(0, m.index - 90);
    const b = Math.min(text.length, m.index + m[0].length + 90);
    const last = spans[spans.length - 1];
    if (last && a <= last[1]) last[1] = b;
    else spans.push([a, b]);
  }
  return spans.map(([a, b]) => text.slice(a, b)).join("\n");
}

function workModeFromDescription(text: string): WorkMode | null {
  if (!text) return null;
  const sample = modeWindows(text.length > 30_000 ? text.slice(0, 30_000) : text);
  if (!sample) return null;
  if (DESC_HYBRID.test(sample)) return "hybrid";
  if (DESC_NOT_REMOTE.test(sample)) return "onsite";
  if (DESC_REMOTE.test(sample)) return "remote";
  if (DESC_ONSITE.test(sample)) return "onsite";
  return null;
}

/** Precedence: structured hint > location strings > title > employment type > description. */
export function detectWorkMode(workModeInput: WorkModeInput): WorkModeResult {
  const input = bag(workModeInput);
  const hint = asString(input.hint);
  if ((WORK_MODES as readonly string[]).includes(hint)) {
    const workMode = hint as WorkMode;
    return { workMode, isRemote: workMode === "remote", source: "hint" };
  }
  if (input.isRemoteHint === true) return { workMode: "remote", isRemote: true, source: "hint" };
  const fromLoc = input.locationWorkMode !== undefined ? input.locationWorkMode : normalizeLocations(input.locations ?? []).workMode;
  if (fromLoc) return { workMode: fromLoc, isRemote: fromLoc === "remote", source: "location" };
  const fromTitle = workModeFromText(asString(input.title));
  if (fromTitle) return { workMode: fromTitle, isRemote: fromTitle === "remote", source: "title" };
  const fromType = workModeFromText(asString(input.employmentTypeRaw));
  if (fromType) return { workMode: fromType, isRemote: fromType === "remote", source: "employment_type" };
  const tagSet = new Set(asStringList(input.tags).map((t) => t.toLowerCase().replace(/[\s_]+/g, "-")));
  const fromTags: WorkMode | null =
    tagSet.has("hybrid") ? "hybrid" : tagSet.has("remote") || tagSet.has("wfh") || tagSet.has("work-from-home") ? "remote" : tagSet.has("onsite") || tagSet.has("on-site") ? "onsite" : null;
  if (fromTags) return { workMode: fromTags, isRemote: fromTags === "remote", source: "tags" };
  const fromDesc = workModeFromDescription(asString(input.description));
  if (fromDesc) return { workMode: fromDesc, isRemote: fromDesc === "remote", source: "description" };
  return { workMode: null, isRemote: false, source: "none" };
}
