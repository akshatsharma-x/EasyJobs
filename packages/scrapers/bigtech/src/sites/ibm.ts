/**
 * IBM — the search API the careers page (ibm.com/careers/search) calls.
 *
 *   POST https://www-api.ibm.com/search/api/v2
 *   { appId: "careers", scopes: ["careers2"], query: { bool: { must: [] } },
 *     post_filter: { term: { field_keyword_05: "India" } },
 *     size: 50, from: n, sort: [{ dcdate: "desc" }, { _id: "asc" }],
 *     lang: "zz", localeSelector: {}, sm: { query: "", lang: "zz" }, _source: [...] }
 *   → { hits: { total: { value }, hits: [{ _id, _source: { title, url, description (snippet), body (full
 *       text), dcdate "2026-11-24", field_keyword_05 country, _08 category, _17 work mode
 *       (Hybrid|Remote|""), _18 level (Professional|Entry Level|Internship), _19 "Bangalore, IN" } }] } }
 *
 * The API validates `_source`, `sort` and `aggs` against a whitelist; `body` (full description as
 * flattened text, followed by a facet/skills tail) and `dcdate` are allowed. Job pages
 * (careers.ibm.com/careers/JobDetail?jobId=N, Avature) answer bots with an AWS WAF challenge
 * (HTTP 202 + x-amzn-waf-action: challenge), so we never fetch them — the API has everything.
 */
import type { RawJob, WorkMode } from "@easyjobs/contract";
import {
  buildRawJob, defineCareerSite, detectJobType, escapeHtml, levelFromCategory, maxPagesFrom, pageSizeFrom, paginate,
  postJson, postedAtFrom, type CompanyInfo, type SiteContext,
} from "../lib";

export interface IbmSource {
  title: string;
  url: string;
  description?: string | null;
  body?: string | null;
  dcdate?: string | null;
  language?: string | null;
  entitled?: string | null;
  field_keyword_05?: string | null;
  field_keyword_08?: string | null;
  field_keyword_17?: string | null;
  field_keyword_18?: string | null;
  field_keyword_19?: string | null;
}

export interface IbmHit {
  _id: string;
  _source: IbmSource;
}

export interface IbmSearchResponse {
  hits?: { total?: { value?: number } | number; hits?: IbmHit[] };
  errors?: unknown;
}

export const IBM: CompanyInfo = {
  slug: "ibm",
  name: "IBM",
  domain: "ibm.com",
  careersUrl: "https://www.ibm.com/careers/search?field_keyword_05[0]=India",
};

export const IBM_SEARCH_URL = "https://www-api.ibm.com/search/api/v2";
const SOURCE_FIELDS = [
  "_id", "title", "url", "description", "body", "dcdate", "language", "entitled",
  "field_keyword_05", "field_keyword_08", "field_keyword_17", "field_keyword_18", "field_keyword_19",
];

export function ibmSearchBody(from: number, size: number, country = "India"): Record<string, unknown> {
  return {
    appId: "careers",
    scopes: ["careers2"],
    query: { bool: { must: [] } },
    post_filter: { term: { field_keyword_05: country } },
    size,
    from,
    sort: [{ dcdate: "desc" }, { _id: "asc" }],
    lang: "zz",
    localeSelector: {},
    sm: { query: "", lang: "zz" },
    _source: SOURCE_FIELDS,
  };
}

export function ibmJobId(url: string): string | null {
  try {
    return new URL(url).searchParams.get("jobId");
  } catch {
    return null;
  }
}

const titleCaseWord = (w: string): string => (w.length > 2 && w === w.toUpperCase() ? w[0] + w.slice(1).toLowerCase() : w);

/** "PUNE, IN" → "Pune, India"; "Multiple Cities" → "India". */
export function ibmLocation(raw: string | null | undefined, country: string | null | undefined): string | null {
  const loc = (raw ?? "").trim();
  const ctry = (country ?? "").trim();
  if (!loc || /^multiple (cities|locations)$/i.test(loc)) return ctry || null;
  const m = /^(.*?),\s*([A-Z]{2})$/.exec(loc);
  const city = (m ? m[1]! : loc).split(/\s+/).map(titleCaseWord).join(" ");
  return ctry ? `${city}, ${ctry}` : m ? `${city}, ${m[2]}` : city;
}

export interface IbmBodyParts {
  text: string;
  office: string | null;
  legalEntity: string | null;
  skillKeywords: string | null;
}

/**
 * Splits the flattened `body` into the description and the facet tail that IBM appends:
 * "<description> India Data & Analytics Hybrid Professional GURGAON, IN GURGAON (0063) IBM India Private Limited <skills…>".
 */
export function splitIbmBody(src: IbmSource): IbmBodyParts {
  const body = (src.body ?? "").replace(/\s+/g, " ").trim();
  const facets = [src.field_keyword_05, src.field_keyword_08, src.field_keyword_17, src.field_keyword_18, src.field_keyword_19]
    .map((f) => (f ?? "").trim())
    .filter(Boolean);
  const candidates = [facets.join(" "), facets.slice(0, 2).join(" ")].filter((c) => c.length > 0);
  for (const prefix of candidates) {
    const at = body.lastIndexOf(` ${prefix} `);
    const atEnd = at < 0 && body.endsWith(` ${prefix}`) ? body.length - prefix.length - 1 : at;
    if (atEnd <= 0) continue;
    let tail = body.slice(atEnd + prefix.length + 1).trim();
    if (prefix === candidates[1] && facets.length > 2) {
      // Fallback prefix: drop the remaining facet values from the start of the tail.
      for (const f of facets.slice(2)) if (tail.startsWith(`${f} `) || tail === f) tail = tail.slice(f.length).trim();
    }
    const office = /^(.*?\(\d{3,5}\))(?:\s+|$)/.exec(tail);
    if (office) tail = tail.slice(office[0].length);
    const entity = /^(IBM(?:\s+[^\s]+){0,6}?\s+(?:Private Limited|Pvt\.? Ltd\.?|Limited|Ltd\.?|Inc\.?|Corporation|Corp\.?|LLC|GmbH|S\.A\.|B\.V\.))(?:\s+|$)/.exec(tail);
    if (entity) tail = tail.slice(entity[0].length);
    return {
      text: body.slice(0, atEnd).trim(),
      office: office?.[1]?.trim() ?? null,
      legalEntity: entity?.[1]?.trim() ?? null,
      skillKeywords: tail.trim() || null,
    };
  }
  return { text: body, office: null, legalEntity: null, skillKeywords: null };
}

/** Flattened text with inline "•" bullets → <p>intro</p><ul><li>…</li></ul>. */
export function ibmTextToHtml(text: string): string | null {
  const t = text.trim();
  if (!t) return null;
  const [intro = "", ...bullets] = t.split(/\s+•\s+/);
  const parts: string[] = [];
  if (intro.trim()) parts.push(`<p>${escapeHtml(intro.trim())}</p>`);
  const items = bullets.map((b) => b.trim()).filter(Boolean);
  if (items.length > 0) parts.push(`<ul>${items.map((b) => `<li>${escapeHtml(b)}</li>`).join("")}</ul>`);
  return parts.join("\n") || null;
}

function ibmWorkMode(v: string | null | undefined): WorkMode | undefined {
  const s = (v ?? "").toLowerCase();
  return s === "hybrid" ? "hybrid" : s === "remote" ? "remote" : s === "onsite" || s === "on-site" ? "onsite" : undefined;
}

/** Title words that already say the level; IBM's broad "Professional" band then adds nothing. */
const IBM_TITLE_SENIORITY =
  /\b(?:senior|sr|staff|principal|lead|head|director|vp|vice president|chief|manager|architect|distinguished|fellow|intern|internship|junior|jr|associate|graduate|trainee|fresher|entry|apprentice)\b/i;

/**
 * IBM's level facet is "Entry Level" / "Professional" / "Internship". "Professional" is the experienced-hire band
 * (W2: 3,198 of 3,698 open IBM jobs defaulted to entry): "mid" unless the title states a level itself.
 */
export function ibmProfessionalLevel(level: string | null, title: string | null | undefined): "mid" | undefined {
  if (!level || !/^\s*professional\s*$/i.test(level)) return undefined;
  return title && IBM_TITLE_SENIORITY.test(title) ? undefined : "mid";
}

export function mapIbmHit(hit: IbmHit): RawJob | null {
  const src = hit._source;
  const id = ibmJobId(src.url);
  if (!id) return null;
  const sourceUrl = `https://careers.ibm.com/careers/JobDetail?jobId=${id}`;
  const parts = splitIbmBody(src);
  const level = src.field_keyword_18 ?? null;
  const jobType = detectJobType({ title: src.title, categories: [level] });
  const html = ibmTextToHtml(parts.text) ?? (src.description ? `<p>${escapeHtml(src.description)}</p>` : null);
  return buildRawJob(IBM, {
    sourceJobId: id,
    title: src.title,
    sourceUrl,
    applyUrl: sourceUrl,
    locations: [ibmLocation(src.field_keyword_19, src.field_keyword_05)],
    descriptionHtml: html,
    postedAt: postedAtFrom(src.dcdate),
    department: src.field_keyword_08 ?? null,
    jobType,
    experienceLevel: jobType === "internship" ? "intern" : (levelFromCategory(level) ?? ibmProfessionalLevel(level, src.title)),
    workMode: ibmWorkMode(src.field_keyword_17),
    extra: {
      careerLevel: level,
      office: parts.office,
      legalEntity: parts.legalEntity,
      skillKeywords: parts.skillKeywords,
      language: src.language,
      searchId: hit._id,
      descriptionTruncated: !parts.text && !!src.description,
    },
  });
}

export const ibm = defineCareerSite<IbmHit>({
  company: IBM,
  name: "IBM Careers",
  intervalMinutes: 60,
  endpointType: "json (search API POST)",
  async *list(ctx: SiteContext) {
    const size = pageSizeFrom(ctx.env, 50, 50);
    yield* paginate<IbmHit>({
      onTruncated: (reason) => ctx.markIncomplete?.(reason),
      pageSize: size,
      maxPages: maxPagesFrom(ctx.env, 150),
      signal: ctx.signal,
      idOf: (h) => h._id,
      fetchPage: async (i) => {
        const res = await postJson<IbmSearchResponse>(ctx.http, IBM_SEARCH_URL, ibmSearchBody(i * size, size));
        if (res.errors) throw new Error(`ibm search rejected the request: ${JSON.stringify(res.errors).slice(0, 200)}`);
        const totalRaw = res.hits?.total;
        const total = typeof totalRaw === "number" ? totalRaw : (totalRaw?.value ?? null);
        if (total !== null) ctx.reportTotal(total);
        return { items: res.hits?.hits ?? [], total };
      },
    });
  },
  idOf: (h) => ibmJobId(h._source?.url ?? "") ?? h._id,
  toRawJob: (h) => mapIbmHit(h),
});
