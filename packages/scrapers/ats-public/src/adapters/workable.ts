/**
 * Workable job widget API (public; used by Workable's embeddable job widget):
 *   GET https://apply.workable.com/api/v1/widget/accounts/{account}?details=true
 * Chosen over the v3 API (POST /api/v3/accounts/{account}/jobs + one v2 request per job for the
 * description) because ONE request returns every published job with description, requirements and
 * benefits. Verified: grouped by shortcode it matches v3 `total` exactly on every board tested.
 * Quirk: a job with N locations appears N times (same shortcode, one entry per location) — merged here.
 * Unknown account → 404 "Not Found". Workplace is only `telecommuting` (remote yes/no); hybrid is not exposed.
 */
import type { CompanyTarget, RawJob } from "@easyjobs/contract";
import { UnexpectedResponseError } from "../core/errors";
import { getBoardJson } from "../core/http";
import { buildJob } from "../core/job";
import type { AtsAdapter } from "../core/types";
import { htmlSection, joinHtml } from "../lib/html";
import { jobTypeFromLabel, levelFromLabel } from "../lib/hints";
import { joinLocation } from "../lib/location";
import { clean, extraOf, uniqStrings } from "../lib/text";
import { bareToken, tokenUrl } from "../lib/tokens";

export interface WorkableLocation {
  country?: string | null;
  countryCode?: string | null;
  city?: string | null;
  region?: string | null;
  hidden?: boolean | null;
}

export interface WorkableJob {
  title?: string | null;
  shortcode: string;
  code?: string | null;
  employment_type?: string | null;
  telecommuting?: boolean | null;
  department?: string | null;
  url?: string | null;
  shortlink?: string | null;
  application_url?: string | null;
  published_on?: string | null;
  created_at?: string | null;
  country?: string | null;
  city?: string | null;
  state?: string | null;
  education?: string | null;
  experience?: string | null;
  function?: string | null;
  industry?: string | null;
  locations?: WorkableLocation[] | null;
  description?: string | null;
  requirements?: string | null;
  benefits?: string | null;
}

export interface WorkableAccount {
  name?: string | null;
  description?: string | null;
  jobs?: WorkableJob[];
}

const API = "https://apply.workable.com/api/v1/widget/accounts";

/** "acme" | "https://apply.workable.com/acme/" | "https://apply.workable.com/acme/j/ABC123/" | "acme.workable.com" → "acme". */
export function workableToken(raw: string): string {
  const parsed = tokenUrl(raw, /(^|\.)workable\.com$/i);
  if (!parsed) return bareToken(raw);
  const { url, parts } = parsed;
  if (/^apply\.workable\.com$/i.test(url.hostname) || /^www\.workable\.com$/i.test(url.hostname)) {
    const p = parts[0] === "api" ? parts.slice(parts.indexOf("accounts") + 1) : parts;
    if (!p[0] || p[0] === "j") throw new Error(`Cannot read a Workable account from "${raw}"`);
    return p[0];
  }
  return url.hostname.split(".")[0]!;
}

export const workableAccountUrl = (account: string): string => `${API}/${encodeURIComponent(account)}?details=true`;

/** Groups the widget's per-location duplicates by shortcode, preserving board order. */
export function groupWorkableJobs(jobs: WorkableJob[]): WorkableJob[][] {
  const groups = new Map<string, WorkableJob[]>();
  for (const job of jobs) {
    const code = clean(job.shortcode);
    if (!code) continue;
    const group = groups.get(code);
    if (group) group.push(job);
    else groups.set(code, [job]);
  }
  return [...groups.values()];
}

export function workableLocations(entries: WorkableJob[]): string[] {
  const out: (string | null)[] = [];
  for (const e of entries) {
    const visible = (e.locations ?? []).filter((l) => l.hidden !== true);
    if (visible.length > 0) out.push(...visible.map((l) => joinLocation([l.city, l.region, l.country])));
    else out.push(joinLocation([e.city, e.state, e.country]));
  }
  const locations = uniqStrings(out);
  if (locations.length === 0 && entries.some((e) => e.telecommuting === true)) return ["Remote"];
  return locations;
}

export function mapWorkableJob(entries: WorkableJob[], target: CompanyTarget, account: string, accountName?: string | null): RawJob | null {
  const job = entries[0];
  if (!job) return null;
  const title = clean(job.title);
  const experience = clean(job.experience);
  const isInternship = /^internship$/i.test(experience ?? "");
  const remote = job.telecommuting === true;
  return buildJob("workable", target, {
    sourceJobId: job.shortcode,
    title,
    url: clean(job.url) ?? clean(job.shortlink) ?? `https://apply.workable.com/${encodeURIComponent(account)}/j/${encodeURIComponent(job.shortcode)}/`,
    company: accountName,
    locations: workableLocations(entries),
    descriptionHtml: joinHtml([job.description, htmlSection("Requirements", job.requirements), htmlSection("Benefits", job.benefits)]),
    postedAt: job.published_on ?? job.created_at,
    department: job.department,
    jobType: isInternship ? "internship" : jobTypeFromLabel(job.employment_type),
    employmentTypeRaw: job.employment_type,
    experienceLevel: levelFromLabel(experience, title),
    experienceRaw: experience,
    workMode: remote ? "remote" : undefined,
    isRemote: typeof job.telecommuting === "boolean" ? job.telecommuting : undefined,
    extra: extraOf({
      code: clean(job.code),
      education: clean(job.education),
      function: clean(job.function),
      industry: clean(job.industry),
      applyFormUrl: clean(job.application_url),
      countryCodes: uniqStrings(entries.flatMap((e) => (e.locations ?? []).map((l) => l.countryCode))),
    }),
  });
}

export const workable: AtsAdapter = {
  id: "workable",
  name: "Workable",
  ats: "workable",
  endpoint: `${API}/{account}?details=true`,
  async *scrapeTarget(ctx) {
    const account = workableToken(ctx.target.token);
    const url = workableAccountUrl(account);
    const data = await getBoardJson<WorkableAccount>(ctx, url);
    if (!Array.isArray(data?.jobs)) throw new UnexpectedResponseError(url, "expected { jobs: [...] }");
    const groups = groupWorkableJobs(data.jobs);
    for (const entries of groups) {
      const raw = mapWorkableJob(entries, ctx.target, account, data.name);
      if (raw) yield raw;
      else ctx.skip("missing id/title/url");
    }
  },
};
