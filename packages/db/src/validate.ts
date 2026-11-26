/**
 * Ingest validation (the API is the trust boundary). `jobInputSchema` is declared as z.ZodType<JobInput>
 * and additionally checked for exact equality with the contract type, so it can never drift.
 *
 * Strict (reject the item): everything `validateJobInput` checks — required strings, http(s) URLs, enums,
 * ISO postedAt, array-typed fields, isRemote boolean, qualityScore 0–100.
 * Lenient (normalise instead of rejecting): soft fields — trimmed/truncated strings, invalid optional URLs or
 * dates → null, malformed salary → null, unknown company tags dropped, arrays de-duplicated, skills capped at 12.
 */
import { z } from "zod";
import {
  COMPANY_TAGS,
  EXPERIENCE_LEVELS,
  JOB_CATEGORIES,
  JOB_TYPES,
  SOURCE_KINDS,
  WORK_MODES,
  slugify,
  type JobInput,
  type JobLocation,
  type RunReport,
  type Salary,
} from "@easyjobs/contract";

const isHttpUrl = (v: string): boolean => {
  if (!/^https?:\/\//i.test(v)) return false;
  try {
    new URL(v);
    return true;
  } catch {
    return false;
  }
};
const toIsoOrNull = (v: unknown): string | null => {
  if (typeof v !== "string" && typeof v !== "number") return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};

/** Required, non-empty after trim; over-long values are truncated (not rejected). */
const reqStr = (max: number) =>
  z
    .string({ error: "is required" })
    .transform((v) => v.trim().slice(0, max))
    .refine((v) => v.length > 0, "is required");
/** Optional string → trimmed string or null. Non-strings become null. */
const optStr = (max: number) =>
  z
    .unknown()
    .optional()
    .transform((v): string | null => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null));
const httpUrl = z
  .string({ error: "must be an absolute http(s) URL" })
  .transform((v) => v.trim())
  .refine((v) => v.length <= 4096 && isHttpUrl(v), "must be an absolute http(s) URL");
const optHttpUrl = z
  .unknown()
  .optional()
  .transform((v): string | null => (typeof v === "string" && v.length <= 4096 && isHttpUrl(v.trim()) ? v.trim() : null));
const optNum = (min: number, max: number) =>
  z.unknown().optional().transform((v): number | null => (typeof v === "number" && Number.isFinite(v) && v >= min && v <= max ? v : null));
const strList = (maxItems: number, maxLen: number) =>
  z.array(z.unknown(), { error: "must be an array" }).transform((arr): string[] => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const raw of arr) {
      if (typeof raw !== "string") continue;
      const v = raw.trim().slice(0, maxLen);
      const key = v.toLowerCase();
      if (!v || seen.has(key)) continue;
      seen.add(key);
      out.push(v);
      if (out.length >= maxItems) break;
    }
    return out;
  });

const locationSchema: z.ZodType<JobLocation> = z
  .object({
    raw: z.unknown().optional(),
    city: optStr(120),
    state: optStr(120),
    country: z.unknown().optional().transform((v): string | null => (typeof v === "string" && /^[a-z]{2}$/i.test(v.trim()) ? v.trim().toUpperCase() : null)),
  })
  .transform((l) => {
    const raw = typeof l.raw === "string" && l.raw.trim() ? l.raw.trim().slice(0, 300) : [l.city, l.state, l.country].filter(Boolean).join(", ");
    return { raw, city: l.city, state: l.state, country: l.country };
  });

const salarySchema: z.ZodType<Salary> = z
  .object({
    min: optNum(0, 1e12),
    max: optNum(0, 1e12),
    currency: z.string().trim().regex(/^[A-Za-z]{3}$/).transform((c) => c.toUpperCase()),
    period: z.enum(["hour", "month", "year"]),
    raw: optStr(200),
  })
  .refine((s) => s.min !== null || s.max !== null || s.raw !== null, "empty salary");

const jobInputObject = z.object({
  fingerprint: reqStr(300),
  source: reqStr(100),
  sourceName: reqStr(200),
  sourceKind: z.enum(SOURCE_KINDS, { error: "sourceKind invalid" }),
  sourceJobId: reqStr(500),
  sourceUrl: httpUrl,
  target: optStr(300),
  applyUrl: httpUrl,
  title: reqStr(300),
  company: reqStr(200),
  companySlug: reqStr(120).transform((v, ctx) => {
    const s = /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(v) ? v : slugify(v);
    if (!s) ctx.addIssue({ code: "custom", message: "companySlug is not sluggable" });
    return s;
  }),
  companyDomain: z.unknown().optional().transform((v): string | null => {
    if (typeof v !== "string") return null;
    const d = v.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
    return /^[a-z0-9.-]+\.[a-z]{2,}$/.test(d) && d.length <= 253 ? d : null;
  }),
  companyLogoUrl: optHttpUrl,
  companyTags: z.array(z.unknown(), { error: "must be an array" }).transform((arr): string[] => [
    ...new Set(arr.filter((t): t is string => typeof t === "string" && (COMPANY_TAGS as readonly string[]).includes(t))),
  ]),
  locations: z.array(z.unknown(), { error: "must be an array" }).transform((arr): JobLocation[] => {
    const out: JobLocation[] = [];
    const seen = new Set<string>();
    for (const item of arr.slice(0, 100)) {
      const parsed = locationSchema.safeParse(typeof item === "string" ? { raw: item } : item);
      if (!parsed.success || !parsed.data.raw) continue;
      const key = `${parsed.data.city ?? parsed.data.raw}|${parsed.data.country ?? ""}`.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(parsed.data);
    }
    return out.slice(0, 50);
  }),
  workMode: z.enum(WORK_MODES, { error: "workMode must be null or valid" }).nullable(),
  isRemote: z.boolean({ error: "isRemote must be boolean" }),
  jobType: z.enum(JOB_TYPES, { error: "jobType invalid" }),
  experienceLevel: z.enum(EXPERIENCE_LEVELS, { error: "experienceLevel invalid" }),
  experienceMin: optNum(0, 60),
  experienceMax: optNum(0, 60),
  batches: z
    .array(z.unknown(), { error: "must be an array" })
    .transform((arr): number[] =>
      [...new Set(arr.filter((n): n is number => typeof n === "number" && Number.isInteger(n) && n >= 1990 && n <= 2100))].sort((a, b) => a - b),
    ),
  degrees: strList(30, 80),
  salary: z.unknown().optional().transform((v): Salary | null => {
    if (v === null || v === undefined) return null;
    const parsed = salarySchema.safeParse(v);
    return parsed.success ? parsed.data : null;
  }),
  salaryInrYearlyMin: optNum(0, 1e12),
  salaryInrYearlyMax: optNum(0, 1e12),
  skills: strList(12, 60),
  category: z.enum(JOB_CATEGORIES, { error: "category invalid" }),
  department: optStr(200),
  descriptionHtml: z.unknown().optional().transform((v): string | null => (typeof v === "string" && v.trim() ? v : null)),
  descriptionText: z.unknown().optional().transform((v): string | null => (typeof v === "string" && v.trim() ? v.trim().slice(0, 100_000) : null)),
  summary: optStr(280),
  postedAt: z
    .string({ error: "postedAt invalid" })
    .refine((v) => !Number.isNaN(Date.parse(v)), "postedAt invalid")
    .transform((v) => new Date(v).toISOString()),
  validThrough: z.unknown().optional().transform(toIsoOrNull),
  qualityScore: z
    .number({ error: "qualityScore must be 0–100" })
    .min(0, "qualityScore must be 0–100")
    .max(100, "qualityScore must be 0–100")
    .transform((n) => Math.round(n)),
  tags: strList(30, 60),
  extra: z.unknown().optional().transform((v): Record<string, unknown> =>
    v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {},
  ),
});

type Exact<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
/** Compile-time guard: the schema's output is exactly the contract's JobInput (fails typecheck on drift). */
const schemaMatchesContract: Exact<z.output<typeof jobInputObject>, JobInput> = true;
void schemaMatchesContract;

export const jobInputSchema: z.ZodType<JobInput> = jobInputObject;

export type ValidationResult = { ok: true; job: JobInput } | { ok: false; error: string };

function formatIssues(error: z.ZodError): string {
  return error.issues
    .slice(0, 8)
    .map((i) => {
      const path = i.path.map(String).join(".");
      return path && !i.message.startsWith(path) ? `${path}: ${i.message}` : i.message;
    })
    .join("; ")
    .slice(0, 500);
}

export function validateJob(item: unknown): ValidationResult {
  if (!item || typeof item !== "object" || Array.isArray(item)) return { ok: false, error: "not an object" };
  const parsed = jobInputSchema.safeParse(item);
  return parsed.success ? { ok: true, job: parsed.data } : { ok: false, error: formatIssues(parsed.error) };
}

/* ─────────── Envelopes for the other ingest routes ─────────── */

export const MAX_JOBS_PER_REQUEST = 500;

export const ingestEnvelopeSchema = z.object({
  source: z.string().trim().min(1).max(100),
  runId: z.string().trim().min(1).max(200),
  jobs: z.array(z.unknown()),
});

/** SweepRequest, leniently: `target` may be null/"" for sources without targets (contract request filed). */
export interface SweepInput {
  source: string;
  target: string | null;
  seenSourceJobIds: string[];
}
export const sweepSchema: z.ZodType<SweepInput> = z.object({
  source: z.string().trim().min(1).max(100),
  target: z
    .string()
    .max(300)
    .nullish()
    .transform((t) => (t && t.trim() ? t.trim() : null)),
  seenSourceJobIds: z.array(z.string().max(500)).max(500_000),
});

/** RunReport plus the optional fields requested by P05 (`complete`, `stats`); malformed extras are dropped. */
export type RunReportInput = RunReport & { complete?: boolean; stats?: Record<string, number> };

export const runReportSchema: z.ZodType<RunReportInput> = z.object({
  runId: z.string().trim().min(1).max(200),
  source: z.string().trim().min(1).max(100),
  target: z
    .string()
    .max(300)
    .nullish()
    .transform((t) => (t && t.trim() ? t.trim() : null)),
  startedAt: z.string().refine((v) => !Number.isNaN(Date.parse(v)), "startedAt must be ISO-8601").transform((v) => new Date(v).toISOString()),
  finishedAt: z.string().refine((v) => !Number.isNaN(Date.parse(v)), "finishedAt must be ISO-8601").transform((v) => new Date(v).toISOString()),
  status: z.enum(["ok", "partial", "error"]),
  emitted: z.number().int().min(0),
  invalid: z.number().int().min(0),
  errors: z.array(z.unknown()).transform((arr) => arr.slice(0, 50).map((e) => String(e).slice(0, 2000))),
  complete: z.boolean().optional().catch(undefined),
  stats: z
    .record(z.string().max(100), z.number().finite())
    .optional()
    .catch(undefined)
    .transform((v) => (v && Object.keys(v).length <= 100 ? v : undefined)),
});

export function formatZodError(error: z.ZodError): string {
  return formatIssues(error);
}
