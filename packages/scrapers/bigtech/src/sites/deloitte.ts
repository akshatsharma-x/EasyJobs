/**
 * Deloitte (USI — Deloitte's India offices) — usijobs.deloitte.com, an Avature portal ("careersUSI").
 *
 *   list:   GET https://usijobs.deloitte.com/en_US/careersUSI/SearchJobs/?jobRecordsPerPage=10&jobOffset={n}
 *           Server-rendered <article class="article--result" data-total="750"> tiles: title + link
 *           (…/JobDetail/<slug>/<id>), brand, legal entity, location. Avature caps pages at 10.
 *   detail: GET the JobDetail page (unknown ids only) → schema.org JobPosting JSON-LD
 *           (datePosted, description HTML, educationRequirements, internal requisition title with
 *           the level code, e.g. "USI - EH27 - L55 Manager, …").
 * robots.txt: "Allow: /{any}/careers" covers /en_US/careersUSI/…; everything else is disallowed.
 * The SearchJobs/feed/ RSS ignores paging (fixed 20 items), so it isn't used.
 * jobsindia.deloitte.com (Deloitte India member firm) no longer resolves (ENOTFOUND, Nov 2026).
 */
import type { ExperienceLevel, RawJob } from "@easyjobs/contract";
import {
  buildRawJob, cleanInline, defineCareerSite, detectJobType, extractJsonLdJobPostings, htmlToText, isOpenToIndia,
  maxPagesFrom, paginate, postedAtFrom, uniqueStrings, unescapeHtmlIfEscaped, type CompanyInfo, type SiteContext,
} from "../lib";

export const DELOITTE: CompanyInfo = {
  slug: "deloitte",
  name: "Deloitte",
  domain: "deloitte.com",
  careersUrl: "https://usijobs.deloitte.com/en_US/careersUSI",
};

const BASE = "https://usijobs.deloitte.com/en_US/careersUSI";
const PAGE_SIZE = 10;

export interface DeloitteTile {
  id: string;
  url: string;
  title: string;
  brand: string | null;
  legalEntity: string | null;
  /** "Hyderabad, Telangana, India" or "Multiple Locations". */
  location: string | null;
}

export function deloitteSearchUrl(offset: number): string {
  return `${BASE}/SearchJobs/?jobRecordsPerPage=${PAGE_SIZE}&jobOffset=${offset}`;
}

export function parseDeloitteSearch(html: string): { tiles: DeloitteTile[]; total: number | null } {
  const total = /data-total="(\d+)"/.exec(html)?.[1];
  const tiles: DeloitteTile[] = [];
  for (const m of html.matchAll(/<article class="article--result[\s\S]*?<\/article>/g)) {
    const block = m[0];
    const link = /<a href="([^"]*\/JobDetail\/[^"]*?\/(\d+))"[^>]*>([\s\S]*?)<\/a>/.exec(block);
    if (!link) continue;
    const subtitle = block.split("article__header__text__subtitle")[1] ?? "";
    const spans = [...subtitle.matchAll(/<span>([\s\S]*?)<\/span>/g)].map((s) => cleanInline(s[1]));
    // Spans are [brand, legal entity, location]; the brand itself mentions "India Offices".
    const isEntity = (s: string): boolean => /\b(private limited|pvt\.? ltd|limited liability partnership|llp|limited)\b/i.test(s);
    const location =
      spans.find((s) => /,\s*india$/i.test(s) || /^multiple locations$/i.test(s)) ??
      [...spans].reverse().find((s) => !/^deloitte\b/i.test(s) && !isEntity(s) && isOpenToIndia([s])) ??
      null;
    const legalEntity = spans.find((s) => s !== location && isEntity(s)) ?? null;
    const brand = spans.find((s) => s !== location && s !== legalEntity) ?? null;
    tiles.push({
      id: link[2]!,
      url: cleanInline(link[1]),
      title: cleanInline(link[3]),
      brand: brand ? brand.replace(/^Deloitte\s+I\s+/, "") : null,
      legalEntity,
      location,
    });
  }
  return { tiles, total: total ? Number(total) : null };
}

export interface DeloitteDetail {
  datePosted: string | null;
  descriptionHtml: string | null;
  requisitionTitle: string | null;
  education: string | null;
  validThrough: string | null;
}

export function parseDeloitteDetail(html: string): DeloitteDetail | null {
  const jp = extractJsonLdJobPostings(html)[0];
  if (!jp) return null;
  const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
  return {
    datePosted: str(jp.datePosted),
    descriptionHtml: str(jp.description) ? unescapeHtmlIfEscaped(str(jp.description)!) : null,
    requisitionTitle: str(jp.title),
    education: str(jp.educationRequirements),
    validThrough: str(jp.validThrough),
  };
}

/**
 * City list from a description: "Location: Mumbai, Hyderabad", "Location – Hyderabad/Bengaluru",
 * "Location - Hyderabad", or a "Locations" heading followed by "· Hyderabad, Bengaluru, Pune".
 */
export function locationsFromDescription(descriptionHtml: string | null): string[] {
  const text = htmlToText(descriptionHtml);
  if (!text) return [];
  const m =
    /\bLocations?\s*(?::|–|—|-)\s*([^\n]{2,200})/i.exec(text) ??
    /(?:^|\n)\s*(?:Job |Work )?Locations?\s*\n+\s*[·•*-]?\s*([^\n]{2,200})/i.exec(text);
  if (!m) return [];
  const line = m[1]!.split(/\b(?:Shift|Timings?|Qualifications?|Experience|Work you'?ll do)\b|#/i)[0]!;
  return uniqueStrings(
    line
      .split(/\s*(?:,|\/|;|\||\band\b|·|•)\s*/i)
      .map((c) => cleanInline(c).replace(/\.$/, ""))
      .filter((c) => c.length >= 3 && c.length <= 30 && isOpenToIndia([c]))
      .map((c) => `${c}, India`),
  );
}

/** Deloitte level code from the requisition title ("USI - EH27 - L55 Manager…" → "L55"). */
export function deloitteLevelCode(requisitionTitle: string | null): string | null {
  return requisitionTitle ? (/\bL(\d{2})\b/.exec(requisitionTitle)?.[0] ?? null) : null;
}

function deloitteLevel(title: string, reqTitle: string | null): ExperienceLevel | undefined {
  const s = `${title} ${reqTitle ?? ""}`;
  if (/\bintern(ship)?s?\b/i.test(s)) return "intern";
  if (/\b(campus|fresher|freshers|graduate trainee|new grad)\b/i.test(s)) return "fresher";
  return undefined;
}

export function mapDeloitteJob(tile: DeloitteTile, detail: DeloitteDetail | null): RawJob {
  const multi = !tile.location || /^multiple locations$/i.test(tile.location);
  // Multi-location: cities from the description (full record) — or "India" (the portal is India-only);
  // light records add nothing, so the stored union never gains a conflicting entry.
  const fromText = multi && detail ? locationsFromDescription(detail.descriptionHtml) : [];
  const locations = !multi ? [tile.location!] : detail ? (fromText.length > 0 ? fromText : ["India"]) : [];
  const jobType = detectJobType({ title: tile.title });
  return buildRawJob(DELOITTE, {
    sourceJobId: tile.id,
    title: tile.title,
    sourceUrl: tile.url,
    applyUrl: tile.url,
    locations,
    descriptionHtml: detail?.descriptionHtml ?? null,
    postedAt: detail ? postedAtFrom(detail.datePosted) : null,
    validThrough: detail?.validThrough ?? null,
    jobType,
    experienceLevel: jobType === "internship" ? "intern" : deloitteLevel(tile.title, detail?.requisitionTitle ?? null),
    degrees: detail?.education ? [detail.education] : [],
    extra: {
      legalEntity: tile.legalEntity,
      brand: tile.brand,
      requisitionTitle: detail?.requisitionTitle,
      levelCode: deloitteLevelCode(detail?.requisitionTitle ?? null),
      multipleLocations: multi || undefined,
    },
  });
}

export const deloitte = defineCareerSite<DeloitteTile, DeloitteDetail>({
  company: DELOITTE,
  name: "Deloitte USI Careers",
  intervalMinutes: 60,
  endpointType: "html (Avature SearchJobs) + JSON-LD job pages",
  async *list(ctx: SiteContext) {
    yield* paginate<DeloitteTile>({
      onTruncated: (reason) => ctx.markIncomplete?.(reason),
      pageSize: PAGE_SIZE,
      maxPages: maxPagesFrom(ctx.env, 150),
      signal: ctx.signal,
      idOf: (t) => t.id,
      fetchPage: async (i) => {
        const { tiles, total } = parseDeloitteSearch(await ctx.http.text(deloitteSearchUrl(i * PAGE_SIZE), { headers: { accept: "text/html" } }));
        if (i === 0 && tiles.length === 0) throw new Error("no job tiles on the first SearchJobs page — layout changed?");
        if (total !== null) ctx.reportTotal(total);
        return { items: tiles, total };
      },
    });
  },
  idOf: (t) => t.id,
  keep: (t) => !t.location || /^multiple locations$/i.test(t.location) || isOpenToIndia([t.location], true),
  async detail(t, ctx) {
    return parseDeloitteDetail(await ctx.http.text(t.url, { headers: { accept: "text/html" } }));
  },
  toRawJob(t, detail, ctx) {
    // Unknown job whose detail failed: retry next run instead of storing it without a description.
    if (!detail && !(ctx.isKnown?.(t.id, DELOITTE.slug) ?? false)) return null;
    return mapDeloitteJob(t, detail);
  },
});
