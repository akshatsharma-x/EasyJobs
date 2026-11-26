/**
 * Deterministic mock dataset for the EasyJobs web app (mock mode).
 *
 * - ~400 open + 8 closed jobs generated from a fixed seed. Times are RELATIVE: each base job stores a
 *   fixed `postedOffsetMs` and `postedAt = now − offset` is materialised at query time, so the dataset always
 *   looks fresh and every count is deterministic for a given `now`.
 * - Live (stream) jobs carry their generator inputs in the id ("lv-<ts36>-<seed36>-<choices>"), so any process
 *   (e.g. the Next.js server rendering /jobs/[id]) regenerates the IDENTICAL job from the id alone.
 */
import {
  EXPERIENCE_LEVELS,
  JOB_CATEGORIES,
  JOB_TYPES,
  KNOWN_TAGS,
  LABELS,
  SOURCE_KIND_PRIORITY,
  WORK_MODES,
  isOfficialKind,
  slugify,
  type ExperienceLevel,
  type JobCategory,
  type JobDetail,
  type JobListItem,
  type JobSourceRef,
  type JobType,
  type Salary,
  type SearchQuery,
  type WorkMode,
} from "@easyjobs/contract";
import {
  ALL_SKILLS,
  CATEGORY_TITLES,
  CATEGORY_WEIGHTS,
  CITY_CATALOG,
  COUNTRY_CURRENCY,
  CURRENCY_BAND_FACTOR,
  DEGREES,
  DEPARTMENTS,
  FX_TO_INR,
  GLOBAL_OFFICE_SHARE,
  LEVEL_AFFINITY,
  LEVEL_WEIGHTS,
  MOCK_COMPANIES,
  MOCK_SOURCES,
  PERKS,
  REMOTE_SHARE,
  SKILL_STACKS,
  STACK_HINTS,
  TEAMS,
  TEAM_CATEGORIES,
  boardUrl,
  copyFor,
  type CityDef,
  type CompanyProfile,
  type MockCompanyDef,
  type MockSourceDef,
} from "./mock/catalog";
import {
  chance,
  mulberry32,
  pick,
  randFloat,
  randInt,
  roundTo,
  sampleDistinct,
  weightedIndex,
  weightedPick,
  type Rng,
} from "./mock/prng";

export { ALL_SKILLS, CITY_CATALOG, MOCK_COMPANIES, MOCK_SOURCES } from "./mock/catalog";
export type { CityDef, CompanyProfile, MockCompanyDef, MockSourceDef } from "./mock/catalog";
export { mulberry32, type Rng } from "./mock/prng";

/* ─────────────────────────── Constants & lookups ─────────────────────────── */

export const MOCK_SEED = 20261126;
export const BASE_JOB_COUNT = 400;
export const CLOSED_JOB_COUNT = 8;

const MINUTE = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;

/** Tags a live job can be forced to carry (index-encoded in live ids). */
export const TAG_POOL: readonly string[] = KNOWN_TAGS;

const COMPANY_INDEX = new Map<string, number>(MOCK_COMPANIES.map((c, i) => [c.slug, i]));
const CITY_INDEX = new Map<string, number>(CITY_CATALOG.map((c, i) => [c.name.toLowerCase(), i]));
const SKILL_INDEX = new Map<string, number>(ALL_SKILLS.map((s, i) => [s.toLowerCase(), i]));
const SOURCE_INDEX = new Map<string, number>(MOCK_SOURCES.map((s, i) => [s.id, i]));
const SOURCE_BY_ID = new Map<string, MockSourceDef>(MOCK_SOURCES.map((s) => [s.id, s]));
const COMPANY_BY_SLUG = new Map<string, MockCompanyDef>(MOCK_COMPANIES.map((c) => [c.slug, c]));
const CITY_BY_NAME = new Map<string, CityDef>(CITY_CATALOG.map((c) => [c.name, c]));
const INDIAN_CITIES: readonly CityDef[] = CITY_CATALOG.filter((c) => c.country === "IN");

export function companyBySlug(slug: string): MockCompanyDef | undefined {
  return COMPANY_BY_SLUG.get(slug.toLowerCase());
}

export function sourceById(id: string): MockSourceDef | undefined {
  return SOURCE_BY_ID.get(id);
}

export function isOfficialSourceId(id: string): boolean {
  const def = SOURCE_BY_ID.get(id);
  return def !== undefined && isOfficialKind(def.kind);
}

/** Candidate years of experience → most fitting level (used to bias live jobs). */
export function levelForExp(years: number): ExperienceLevel {
  if (years < 1) return "fresher";
  if (years < 2) return "entry";
  if (years < 5) return "mid";
  if (years < 8) return "senior";
  return "lead";
}

/* ─────────────────────────── Types ─────────────────────────── */

export interface MockLocation {
  /** "Bengaluru, IN" · "Remote (India)" */
  display: string;
  city: string | null;
  state: string | null;
  country: string | null;
}

/** Everything needed to materialise a JobListItem / JobDetail for any `now`. */
export interface MockJobSpec {
  id: string;
  seed: number;
  status: "open" | "closed";
  companyIndex: number;
  title: string;
  slug: string;
  level: ExperienceLevel;
  jobType: JobType;
  workMode: WorkMode;
  isRemote: boolean;
  category: JobCategory;
  locations: MockLocation[];
  experienceMin: number | null;
  experienceMax: number | null;
  batches: number[];
  salary: Salary | null;
  salaryInrYearlyMin: number | null;
  salaryInrYearlyMax: number | null;
  skills: string[];
  tags: string[];
  sources: JobSourceRef[];
  applyUrl: string;
  isOfficial: boolean;
  degrees: string[];
  department: string | null;
  summary: string;
  qualityScore: number;
  /** Base jobs: postedAt = now − postedOffsetMs. */
  postedOffsetMs: number | null;
  /** Live jobs: absolute postedAt (epoch ms). */
  postedAtMs: number | null;
  /** validThrough = postedAt + validForMs; null = no deadline. */
  validForMs: number | null;
  /** firstSeenAt = postedAt + firstSeenDelayMs (capped at now). */
  firstSeenDelayMs: number;
  /** Open jobs: lastSeenAt = now − lastSeenAgoMs. */
  lastSeenAgoMs: number;
  team: string | null;
  internDuration: string | null;
}

/**
 * Generator inputs a live job can be forced to (catalog indices). Encoded into live ids, so every
 * value must be a non-negative integer. `exp` is tenths of a year; `salaryFloorLpa` is INR lakh/yr.
 */
export interface JobChoices {
  company?: number;
  level?: number;
  category?: number;
  type?: number;
  mode?: number;
  city?: number;
  skill?: number;
  batch?: number;
  source?: number;
  tag?: number;
  official?: number;
  salaryFloorLpa?: number;
  exp?: number;
}

export interface SpecTiming {
  id: string;
  status?: "open" | "closed";
  /** Base jobs */
  postedOffsetMs?: number;
  /** Live jobs */
  postedAtMs?: number;
}

/* ─────────────────────────── Ids ─────────────────────────── */

const CHOICE_CODES: readonly (readonly [keyof JobChoices, string])[] = [
  ["company", "c"], ["level", "l"], ["category", "k"], ["type", "y"], ["mode", "m"], ["city", "x"], ["skill", "s"],
  ["batch", "b"], ["source", "r"], ["tag", "t"], ["official", "o"], ["salaryFloorLpa", "p"], ["exp", "e"],
];
const CODE_TO_KEY = new Map<string, keyof JobChoices>(CHOICE_CODES.map(([key, code]) => [code, key]));

/** Stable, short, URL-safe ids for base jobs: "ej" + 4 base36 chars (bijective for i < 36⁴). */
export function baseJobId(index: number): string {
  return `ej${((index * 7919 + 104729) % 1_679_616).toString(36).padStart(4, "0")}`;
}

export function encodeLiveId(postedAtMs: number, seed: number, choices: JobChoices): string {
  const parts: string[] = [];
  for (const [key, code] of CHOICE_CODES) {
    const v = choices[key];
    if (v !== undefined && Number.isInteger(v) && v >= 0) parts.push(`${code}${v.toString(36)}`);
  }
  const head = `lv-${Math.floor(postedAtMs).toString(36)}-${(seed >>> 0).toString(36)}`;
  return parts.length > 0 ? `${head}-${parts.join("_")}` : head;
}

export function isLiveId(id: string): boolean {
  return id.startsWith("lv-");
}

/** Inverse of encodeLiveId; null for anything malformed. */
export function decodeLiveId(id: string): { postedAtMs: number; seed: number; choices: JobChoices } | null {
  const m = /^lv-([0-9a-z]{1,12})-([0-9a-z]{1,7})(?:-([0-9a-z_]{1,120}))?$/.exec(id);
  if (!m) return null;
  const postedAtMs = parseInt(m[1] as string, 36);
  const seed = parseInt(m[2] as string, 36);
  if (!Number.isSafeInteger(postedAtMs) || !Number.isSafeInteger(seed) || seed > 0xffffffff) return null;
  const choices: JobChoices = {};
  if (m[3]) {
    for (const part of m[3].split("_")) {
      const key = CODE_TO_KEY.get(part.charAt(0));
      const value = parseInt(part.slice(1), 36);
      if (!key || !Number.isSafeInteger(value) || value < 0 || choices[key] !== undefined) return null;
      choices[key] = value;
    }
  }
  return { postedAtMs, seed, choices };
}

/* ─────────────────────────── Salary ─────────────────────────── */

type NonIntern = Exclude<ExperienceLevel, "intern">;

/** Range for the MINIMUM of an INR yearly salary, in lakh (LPA). */
const INR_BANDS_LPA: Record<CompanyProfile, Record<NonIntern, [number, number]>> = {
  bigtech: { fresher: [18, 45], entry: [20, 45], mid: [35, 70], senior: [55, 110], lead: [90, 180], executive: [150, 300] },
  product: { fresher: [12, 30], entry: [12, 28], mid: [25, 50], senior: [40, 80], lead: [60, 120], executive: [100, 200] },
  startup: { fresher: [10, 25], entry: [10, 24], mid: [20, 45], senior: [35, 70], lead: [55, 110], executive: [90, 180] },
  fintech: { fresher: [10, 28], entry: [12, 26], mid: [22, 45], senior: [35, 75], lead: [55, 110], executive: [90, 180] },
  services: { fresher: [3.5, 7], entry: [4, 9], mid: [8, 18], senior: [15, 30], lead: [25, 45], executive: [45, 80] },
  consulting: { fresher: [6, 12], entry: [7, 14], mid: [12, 25], senior: [20, 40], lead: [35, 60], executive: [60, 120] },
  bank: { fresher: [12, 25], entry: [14, 28], mid: [25, 45], senior: [40, 75], lead: [60, 120], executive: [100, 220] },
  semis: { fresher: [14, 30], entry: [15, 30], mid: [25, 50], senior: [40, 80], lead: [60, 120], executive: [100, 200] },
  global: { fresher: [12, 30], entry: [18, 35], mid: [30, 60], senior: [50, 90], lead: [80, 150], executive: [120, 250] },
};

/** Monthly INR internship stipend range, in thousands. */
const STIPEND_K: Record<CompanyProfile, [number, number]> = {
  bigtech: [80, 150], product: [40, 100], startup: [15, 60], fintech: [25, 80], services: [10, 25],
  consulting: [20, 50], bank: [70, 150], semis: [45, 100], global: [60, 120],
};

/** USD yearly base ranges (thousands) for global offices; scaled per currency by CURRENCY_BAND_FACTOR. */
const USD_BANDS_K: Record<NonIntern, [number, number]> = {
  fresher: [70, 110], entry: [85, 130], mid: [120, 170], senior: [160, 230], lead: [210, 300], executive: [260, 400],
};

const CURRENCY_SYMBOL: Record<string, string> = { INR: "₹", USD: "$", EUR: "€", GBP: "£", SGD: "S$", CAD: "C$" };
const inrGrouping = new Intl.NumberFormat("en-IN");
const intlGrouping = new Intl.NumberFormat("en-US");

function roundLpa(v: number): number {
  if (v < 10) return roundTo(v, 0.5);
  if (v < 50) return Math.round(v);
  return roundTo(v, 5);
}

const trimNum = (n: number): string => String(Number(n.toFixed(1)));

/** INR/yr equivalent of a salary using the static FX table (month × 12, hour × 2080). */
export function salaryToInrYearly(salary: Salary | null): { min: number | null; max: number | null } {
  if (!salary) return { min: null, max: null };
  const factor = salary.period === "year" ? 1 : salary.period === "month" ? 12 : 2080;
  const fx = FX_TO_INR[salary.currency] ?? 1;
  const conv = (v: number | null): number | null => (v === null ? null : Math.round(v * factor * fx));
  return { min: conv(salary.min), max: conv(salary.max) };
}

function inrYearlySalary(rng: Rng, band: [number, number]): Salary {
  const base = roundLpa(randFloat(rng, band[0], band[1]));
  const shape = rng();
  let min: number | null = base;
  let max: number | null;
  if (shape < 0.15) max = base;
  else if (shape < 0.2) {
    min = null;
    max = roundLpa(base * 1.3);
  } else if (shape < 0.25) max = null;
  else max = Math.max(base + 0.5, roundLpa(base * randFloat(rng, 1.2, 1.6)));
  const lakh = (v: number): number => Math.round(v * 100_000);
  let raw: string;
  if (chance(rng, 0.5)) {
    if (min !== null && max !== null) raw = min === max ? `₹${trimNum(min)} LPA` : `₹${trimNum(min)}–${trimNum(max)} LPA`;
    else if (min === null && max !== null) raw = `Up to ₹${trimNum(max)} LPA`;
    else raw = `₹${trimNum(min ?? 0)} LPA+`;
  } else {
    const fmt = (v: number): string => `₹${inrGrouping.format(lakh(v))}`;
    if (min !== null && max !== null) raw = min === max ? `${fmt(min)} per annum` : `${fmt(min)} – ${fmt(max)} per annum`;
    else if (min === null && max !== null) raw = `Up to ${fmt(max)} per annum`;
    else raw = `${fmt(min ?? 0)}+ per annum`;
  }
  return { min: min === null ? null : lakh(min), max: max === null ? null : lakh(max), currency: "INR", period: "year", raw };
}

function inrStipend(rng: Rng, band: [number, number]): Salary {
  const k = randInt(rng, band[0], band[1]);
  const min = (k >= 20 ? roundTo(k, 5) : k) * 1000;
  const max = chance(rng, 0.6) ? min : min + roundTo(randInt(rng, 5, 20), 5) * 1000;
  const raw = min === max ? `₹${inrGrouping.format(min)} /month` : `₹${inrGrouping.format(min)} – ${inrGrouping.format(max)} /month`;
  return { min, max, currency: "INR", period: "month", raw };
}

function inrHourly(rng: Rng): Salary {
  const min = roundTo(randInt(rng, 400, 1500), 50);
  const max = chance(rng, 0.5) ? min : min + roundTo(randInt(rng, 200, 600), 50);
  return { min, max, currency: "INR", period: "hour", raw: min === max ? `₹${min} /hour` : `₹${min} – ₹${max} /hour` };
}

function foreignSalary(rng: Rng, level: ExperienceLevel, currency: string): Salary {
  const sym = CURRENCY_SYMBOL[currency] ?? `${currency} `;
  const factor = CURRENCY_BAND_FACTOR[currency] ?? 1;
  if (level === "intern") {
    const min = roundTo(randFloat(rng, 6, 10) * factor, 0.5) * 1000;
    return { min, max: min, currency, period: "month", raw: `${sym}${intlGrouping.format(min)} /month` };
  }
  const [lo, hi] = USD_BANDS_K[level];
  const min = roundTo(randFloat(rng, lo, hi) * factor, 5) * 1000;
  const max = min + roundTo(randFloat(rng, 15, 45) * factor, 5) * 1000;
  return { min, max, currency, period: "year", raw: `${sym}${intlGrouping.format(min)} – ${sym}${intlGrouping.format(max)} a year` };
}

function makeSalary(rng: Rng, level: ExperienceLevel, profile: CompanyProfile, currency: string, jobType: JobType): Salary {
  if (currency !== "INR") return foreignSalary(rng, level, currency);
  if (level === "intern") return inrStipend(rng, STIPEND_K[profile]);
  if ((jobType === "contract" || jobType === "part_time" || jobType === "freelance") && chance(rng, 0.4)) return inrHourly(rng);
  return inrYearlySalary(rng, INR_BANDS_LPA[profile][level]);
}

/** Make sure the (max ?? min) INR/yr is ≥ floorLpa lakh — used to bias live jobs towards a salary filter. */
function ensureSalaryFloor(salary: Salary | null, floorLpa: number, level: ExperienceLevel): Salary {
  const floor = floorLpa * 100_000;
  const inr = salaryToInrYearly(salary);
  const best = inr.max ?? inr.min;
  if (salary && best !== null && best >= floor) return salary;
  if (level === "intern") {
    const min = Math.ceil(floor / 12 / 1000) * 1000;
    const max = min + 10_000;
    return { min, max, currency: "INR", period: "month", raw: `₹${inrGrouping.format(min)} – ${inrGrouping.format(max)} /month` };
  }
  const maxLpa = Math.ceil(floorLpa * 1.3);
  return { min: floor, max: maxLpa * 100_000, currency: "INR", period: "year", raw: `₹${floorLpa}–${maxLpa} LPA` };
}

/* ─────────────────────────── Small helpers ─────────────────────────── */

function validIndex(value: number | undefined, list: readonly unknown[]): value is number {
  return value !== undefined && Number.isInteger(value) && value >= 0 && value < list.length;
}

function article(title: string): "a" | "an" {
  const acronym = /^([A-Z]{2,})\b/.exec(title);
  if (acronym) return "AEFHILMNORSX".includes((acronym[1] as string).charAt(0)) ? "an" : "a";
  return /^[aeio]/i.test(title) ? "an" : "a";
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,.;:–-]+$/, "")}…`;
}

function batchList(batches: number[]): string {
  return batches.join("/");
}

function toLocation(city: CityDef): MockLocation {
  return { display: `${city.name}, ${city.country}`, city: city.name, state: city.state, country: city.country };
}

function cityDef(name: string): CityDef {
  return CITY_BY_NAME.get(name) ?? (INDIAN_CITIES[0] as CityDef);
}

function experienceFor(level: ExperienceLevel, rng: Rng): [number | null, number | null] {
  switch (level) {
    case "intern":
      return chance(rng, 0.8) ? [0, 0] : [null, null];
    case "fresher":
      return chance(rng, 0.6) ? [0, 0] : [0, 1];
    case "entry":
      return chance(rng, 0.85) ? [0, 2] : chance(rng, 0.6) ? [1, 3] : [null, null];
    case "mid":
      return pick(rng, [[2, 5], [3, 6], [2, 4], [3, 5]] as const).slice() as [number, number];
    case "senior":
      return pick(rng, [[5, 8], [5, 10], [6, 9]] as const).slice() as [number, number];
    case "lead":
      return pick(rng, [[8, null], [8, 12], [10, 15]] as const).slice() as [number, number | null];
    case "executive":
      return pick(rng, [[12, null], [15, null]] as const).slice() as [number, null];
  }
}

function batchesFor(level: ExperienceLevel, rng: Rng): number[] {
  if (level === "intern") return [...pick(rng, [[2027], [2027, 2028], [2026, 2027], [2027], [2028]] as const)];
  if (level === "fresher") return [...pick(rng, [[2026], [2025, 2026], [2026, 2027], [2024, 2025, 2026], [2025], [2026]] as const)];
  if (level === "entry" && chance(rng, 0.2)) return [...pick(rng, [[2024, 2025], [2025], [2023, 2024, 2025]] as const)];
  return [];
}

function fallbackTitle(category: JobCategory, level: ExperienceLevel): string {
  const base = category === "other" ? "Generalist" : LABELS.category[category];
  switch (level) {
    case "intern":
      return `${base} Intern`;
    case "fresher":
      return `${base} Associate – Fresher`;
    case "entry":
      return `${base} Associate`;
    case "mid":
      return `${base} Specialist`;
    case "senior":
      return `Senior ${base} Specialist`;
    case "lead":
      return `${base} Lead`;
    case "executive":
      return `Head of ${base}`;
  }
}

function postedOffset(rng: Rng): number {
  const r = rng();
  let ms: number;
  if (r < 0.15) ms = randFloat(rng, 2 * MINUTE, 3 * HOUR);
  else if (r < 0.3) ms = randFloat(rng, 3 * HOUR, 24 * HOUR);
  else if (r < 0.55) ms = randFloat(rng, DAY, 3 * DAY);
  else if (r < 0.8) ms = randFloat(rng, 3 * DAY, 10 * DAY);
  else ms = randFloat(rng, 10 * DAY, 30 * DAY);
  return Math.round(ms / 1000) * 1000;
}

const BOARD_WEIGHTS: Record<"intern" | "fresher" | "experienced", readonly (readonly [string, number])[]> = {
  intern: [["internshala", 5], ["unstop", 3], ["linkedin", 2], ["coursejoiner", 1]],
  fresher: [["coursejoiner", 5], ["naukri", 3], ["linkedin", 3], ["unstop", 2], ["internshala", 1]],
  experienced: [["linkedin", 6], ["naukri", 5], ["coursejoiner", 0.6]],
};

function pickBoards(rng: Rng, level: ExperienceLevel, count: number): string[] {
  const pool = [...BOARD_WEIGHTS[level === "intern" ? "intern" : level === "fresher" ? "fresher" : "experienced"]];
  const out: string[] = [];
  while (out.length < count && pool.length > 0) {
    const i = weightedIndex(rng, pool.map(([, w]) => w));
    out.push((pool[i] as readonly [string, number])[0]);
    pool.splice(i, 1);
  }
  return out;
}

/* ─────────────────────────── Generator ─────────────────────────── */

/** Pure function of (seed, choices, timing) — identical output in every process. */
export function generateJobSpec(seed: number, choices: JobChoices, timing: SpecTiming): MockJobSpec {
  const rng = mulberry32(seed);
  const forcedType = validIndex(choices.type, JOB_TYPES) ? JOB_TYPES[choices.type] : undefined;
  const forcedMode = validIndex(choices.mode, WORK_MODES) ? WORK_MODES[choices.mode] : undefined;
  const forcedCategory = validIndex(choices.category, JOB_CATEGORIES) ? JOB_CATEGORIES[choices.category] : undefined;
  const forcedCity = validIndex(choices.city, CITY_CATALOG) ? CITY_CATALOG[choices.city] : undefined;
  const forcedTag = validIndex(choices.tag, TAG_POOL) ? TAG_POOL[choices.tag] : undefined;
  const forcedSource = validIndex(choices.source, MOCK_SOURCES) ? MOCK_SOURCES[choices.source] : undefined;
  const forcedSkill = validIndex(choices.skill, ALL_SKILLS) ? ALL_SKILLS[choices.skill] : undefined;
  const forcedBatch = choices.batch !== undefined && choices.batch >= 10 && choices.batch <= 60 ? 2000 + choices.batch : undefined;
  const forcedExp = choices.exp !== undefined && choices.exp <= 500 ? choices.exp / 10 : undefined;

  // 1 · level
  let level: ExperienceLevel;
  if (validIndex(choices.level, EXPERIENCE_LEVELS)) level = EXPERIENCE_LEVELS[choices.level] as ExperienceLevel;
  else if (forcedType === "internship") level = "intern";
  else if (forcedExp !== undefined) level = levelForExp(forcedExp);
  else if (forcedBatch !== undefined) level = chance(rng, 0.5) ? "intern" : "fresher";
  else level = weightedPick(rng, EXPERIENCE_LEVELS, (l) => LEVEL_WEIGHTS[l]);

  // 2 · company
  const companyIndex = validIndex(choices.company, MOCK_COMPANIES)
    ? choices.company
    : weightedIndex(rng, MOCK_COMPANIES.map((c) => c.weight * LEVEL_AFFINITY[c.profile][level]));
  const company = MOCK_COMPANIES[companyIndex] as MockCompanyDef;
  const profile = company.profile;

  // 3 · category
  let category: JobCategory;
  if (forcedCategory) category = forcedCategory;
  else {
    const weights = CATEGORY_WEIGHTS[profile];
    const options = (Object.keys(weights) as JobCategory[]).filter((c) => CATEGORY_TITLES[c] !== undefined);
    category = weightedPick(rng, options, (c) => weights[c] ?? 0);
  }

  // 4 · batches (titles may embed the batch year)
  const batches = batchesFor(level, rng);
  if (forcedBatch !== undefined && !batches.includes(forcedBatch)) batches.push(forcedBatch);
  batches.sort((a, b) => a - b);

  // 5 · title (+ team suffix)
  const titles = CATEGORY_TITLES[category];
  let pool: readonly string[] = titles ? titles[level] : [fallbackTitle(category, level)];
  if (category === "software_engineering") {
    if (level === "fresher" && company.fresherTitles && chance(rng, 0.75)) pool = company.fresherTitles;
    if (level === "intern" && company.internTitles && chance(rng, 0.7)) pool = company.internTitles;
  }
  let title = pick(rng, pool).replace("{batch}", String(batches.length > 0 ? Math.max(...batches) : 2026));
  let team: string | null = null;
  if (
    (level === "mid" || level === "senior" || level === "lead") &&
    TEAM_CATEGORIES.has(category) &&
    !/[–(]/.test(title) &&
    chance(rng, 0.35)
  ) {
    team = pick(rng, TEAMS);
    title = `${title} – ${team}`;
  }

  // 6 · job type
  let jobType: JobType;
  if (forcedType) jobType = forcedType;
  else if (level === "intern") jobType = "internship";
  else if (level === "fresher" && profile === "services" && chance(rng, 0.05)) jobType = "apprenticeship";
  else {
    const r = rng();
    jobType = r < 0.92 ? "full_time" : r < 0.96 ? "contract" : r < 0.98 ? "part_time" : r < 0.99 ? "temporary" : "freelance";
  }

  // 7 · work mode
  let workMode: WorkMode;
  const remoteShare = company.remoteShare ?? REMOTE_SHARE[profile] + (level === "intern" ? 0.12 : 0);
  if (forcedMode) workMode = forcedMode;
  else if (forcedTag === "wfh") workMode = "remote";
  else if (forcedCity) workMode = chance(rng, 0.62) ? "onsite" : "hybrid";
  else if (company.cities.length === 0) workMode = "remote";
  else workMode = chance(rng, remoteShare) ? "remote" : chance(rng, 0.62) ? "onsite" : "hybrid";
  const isRemote = workMode === "remote";

  // 8 · locations
  let locations: MockLocation[];
  if (isRemote) {
    const worldwide = profile === "global" && level !== "intern" && chance(rng, 0.6);
    locations = [
      worldwide
        ? { display: "Remote (Worldwide)", city: null, state: null, country: null }
        : { display: "Remote (India)", city: null, state: null, country: "IN" },
    ];
  } else {
    let primary: CityDef;
    const globalShare = GLOBAL_OFFICE_SHARE[profile] * (level === "intern" ? 0.3 : 1);
    if (forcedCity) primary = forcedCity;
    else if (company.globalCities && company.globalCities.length > 0 && chance(rng, globalShare)) primary = cityDef(pick(rng, company.globalCities));
    else if (company.cities.length > 0) {
      // Flatter than the national weights so multi-city employers spread out; the first listed city is the main hub.
      const options = company.cities.map(cityDef);
      primary = options[weightedIndex(rng, options.map((c, i) => Math.sqrt(c.weight) / (1 + 0.2 * i)))] as CityDef;
    }
    else primary = weightedPick(rng, INDIAN_CITIES, (c) => c.weight);
    locations = [toLocation(primary)];
    if (primary.country === "IN" && company.cities.length >= 2 && chance(rng, 0.26)) {
      const others = sampleDistinct(rng, company.cities.filter((n) => n !== primary.name), randInt(rng, 1, 2));
      for (const name of others) locations.push(toLocation(cityDef(name)));
    }
  }
  const primaryCountry = locations[0]?.country ?? null;

  // 9 · experience
  let [experienceMin, experienceMax] = experienceFor(level, rng);
  if (forcedExp !== undefined && !((experienceMin ?? 0) <= forcedExp && forcedExp <= (experienceMax ?? Number.POSITIVE_INFINITY))) {
    experienceMin = Math.min(experienceMin ?? 0, Math.floor(forcedExp));
    experienceMax = experienceMax === null ? null : Math.max(experienceMax, Math.ceil(forcedExp));
  }

  // 10 · skills
  const stacks = SKILL_STACKS[category] ?? [["Communication", "Problem Solving", "Excel", "Teamwork"]];
  const hint = STACK_HINTS.find((h) => h.category === category && h.pattern.test(title));
  const stack = hint && stacks[hint.stack] ? (stacks[hint.stack] as string[]) : pick(rng, stacks);
  const count = Math.min(stack.length, randInt(rng, 4, 7));
  let skills = [...stack.slice(0, 2), ...sampleDistinct(rng, stack.slice(2), count - 2)];
  if (forcedSkill && !skills.some((s) => s.toLowerCase() === forcedSkill.toLowerCase())) skills = [forcedSkill, ...skills];
  skills = skills.slice(0, 8);

  // 11 · sources (most official first)
  const officialDef = sourceById(company.official) as MockSourceDef;
  const forcedOfficial = choices.official === 1 || (forcedSource !== undefined && isOfficialKind(forcedSource.kind));
  const hasOfficial = forcedOfficial || chance(rng, level === "intern" ? 0.55 : level === "fresher" ? 0.62 : 0.82);
  const boardCount = hasOfficial ? (chance(rng, 0.3) ? randInt(rng, 1, 2) : 0) : randInt(rng, 1, 2);
  const boards = pickBoards(rng, level, boardCount);
  if (forcedSource && !isOfficialKind(forcedSource.kind) && !boards.includes(forcedSource.id)) boards.unshift(forcedSource.id);
  const sources: JobSourceRef[] = [];
  if (hasOfficial) sources.push({ id: officialDef.id, name: officialDef.name, kind: officialDef.kind, url: company.careersUrl });
  for (const id of boards) {
    const def = sourceById(id) as MockSourceDef;
    sources.push({ id: def.id, name: def.name, kind: def.kind, url: boardUrl(id, level === "intern") });
  }
  sources.sort((a, b) => SOURCE_KIND_PRIORITY[b.kind] - SOURCE_KIND_PRIORITY[a.kind]);
  const applyUrl = hasOfficial ? company.careersUrl : (sources[0] as JobSourceRef).url;

  // 12 · salary
  const currency = isRemote ? (primaryCountry === "IN" ? "INR" : "USD") : (COUNTRY_CURRENCY[primaryCountry ?? "IN"] ?? "INR");
  const officialOnly = hasOfficial && boards.length === 0;
  const nullChance =
    level === "intern"
      ? officialOnly ? 0.35 : 0.06
      : officialOnly
        ? profile === "bigtech" || profile === "bank" || profile === "semis" ? 0.62 : 0.5
        : 0.18;
  let salary: Salary | null = chance(rng, nullChance) ? null : makeSalary(rng, level, profile, currency, jobType);
  if (choices.salaryFloorLpa !== undefined && choices.salaryFloorLpa > 0 && choices.salaryFloorLpa <= 10_000) {
    salary = ensureSalaryFloor(salary, choices.salaryFloorLpa, level);
  }
  const inr = salaryToInrYearly(salary);

  // 13 · tags
  const tags = new Set<string>();
  if ((level === "fresher" && chance(rng, 0.4)) || (level === "intern" && chance(rng, 0.08))) tags.add("off-campus");
  if (!isRemote && (level === "fresher" || level === "entry") && (profile === "services" || category === "customer_support") && chance(rng, 0.12)) {
    tags.add("walk-in");
  }
  if (isRemote && primaryCountry === "IN" && chance(rng, 0.7)) tags.add("wfh");
  if (chance(rng, 0.035)) tags.add("women");
  if (chance(rng, 0.08)) tags.add("urgent");
  if (forcedTag) tags.add(forcedTag);

  // 14 · degrees, department, quality, timing extras
  const degreePool = DEGREES[category] ?? ["Any graduate"];
  const degrees =
    level === "lead" || level === "executive"
      ? chance(rng, 0.5) ? [] : [degreePool[0] as string]
      : sampleDistinct(rng, degreePool, randInt(rng, 1, Math.min(3, degreePool.length))).sort(
          (a, b) => degreePool.indexOf(a) - degreePool.indexOf(b),
        );
  const department = DEPARTMENTS[category] ?? null;
  const qualityScore = hasOfficial ? randInt(rng, 70, 98) : randInt(rng, 55, 85);
  const status = timing.status ?? "open";
  const hasDeadline = chance(rng, level === "intern" || level === "fresher" ? 0.5 : 0.22);
  const futureMs = randInt(rng, 3, 21) * DAY + randInt(rng, 0, 23) * HOUR;
  let validForMs: number | null = null;
  if (timing.postedOffsetMs !== undefined) {
    if (status === "closed") validForMs = Math.max(DAY, Math.min(timing.postedOffsetMs - 2 * DAY, randInt(rng, 5, 15) * DAY));
    else if (hasDeadline) validForMs = timing.postedOffsetMs + futureMs;
  } else if (hasDeadline) validForMs = futureMs;
  const firstSeenDelayMs = randInt(rng, 0, 20) * MINUTE;
  const lastSeenAgoMs = randInt(rng, 1, 40) * MINUTE;
  const internDuration = level === "intern" ? pick(rng, ["2 months", "3 months", "6 months", "6 months"]) : null;

  // 15 · summary (≤ 280 chars)
  const copy = copyFor(category);
  const where = isRemote
    ? (locations[0] as MockLocation).country === null ? "remotely (worldwide)" : "remotely from anywhere in India"
    : `in ${(locations[0] as MockLocation).city ?? ""}`;
  const forBatch = (level === "intern" || level === "fresher") && batches.length > 0 ? ` for the ${batchList(batches)} batch` : "";
  const summary = truncate(`${company.name} is hiring ${article(title)} ${title} ${where}${forBatch}. You'll ${pick(rng, copy.mission)}.`, 280);

  return {
    id: timing.id,
    seed: seed >>> 0,
    status,
    companyIndex,
    title,
    slug: slugify(`${title} ${company.name}`),
    level,
    jobType,
    workMode,
    isRemote,
    category,
    locations,
    experienceMin,
    experienceMax,
    batches,
    salary,
    salaryInrYearlyMin: inr.min,
    salaryInrYearlyMax: inr.max,
    skills,
    tags: [...tags],
    sources,
    applyUrl,
    isOfficial: sources.some((s) => isOfficialKind(s.kind)),
    degrees,
    department,
    summary,
    qualityScore,
    postedOffsetMs: timing.postedOffsetMs ?? null,
    postedAtMs: timing.postedAtMs ?? null,
    validForMs,
    firstSeenDelayMs,
    lastSeenAgoMs,
    team,
    internDuration,
  };
}

/* ─────────────────────────── Base dataset ─────────────────────────── */

let baseSpecs: readonly MockJobSpec[] | undefined;
let baseById: Map<string, MockJobSpec> | undefined;

/** The deterministic base dataset (BASE_JOB_COUNT open + CLOSED_JOB_COUNT closed), generated once per process. */
export function getBaseSpecs(): readonly MockJobSpec[] {
  if (baseSpecs) return baseSpecs;
  const master = mulberry32(MOCK_SEED);
  const specs: MockJobSpec[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < BASE_JOB_COUNT + CLOSED_JOB_COUNT; i++) {
    const closed = i >= BASE_JOB_COUNT;
    const postedOffsetMs = closed ? Math.round(randFloat(master, 20 * DAY, 60 * DAY) / 1000) * 1000 : postedOffset(master);
    const timing: SpecTiming = { id: baseJobId(i), postedOffsetMs, status: closed ? "closed" : "open" };
    // Re-roll (deterministically) when a company already has the same title in the same place.
    let spec = generateJobSpec(Math.floor(master() * 0x100000000) >>> 0, {}, timing);
    for (let attempt = 0; attempt < 4 && seen.has(dedupeKey(spec)); attempt++) {
      spec = generateJobSpec(Math.floor(master() * 0x100000000) >>> 0, {}, timing);
    }
    seen.add(dedupeKey(spec));
    specs.push(spec);
  }
  baseSpecs = specs;
  baseById = new Map(specs.map((s) => [s.id, s]));
  return specs;
}

function dedupeKey(spec: MockJobSpec): string {
  return `${spec.companyIndex}|${spec.title}|${spec.locations[0]?.display ?? ""}`;
}

export function getBaseSpec(id: string): MockJobSpec | undefined {
  if (!baseById) getBaseSpecs();
  return baseById?.get(id);
}

/** Regenerate a live job from its self-describing id (null when the id is malformed). */
export function specFromLiveId(id: string): MockJobSpec | null {
  const decoded = decodeLiveId(id);
  if (!decoded) return null;
  return generateJobSpec(decoded.seed, decoded.choices, { id, postedAtMs: decoded.postedAtMs });
}

/* ─────────────────────────── Live-job bias ─────────────────────────── */

/** Pick generator inputs that make a new live job satisfy `filters` where possible. */
export function deriveChoices(filters: Partial<SearchQuery>, rng: Rng): JobChoices {
  const c: JobChoices = {};
  const one = <T>(list: readonly T[] | undefined): T | undefined => (list && list.length > 0 ? pick(rng, list) : undefined);

  const officialSourceIds = (filters.source ?? []).filter(isOfficialSourceId);
  const boardSourceIds = (filters.source ?? []).filter((id) => SOURCE_BY_ID.has(id) && !isOfficialSourceId(id));

  // company: explicit slug > ctype > official source
  const slug = one(filters.company);
  let companyIndex = slug !== undefined ? COMPANY_INDEX.get(slug.toLowerCase()) : undefined;
  if (companyIndex === undefined && ((filters.ctype?.length ?? 0) > 0 || officialSourceIds.length > 0)) {
    let candidates = MOCK_COMPANIES.map((_, i) => i);
    if (filters.ctype && filters.ctype.length > 0) {
      const wanted = filters.ctype;
      const byTag = candidates.filter((i) => (MOCK_COMPANIES[i] as MockCompanyDef).tags.some((t) => wanted.includes(t)));
      if (byTag.length > 0) candidates = byTag;
    }
    if (officialSourceIds.length > 0) {
      const bySource = candidates.filter((i) => officialSourceIds.includes((MOCK_COMPANIES[i] as MockCompanyDef).official));
      if (bySource.length > 0) candidates = bySource;
    }
    companyIndex = pick(rng, candidates);
  }
  if (companyIndex !== undefined) c.company = companyIndex;

  // level / type
  const level = one(filters.level);
  if (level) c.level = EXPERIENCE_LEVELS.indexOf(level);
  else if (filters.type && filters.type.length > 0 && filters.type.every((t) => t === "internship")) c.level = EXPERIENCE_LEVELS.indexOf("intern");
  else if (filters.exp !== undefined) c.level = EXPERIENCE_LEVELS.indexOf(levelForExp(filters.exp));
  else if (filters.batch && filters.batch.length > 0) c.level = EXPERIENCE_LEVELS.indexOf(chance(rng, 0.5) ? "intern" : "fresher");
  if (filters.type && filters.type.length > 0) {
    const isIntern = c.level === EXPERIENCE_LEVELS.indexOf("intern");
    const fitting = filters.type.filter((t) => (isIntern ? t === "internship" : t !== "internship"));
    const type = one(fitting.length > 0 ? fitting : filters.type);
    if (type) c.type = JOB_TYPES.indexOf(type);
  }

  // category
  const category = one(filters.category);
  if (category) c.category = JOB_CATEGORIES.indexOf(category);

  // mode / location / country
  const locations = filters.location ?? [];
  const wantsRemote = locations.some((l) => l.toLowerCase() === "remote");
  const cityNames = locations.filter((l) => l.toLowerCase() !== "remote" && CITY_INDEX.has(l.toLowerCase()));
  const mode = one(filters.mode);
  if (mode) c.mode = WORK_MODES.indexOf(mode);
  else if (wantsRemote && (cityNames.length === 0 || chance(rng, 0.5))) c.mode = WORK_MODES.indexOf("remote");
  else if ((filters.tag ?? []).includes("wfh") && cityNames.length === 0) c.mode = WORK_MODES.indexOf("remote");
  if (c.mode !== WORK_MODES.indexOf("remote")) {
    const cityName = one(cityNames);
    if (cityName !== undefined) c.city = CITY_INDEX.get(cityName.toLowerCase());
    else if (filters.country && filters.country.length > 0) {
      const countries = filters.country.map((x) => x.toUpperCase());
      const options = CITY_CATALOG.map((city, i) => ({ city, i })).filter(({ city }) => countries.includes(city.country));
      if (options.length > 0) c.city = pick(rng, options).i;
    }
  }

  // skills, batch, source, tag, official, salary, experience
  const skill = one(filters.skills);
  if (skill !== undefined) {
    const si = SKILL_INDEX.get(skill.toLowerCase());
    if (si !== undefined) c.skill = si;
  }
  const batch = one(filters.batch);
  if (batch !== undefined && batch >= 2010 && batch <= 2060) c.batch = batch - 2000;
  if (officialSourceIds.length === 0) {
    const board = one(boardSourceIds);
    if (board !== undefined) c.source = SOURCE_INDEX.get(board);
  }
  const tag = one((filters.tag ?? []).filter((t) => TAG_POOL.includes(t)));
  if (tag !== undefined) c.tag = TAG_POOL.indexOf(tag);
  if (filters.official) c.official = 1;
  if (filters.salaryMin !== undefined && filters.salaryMin > 0) c.salaryFloorLpa = Math.min(10_000, Math.ceil(filters.salaryMin / 100_000));
  if (filters.exp !== undefined) c.exp = Math.max(0, Math.min(500, Math.round(filters.exp * 10)));
  return c;
}

/* ─────────────────────────── Materialisation ─────────────────────────── */

export function postedAtFor(spec: MockJobSpec, now: number): number {
  return spec.postedAtMs ?? now - (spec.postedOffsetMs ?? 0);
}

export function mockCompanyFor(spec: MockJobSpec): MockCompanyDef {
  return MOCK_COMPANIES[spec.companyIndex] as MockCompanyDef;
}

export function toListItem(spec: MockJobSpec, now: number): JobListItem {
  const company = mockCompanyFor(spec);
  return {
    id: spec.id,
    slug: spec.slug,
    title: spec.title,
    company: { name: company.name, slug: company.slug, domain: company.domain, logoUrl: null, tags: [...company.tags] },
    locations: spec.locations.map((l) => l.display),
    isRemote: spec.isRemote,
    workMode: spec.workMode,
    jobType: spec.jobType,
    experienceLevel: spec.level,
    experienceMin: spec.experienceMin,
    experienceMax: spec.experienceMax,
    batches: [...spec.batches],
    salary: spec.salary ? { ...spec.salary } : null,
    skills: [...spec.skills],
    category: spec.category,
    tags: [...spec.tags],
    postedAt: new Date(postedAtFor(spec, now)).toISOString(),
    applyUrl: spec.applyUrl,
    isOfficial: spec.isOfficial,
    sources: spec.sources.map((s) => ({ ...s })),
    summary: spec.summary,
  };
}

export function toJobDetail(spec: MockJobSpec, now: number): JobDetail {
  const posted = postedAtFor(spec, now);
  const firstSeen = Math.min(Math.max(now, posted), posted + spec.firstSeenDelayMs);
  const lastSeen =
    spec.status === "open"
      ? Math.max(firstSeen, now - spec.lastSeenAgoMs)
      : Math.max(firstSeen, Math.min(now - 3 * DAY, posted + 15 * DAY));
  return {
    ...toListItem(spec, now),
    descriptionHtml: descriptionFor(spec),
    degrees: [...spec.degrees],
    department: spec.department,
    validThrough: spec.validForMs === null ? null : new Date(posted + spec.validForMs).toISOString(),
    firstSeenAt: new Date(firstSeen).toISOString(),
    lastSeenAt: new Date(lastSeen).toISOString(),
    status: spec.status,
  };
}

/* ─────────────────────────── Descriptions (lazy, deterministic) ─────────────────────────── */

const descriptionCache = new Map<string, string>();

const esc = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const ul = (items: string[]): string => `<ul>${items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>`;

function joinList(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/** Sanitised-by-construction HTML: only h3 / p / ul / li / strong / a tags, all text escaped. */
export function descriptionFor(spec: MockJobSpec): string {
  const cached = descriptionCache.get(spec.id);
  if (cached !== undefined) return cached;
  const rng = mulberry32((spec.seed ^ 0x9e3779b9) >>> 0);
  const company = mockCompanyFor(spec);
  const copy = copyFor(spec.category);
  const cities = spec.locations.map((l) => l.city).filter((c): c is string => c !== null);
  const where = spec.isRemote ? "remotely" : `from our ${joinList(cities)} office${cities.length > 1 ? "s" : ""}`;
  const batches = batchList(spec.batches);
  const degree = spec.degrees[0] ?? "a bachelor's or master's degree";
  const html: string[] = [];

  html.push("<h3>About the role</h3>");
  html.push(
    `<p>${esc(company.blurb)} As ${article(spec.title)} <strong>${esc(spec.title)}</strong>${
      spec.team ? ` on the ${esc(spec.team)} team` : ""
    }, you'll ${esc(pick(rng, copy.mission))}, working ${esc(where)} with people who care deeply about craft and impact.</p>`,
  );
  if (spec.level === "intern") {
    html.push(
      `<p>This is a <strong>${esc(spec.internDuration ?? "6 months")} internship</strong>${
        spec.batches.length > 0 ? ` for students graduating in ${esc(batches)}` : ""
      }. Interns work on real projects with a dedicated mentor, and top performers receive a pre-placement offer.</p>`,
    );
  } else if (spec.level === "fresher") {
    html.push(
      `<p>This role is part of our ${spec.tags.includes("off-campus") ? "off-campus" : "campus"} hiring program for the <strong>${esc(
        batches || "2026",
      )} batch</strong>. You'll start with a structured onboarding and training program before joining your team.</p>`,
    );
  }

  html.push("<h3>What you'll do</h3>");
  html.push(ul(sampleDistinct(rng, copy.responsibilities, Math.min(copy.responsibilities.length, randInt(rng, 4, 6)))));

  let experienceLine: string;
  if (spec.level === "intern") experienceLine = `Currently pursuing ${degree}${spec.batches.length > 0 ? `, graduating in ${batches}` : ""}`;
  else if (spec.level === "fresher") experienceLine = `${degree} graduates from the ${batches || "2026"} batch — no prior work experience required`;
  else if (spec.experienceMin !== null && spec.experienceMax !== null) experienceLine = `${spec.experienceMin}–${spec.experienceMax} years of relevant experience`;
  else if (spec.experienceMin !== null) experienceLine = `${spec.experienceMin}+ years of relevant experience`;
  else experienceLine = "Relevant hands-on experience in a similar role";
  const topSkills = spec.skills.slice(0, 3);
  const requirements = [
    experienceLine,
    ...(topSkills.length > 0 ? [`Hands-on experience with ${joinList(topSkills)}`] : []),
    ...sampleDistinct(rng, copy.requirements, Math.min(copy.requirements.length, randInt(rng, 2, 4))),
  ];
  html.push("<h3>What we're looking for</h3>");
  html.push(ul(requirements));

  if (spec.level === "intern" || spec.level === "fresher") {
    const eligibility = [
      spec.batches.length > 0 ? `Batch: ${spec.batches.join(", ")}` : "Batch: final-year students and recent graduates",
      `Degree: ${spec.degrees.length > 0 ? spec.degrees.join(", ") : "Any graduate"}`,
      company.profile === "services" ? "Minimum 60% (or 6.0 CGPA) throughout academics, with no active backlogs" : "No active backlogs at the time of joining",
    ];
    html.push("<h3>Eligibility</h3>");
    html.push(ul(eligibility));
  }

  html.push("<h3>Nice to have</h3>");
  html.push(ul(sampleDistinct(rng, copy.niceToHave, Math.min(copy.niceToHave.length, randInt(rng, 2, 3)))));

  const perkKey =
    spec.level === "intern"
      ? "intern"
      : company.profile === "services" || company.profile === "consulting"
        ? "services"
        : company.profile === "startup" || company.profile === "fintech"
          ? "growth"
          : "enterprise";
  html.push("<h3>Perks &amp; benefits</h3>");
  html.push(ul(sampleDistinct(rng, PERKS[perkKey], randInt(rng, 3, 5))));

  if (spec.isOfficial) {
    html.push(
      `<p>Learn more about life at ${esc(company.name)} on the <a href="${esc(company.careersUrl)}">official careers page</a>.</p>`,
    );
  }
  const out = html.join("");
  if (descriptionCache.size > 2000) descriptionCache.clear();
  descriptionCache.set(spec.id, out);
  return out;
}
