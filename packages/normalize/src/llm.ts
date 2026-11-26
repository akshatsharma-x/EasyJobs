/**
 * Optional LLM enrichment for low-confidence records (Anthropic SDK, strict tool use).
 * - No-op without ANTHROPIC_API_KEY (or an injected client).
 * - Only fills level / experience / batches / degrees / skills / category; never touches title, company or applyUrl.
 * - Results are cached on disk by fingerprint, so re-runs cost nothing.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type Anthropic from "@anthropic-ai/sdk";
import { EXPERIENCE_LEVELS, JOB_CATEGORIES, type ExperienceLevel, type JobCategory, type JobInput } from "@easyjobs/contract";
import { cleanBatches } from "./batches";
import { cleanDegreeList, DEGREES } from "./degrees";
import type { NormalizeMeta } from "./normalize";
import { cleanSkillList } from "./skills";
import { isRecord } from "./text";

export const DEFAULT_LLM_MODEL = "claude-haiku-5-5";
const TOOL_NAME = "record_job_fields";
const MAX_DESCRIPTION_CHARS = 12_000;

/** The subset of the SDK client we use (lets tests inject a fake). */
export interface LlmClient {
  messages: {
    create(params: Anthropic.MessageCreateParamsNonStreaming): PromiseLike<Anthropic.Message>;
  };
}

export interface EnrichOptions {
  /** Default: env ANTHROPIC_API_KEY. */
  apiKey?: string | null;
  /** Default: env NORMALIZE_LLM_MODEL or claude-haiku-5-5. */
  model?: string;
  /** Default: env NORMALIZE_LLM_CACHE_DIR or packages/normalize/.cache/llm. null disables the cache. */
  cacheDir?: string | null;
  /** Enrich even when the record is not low-confidence. */
  force?: boolean;
  /** Use cached answers only; never call the API (e.g. once a caller's request budget is spent). */
  cacheOnly?: boolean;
  /** Injected client (tests). When set, no API key is required. */
  client?: LlmClient;
  /** Per-request timeout in ms (default 30 000). */
  timeoutMs?: number;
  log?: (msg: string, meta?: Record<string, unknown>) => void;
}

export interface LlmFields {
  experienceLevel: ExperienceLevel;
  experienceMin: number | null;
  experienceMax: number | null;
  batches: number[];
  degrees: string[];
  skills: string[];
  category: JobCategory;
}

const nullableNumber = { anyOf: [{ type: "number" }, { type: "null" }] };

/** Strict JSON schema (structured outputs): every property required, additionalProperties false. */
export const ENRICH_TOOL: Anthropic.Tool = {
  name: TOOL_NAME,
  description:
    "Record the hiring facts stated in the job posting. Use null or [] when the posting does not say; never guess numbers.",
  strict: true,
  input_schema: {
    type: "object",
    properties: {
      experienceLevel: {
        type: "string",
        enum: [...EXPERIENCE_LEVELS],
        description:
          "intern: internship · fresher: 0 yrs, new grad / campus / 20XX batch · entry: 0–2 yrs, junior, SDE-1 · mid: 2–5 yrs, SDE-2 · senior: 5–8 yrs · lead: 8+ yrs, staff/principal/architect/engineering manager · executive: director, head of, VP, CXO",
      },
      experienceMin: { ...nullableNumber, description: "Minimum years of experience required, or null." },
      experienceMax: { ...nullableNumber, description: "Maximum years of experience, or null if open-ended/unknown." },
      batches: { type: "array", items: { type: "integer" }, description: "Eligible graduation years (e.g. 2025, 2026). [] if not stated." },
      degrees: { type: "array", items: { type: "string", enum: [...DEGREES] }, description: "Required degrees. [] if not stated." },
      skills: { type: "array", items: { type: "string" }, description: "Up to 12 concrete skills/tools, most important first." },
      category: { type: "string", enum: [...JOB_CATEGORIES], description: "Job function." },
    },
    required: ["experienceLevel", "experienceMin", "experienceMax", "batches", "degrees", "skills", "category"],
    additionalProperties: false,
  },
};

const SYSTEM_PROMPT = `You extract structured hiring facts from job postings (mostly India; some global/remote) for a job-search index.
Use only what the posting states or clearly implies. Years of experience, graduation batches and degrees must come from the text; when absent use null or [].
Pick experienceLevel from the definitions in the tool schema; internships are "intern" and roles for 0-year candidates are "fresher".
Call the ${TOOL_NAME} tool exactly once with your answer.`;

/* ─────────────────────────── Gating ─────────────────────────── */

function metaOf(job: JobInput): Partial<NormalizeMeta> {
  const m = isRecord(job.extra) ? job.extra.normalize : undefined;
  return isRecord(m) ? (m as Partial<NormalizeMeta>) : {};
}

/** Low-confidence = defaulted level, unknown category, or no skills — and enough text for the model to read. */
export function needsEnrichment(job: JobInput): boolean {
  if (!isRecord(job) || typeof job.descriptionText !== "string" || job.descriptionText.length < 120) return false;
  const conf = metaOf(job).confidence;
  return conf?.level === "low" || conf?.category === "low" || job.category === "other" || !Array.isArray(job.skills) || job.skills.length === 0;
}

/* ─────────────────────────── Cache ─────────────────────────── */

function defaultCacheDir(): string {
  const env = process.env.NORMALIZE_LLM_CACHE_DIR?.trim();
  if (env) return env;
  return join(dirname(fileURLToPath(import.meta.url)), "..", ".cache", "llm");
}

function cachePath(dir: string, fingerprint: string): string {
  return join(dir, `${fingerprint.replace(/[^a-z0-9]+/gi, "_")}.json`);
}

function readCache(dir: string | null, fingerprint: string, model: string): LlmFields | null {
  if (!dir) return null;
  try {
    const data: unknown = JSON.parse(readFileSync(cachePath(dir, fingerprint), "utf8"));
    if (!isRecord(data) || data.model !== model) return null;
    return validateFields(data.fields);
  } catch {
    return null;
  }
}

function writeCache(dir: string | null, fingerprint: string, model: string, fields: LlmFields): void {
  if (!dir) return;
  try {
    mkdirSync(dir, { recursive: true });
    writeFileSync(cachePath(dir, fingerprint), JSON.stringify({ v: 1, model, at: new Date().toISOString(), fields }, null, 2));
  } catch {
    /* cache is best-effort */
  }
}

/* ─────────────────────────── Validation & merge ─────────────────────────── */

function years(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 50 ? Math.round(v * 10) / 10 : null;
}

/** Re-validate model output (defence in depth on top of the strict schema). */
export function validateFields(input: unknown): LlmFields | null {
  if (!isRecord(input)) return null;
  const level = input.experienceLevel;
  const category = input.category;
  if (typeof level !== "string" || !(EXPERIENCE_LEVELS as readonly string[]).includes(level)) return null;
  if (typeof category !== "string" || !(JOB_CATEGORIES as readonly string[]).includes(category)) return null;
  let min = years(input.experienceMin);
  let max = years(input.experienceMax);
  if (min !== null && max !== null && min > max) [min, max] = [max, min];
  return {
    experienceLevel: level as ExperienceLevel,
    experienceMin: min,
    experienceMax: max,
    batches: cleanBatches(input.batches),
    degrees: cleanDegreeList(Array.isArray(input.degrees) ? input.degrees.filter((d) => (DEGREES as readonly unknown[]).includes(d)) : []),
    skills: cleanSkillList(input.skills),
    category: category as JobCategory,
  };
}

/** Fill only low-confidence / empty fields. Identity fields (title, company, applyUrl, …) are never touched. */
export function applyFields(job: JobInput, fields: LlmFields, info: { model: string; cached: boolean }, force = false): JobInput {
  const meta = metaOf(job);
  const levelLow = force || meta.confidence?.level === "low";
  const categoryLow = force || meta.confidence?.category === "low" || job.category === "other";
  const hasYears = job.experienceMin !== null || job.experienceMax !== null;
  const out: JobInput = { ...job };
  if (levelLow) out.experienceLevel = fields.experienceLevel;
  if (!hasYears || (levelLow && job.experienceMax === null && job.experienceMin === 0 && fields.experienceMin !== null)) {
    out.experienceMin = fields.experienceMin ?? job.experienceMin;
    out.experienceMax = fields.experienceMax ?? job.experienceMax;
  }
  if (job.batches.length === 0 && fields.batches.length > 0) out.batches = fields.batches;
  if (job.degrees.length === 0 && fields.degrees.length > 0) out.degrees = fields.degrees;
  if (job.skills.length === 0 && fields.skills.length > 0) out.skills = fields.skills.slice(0, 12);
  if (categoryLow) out.category = fields.category;
  const newMeta = { ...meta, confidence: { level: levelLow ? "medium" : meta.confidence?.level, category: categoryLow ? "medium" : meta.confidence?.category }, llm: info };
  out.extra = { ...job.extra, normalize: newMeta };
  // Belt and braces: identity fields are copied back unchanged.
  out.title = job.title;
  out.company = job.company;
  out.applyUrl = job.applyUrl;
  out.fingerprint = job.fingerprint;
  return out;
}

function userPrompt(job: JobInput): string {
  const desc = (job.descriptionText ?? "").slice(0, MAX_DESCRIPTION_CHARS);
  const where = job.locations.map((l) => l.raw).join("; ") || (job.isRemote ? "Remote" : "unknown");
  return [
    `Title: ${job.title}`,
    `Company: ${job.company}`,
    `Location: ${where}`,
    `Job type: ${job.jobType}`,
    job.department ? `Department: ${job.department}` : null,
    "",
    "<posting>",
    desc,
    "</posting>",
    "",
    `Use the ${TOOL_NAME} tool to record the fields.`,
  ]
    .filter((l): l is string => l !== null)
    .join("\n");
}

/* ─────────────────────────── Client ─────────────────────────── */

type SdkModule = typeof import("@anthropic-ai/sdk");
let sdkPromise: Promise<SdkModule> | null = null;
let disabledReason: string | null = null;

async function loadSdk(): Promise<SdkModule> {
  sdkPromise ??= import("@anthropic-ai/sdk");
  return sdkPromise;
}

/** For tests: re-enable after an authentication failure disabled the module. */
export function resetLlmState(): void {
  disabledReason = null;
}

/**
 * Enrich one normalized job with the latest small Claude model. Returns the job unchanged when there is no key,
 * the record is already high-confidence, the model refuses, or any API error occurs.
 */
export async function enrichWithLLM(job: JobInput, opts: EnrichOptions = {}): Promise<JobInput> {
  const log = opts.log ?? (() => undefined);
  const apiKey = opts.apiKey === undefined ? (process.env.ANTHROPIC_API_KEY?.trim() ?? "") : (opts.apiKey ?? "");
  if (!opts.client && !apiKey) return job;
  if (!opts.force && !needsEnrichment(job)) return job;
  if (disabledReason && !opts.client) return job;

  const model = opts.model ?? (process.env.NORMALIZE_LLM_MODEL?.trim() || DEFAULT_LLM_MODEL);
  const cacheDir = opts.cacheDir === undefined ? defaultCacheDir() : opts.cacheDir;
  const cached = readCache(cacheDir, job.fingerprint, model);
  if (cached) return applyFields(job, cached, { model, cached: true }, opts.force);
  if (opts.cacheOnly) return job;

  let sdk: SdkModule | null = null;
  try {
    let client: LlmClient;
    if (opts.client) client = opts.client;
    else {
      sdk = await loadSdk();
      client = new sdk.default({ apiKey, timeout: opts.timeoutMs ?? 30_000, maxRetries: 2 });
    }
    const response = await client.messages.create({
      model,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      tools: [ENRICH_TOOL],
      // Claude Haiku 5.5 accepts a forced tool call (it skips thinking for it); strict: true guarantees the schema.
      tool_choice: { type: "tool", name: TOOL_NAME },
      output_config: { effort: "low" },
      messages: [{ role: "user", content: userPrompt(job) }],
    });
    if (response.stop_reason === "refusal" || response.stop_reason === "max_tokens") {
      log("llm: no usable answer", { fingerprint: job.fingerprint, stop_reason: response.stop_reason });
      return job;
    }
    const block = response.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use" && b.name === TOOL_NAME);
    const fields = block ? validateFields(block.input) : null;
    if (!fields) {
      log("llm: invalid tool output", { fingerprint: job.fingerprint });
      return job;
    }
    writeCache(cacheDir, job.fingerprint, model, fields);
    return applyFields(job, fields, { model, cached: false }, opts.force);
  } catch (error) {
    sdk ??= opts.client ? null : await loadSdk().catch(() => null);
    if (sdk && (error instanceof sdk.AuthenticationError || error instanceof sdk.PermissionDeniedError)) {
      disabledReason = error.message;
      log("llm: authentication failed — enrichment disabled for this process", { error: error.message });
    } else if (sdk && error instanceof sdk.RateLimitError) {
      log("llm: rate limited — skipping", { fingerprint: job.fingerprint });
    } else if (sdk && error instanceof sdk.APIError) {
      log("llm: API error — skipping", { status: error.status, error: error.message });
    } else {
      log("llm: request failed — skipping", { error: error instanceof Error ? error.message : String(error) });
    }
    return job;
  }
}

/** Enrich many jobs with bounded concurrency (order preserved). */
export async function enrichManyWithLLM(jobs: readonly JobInput[], opts: EnrichOptions & { concurrency?: number } = {}): Promise<JobInput[]> {
  const out: JobInput[] = new Array<JobInput>(jobs.length);
  let next = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(opts.concurrency ?? 4, jobs.length)) }, async () => {
    while (next < jobs.length) {
      const i = next++;
      out[i] = await enrichWithLLM(jobs[i] as JobInput, opts);
    }
  });
  await Promise.all(workers);
  return out;
}
