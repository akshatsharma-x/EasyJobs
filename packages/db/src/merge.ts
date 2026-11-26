/**
 * Pure merge + freshness logic (§0.4). No I/O — unit-testable on its own.
 *
 * Merge on the same fingerprint:
 *  - sources are unioned by (source, sourceJobId)
 *  - scalar field groups come from the highest SOURCE_KIND_PRIORITY source that has a non-empty value;
 *    a non-empty value is never overwritten with null/empty (provenance kept per group in `fieldPrio`)
 *  - arrays are unioned (skills capped at 12; the higher-priority side's items come first)
 *  - postedAt / firstSeenAt keep the earliest value; applyUrl comes from the most official source
 *  - any sighting re-opens the job (then the freshness rules below still apply)
 */
import {
  LABELS,
  SOURCE_KIND_PRIORITY,
  isOfficialKind,
  slugify,
  type JobInput,
  type JobLocation,
  type JobSourceRef,
  type SourceKind,
} from "@easyjobs/contract";
import type { JobRecord, SourceRecord } from "./records";
import type { ClosedReason, JobStatus } from "./schema";

export const DAY_MS = 86_400_000;
export const BOARD_UNSEEN_CLOSE_MS = 21 * DAY_MS;
export const BOARD_MAX_AGE_MS = 45 * DAY_MS;
export const MAX_SKILLS = 12;

export const priorityOf = (kind: SourceKind): number => SOURCE_KIND_PRIORITY[kind] ?? 0;

/* ─────────────── field groups ─────────────── */

type ScalarGroup = {
  name: string;
  fields: readonly (keyof JobRecord & keyof JobInput)[];
  empty: (v: Pick<JobRecord, keyof JobRecord & keyof JobInput>) => boolean;
};

const blank = (v: unknown): boolean =>
  v === null || v === undefined || (typeof v === "string" && v.trim() === "") || (Array.isArray(v) && v.length === 0);

/** Scalar groups: fields that must stay consistent move together (salary trio, experience range, description pair). */
const SCALAR_GROUPS: readonly ScalarGroup[] = [
  { name: "title", fields: ["title"], empty: (v) => blank(v.title) },
  { name: "company", fields: ["company"], empty: (v) => blank(v.company) },
  { name: "companySlug", fields: ["companySlug"], empty: (v) => blank(v.companySlug) },
  { name: "companyDomain", fields: ["companyDomain"], empty: (v) => blank(v.companyDomain) },
  { name: "companyLogoUrl", fields: ["companyLogoUrl"], empty: (v) => blank(v.companyLogoUrl) },
  { name: "workMode", fields: ["workMode"], empty: (v) => blank(v.workMode) },
  { name: "isRemote", fields: ["isRemote"], empty: () => false },
  { name: "jobType", fields: ["jobType"], empty: (v) => blank(v.jobType) },
  { name: "experienceLevel", fields: ["experienceLevel"], empty: (v) => blank(v.experienceLevel) },
  { name: "experience", fields: ["experienceMin", "experienceMax"], empty: (v) => v.experienceMin === null && v.experienceMax === null },
  {
    name: "salary",
    fields: ["salary", "salaryInrYearlyMin", "salaryInrYearlyMax"],
    empty: (v) => v.salary === null && v.salaryInrYearlyMin === null && v.salaryInrYearlyMax === null,
  },
  // "other" is the normaliser's "unknown" — treat it as empty so a real category from any source fills it.
  { name: "category", fields: ["category"], empty: (v) => blank(v.category) || v.category === "other" },
  { name: "department", fields: ["department"], empty: (v) => blank(v.department) },
  { name: "description", fields: ["descriptionHtml", "descriptionText"], empty: (v) => blank(v.descriptionHtml) && blank(v.descriptionText) },
  { name: "summary", fields: ["summary"], empty: (v) => blank(v.summary) },
  { name: "validThrough", fields: ["validThrough"], empty: (v) => blank(v.validThrough) },
  { name: "applyUrl", fields: ["applyUrl"], empty: (v) => blank(v.applyUrl) },
];

/* ─────────────── helpers ─────────────── */

function unionStrings(first: readonly string[], second: readonly string[], cap = Infinity): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of [...first, ...second]) {
    const key = v.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(v);
    if (out.length >= cap) break;
  }
  return out;
}

const locationKey = (l: JobLocation): string => `${(l.city ?? l.raw).toLowerCase()}|${l.country ?? ""}`;
function unionLocations(first: readonly JobLocation[], second: readonly JobLocation[]): JobLocation[] {
  const seen = new Map<string, JobLocation>();
  for (const l of [...first, ...second]) {
    const k = locationKey(l);
    if (!seen.has(k)) seen.set(k, l);
  }
  return [...seen.values()].slice(0, 50);
}

const PSEUDO_CITY = /^(remote|anywhere|wfh|work from home|multiple locations?|various|pan[ -]?india|india|global|worldwide|hybrid|on-?site|n\/?a|not specified)$/i;

export function deriveCities(locations: readonly JobLocation[]): string[] {
  return unionStrings(
    locations.map((l) => l.city?.trim() ?? "").filter((c) => c.length > 0 && !PSEUDO_CITY.test(c)),
    [],
  );
}
export function deriveCountries(locations: readonly JobLocation[]): string[] {
  return [...new Set(locations.map((l) => l.country?.toUpperCase() ?? "").filter((c) => /^[A-Z]{2}$/.test(c)))];
}

const TYPE_WORDS: Record<JobRecord["jobType"], string> = {
  internship: "internship intern",
  full_time: "full time fulltime",
  part_time: "part time parttime",
  contract: "contract contractual",
  temporary: "temporary",
  apprenticeship: "apprenticeship apprentice",
  freelance: "freelance freelancer",
};
const LEVEL_WORDS: Record<JobRecord["experienceLevel"], string> = {
  intern: "intern internship",
  fresher: "fresher freshers graduate",
  entry: "entry level junior",
  mid: "mid level",
  senior: "senior",
  lead: "lead staff principal",
  executive: "director executive",
};

/** Weight-C words: where it is (cities/states), how (remote/hybrid), what kind (type/level), department, tags, batches. */
export function buildSearchMeta(job: JobRecord): string {
  const words = new Set<string>();
  for (const l of job.locations) {
    if (l.city) words.add(l.city);
    if (l.state) words.add(l.state);
  }
  if (job.isRemote || job.workMode === "remote") words.add("remote wfh work from home");
  if (job.workMode === "hybrid") words.add("hybrid");
  if (job.workMode === "onsite") words.add("onsite");
  words.add(TYPE_WORDS[job.jobType]);
  words.add(LEVEL_WORDS[job.experienceLevel]);
  if (job.department) words.add(job.department);
  for (const t of job.tags) words.add(t);
  if (job.batches.length > 0) words.add(`batch ${job.batches.join(" ")}`);
  return [...words].join(" , ").slice(0, 2000);
}

/** "Bengaluru, IN" · raw when no city · + "Remote" when remote and not already said. */
export function displayLocations(locations: readonly JobLocation[], isRemote: boolean): string[] {
  const out: string[] = [];
  for (const l of locations) {
    const s = l.city ? (l.country ? `${l.city}, ${l.country}` : l.city) : l.raw;
    if (s && !out.includes(s)) out.push(s);
  }
  if (isRemote && !out.some((s) => /remote|anywhere|work from home|wfh/i.test(s))) out.push("Remote");
  return out;
}

const JOB_STATUS_OPEN = { status: "open" as JobStatus, closedReason: null };

/** Freshness rules (§0.4). `hasActiveSources=false` → swept. */
export function computeStatus(
  job: Pick<JobRecord, "validThrough" | "isOfficial" | "lastSeenAt" | "postedAt"> & { tags?: readonly string[] },
  hasActiveSources: boolean,
  now: Date,
): { status: JobStatus; closedReason: ClosedReason | null } {
  const t = now.getTime();
  if (!hasActiveSources) return { status: "closed", closedReason: "swept" };
  // ATS test requisitions leak into public feeds ("DO NOT APPLY - TEST REQ"); normalize tags them (P03 #6, W1).
  if (job.tags?.includes("test-posting")) return { status: "closed", closedReason: "test_posting" };
  if (job.validThrough && Date.parse(job.validThrough) < t) return { status: "closed", closedReason: "expired" };
  if (!job.isOfficial) {
    if (t - Date.parse(job.lastSeenAt) > BOARD_UNSEEN_CLOSE_MS) return { status: "closed", closedReason: "stale" };
    if (t - Date.parse(job.postedAt) > BOARD_MAX_AGE_MS) return { status: "closed", closedReason: "too_old" };
  }
  return JOB_STATUS_OPEN;
}

/* ─────────────── merge ─────────────── */

/**
 * Light records (`extra.light === true`, P05/P03): a re-sighting of a known job emitted without its
 * description. Fields that normalize derives from the description would be worse than the stored ones,
 * so a light record never updates them (it still counts as a sighting and can fill empty fields of a new job).
 */
const LIGHT_SKIP = new Set(["experienceLevel", "experience", "category", "summary", "description"]);
export const isLightRecord = (input: JobInput): boolean => input.extra?.light === true;
const withoutLightFlag = (extra: Record<string, unknown>): Record<string, unknown> => {
  if (!("light" in extra)) return extra;
  const { light: _light, ...rest } = extra;
  return rest;
};

/**
 * Merge one validated JobInput into the stored record (or create one). Source aggregates and status are
 * computed afterwards by `finalizeJob` once the job's full source list is known.
 */
export function mergeJob(existing: JobRecord | null, input: JobInput, ctx: { id: string; now: string }): JobRecord {
  const p = priorityOf(input.sourceKind);
  if (!existing) {
    const prio: Record<string, number> = {};
    for (const g of SCALAR_GROUPS) if (!g.empty(input)) prio[g.name] = p;
    prio.arrays = p;
    const created: JobRecord = {
      id: ctx.id,
      fingerprint: input.fingerprint,
      slug: "",
      title: input.title,
      company: input.company,
      companySlug: input.companySlug,
      companyDomain: input.companyDomain,
      companyLogoUrl: input.companyLogoUrl,
      companyTags: input.companyTags,
      locations: input.locations,
      cities: [],
      countries: [],
      workMode: input.workMode,
      isRemote: input.isRemote,
      jobType: input.jobType,
      experienceLevel: input.experienceLevel,
      experienceMin: input.experienceMin,
      experienceMax: input.experienceMax,
      batches: input.batches,
      degrees: input.degrees,
      salary: input.salary,
      salaryInrYearlyMin: input.salaryInrYearlyMin,
      salaryInrYearlyMax: input.salaryInrYearlyMax,
      skills: input.skills.slice(0, MAX_SKILLS),
      category: input.category,
      department: input.department,
      descriptionHtml: input.descriptionHtml,
      descriptionText: input.descriptionText,
      summary: input.summary,
      postedAt: input.postedAt,
      validThrough: input.validThrough,
      qualityScore: input.qualityScore,
      tags: input.tags,
      extra: withoutLightFlag(input.extra),
      applyUrl: input.applyUrl,
      sourceIds: [],
      sources: [],
      bestSourceKind: input.sourceKind,
      isOfficial: isOfficialKind(input.sourceKind),
      status: "open",
      closedReason: null,
      firstSeenAt: ctx.now,
      lastSeenAt: ctx.now,
      closedAt: null,
      updatedAt: ctx.now,
      fieldPrio: prio,
      searchMeta: "",
    };
    return derive(created);
  }

  const next: JobRecord = { ...existing, fieldPrio: { ...existing.fieldPrio } };
  const target = next as unknown as Record<string, unknown>;
  const source = input as unknown as Record<string, unknown>;
  const light = isLightRecord(input);
  for (const g of SCALAR_GROUPS) {
    if (g.empty(input)) continue; // never overwrite with null/empty
    if (light && LIGHT_SKIP.has(g.name) && !g.empty(next)) continue; // keep description-derived values
    const current = next.fieldPrio[g.name] ?? 0;
    if (g.empty(next) || p >= current) {
      for (const f of g.fields) target[f] = source[f];
      next.fieldPrio[g.name] = p;
    }
  }
  if (next.skills.length > MAX_SKILLS) next.skills = next.skills.slice(0, MAX_SKILLS);

  // Arrays: union; the higher-priority side leads (matters for the 12-skill cap and display order).
  const incomingLeads = p > (existing.fieldPrio.arrays ?? 0);
  const pair = <T>(a: readonly T[], b: readonly T[]): [readonly T[], readonly T[]] => (incomingLeads ? [b, a] : [a, b]);
  next.skills = unionStrings(...pair(existing.skills, input.skills), MAX_SKILLS);
  next.companyTags = unionStrings(...pair(existing.companyTags, input.companyTags));
  next.degrees = unionStrings(...pair(existing.degrees, input.degrees));
  next.tags = unionStrings(...pair(existing.tags, input.tags));
  next.locations = unionLocations(...pair(existing.locations, input.locations));
  next.batches = [...new Set([...existing.batches, ...input.batches])].sort((a, b) => a - b);
  next.fieldPrio.arrays = Math.max(existing.fieldPrio.arrays ?? 0, p);

  const incomingExtra = withoutLightFlag(input.extra);
  next.extra = incomingLeads ? { ...existing.extra, ...incomingExtra } : { ...incomingExtra, ...existing.extra };
  next.postedAt = Date.parse(input.postedAt) < Date.parse(existing.postedAt) ? input.postedAt : existing.postedAt;
  next.qualityScore = Math.max(existing.qualityScore, input.qualityScore);
  next.lastSeenAt = ctx.now;
  return derive(next);
}

function derive(job: JobRecord): JobRecord {
  job.slug = slugify(`${job.title} ${job.company}`) || job.id;
  job.cities = deriveCities(job.locations);
  job.countries = deriveCountries(job.locations);
  job.searchMeta = buildSearchMeta(job);
  return job;
}

/** Most official first; one ref per source id (its most official / most recently seen record). */
export function sourceRefs(sources: readonly SourceRecord[]): JobSourceRef[] {
  const best = new Map<string, SourceRecord>();
  for (const s of sources) {
    const cur = best.get(s.source);
    if (
      !cur ||
      priorityOf(s.sourceKind) > priorityOf(cur.sourceKind) ||
      (priorityOf(s.sourceKind) === priorityOf(cur.sourceKind) && s.lastSeenAt > cur.lastSeenAt)
    ) {
      best.set(s.source, s);
    }
  }
  return [...best.values()]
    .sort((a, b) => priorityOf(b.sourceKind) - priorityOf(a.sourceKind) || a.source.localeCompare(b.source))
    .map((s) => ({
      id: s.source,
      name: s.sourceName,
      kind: s.sourceKind,
      url: s.url,
      ...(s.attribution ? { attribution: s.attribution } : {}),
      ...(s.terms ? { terms: s.terms } : {}),
    }));
}

/**
 * Recompute source aggregates + status from the job's sources (active and removed). With no active
 * sources the last known aggregates are kept for display and the job is closed ("swept").
 */
export function finalizeJob(job: JobRecord, allSources: readonly SourceRecord[], now: Date, prevStatus: JobStatus | null): JobRecord {
  const active = allSources.filter((s) => s.removedAt === null);
  if (active.length > 0) {
    job.sources = sourceRefs(active);
    job.sourceIds = job.sources.map((s) => s.id);
    job.bestSourceKind = job.sources[0]!.kind;
    job.isOfficial = active.some((s) => isOfficialKind(s.sourceKind));
  }
  const { status, closedReason } = computeStatus(job, active.length > 0, now);
  job.status = status;
  job.closedReason = closedReason;
  if (status === "open") job.closedAt = null;
  else if (prevStatus !== "closed" || !job.closedAt) job.closedAt = now.toISOString();
  return job;
}

/** JSON with sorted object keys — jsonb reorders keys, so plain JSON.stringify is not comparable. */
export function canonicalJson(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v) ?? "null";
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(",")}]`;
  const obj = v as Record<string, unknown>;
  return `{${Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`)
    .join(",")}}`;
}

/** True when two records differ in anything but bookkeeping timestamps (drives write skipping). */
export function recordChanged(a: JobRecord, b: JobRecord): boolean {
  for (const key of Object.keys(b) as (keyof JobRecord)[]) {
    if (key === "lastSeenAt" || key === "updatedAt") continue;
    if (canonicalJson(a[key]) !== canonicalJson(b[key])) return true;
  }
  return false;
}

/** Facet/tag display labels not covered by LABELS. */
export const TAG_LABELS: Record<string, string> = {
  "off-campus": "Off-campus",
  "walk-in": "Walk-in",
  wfh: "Work from home",
  women: "Women",
  diversity: "Diversity",
  pwd: "PwD",
  urgent: "Urgent",
  suspicious: "Suspicious",
};
export const labelForTag = (t: string): string => TAG_LABELS[t] ?? t.replace(/[-_]+/g, " ").replace(/^\w/, (c) => c.toUpperCase());
export const labelForCompanyTag = (t: string): string => (LABELS.companyTag as Record<string, string>)[t] ?? t;
