/**
 * Apple — jobs.apple.com (server-rendered React Router app). Every page embeds its data as
 *   <script>window.__staticRouterHydrationData = JSON.parse("{\"loaderData\":{…}}")</script>
 *
 *   List:   GET https://jobs.apple.com/en-in/search?location=india-INDC&sort=newest&page={n}   (20 per page, fixed)
 *           → loaderData.search { searchResults[], totalRecords, page }
 *             result: { id "<positionId>-<locCode>", positionId, postingTitle, transformedPostingTitle,
 *                       jobSummary (text), locations[{name, countryName, level}], postDateInGMT,
 *                       postingDate "25 Nov 2026", team{teamName, teamCode}, type REQ|PIPE,
 *                       managedPipelineRole, homeOffice, standardWeeklyHours, isMultiLocation }
 *   Detail: GET https://jobs.apple.com/en-in/details/{positionId}/{transformedPostingTitle}
 *           → loaderData.jobDetails.jobsData { description, minimumQualifications, preferredQualifications,
 *                       jobSummary, teamNames[], locations[], postingPostLocationData, jobType (CORPORATE|RETAIL), … }
 *
 * robots: jobs.apple.com has no robots.txt (it redirects to a 404 page → allow-all). Search pages
 * carry <meta name="robots" content="noindex,follow"> (links may be followed); detail pages are
 * indexable with a canonical URL. The JSON API (/api/role/search) needs an x-apple-csrf-token
 * session token, so it is NOT used.
 *
 * A multi-location position appears once per location (id suffix differs, same positionId), on the
 * same or the next page — merged here with a one-page lookahead.
 * Managed pipeline roles (evergreen retail pipelines) have a postDateInGMT that is refreshed
 * continuously; their real first posting date is in the detail's postingPostLocationData.
 */
import type { RawJob, WorkMode } from "@easyjobs/contract";
import {
  buildRawJob, cleanInline, defineCareerSite, detectJobType, joinSections, levelFromCategory, maxPagesFrom,
  pageSizeFrom, parseExperienceYears, postedAtFrom, uniqueStrings, type CompanyInfo, type SiteContext,
} from "../lib";

export interface AppleLocation {
  name?: string | null;
  countryName?: string | null;
  city?: string | null;
  stateProvince?: string | null;
  level?: number | null;
  postLocationId?: string | null;
  id?: string | null;
}

export interface AppleSearchResult {
  id: string;
  positionId: string;
  postingTitle: string;
  transformedPostingTitle?: string | null;
  jobSummary?: string | null;
  locations?: AppleLocation[] | null;
  postDateInGMT?: string | null;
  postingDate?: string | null;
  team?: { teamName?: string | null; teamCode?: string | null; teamID?: string | null } | null;
  type?: string | null;
  managedPipelineRole?: boolean | null;
  homeOffice?: boolean | null;
  standardWeeklyHours?: number | null;
  isMultiLocation?: boolean | null;
  reqId?: string | null;
}

export interface AppleJobDetails {
  positionId?: string | null;
  postingTitle?: string | null;
  jobSummary?: string | null;
  description?: string | null;
  minimumQualifications?: string | null;
  preferredQualifications?: string | null;
  teamNames?: string[] | null;
  locations?: AppleLocation[] | null;
  postDateInGMT?: string | null;
  postingPostLocationData?: Record<string, Record<string, { postingDate?: string | null } | null> | null> | null;
  jobType?: string | null;
  homeOffice?: boolean | null;
  type?: string | null;
  managedPipelineRole?: boolean | null;
}

export const APPLE: CompanyInfo = {
  slug: "apple",
  name: "Apple",
  domain: "apple.com",
  careersUrl: "https://jobs.apple.com/en-in/search?location=india-INDC",
};

const BASE = "https://jobs.apple.com";
/** Apple renders a fixed 20 results per page. */
const APPLE_PAGE_SIZE = 20;

export function appleSearchUrl(page: number): string {
  return `${BASE}/en-in/search?location=india-INDC&sort=newest&page=${page}`;
}

export function appleJobUrl(r: { positionId: string; transformedPostingTitle?: string | null }): string {
  const slug = r.transformedPostingTitle ? `/${encodeURIComponent(r.transformedPostingTitle)}` : "";
  return `${BASE}/en-in/details/${encodeURIComponent(r.positionId)}${slug}`;
}

/**
 * Extracts window.__staticRouterHydrationData from a page. Handles the current
 * `= JSON.parse("<json string literal>")` form and a plain object literal (drift tolerance).
 */
export function parseAppleHydration(html: string): Record<string, unknown> | null {
  const marker = /window\.__staticRouterHydrationData\s*=\s*/.exec(html);
  if (!marker) return null;
  let i = marker.index + marker[0].length;
  if (html.startsWith("JSON.parse(", i)) {
    i += "JSON.parse(".length;
    const quote = html[i];
    if (quote !== '"' && quote !== "'") return null;
    let j = i + 1;
    while (j < html.length && html[j] !== quote) j += html[j] === "\\" ? 2 : 1;
    let body = html.slice(i + 1, j);
    if (quote === "'") body = body.replace(/\\'/g, "'").replace(/"/g, '\\"');
    try {
      return JSON.parse(JSON.parse(`"${body}"`) as string) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
  if (html[i] === "{") {
    const end = html.indexOf("</script>", i);
    const raw = html.slice(i, end < 0 ? undefined : end).trim().replace(/;\s*$/, "");
    try {
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
  return null;
}

function loaderData(html: string): Record<string, unknown> {
  const data = parseAppleHydration(html);
  const ld = data?.loaderData;
  if (!ld || typeof ld !== "object") throw new Error("jobs.apple.com: hydration data not found (page layout changed?)");
  return ld as Record<string, unknown>;
}

export function parseAppleSearchPage(html: string): { results: AppleSearchResult[]; total: number | null; page: number | null } {
  const search = loaderData(html).search as { searchResults?: AppleSearchResult[]; totalRecords?: number; page?: number } | undefined;
  if (!search) throw new Error("jobs.apple.com: loaderData.search missing");
  return {
    results: Array.isArray(search.searchResults) ? search.searchResults.filter((r) => r && r.positionId && r.postingTitle) : [],
    total: typeof search.totalRecords === "number" ? search.totalRecords : null,
    page: typeof search.page === "number" ? search.page : null,
  };
}

export function parseAppleDetailPage(html: string): AppleJobDetails | null {
  const jd = (loaderData(html).jobDetails as { jobsData?: AppleJobDetails } | undefined)?.jobsData;
  return jd && typeof jd === "object" ? jd : null;
}

/**
 * "Hyderabad" (city-level) → "Hyderabad, India"; country-level → "India". The state is omitted on
 * purpose: list entries don't carry it, so light records and full records get identical labels.
 */
export function appleLocationLabel(l: AppleLocation): string {
  const name = cleanInline(l.name ?? l.city ?? "");
  const country = cleanInline(l.countryName ?? "");
  if (!name) return country;
  if (!country || name.toLowerCase() === country.toLowerCase()) return name;
  return `${name}, ${country}`;
}

function mergeLocations(into: AppleSearchResult, from: AppleSearchResult): void {
  const have = new Set((into.locations ?? []).map(appleLocationLabel));
  for (const l of from.locations ?? []) if (!have.has(appleLocationLabel(l))) (into.locations ??= []).push(l);
}

/** Earliest original posting date across locales/locations (managed pipeline roles). */
export function appleFirstPostingDate(d: AppleJobDetails | null): string | null {
  let best: number | null = null;
  for (const perLoc of Object.values(d?.postingPostLocationData ?? {})) {
    for (const v of Object.values(perLoc ?? {})) {
      const t = v?.postingDate ? Date.parse(v.postingDate) : Number.NaN;
      if (!Number.isNaN(t) && (best === null || t < best)) best = t;
    }
  }
  return best === null ? null : new Date(best).toISOString();
}

/** Retail titles are prefixed with the country ("IN-Business Expert"). */
export function cleanAppleTitle(title: string): string {
  return cleanInline(title).replace(/^IN\s*[-–]\s*/, "");
}

export function mapAppleJob(r: AppleSearchResult, d: AppleJobDetails | null): RawJob {
  const url = appleJobUrl(r);
  const teams = uniqueStrings([...(d?.teamNames ?? []), r.team?.teamName]);
  // The detail lists every location of the position; the list entry only those merged in this run.
  const locations = uniqueStrings((d?.locations?.length ? d.locations : (r.locations ?? [])).map(appleLocationLabel));
  const hours = typeof r.standardWeeklyHours === "number" ? r.standardWeeklyHours : null;
  const title = cleanAppleTitle(r.postingTitle);
  const jobType =
    detectJobType({ title, categories: teams }) ?? (hours === null ? undefined : hours >= 35 ? "full_time" : hours > 0 ? "part_time" : undefined);
  const remote = d?.homeOffice ?? r.homeOffice ?? null;
  const workMode: WorkMode | undefined = remote === true ? "remote" : undefined;
  const managed = r.managedPipelineRole === true || d?.managedPipelineRole === true;
  const postedAt = managed ? appleFirstPostingDate(d) : postedAtFrom(r.postDateInGMT ?? d?.postDateInGMT ?? r.postingDate);
  const years = parseExperienceYears(d?.minimumQualifications);
  return buildRawJob(APPLE, {
    sourceJobId: r.positionId,
    title,
    sourceUrl: url,
    applyUrl: url,
    locations,
    descriptionHtml: joinSections([
      { body: d?.jobSummary ?? r.jobSummary },
      { title: "Description", body: d?.description },
      { title: "Minimum Qualifications", body: d?.minimumQualifications },
      { title: "Preferred Qualifications", body: d?.preferredQualifications },
    ]),
    postedAt,
    department: teams.length > 0 ? teams.join(" / ") : null,
    employmentTypeRaw: hours !== null ? `${hours} hours/week` : null,
    jobType,
    experienceLevel: teams.map((t) => levelFromCategory(t)).find(Boolean),
    experienceRaw: years?.raw ?? null,
    experienceMin: years?.min ?? null,
    experienceMax: years?.max ?? null,
    workMode,
    ...(remote === true ? { isRemote: true } : {}),
    extra: {
      reqId: r.reqId,
      postingType: r.type ?? d?.type,
      managedPipelineRole: managed || null,
      appleJobType: d?.jobType,
      teamCode: r.team?.teamCode,
      postingTitle: title !== r.postingTitle ? r.postingTitle : null,
    },
  });
}

export const apple = defineCareerSite<AppleSearchResult, AppleJobDetails>({
  company: APPLE,
  name: "Apple Jobs",
  intervalMinutes: 60,
  endpointType: "html (embedded hydration JSON)",
  async *list(ctx: SiteContext) {
    const size = pageSizeFrom(ctx.env, APPLE_PAGE_SIZE, APPLE_PAGE_SIZE);
    const maxPages = maxPagesFrom(ctx.env, 50);
    // One-page lookahead: a multi-location position's other locations show up on the same or next page.
    let pending = new Map<string, AppleSearchResult>();
    let complete = false;
    for (let page = 1; page <= maxPages; page++) {
      const { results, total } = parseAppleSearchPage(await ctx.http.text(appleSearchUrl(page)));
      if (total !== null) ctx.reportTotal(total);
      const current = new Map<string, AppleSearchResult>();
      for (const r of results) {
        const prev = pending.get(r.positionId) ?? current.get(r.positionId);
        if (prev) mergeLocations(prev, r);
        else current.set(r.positionId, { ...r, locations: [...(r.locations ?? [])] });
      }
      yield* pending.values();
      pending = current;
      if (results.length < size || (total !== null && page * size >= total)) {
        complete = true;
        break;
      }
    }
    if (!complete) ctx.markIncomplete?.(`listing truncated at maxPages=${maxPages}`);
    yield* pending.values();
  },
  idOf: (r) => r.positionId,
  detail: async (r, ctx) => parseAppleDetailPage(await ctx.http.text(appleJobUrl(r))),
  toRawJob: (r, d) => mapAppleJob(r, d),
});
