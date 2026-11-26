/** Path segments that introduce a job detail page ("/job/…", "/jobs/123", "/job-details/…", "/JobDetail/…"). */
const JOB_SEGMENT = /^(?:jobs?|job-?details?|jobdetails?|job_detail|jobdetail|job-?posting|jobposting|positions?|postings?|openings?|vacanc(?:y|ies)|requisitions?|offres?|offre-d-emploi|stellenangebote?|empleos?|vagas?|careers?-?detail|jobdescription)$/i;
const JOB_SEGMENT_WITH_ID = /^(?:job|position|posting|opening|vacancy|requisition|req)[-_]\w*\d{3,}/i;
const NEGATIVE_SEGMENT = /^(?:search|search-?results?|searchjobs|category|categories|c|locations?|cities|countries|teams?|departments?|saved(?:-?jobs)?|alerts?|job-?alerts?|talent-?community|talentcommunity|login|signin|register|benefits|blog|events?|news|press|faq|about|life|culture|students?|apply|applybutton|preapply|email|share|map|sitemap)$/i;
const ID_QUERY = /^(?:jobid|job_id|jobreqid|job|id|reqid|req|requisitionid|postingid|gh_jid|pid|vacancyid|jobnumber)$/i;

/**
 * Heuristic: is this URL a single job posting page (not a listing, category or search page)?
 * `include` (target.extra.jobUrlPattern) overrides the heuristic when given.
 */
export function isLikelyJobUrl(raw: string, include?: RegExp, exclude?: RegExp): boolean {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (exclude?.test(raw)) return false;
  if (include) return include.test(raw);
  if (/\.(?:pdf|jpe?g|png|gif|svg|css|js|xml|gz|zip|docx?)$/i.test(u.pathname)) return false;
  if (/[?&](?:q|query|keyword|keywords|search|location)=/i.test(u.search)) return false;
  const segs = u.pathname.split("/").filter(Boolean).map((s) => decodeURIComponent(s));
  for (const [k] of u.searchParams) if (ID_QUERY.test(k) && /\d{3,}|[A-Z]{1,4}-?\d{3,}/i.test(u.searchParams.get(k) ?? "")) return !segs.some((s) => NEGATIVE_SEGMENT.test(s));
  const at = segs.findIndex((s) => JOB_SEGMENT.test(s) || JOB_SEGMENT_WITH_ID.test(s));
  if (at < 0) return false;
  if (segs.slice(0, at).some((s) => NEGATIVE_SEGMENT.test(s))) return false;
  const after = segs.slice(at + 1);
  if (after.some((s) => NEGATIVE_SEGMENT.test(s))) return false;
  // "/jobs" or "/en/jobs/" alone is a listing; a detail page has something after the keyword
  // (slug or id) — or an id inside the keyword segment itself ("job-12345").
  return after.length > 0 || JOB_SEGMENT_WITH_ID.test(segs[at] ?? "");
}

const ID_SEGMENT = /^(?:[A-Za-z]{1,6}[-_]?)?\d{4,}(?:[-_][A-Za-z0-9]+)?$/;

/**
 * Stable per-host job id from a URL: an id-like path segment (last one wins) or an id query
 * parameter; else the normalized path. Lets isKnown() run before the page is fetched.
 */
export function jobIdFromUrl(raw: string): string {
  const u = new URL(raw);
  const host = u.hostname.toLowerCase().replace(/^www\./, "");
  for (const [k, v] of u.searchParams) if (ID_QUERY.test(k) && v.trim()) return `${host}:${v.trim()}`;
  const segs = u.pathname.split("/").filter(Boolean).map((s) => decodeURIComponent(s));
  for (let i = segs.length - 1; i >= 0; i--) {
    const s = segs[i] ?? "";
    if (ID_SEGMENT.test(s)) return `${host}:${s}`;
  }
  // Slug-only URLs: the path is the identity (case-insensitive, no trailing slash).
  return `${host}:${u.pathname.replace(/\/+$/, "").toLowerCase() || "/"}`;
}

/** Canonical form used for de-duplication (no hash, no trailing slash, lowercase host). */
export function canonicalPageUrl(raw: string): string {
  const u = new URL(raw);
  u.hash = "";
  u.hostname = u.hostname.toLowerCase();
  const path = u.pathname.length > 1 ? u.pathname.replace(/\/+$/, "") : u.pathname;
  return `${u.protocol}//${u.host}${path}${u.search}`;
}

/** Compile an optional user-provided regex (target.extra), ignoring invalid ones. */
export function optionalRegex(source: string | undefined): RegExp | undefined {
  if (!source) return undefined;
  try {
    return new RegExp(source, "i");
  } catch {
    return undefined;
  }
}
