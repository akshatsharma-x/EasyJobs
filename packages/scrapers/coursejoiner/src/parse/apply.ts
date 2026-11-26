/** Apply-link candidate extraction and scoring. */
import type { ContentModel, Line, LinkRef } from "./dom";
import { labelToField } from "./labels";
import { classifyUrl, REJECTED_KINDS, type LinkKind } from "./hosts";
import { urlMatchesCompany, type CompanyKey } from "./company";
import { looksLikeRole } from "./role";
import { isRootUrl, looksJobSpecific, parseUrl, stripTracking } from "../util/url";

export interface ApplyCandidate {
  url: string;
  kind: LinkKind;
  score: number;
  companyMatch: boolean;
  specific: boolean;
  /** First occurrence (anchor text/context). */
  link: LinkRef;
  occurrences: LinkRef[];
  reasons: string[];
}

export interface ApplyScoringOptions {
  /** Keys of the chosen company name and its alternative spellings (title/tag/About candidates). */
  company: CompanyKey | CompanyKey[] | null;
  selfHost: string;
  extraBlogHosts?: string[];
  /** Maps a (shortener) URL to its resolved destination. */
  resolve?: (url: string) => string;
}

/** Minimum score for a link to count as an apply link. */
export const MIN_APPLY_SCORE = 30;

const APPLY_TEXT = /\b(?:apply(?:\s+(?:here|now|online|link|today|on|at|via|for))?|click here to apply|register(?:\s+(?:here|now))?|registration(?:\s+link)?|application (?:form|link)|i am interested|submit (?:your )?application|official (?:job )?(?:apply )?link|direct (?:apply )?link)\b/i;
const OFFICIAL_TEXT = /\b(?:official (?:website|site|portal|career(?:s)?(?: (?:page|portal|site))?|notification)|career(?:s)? (?:page|portal|site)|job (?:page|listing|post(?:ing)?)|more details|job details|listing)\b/i;
const NEGATIVE_TEXT = /\b(?:read more|also read|related|recommended|similar (?:jobs|posts)|you may also like|privacy|terms|telegram|whatsapp|youtube|instagram|subscribe|download (?:the )?app|course|syllabus|previous (?:year )?papers?|mock test|admit card|result|answer key|join (?:our|the|us)|follow us|resume (?:template|builder)|map|directions)\b/i;
const APPLY_SECTION = /\b(?:how to apply|apply(?:ing)?|application (?:process|link)|registration|important links?|links?)\b/i;

/** "careers.irco.com/job/…", "jobs.example.com", "example.com/careers/…" — a company-run careers site. */
export function isCareerSite(url: string): boolean {
  const u = parseUrl(url);
  if (!u) return false;
  const first = u.hostname.toLowerCase().replace(/^www\./, "").split(".")[0] ?? "";
  if (/^(?:careers?|jobs?|apply|hiring|recruit(?:ment|ing)?|talent|joinus|join|workwithus|opportunities|vacancies)$/.test(first)) return true;
  return /^\/(?:[a-z]{2}(?:[-_][a-z]{2})?\/)?(?:careers?|jobs?|job-openings|vacancies|join-us|work-with-us)(?:\/|$)/i.test(u.pathname) && looksJobSpecific(url);
}

/** Canonical grouping key: host (no www) + path (no trailing slash) + query. */
export function linkKey(url: string): string {
  const u = parseUrl(url);
  if (!u) return url;
  return `${u.hostname.toLowerCase().replace(/^www\./, "")}${u.pathname.replace(/\/+$/, "")}${u.search}`;
}

function lineLabelIsApply(line: Line | undefined, link: LinkRef): "apply" | "website" | null {
  if (!line) return null;
  const before = link.before || "";
  const label = /([A-Za-z][A-Za-z0-9 /&().'’+-]{1,70}?)\s*(?::-|:|：|–|—|-)\s*(?:[^:]*)?$/.exec(before)?.[1] ?? before.replace(/[:\s–—-]+$/, "");
  const key = labelToField(label.trim());
  if (key === "applyLink") return "apply";
  if (key === "website") return "website";
  // Table rows: label in the first cell.
  if (line.cells && link.cellIdx !== undefined && link.cellIdx > 0) {
    const cellKey = labelToField(line.cells[0]?.text ?? "");
    if (cellKey === "applyLink") return "apply";
    if (cellKey === "website") return "website";
  }
  return null;
}

export function scoreApplyLinks(model: ContentModel, opts: ApplyScoringOptions): ApplyCandidate[] {
  const groups = new Map<string, ApplyCandidate>();
  const total = Math.max(1, model.lines.length);
  for (const link of model.links) {
    const resolved = stripTracking(opts.resolve ? opts.resolve(link.href) : link.href);
    let kind = classifyUrl(resolved, { selfHost: opts.selfHost, extraBlogHosts: opts.extraBlogHosts });
    const companyMatch = urlMatchesCompany(resolved, opts.company);
    if (REJECTED_KINDS.has(kind) && !(kind === "blog" && companyMatch)) continue;
    if (kind === "other" && (companyMatch || isCareerSite(resolved))) kind = "company";
    const key = linkKey(resolved);
    const existing = groups.get(key);
    if (existing) {
      existing.occurrences.push(link);
      continue;
    }
    groups.set(key, { url: resolved, kind, score: 0, companyMatch, specific: looksJobSpecific(resolved), link, occurrences: [link], reasons: [] });
  }

  for (const c of groups.values()) {
    const r: string[] = [];
    let s = 0;
    // "company" without a name match = careers-style host of unknown ownership (could be another company).
    const base: Record<string, number> = { ats: 50, company: c.companyMatch ? 45 : 30, job_board: 25, form: 20, shortener: 12, pdf: 5, other: 10, blog: 20 };
    s += base[c.kind] ?? 0;
    r.push(`kind:${c.kind}`);
    if (c.companyMatch) {
      const bonus: Record<string, number> = { ats: 25, company: 20, job_board: 10, form: 15, blog: 0 };
      s += bonus[c.kind] ?? 25;
      r.push("company-match");
    }
    if (c.specific) {
      s += 25;
      r.push("job-specific");
    } else if (c.kind === "job_board") {
      // A job board's search/company page is not an apply link.
      s -= 80;
      r.push("job-board-listing-page");
    } else if (isRootUrl(c.url)) {
      s -= 40;
      r.push("homepage");
    } else if (/\/(?:career|careers|jobs?|join|opportunit|vacanc|recruit|hiring|apply)/i.test(parseUrl(c.url)?.pathname ?? "")) {
      s += 5;
      r.push("careers-path");
    }
    let best = -Infinity;
    for (const occ of c.occurrences) {
      const line = model.lines[occ.lineIdx];
      let o = 0;
      const ctx = `${occ.before.slice(-60)} ${occ.text} ${occ.after.slice(0, 40)}`;
      if (APPLY_TEXT.test(occ.text)) o += 30;
      else if (APPLY_TEXT.test(occ.before.slice(-50))) o += 15;
      const label = lineLabelIsApply(line, occ);
      if (label === "apply") o += 35;
      else if (label === "website") o += 5; // "Official Website/Portal" is usually the generic careers page
      if (OFFICIAL_TEXT.test(ctx)) o += 4;
      if (NEGATIVE_TEXT.test(`${occ.text} ${occ.before.slice(-40)}`)) o -= 60;
      if (looksLikeRole(occ.text)) o += 8;
      if (line && APPLY_SECTION.test(line.section)) o += 10;
      if (line?.inFaq) o -= 10;
      if (occ.lineIdx < 3 && !APPLY_TEXT.test(occ.text)) o -= 5;
      if (occ.isButton) o += 5;
      o += Math.round((occ.lineIdx / total) * 4); // apply links tend to sit near the end
      best = Math.max(best, o);
    }
    s += best;
    const extra = Math.min(3, c.occurrences.length - 1);
    if (extra > 0) {
      s += extra * 5;
      r.push(`repeated:${c.occurrences.length}`);
    }
    c.score = s;
    c.reasons = r;
  }
  return [...groups.values()].sort((a, b) => b.score - a.score || a.link.order - b.link.order);
}

export function bestApplyLink(cands: ApplyCandidate[]): ApplyCandidate | null {
  const best = cands[0];
  return best && best.score >= MIN_APPLY_SCORE ? best : null;
}
