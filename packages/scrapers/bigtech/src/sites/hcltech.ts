/**
 * HCLTech — careers.hcltech.com (SAP SuccessFactors RMK, "SearchResultsUnify").
 *
 * www.hcltech.com/careers/* does not answer non-browser clients (HTTP/2 errors / timeouts behind
 * Akamai), but the actual job board, careers.hcltech.com, does. Its search and the /go/India/
 * landing page load jobs from POST /services/recruiting/v1/jobs with a page-embedded CSRF token,
 * and robots.txt disallows /services/ — so, like Wipro, this uses the allowed path:
 *   - list:   GET https://careers.hcltech.com/sitemap.xml → ~14k /job/<Title>/<postingId>/ (global)
 *   - detail: GET the job page (unknown ids only) → country token ("India"), "City, State"
 *             token(s) (several locations are concatenated without separators), description
 *             (Job Summary / Key Responsibilities / Skill Requirements / Other Requirements).
 * The slug carries no location, so the India filter needs the job page; postings found to be
 * outside India (or closed) are memoised in-process so later runs don't re-fetch them.
 * Job pages show no posting date → postedAt null (the pipeline falls back to first-seen).
 */
import type { RawJob } from "@easyjobs/contract";
import {
  buildRawJob, cleanInline, defineCareerSite, detectJobType, htmlToText, isIndiaLocation, uniqueStrings,
  type CompanyInfo, type SiteContext,
} from "../lib";
import { fetchRmkSitemap, parseRmkJobPage, SkipMemo, slugWords, type RmkJobPage, type RmkSitemapEntry } from "./_successfactors";

export const HCLTECH: CompanyInfo = {
  slug: "hcltech",
  name: "HCLTech",
  domain: "hcltech.com",
  careersUrl: "https://careers.hcltech.com/go/India/9553955/",
};

const ORIGIN = "https://careers.hcltech.com";

export interface HclPlace {
  country: string | null;
  /** "City, State" entries as shown on the page. */
  places: string[];
}

/**
 * "| Chennai, Tamil NaduBengaluru, Karnataka" → ["Chennai, Tamil Nadu", "Bengaluru, Karnataka"].
 * "Others, Karnataka" (city not given) → "Karnataka"; "Gautam Buddha Nagar" (the district HCLTech's
 * Noida campuses are in) → "Noida".
 */
export function splitHclLocations(text: string): string[] {
  const s = cleanInline(text).replace(/^\|\s*/, "");
  return uniqueStrings(
    s
      .replace(/([a-z)])(?=[A-Z][A-Za-z.()' -]*,\s)/g, "$1|")
      .split("|")
      .map((p) => p.trim().replace(/^Others,\s*/i, "").replace(/^Gautam Buddha Nagar\b/i, "Noida")),
  );
}

export function hclPlace(page: RmkJobPage): HclPlace {
  const title = (page.title ?? "").toLowerCase();
  const unlabelled = page.tokens.filter((t) => !t.label && t.text.length > 0 && t.text.length < 200);
  const country = unlabelled.find((t) => !t.text.includes(",") && !/\d/.test(t.text) && t.text.toLowerCase() !== title && t.text.length <= 40)?.text ?? null;
  const loc = unlabelled.find((t) => t.text.includes(",") && t.text.toLowerCase() !== title);
  return { country: country ? cleanInline(country) : null, places: loc ? splitHclLocations(loc.text) : [] };
}

export function isHclIndia(place: HclPlace): boolean {
  if (place.country) return /^india$/i.test(place.country);
  return place.places.some((p) => isIndiaLocation(p));
}

/** Short comma lists under "Skill Requirements" ("AWS , Linux , RHEL") → skills; prose → none. */
export function hclSkills(descriptionHtml: string | null): string[] {
  if (!descriptionHtml) return [];
  const m = /<h2[^>]*>\s*Skill Requirements\s*<\/h2>([\s\S]*?)(?=<h2|$)/i.exec(descriptionHtml);
  const text = cleanInline(htmlToText(m?.[1] ?? "") ?? "");
  if (!text || text.length > 250 || !/[,;|]/.test(text)) return [];
  return uniqueStrings(text.split(/\s*[,;|]\s*/)).filter((s) => s.length >= 2 && s.length <= 40).slice(0, 12);
}

export interface HclDetail {
  page: RmkJobPage;
}

export function mapHclJob(entry: RmkSitemapEntry, detail: HclDetail | null): RawJob {
  const title = slugWords(entry.slug);
  const page = detail?.page ?? null;
  const place = page ? hclPlace(page) : null;
  const descriptionHtml = page?.descriptions[0]?.replace(/\r\n?/g, "\n") ?? null;
  const india = place ? isHclIndia(place) : false;
  return buildRawJob(HCLTECH, {
    sourceJobId: entry.id,
    title,
    sourceUrl: entry.url,
    applyUrl: entry.url,
    locations: place ? place.places.map((p) => (india && !/india$/i.test(p) ? `${p}, India` : p)) : [],
    descriptionHtml,
    postedAt: null,
    jobType: detectJobType({ title }),
    skills: hclSkills(descriptionHtml),
    extra: {
      pageTitle: page?.title,
      country: place?.country,
      canonicalUrl: page?.canonicalUrl ?? undefined,
    },
  });
}

/** Postings dropped after a detail fetch (outside India, closed) — see SkipMemo. */
export const hclSkipped = new SkipMemo();

export const hcltech = defineCareerSite<RmkSitemapEntry, HclDetail>({
  company: HCLTECH,
  name: "HCLTech Careers",
  intervalMinutes: 60,
  endpointType: "sitemap.xml + job pages (SuccessFactors RMK HTML)",
  async *list(ctx: SiteContext) {
    const entries = await fetchRmkSitemap(ctx, ORIGIN);
    ctx.reportTotal(entries.length);
    yield* entries;
  },
  idOf: (e) => e.id,
  keep: (e) => !hclSkipped.has(e.id),
  async detail(e, ctx) {
    const html = await ctx.http.text(e.url, { headers: { accept: "text/html" } });
    return { page: parseRmkJobPage(html) };
  },
  toRawJob(e, detail, ctx) {
    if (detail) {
      if (detail.page.closed || !isHclIndia(hclPlace(detail.page))) {
        hclSkipped.add(e.id);
        return null;
      }
      return mapHclJob(e, detail);
    }
    // Known (stored earlier, hence an India posting) → light record; unknown + failed detail → retry next run.
    return ctx.isKnown?.(e.id, HCLTECH.slug) ? mapHclJob(e, null) : null;
  },
});
