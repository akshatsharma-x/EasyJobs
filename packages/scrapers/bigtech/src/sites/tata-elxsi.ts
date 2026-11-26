/**
 * Tata Elxsi — www.tataelxsi.com/careers/job-openings (the company's own CMS; robots.txt: Allow / for *).
 *
 * List (HTML): GET https://www.tataelxsi.com/careers/job-openings?page={1..N} (1-based pager, ~8 rows/page)
 *   row: <h5>RFH/07664</h5><h3>Title</h3><p>Bangalore/ Pune | 4 - 7 years | B.E, B.Tech, MCA | Role</p>
 *        <p>25 Nov 2026</p><a href="…/careers/job-openings/{slug}">Know More</a>
 * Detail (unknown ids only): GET https://www.tataelxsi.com/careers/job-openings/{slug} → <div class="jbpam1"> description.
 * Some openings are abroad (Coventry / Gaydon, US cities) → kept only when a location is in India.
 */
import type { RawJob } from "@easyjobs/contract";
import {
  absoluteUrl, buildRawJob, cleanInline, defineCareerSite, detectJobType, isIndiaLocation, isOpenToIndia, maxPagesFrom,
  parseExperienceYears, postedAtFrom, uniqueStrings, type CompanyInfo, type SiteContext,
} from "../lib";

export const TATA_ELXSI: CompanyInfo = {
  slug: "tata-elxsi",
  name: "Tata Elxsi",
  domain: "tataelxsi.com",
  careersUrl: "https://www.tataelxsi.com/careers/job-openings",
};

const LIST = "https://www.tataelxsi.com/careers/job-openings";

export function elxsiListUrl(page: number): string {
  return `${LIST}?page=${page}`;
}

export interface ElxsiRow {
  slug: string;
  url: string;
  title: string;
  reqId: string | null;
  /** City strings as listed ("Bangalore", "San Diego, CA"). */
  cities: string[];
  experienceRaw: string | null;
  degrees: string[];
  role: string | null;
  date: string | null;
}

export function parseElxsiList(html: string): { rows: ElxsiRow[]; lastPage: number | null } {
  const rows: ElxsiRow[] = [];
  const re = /<div class="jjbcdeo11">\s*<h5>([\s\S]*?)<\/h5>\s*<h3>([\s\S]*?)<\/h3>\s*<p>([\s\S]*?)<\/p>\s*<\/div>\s*<div class="jjbcdeo12">\s*<p>([\s\S]*?)<\/p>\s*<a href="([^"]+)"/g;
  for (const m of html.matchAll(re)) {
    const url = absoluteUrl(m[5], LIST);
    const slug = url ? /\/careers\/job-openings\/([^/?#]+)/.exec(url)?.[1] : null;
    if (!url || !slug) continue;
    const h5 = cleanInline(m[1]);
    const parts = cleanInline(m[3]).split("|").map((p) => p.trim());
    rows.push({
      slug,
      url,
      title: cleanInline(m[2]),
      reqId: /^RFH\//i.test(h5) ? h5 : null,
      cities: uniqueStrings((parts[0] ?? "").split("/")),
      experienceRaw: parts[1] || null,
      degrees: uniqueStrings((parts[2] ?? "").split(/[,/]/)),
      role: parts[3] || null,
      date: cleanInline(m[4]) || null,
    });
  }
  const pages = [...html.matchAll(/job-openings\?page=(\d+)/g)].map((m) => Number(m[1]));
  return { rows, lastPage: pages.length > 0 ? Math.max(...pages) : null };
}

/** Inner HTML of the first <div class="{cls}"> (balanced <div> nesting). */
export function innerDiv(html: string, cls: string): string | null {
  const open = new RegExp(`<div class="${cls}"[^>]*>`).exec(html);
  if (!open) return null;
  const start = open.index + open[0].length;
  const tag = /<(\/?)div\b[^>]*>/gi;
  tag.lastIndex = start;
  let depth = 1;
  for (let m = tag.exec(html); m; m = tag.exec(html)) {
    depth += m[1] ? -1 : 1;
    if (depth === 0) return html.slice(start, m.index).trim() || null;
  }
  return null;
}

export function parseElxsiJob(html: string): { descriptionHtml: string | null } {
  return { descriptionHtml: innerDiv(html, "jbpam1") };
}

export function elxsiLocation(city: string): string {
  return isIndiaLocation(city) && !/india/i.test(city) ? `${city}, India` : city;
}

export function mapElxsiJob(row: ElxsiRow, detail: { descriptionHtml: string | null } | null): RawJob {
  const years = parseExperienceYears(row.experienceRaw);
  const jobType = detectJobType({ title: row.title });
  return buildRawJob(TATA_ELXSI, {
    sourceJobId: row.slug,
    title: row.title,
    sourceUrl: row.url,
    locations: row.cities.map(elxsiLocation),
    descriptionHtml: detail?.descriptionHtml ?? null,
    postedAt: postedAtFrom(row.date),
    experienceRaw: row.experienceRaw,
    experienceMin: years?.min ?? null,
    experienceMax: years?.max ?? null,
    degrees: row.degrees,
    jobType,
    experienceLevel: jobType === "internship" ? "intern" : undefined,
    extra: { requisitionId: row.reqId, role: row.role && row.role !== row.title ? row.role : undefined },
  });
}

export const tataElxsi = defineCareerSite<ElxsiRow, { descriptionHtml: string | null }>({
  company: TATA_ELXSI,
  name: "Tata Elxsi Careers",
  intervalMinutes: 60,
  endpointType: "html (CMS job list + job pages)",
  async *list(ctx: SiteContext) {
    const maxPages = maxPagesFrom(ctx.env, 40);
    const seen = new Set<string>();
    let total = 0;
    let complete = false;
    for (let page = 1; page <= maxPages; page++) {
      if (ctx.signal.aborted) return;
      const { rows, lastPage } = parseElxsiList(await ctx.http.text(elxsiListUrl(page)));
      let fresh = 0;
      for (const row of rows) {
        if (seen.has(row.slug)) continue;
        seen.add(row.slug);
        fresh++;
        total++;
        yield row;
      }
      if (rows.length === 0 || fresh === 0 || (lastPage !== null && page >= lastPage)) {
        complete = true;
        break;
      }
    }
    if (!complete) ctx.markIncomplete?.(`listing truncated at maxPages=${maxPages}`);
    ctx.reportTotal(total);
  },
  idOf: (r) => r.slug,
  keep: (r) => isOpenToIndia(r.cities, false),
  detail: async (r, ctx) => parseElxsiJob(await ctx.http.text(r.url)),
  toRawJob: (r, d) => mapElxsiJob(r, d),
});
