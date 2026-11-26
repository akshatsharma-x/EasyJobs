/** parsePost: WordPress post → RawJob[] (one per role) or a skip reason. Pure & synchronous. */
import type { RawJob } from "@easyjobs/contract";
import type { WpPost } from "../wp/types";
import type { WpJobBlogConfig } from "../wp/config";
import { buildContentModel, isJunkLine, modelText, type ContentModel } from "./dom";
import { extractKeyValues, firstValues, isNotAvailable, LOOSE_NA_FIELDS, type FieldKey, type KeyValue } from "./labels";
import { companyKey, extractCompany, type CompanyResult } from "./company";
import { bestApplyLink, scoreApplyLinks, type ApplyCandidate } from "./apply";
import { cleanRole, looksLikeRole, roleFromBody, roleFromTitle, roleFromValue } from "./role";
import { detectRoles, type RoleSpec } from "./roles";
import { classifyIntent } from "./intent";
import { cleanDescription } from "./description";
import { citiesIn, isRemoteText, splitLocations } from "./geo";
import {
  batchesFromValue, deadlineFromTitle, detectJobType, detectLevel, detectTags, detectWorkMode, experienceFromText,
  extractBatches, extractDegrees, parseDeadline, salaryFromTitle, salaryFromValue, type IntentSignals,
} from "./hints";
import { hostOf, registrableDomain } from "../util/url";
import { normalizeSpace, uniqueCi } from "../util/text";

export interface ParseContext {
  site: Pick<WpJobBlogConfig, "id" | "baseUrl" | "includeCategories" | "excludeCategories" | "ambiguousCategories">;
  /** Shortener resolution (url → final url); identity when absent. */
  resolveUrl?: (url: string) => string;
  /** Hosts of other blogs/aggregators (never apply links). */
  extraBlogHosts?: string[];
}

export interface ParsedPost {
  postId: number;
  modifiedGmt: string;
  status: "jobs" | "skipped";
  reason?: string;
  jobs: RawJob[];
  /** 0–1: how sure the heuristics are about company/role/apply link. */
  confidence: number;
  /** Debug info (not emitted). */
  debug?: { company?: CompanyResult; apply?: Pick<ApplyCandidate, "url" | "kind" | "score" | "reasons">[] };
}

const ELIGIBILITY_SECTION = /\b(?:eligib|qualif|who can apply|education|criteria|requirement|skills|batch|degree|academic)/i;

function skip(post: WpPost, reason: string, debug?: ParsedPost["debug"]): ParsedPost {
  return { postId: post.id, modifiedGmt: post.modifiedGmt, status: "skipped", reason, jobs: [], confidence: 0, debug };
}

function sectionText(model: ContentModel, re: RegExp, selfHost: string): string[] {
  return model.lines.filter((l) => !l.inFaq && re.test(l.section) && !isJunkLine(l, selfHost)).map((l) => l.text);
}

function kvValue(kv: Partial<Record<FieldKey, KeyValue>>, key: FieldKey): string | null {
  const v = kv[key]?.value;
  return v && !isNotAvailable(v, LOOSE_NA_FIELDS.has(key)) ? normalizeSpace(v) : null;
}

/** Generic title from the programme kind when nothing more specific exists ("RBI Summer Placement" → "Summer Intern"). */
function fallbackRole(title: string): string | null {
  const t = title.toLowerCase();
  const season = /\b(summer|winter|spring|fall|autumn)\b/.exec(t)?.[1];
  const prefix = season ? `${season[0]!.toUpperCase()}${season.slice(1)} ` : "";
  if (/\bintern(?:ship)?s?\b|\bplacement\b/.test(t)) return `${prefix}Intern`;
  if (/\bapprentice/.test(t)) return "Apprentice";
  if (/\bfellowship\b/.test(t)) return "Fellow";
  if (/\btrainee/.test(t)) return "Trainee";
  return null;
}

function splitSkills(value: string | null): string[] {
  if (!value) return [];
  return uniqueCi(
    value
      .split(/\s*(?:,|\/|;|\||•|\band\b)\s*/i)
      .map((s) => s.replace(/\.$/, "").trim())
      .filter((s) => s.length >= 1 && s.length <= 40 && !/\b(?:good|strong|basic|knowledge|understanding|ability|skills?)\b/i.test(s)),
  ).slice(0, 12);
}

/** Everything derived from the post before role/job assembly (shared with the LLM input builder). */
export interface PostAnalysis {
  selfHost: string;
  model: ContentModel;
  kvs: KeyValue[];
  kv: Partial<Record<FieldKey, KeyValue>>;
  bodyLower: string;
  company: CompanyResult;
  cands: ApplyCandidate[];
}

export function analyzePost(post: WpPost, ctx: ParseContext, companyOverride?: string | null): PostAnalysis {
  const selfHost = hostOf(ctx.site.baseUrl) || hostOf(post.link);
  const model = buildContentModel(post.contentHtml, post.link);
  const kvs = extractKeyValues(model);
  const kv = firstValues(kvs);
  const bodyLower = `${post.title}\n${modelText(model, (l) => !l.inFaq && !isJunkLine(l, selfHost))}`.toLowerCase();
  const company: CompanyResult = companyOverride
    ? { name: companyOverride, source: "kv", candidates: [], confidence: 0.9 }
    : extractCompany({ kv, model, title: post.title, tags: post.tags, bodyLower });
  const names = uniqueCi([company.name ?? "", ...company.candidates.map((c) => c.name)].filter(Boolean));
  const keys = names.map(companyKey);
  const cands = scoreApplyLinks(model, { company: keys.length > 0 ? keys : null, selfHost, extraBlogHosts: ctx.extraBlogHosts, resolve: ctx.resolveUrl });
  return { selfHost, model, kvs, kv, bodyLower, company, cands };
}

/** Externally supplied facts (from the optional LLM pass) that replace the heuristics. */
export interface ParseOverrides {
  company?: string | null;
  roles?: RoleSpec[];
  source?: string;
}

export function parsePost(post: WpPost, ctx: ParseContext, overrides?: ParseOverrides): ParsedPost {
  const intent = classifyIntent(post, ctx.site);
  if (!intent.candidate) return skip(post, intent.reason ?? "not a job post");

  const { selfHost, model, kvs, kv, bodyLower, company, cands } = analyzePost(post, ctx, overrides?.company);
  if (!company.name) return skip(post, "no company", { company });

  const overrideUrl = overrides?.roles?.find((r) => r.applyUrl)?.applyUrl ?? null;
  const best = overrideUrl ? (cands.find((c) => c.url === overrideUrl) ?? null) : bestApplyLink(cands);
  const debug: ParsedPost["debug"] = { company, apply: cands.slice(0, 5).map(({ url, kind, score, reasons }) => ({ url, kind, score, reasons })) };
  if (!best) return skip(post, "no external apply link", debug);

  // ── Role(s)
  const kvRole = kvValue(kv, "role");
  let singleTitle: string | null = null;
  let roleSource = overrides?.roles ? (overrides.source ?? "override") : "kv";
  let multi: RoleSpec[] | null = overrides?.roles && overrides.roles.length > 1 ? overrides.roles : null;
  if (overrides?.roles?.length === 1) singleTitle = overrides.roles[0]!.title;
  if (!overrides?.roles) {
    if (kvRole) {
      const r = roleFromValue(kvRole, company.name);
      if (r && (looksLikeRole(r) || r.length <= 60)) singleTitle = r;
    }
    if (!singleTitle) {
      singleTitle = roleFromTitle(post.title, company.name);
      roleSource = "title";
    }
    if (!singleTitle) {
      singleTitle = roleFromBody(model, company.name);
      roleSource = "body";
    }
    multi = detectRoles(model, cands, company.name, singleTitle);
    if (!singleTitle && !multi) {
      // Last resort: generic title from the post kind ("Intern", "Apprentice", "Trainee"), qualified by a
      // department-ish field when present ("Learning & Development Intern").
      singleTitle = fallbackRole(post.title);
      roleSource = "fallback";
      const dept = kvValue(kv, "department")?.replace(/\s*\([^)]*\)/g, "").trim();
      if (singleTitle && dept && dept.length <= 50 && !/\b(?:intern|trainee|apprentice)\b/i.test(dept)) singleTitle = `${dept} ${singleTitle}`;
    }
  }
  if (!singleTitle && !multi) return skip(post, "no role", debug);
  if (singleTitle && /\b(?:job\s+simulations?|virtual\s+experience)\b/i.test(singleTitle)) return skip(post, "non-job title: job simulation", debug);

  // ── Shared fields
  const postedAt = post.dateGmt;
  const posted = new Date(postedAt);
  const eligibility = sectionText(model, ELIGIBILITY_SECTION, selfHost);
  const kvLocation = kvValue(kv, "location");
  const titleCities = citiesIn(post.title);
  let locations: string[] = kvLocation ? splitLocations(kvLocation) : [];
  // A KV value without any city ("Chhattisgarh", "Multiple") loses to explicit cities in the title.
  if (titleCities.length > 0 && (locations.length === 0 || (kvLocation && citiesIn(kvLocation).length === 0 && !/pan[\s-]?india|remote|work from home|multiple/i.test(kvLocation)))) locations = titleCities;
  if (locations.length === 0) {
    const venue = kvValue(kv, "venue");
    if (venue) locations = citiesIn(venue).slice(0, 3);
  }
  if (locations.length === 0 && /\b(?:pan[\s-]?india|multiple locations?)\b/i.test(post.title)) locations = [/pan[\s-]?india/i.test(post.title) ? "Pan India" : "Multiple Locations"];
  if (locations.length === 0 && isRemoteText(post.title)) locations = ["Remote"];

  const kvExperienceFull = kvValue(kv, "experience");
  const kvExperience = kvExperienceFull && kvExperienceFull.length > 40 ? experienceFromText(kvExperienceFull) ?? kvExperienceFull.slice(0, 40) : kvExperienceFull;
  const experienceRaw = kvExperience ?? experienceFromText(post.title) ?? experienceFromText(eligibility.join("\n"));
  const kvSalary = kvValue(kv, "salary");
  const salaryRaw = (kvSalary ? salaryFromValue(kvSalary) : null) ?? salaryFromTitle(post.title);
  const kvBatch = kv.batch?.value ?? null;
  const batchFromKv = kvBatch ? batchesFromValue(kvBatch, posted.getUTCFullYear()) : [];
  const batches = batchFromKv.length > 0 ? batchFromKv : extractBatches([post.title, ...eligibility, ...kvs.filter((k) => k.key === "qualification").map((k) => k.value)], posted.getUTCFullYear());
  const qualification = kvValue(kv, "qualification");
  const degrees = extractDegrees([qualification ?? "", ...eligibility, post.title]);
  const lastDateRaw = kvValue(kv, "lastDate");
  const validThrough = (lastDateRaw ? parseDeadline(lastDateRaw, posted) : null) ?? deadlineFromTitle(post.title, posted);
  const department = kvValue(kv, "department");
  const employmentTypeRaw = kvValue(kv, "jobType");
  const skills = splitSkills(kvValue(kv, "skills"));
  const descriptionHtml = cleanDescription(post.contentHtml, { baseUrl: post.link, selfHost, extraBlogHosts: ctx.extraBlogHosts });

  const signals: IntentSignals = {
    title: post.title,
    categories: post.categories.map((c) => c.slug),
    tags: post.tags.map((t) => t.slug),
    jobTypeValue: employmentTypeRaw,
    workModeValue: kvValue(kv, "workMode"),
    experienceValue: experienceRaw,
    text: bodyLower,
  };

  const roles: RoleSpec[] =
    multi ?? [overrides?.roles?.length === 1 ? { ...overrides.roles[0]!, applyUrl: overrides.roles[0]!.applyUrl ?? best.url } : { title: singleTitle!, applyUrl: best.url, source: "table" }];
  const jobs: RawJob[] = [];
  roles.forEach((role, i) => {
    const title = cleanRole(role.title, company.name) || role.title;
    const applyCand = cands.find((c) => c.url === (role.applyUrl ?? best.url)) ?? best;
    const roleLocations = role.locations && role.locations.length > 0 ? role.locations : locations;
    const mode = detectWorkMode([signals.workModeValue, kvLocation, employmentTypeRaw, role.locations?.join(" ")], `${post.title} ${title}`);
    const jobType = detectJobType(role.fields?.jobType ? { ...signals, jobTypeValue: role.fields.jobType } : signals, title);
    const roleValidThrough = role.fields?.lastDate ? parseDeadline(role.fields.lastDate, posted) : null;
    const rowExperience = role.fields?.experience && !isNotAvailable(role.fields.experience) ? role.fields.experience : null;
    const exp = rowExperience ?? experienceRaw;
    const level = detectLevel(jobType, signals, title, exp);
    const tags = detectTags(signals, title, mode.isRemote === true);
    const rowSalary = role.fields?.salary ? salaryFromValue(role.fields.salary) : null;
    const rowBatches = role.fields?.batch ? batchesFromValue(role.fields.batch, posted.getUTCFullYear()) : [];
    const rowDegrees = role.fields?.qualification ? extractDegrees([role.fields.qualification]) : [];
    const companyDomain =
      applyCand.kind === "company" && applyCand.companyMatch ? registrableDomain(hostOf(applyCand.url)) : null;

    const job: RawJob = {
      source: ctx.site.id,
      sourceKind: "aggregator",
      sourceJobId: `${post.id}#${i + 1}`,
      sourceUrl: post.link,
      target: null,
      applyUrl: applyCand.url,
      title,
      company: company.name!,
      locations: uniqueCi(roleLocations),
      descriptionHtml,
      postedAt,
    };
    if (companyDomain) job.companyDomain = companyDomain;
    const until = roleValidThrough ?? validThrough;
    if (until) job.validThrough = until;
    if (department) job.department = department;
    if (employmentTypeRaw) job.employmentTypeRaw = employmentTypeRaw;
    if (exp) job.experienceRaw = exp;
    const sal = rowSalary ?? salaryRaw;
    if (sal) job.salaryRaw = sal;
    job.jobType = jobType;
    if (level) job.experienceLevel = level;
    if (mode.workMode) job.workMode = mode.workMode;
    if (mode.isRemote !== undefined) job.isRemote = mode.isRemote;
    const b = rowBatches.length > 0 ? rowBatches : batches;
    if (b.length > 0) job.batches = b;
    const d = rowDegrees.length > 0 ? rowDegrees : degrees;
    if (d.length > 0) job.degrees = d;
    if (skills.length > 0) job.skills = skills;
    if (tags.length > 0) job.tags = tags;
    job.extra = {
      postId: post.id,
      postTitle: post.title,
      categories: signals.categories,
      applyLinkKind: applyCand.kind,
      applyLinkScore: applyCand.score,
      companySource: overrides?.company ? (overrides.source ?? "override") : company.source,
      roleSource: overrides?.roles ? (overrides.source ?? "override") : multi ? role.source : roleSource,
      roles: roles.length,
      ...(overrides?.source === "llm" ? { llm: true } : {}),
      ...(lastDateRaw ? { lastDateRaw } : {}),
      ...(kvValue(kv, "vacancies") ? { vacancies: kvValue(kv, "vacancies") } : {}),
      ...(kvValue(kv, "duration") ? { duration: kvValue(kv, "duration") } : {}),
      ...(kvValue(kv, "venue") ? { venue: kvValue(kv, "venue") } : {}),
      ...(kvValue(kv, "interviewDate") ? { interviewDate: kvValue(kv, "interviewDate") } : {}),
      ...(qualification ? { qualificationRaw: qualification } : {}),
    };
    jobs.push(job);
  });

  // Confidence: company source, role source, apply-link strength.
  const companyConf = company.confidence;
  const roleConf = overrides?.roles ? 0.85 : multi ? 0.9 : roleSource === "kv" ? 1 : roleSource === "title" ? 0.8 : roleSource === "body" ? 0.6 : 0.35;
  const applyConf = overrides?.roles ? 0.85 : Math.min(1, best.score / 100);
  const confidence = Math.round(Math.min(companyConf, roleConf, Math.max(0.3, applyConf)) * 100) / 100;
  return { postId: post.id, modifiedGmt: post.modifiedGmt, status: "jobs", jobs, confidence, debug };
}
