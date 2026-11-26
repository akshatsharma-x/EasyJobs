/**
 * EY (Ernst & Young, incl. GDS India) — careers.ey.com, SAP SuccessFactors Recruiting Marketing (RMK).
 *
 * List (HTML; robots allows /ey/search/ and /ey/job/ — only /services/, /applybutton/, … are disallowed):
 *   GET https://careers.ey.com/ey/search/?locationsearch=India&sortColumn=referencedate&sortDirection=desc&startrow={n}
 *   → 25 <tr class="data-row"> per page (title link /ey/job/{slug}/{id}/, "City, ST, IN, PIN +N more…") and
 *     "Results 1 – 25 of 3335".
 * Detail (only for unknown ids): GET https://careers.ey.com/ey/job/{slug}/{id}/ → schema.org JobPosting
 *   microdata: datePosted / validThrough as Java Date strings ("Sat Nov 14 02:00:00 UTC 2026"), one
 *   itemprop="address" per location, span.jobdescription, and RMK custom fields (customfield3 = work
 *   arrangement, e.g. "Anywhere in Country"; customfield5 = requisition id).
 * The location search matches text, so rows are kept only when their country code is IN.
 */
import type { RawJob } from "@easyjobs/contract";
import {
  absoluteUrl, buildRawJob, cleanInline, decodeEntities, defineCareerSite, detectJobType, detectWorkMode, maxPagesFrom,
  postedAtFrom, readableIndiaLocation, toIsoDate, type CompanyInfo, type SiteContext,
} from "../lib";

export const EY: CompanyInfo = {
  slug: "ey",
  name: "EY",
  domain: "ey.com",
  careersUrl: "https://careers.ey.com/ey/search/?locationsearch=India",
};

const BASE = "https://careers.ey.com";

export function eySearchUrl(startrow: number): string {
  return `${BASE}/ey/search/?locationsearch=India&sortColumn=referencedate&sortDirection=desc&startrow=${startrow}`;
}

export interface EyRow {
  id: string;
  title: string;
  url: string;
  /** "Bengaluru, KA, IN, 560016" */
  location: string;
  country: string | null;
  moreLocations: number;
}

export interface EyDetail {
  title: string | null;
  descriptionHtml: string | null;
  datePosted: string | null;
  validThrough: string | null;
  locations: string[];
  workArrangement: string | null;
  requisitionId: string | null;
}

export function parseEySearch(html: string): { rows: EyRow[]; total: number | null } {
  const rows: EyRow[] = [];
  for (const m of html.matchAll(/<tr class="data-row"[\s\S]*?<\/tr>/g)) {
    const tr = m[0];
    const link = /<a[^>]+href="(\/ey\/job\/[^"]+?\/(\d+)\/)"[^>]*class="jobTitle-link"[^>]*>([\s\S]*?)<\/a>/.exec(tr)
      ?? /<a[^>]+class="jobTitle-link"[^>]+href="(\/ey\/job\/[^"]+?\/(\d+)\/)"[^>]*>([\s\S]*?)<\/a>/.exec(tr);
    if (!link) continue;
    const locHtml = /<span class="jobLocation">([\s\S]*?)<\/span>/.exec(tr)?.[1] ?? "";
    const more = /\+(\d+) more/.exec(decodeEntities(locHtml));
    const location = cleanInline(locHtml.replace(/<small[\s\S]*?<\/small>/, ""));
    const parts = location.split(",").map((p) => p.trim());
    rows.push({
      id: link[2] ?? "",
      title: cleanInline(link[3]),
      url: absoluteUrl(decodeEntities(link[1] ?? ""), BASE) ?? `${BASE}/ey/job/${link[2]}/`,
      location,
      country: parts.length >= 3 ? (parts[2] ?? null) : null,
      moreLocations: more ? Number(more[1]) : 0,
    });
  }
  const totalMatch = /Results\s*(?:<b>)?\s*[\d,]+\s*[–-]\s*[\d,]+\s*(?:<\/b>)?\s*of\s*(?:<b>)?\s*([\d,]+)/.exec(html);
  return { rows, total: totalMatch ? Number((totalMatch[1] ?? "").replace(/,/g, "")) : null };
}

const meta = (block: string, prop: string): string[] =>
  [...block.matchAll(new RegExp(`<meta itemprop="${prop}" content="([^"]*)"`, "g"))].map((m) => decodeEntities(m[1] ?? "").trim());

function careersiteField(html: string, id: string): string | null {
  const m = new RegExp(`data-careersite-propertyid="${id}"[^>]*>([\\s\\S]*?)</(?:span|div|p|h1)>`).exec(html);
  const v = cleanInline(m?.[1]);
  return v || null;
}

export function parseEyJob(html: string): EyDetail {
  const locations: string[] = [];
  for (const chunk of html.split(/itemprop="address"/).slice(1)) {
    const block = chunk.slice(0, 600);
    const city = meta(block, "addressLocality")[0];
    if (!city) continue;
    locations.push(readableIndiaLocation(city, meta(block, "addressRegion")[0], meta(block, "addressCountry")[0]));
  }
  const desc = /<span class="jobdescription">([\s\S]*?)<\/span>\s*<\/div>/.exec(html)?.[1]?.trim() ?? null;
  return {
    title: careersiteField(html, "title"),
    descriptionHtml: desc && desc.length > 0 ? desc : null,
    datePosted: meta(html, "datePosted")[0] ?? null,
    validThrough: meta(html, "validThrough")[0] ?? null,
    locations: [...new Set(locations)],
    workArrangement: careersiteField(html, "customfield3"),
    requisitionId: careersiteField(html, "customfield5"),
  };
}

export function mapEyJob(row: EyRow, detail: EyDetail | null): RawJob {
  const [city, region, country] = row.location.split(",").map((p) => p.trim());
  const fallbackLocation = readableIndiaLocation(city, region, country);
  const title = detail?.title ?? row.title;
  const arrangement = detail?.workArrangement ?? null;
  const jobType = detectJobType({ title });
  return buildRawJob(EY, {
    sourceJobId: row.id,
    title,
    sourceUrl: row.url,
    locations: detail && detail.locations.length > 0 ? detail.locations : [fallbackLocation],
    descriptionHtml: detail?.descriptionHtml ?? null,
    postedAt: postedAtFrom(detail?.datePosted),
    validThrough: toIsoDate(detail?.validThrough),
    jobType,
    experienceLevel: jobType === "internship" ? "intern" : undefined,
    // "Anywhere in Country" = may sit in any EY office in India — a location flexibility, not remote work.
    workMode: arrangement && !/anywhere in country/i.test(arrangement) ? detectWorkMode(arrangement) : undefined,
    extra: {
      requisitionId: detail?.requisitionId,
      workArrangement: arrangement,
      additionalLocations: row.moreLocations || undefined,
    },
  });
}

export const ey = defineCareerSite<EyRow, EyDetail>({
  company: EY,
  name: "EY Careers",
  intervalMinutes: 60,
  endpointType: "html (SuccessFactors RMK search + job microdata)",
  async *list(ctx: SiteContext) {
    const maxPages = maxPagesFrom(ctx.env, 160);
    const seen = new Set<string>();
    let start = 0;
    for (let page = 0; page < maxPages; page++) {
      if (ctx.signal.aborted) return;
      const { rows, total } = parseEySearch(await ctx.http.text(eySearchUrl(start)));
      if (total !== null) ctx.reportTotal(total);
      let fresh = 0;
      for (const row of rows) {
        if (seen.has(row.id)) continue;
        seen.add(row.id);
        fresh++;
        yield row;
      }
      if (rows.length === 0 || fresh === 0) return;
      start += rows.length;
      if (total !== null && start >= total) return;
    }
    ctx.markIncomplete?.(`listing truncated at maxPages=${maxPages}`);
  },
  idOf: (r) => r.id,
  keep: (r) => r.country === null || r.country === "IN",
  detail: async (r, ctx) => parseEyJob(await ctx.http.text(r.url)),
  toRawJob: (r, d) => mapEyJob(r, d),
});
