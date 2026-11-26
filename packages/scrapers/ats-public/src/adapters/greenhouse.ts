/**
 * Greenhouse Job Board API (public, documented: https://developers.greenhouse.io/job-board.html)
 *   GET https://boards-api.greenhouse.io/v1/boards/{token}/jobs?content=true&pay_transparency=true
 * One request returns the whole board. `content` is entity-escaped HTML. Unknown board → 404.
 * `pay_transparency=true` adds `pay_input_ranges` (cents, no interval field). Custom `metadata` fields are
 * board-specific; we read employment type / workplace / level from them when their names say so, and never
 * use metadata currency ranges (some boards expose internal budgets there).
 */
import type { CompanyTarget, RawJob, Salary } from "@easyjobs/contract";
import { UnexpectedResponseError } from "../core/errors";
import { getBoardJson } from "../core/http";
import { toIso } from "../lib/dates";
import { buildJob } from "../core/job";
import type { AtsAdapter } from "../core/types";
import { htmlToPlain, unescapeHtml } from "../lib/html";
import { isPersonalField, looksPersonal } from "../lib/privacy";
import { jobTypeFromLabel, levelFromLabel, stripOptionPrefix, workModeFromLabel } from "../lib/hints";
import { formatSalaryRaw, isPlausibleSalary, makeSalary, periodFromMagnitude, periodFromText, type SalaryPeriod } from "../lib/salary";
import { clean, extraOf, isRecord, truncate, uniqStrings } from "../lib/text";
import { bareToken, tokenUrl } from "../lib/tokens";

export interface GreenhouseMetadata {
  id?: number;
  name?: string | null;
  value?: unknown;
  value_type?: string | null;
}

export interface GreenhousePayRange {
  min_cents?: number | null;
  max_cents?: number | null;
  currency_type?: string | null;
  title?: string | null;
  blurb?: string | null;
}

export interface GreenhouseJob {
  id: number | string;
  internal_job_id?: number | null;
  title?: string | null;
  updated_at?: string | null;
  first_published?: string | null;
  requisition_id?: string | null;
  location?: { name?: string | null } | null;
  absolute_url?: string | null;
  content?: string | null;
  company_name?: string | null;
  language?: string | null;
  application_deadline?: string | null;
  departments?: { id?: number; name?: string | null; parent_id?: number | null }[] | null;
  offices?: { id?: number; name?: string | null; location?: string | null }[] | null;
  metadata?: GreenhouseMetadata[] | null;
  pay_input_ranges?: GreenhousePayRange[] | null;
}

export interface GreenhouseBoard {
  jobs?: GreenhouseJob[];
  meta?: { total?: number };
}

const API = "https://boards-api.greenhouse.io/v1/boards";

/**
 * "stripe", "https://boards.greenhouse.io/stripe", "https://job-boards.eu.greenhouse.io/stripe/jobs/1",
 * "https://boards.greenhouse.io/embed/job_board?for=stripe", "https://boards-api.greenhouse.io/v1/boards/stripe/jobs" → "stripe".
 */
export function greenhouseToken(raw: string): string {
  const parsed = tokenUrl(raw, /(^|\.)greenhouse\.io$/i);
  if (!parsed) return bareToken(raw);
  const { url, parts } = parsed;
  const forParam = url.searchParams.get("for");
  if (forParam) return forParam;
  if (parts[0] === "v1" && parts[1] === "boards" && parts[2]) return parts[2];
  if (parts[0] && parts[0] !== "embed") return parts[0];
  throw new Error(`Cannot read a Greenhouse board token from "${raw}"`);
}

export const greenhouseBoardUrl = (token: string): string =>
  `${API}/${encodeURIComponent(token)}/jobs?content=true&pay_transparency=true`;

/* ───────────── metadata → hints ───────────── */

const EMPLOYMENT_FIELD = /\b(employment|job|worker|employee|contract|position|time|work|hire)\s*(type|status|category|basis)\b|\bcommitment\b/i;
const WORKPLACE_FIELD =
  /\b(workplace|work\s*model|working\s*model|work\s*arrangement|work\s*setting|work\s*style|work\s*mode|location\s*type|remote|on-?site|hybrid|office\s*policy|working\s*pattern)\b/i;
const LEVEL_FIELD = /\b(job|career|experience|seniority|position|role)\s*(level|band)\b|\bseniority\b|^level$/i;
const YEARS_FIELD = /\byears?\s*(of\s*)?experience\b|\bexperience\s*(required|years)\b|\bmin(imum)?\.?\s*experience\b/i;
const IGNORE_FIELD = /\b(education|language|clearance|security|degree|study)\b/i;

const metadataValues = (m: GreenhouseMetadata): string[] => {
  if (m.value_type && /currency|url/i.test(m.value_type)) return [];
  const raw = Array.isArray(m.value) ? m.value : [m.value];
  return raw
    .map((v) => clean(v))
    .filter((v): v is string => v !== null && !looksPersonal(v))
    .map(stripOptionPrefix);
};

export interface GreenhouseHints {
  jobType?: RawJob["jobType"];
  workMode?: RawJob["workMode"];
  experienceLevel?: RawJob["experienceLevel"];
  employmentTypeRaw?: string;
  experienceRaw?: string;
  /** The metadata fields the hints came from (kept in extra.metadata). */
  fields: Record<string, string>;
}

export function greenhouseMetadataHints(metadata: GreenhouseMetadata[] | null | undefined, title: string | null): GreenhouseHints {
  const hints: GreenhouseHints = { fields: {} };
  for (const m of metadata ?? []) {
    const name = clean(m.name);
    if (!name) continue;
    const values = metadataValues(m);
    if (values.length === 0 || IGNORE_FIELD.test(name) || isPersonalField(name, values.join(" "))) continue;
    const relevant = [EMPLOYMENT_FIELD, WORKPLACE_FIELD, LEVEL_FIELD, YEARS_FIELD].some((re) => re.test(name));
    if (!relevant) continue; // other custom fields can be internal (budgets, backfill owners…) — not kept
    if (Object.keys(hints.fields).length < 8) hints.fields[truncate(name, 60)] = truncate(values.join(", "), 200);
    if (!hints.jobType && EMPLOYMENT_FIELD.test(name)) {
      const type = values.map((v) => jobTypeFromLabel(v)).find(Boolean);
      if (type) {
        hints.jobType = type;
        hints.employmentTypeRaw = values.join(", ");
      }
    }
    if (!hints.workMode && WORKPLACE_FIELD.test(name)) hints.workMode = workModeFromLabel(values);
    if (!hints.experienceLevel && LEVEL_FIELD.test(name)) {
      const level = values.map((v) => levelFromLabel(v, title)).find(Boolean);
      if (level) {
        hints.experienceLevel = level;
        hints.experienceRaw ??= values.join(", ");
      }
    }
    if (YEARS_FIELD.test(name)) hints.experienceRaw = values.join(", ");
  }
  return hints;
}

/* ───────────── pay ranges → salary ───────────── */

const rangeText = (r: GreenhousePayRange): string => [clean(r.title), htmlToPlain(r.blurb)].filter(Boolean).join(" ");

/**
 * pay_input_ranges → one Salary. Placeholder ranges (< 5 units) are dropped; an INR range is preferred
 * (India-first), otherwise the first currency listed. Zones in that currency are merged into one min–max.
 * The period comes from the range title/blurb ("Annual", "Monthly", "per hour"), else from an unambiguous
 * magnitude, else salary stays null and only salaryRaw is kept.
 */
export function greenhouseSalary(ranges: GreenhousePayRange[] | null | undefined): { salary: Salary | null; raw: string | null } {
  const valid = (ranges ?? []).filter((r) => {
    const max = Math.max(Number(r.min_cents) || 0, Number(r.max_cents) || 0) / 100;
    return typeof r.currency_type === "string" && /^[A-Z]{3}$/.test(r.currency_type) && max >= 5;
  });
  if (valid.length === 0) return { salary: null, raw: null };
  const currency = valid.some((r) => r.currency_type === "INR") ? "INR" : (valid[0]!.currency_type as string);
  const same = valid.filter((r) => r.currency_type === currency);
  const toUnits = (c: number | null | undefined): number | null => (typeof c === "number" && c > 0 ? c / 100 : null);
  // The range title's period wins unless the amounts contradict it ("…Hourly Rate" over USD 222,500).
  const periodOf = (r: GreenhousePayRange): SalaryPeriod | null => {
    const min = toUnits(r.min_cents);
    const max = toUnits(r.max_cents);
    const stated = periodFromText(rangeText(r));
    return stated && isPlausibleSalary(min, max, currency, stated) ? stated : periodFromMagnitude(min, max, currency);
  };
  const period = periodOf(same[0]!);
  const group = same.filter((r) => periodOf(r) === period);
  const mins = group.map((r) => toUnits(r.min_cents)).filter((n): n is number => n !== null);
  const maxs = group.map((r) => toUnits(r.max_cents)).filter((n): n is number => n !== null);
  const min = mins.length > 0 ? Math.min(...mins) : null;
  const max = maxs.length > 0 ? Math.max(...maxs) : null;
  const label = group.length === 1 ? clean(same[0]!.title) : null;
  const raw = `${formatSalaryRaw(min, max, currency, period)}${label ? ` (${label})` : ""}`;
  return { salary: makeSalary({ min, max, currency, period, raw }), raw };
}

/* ───────────── job mapping ───────────── */

const GENERIC_LOCATION = /^(multiple|various|several|many|all)\b|^(see|refer to) (description|posting)/i;

export function greenhouseLocations(job: GreenhouseJob): string[] {
  const name = clean(job.location?.name);
  const offices = uniqStrings((job.offices ?? []).map((o) => clean(o.location) ?? clean(o.name)));
  if (name && !GENERIC_LOCATION.test(name)) return [name];
  return offices.length > 0 ? offices : name ? [name] : [];
}

export function mapGreenhouseJob(job: GreenhouseJob, target: CompanyTarget, token: string): RawJob | null {
  const id = clean(job.id);
  const title = clean(job.title);
  const hints = greenhouseMetadataHints(job.metadata, title);
  const pay = greenhouseSalary(job.pay_input_ranges);
  const department = (job.departments ?? []).map((d) => clean(d.name)).find((d) => d && !/^no department$/i.test(d));
  const fallbackUrl = id ? `https://job-boards.greenhouse.io/${encodeURIComponent(token)}/jobs/${id}` : null;
  return buildJob("greenhouse", target, {
    sourceJobId: id,
    title,
    url: clean(job.absolute_url) ?? fallbackUrl,
    company: job.company_name,
    locations: greenhouseLocations(job),
    descriptionHtml: unescapeHtml(job.content),
    postedAt: job.first_published ?? job.updated_at,
    validThrough: job.application_deadline,
    department,
    jobType: hints.jobType,
    workMode: hints.workMode,
    experienceLevel: hints.experienceLevel,
    employmentTypeRaw: hints.employmentTypeRaw,
    experienceRaw: hints.experienceRaw,
    salary: pay.salary,
    salaryRaw: pay.raw,
    extra: extraOf({
      internalJobId: job.internal_job_id ?? undefined,
      requisitionId: clean(job.requisition_id),
      updatedAt: toIso(job.updated_at),
      language: clean(job.language),
      companyName: clean(job.company_name),
      offices: uniqStrings((job.offices ?? []).map((o) => o.name)),
      departments: uniqStrings((job.departments ?? []).map((d) => d.name)),
      metadata: hints.fields,
      payRanges: (job.pay_input_ranges ?? [])
        .filter((r): r is GreenhousePayRange => isRecord(r))
        .slice(0, 6)
        .map((r) => ({ title: clean(r.title), currency: r.currency_type, min: (r.min_cents ?? 0) / 100, max: (r.max_cents ?? 0) / 100 })),
    }),
  });
}

export const greenhouse: AtsAdapter = {
  id: "greenhouse",
  name: "Greenhouse",
  ats: "greenhouse",
  endpoint: `${API}/{token}/jobs?content=true&pay_transparency=true`,
  async *scrapeTarget(ctx) {
    const token = greenhouseToken(ctx.target.token);
    const url = greenhouseBoardUrl(token);
    const board = await getBoardJson<GreenhouseBoard>(ctx, url);
    // A malformed 200 must fail the run — treating it as an empty board would let the worker sweep every job.
    if (!Array.isArray(board?.jobs)) throw new UnexpectedResponseError(url, "expected { jobs: [...] }");
    const jobs = board.jobs;
    ctx.log.debug(`board has ${jobs.length} jobs`, { total: board.meta?.total });
    for (const job of jobs) {
      const raw = mapGreenhouseJob(job, ctx.target, token);
      if (raw) yield raw;
      else ctx.skip("missing id/title/url");
    }
  },
};
