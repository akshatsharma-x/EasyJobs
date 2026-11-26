/**
 * Atlassian — the careers page's own listings endpoint (all jobs worldwide in one response).
 *
 *   GET https://www.atlassian.com/endpoint/careers/listings
 *   → [{ id, title, locations[] ("Bengaluru - India -   Bengaluru,  560071 India", "Remote - India - Remote",
 *        "Remote - Remote"), category ("Engineering", "Interns", "Graduates", …), type ("Full-Time" | absent),
 *        overview / responsibilities / qualifications / payRanges / compensation (HTML),
 *        applyUrl + portalJobPost { portalUrl, updatedDate "2026-11-09 12:21 PM" } on *.icims.com }]
 *
 * Applications run on iCIMS (several portals), not a public Greenhouse/Lever board. The listing
 * carries full descriptions, so there is no detail call (robots.txt only disallows
 * /company/careers/detail/*; the endpoint is allowed). The public job page is
 * https://www.atlassian.com/company/careers/details/{id}.
 *
 * India filter (client-side): a location naming India, or "Remote - APAC". "Remote - Remote" is a
 * generic tag Atlassian attaches next to office locations worldwide (mostly US/UK roles), so it
 * does not by itself mean "open to India".
 */
import type { ExperienceLevel, RawJob, WorkMode } from "@easyjobs/contract";
import {
  buildRawJob, defineCareerSite, detectJobType, isIndiaLocation, joinSections, postedAtFrom, uniqueStrings,
  type CompanyInfo,
} from "../lib";

export interface AtlassianListing {
  id: number;
  portalId?: number;
  title: string;
  locations?: string[] | null;
  category?: string | null;
  type?: string | null;
  overview?: string | null;
  responsibilities?: string | null;
  qualifications?: string | null;
  payRanges?: string | null;
  compensation?: string | null;
  applyUrl?: string | null;
  portalJobPost?: { portalId?: number; portalUrl?: string | null; id?: number; updatedDate?: string | null } | null;
}

export const ATLASSIAN: CompanyInfo = {
  slug: "atlassian",
  name: "Atlassian",
  domain: "atlassian.com",
  careersUrl: "https://www.atlassian.com/company/careers/all-jobs",
};

export const ATLASSIAN_LISTINGS_URL = "https://www.atlassian.com/endpoint/careers/listings";

export function atlassianJobUrl(id: number | string): string {
  return `https://www.atlassian.com/company/careers/details/${id}`;
}

/** "Bengaluru - India -   Bengaluru,  560071 India" → "Bengaluru, India"; "Remote - India - Remote" → "Remote - India". */
export function cleanAtlassianLocation(raw: string): string {
  const parts = raw.split(" - ").map((p) => p.replace(/\s+/g, " ").trim()).filter(Boolean);
  const first = parts[0] ?? "";
  const second = (parts[1] ?? "").replace(/\s+or Remote$/i, "").trim();
  if (/^remote$/i.test(first)) return !second || /^remote$/i.test(second) ? "Remote" : `Remote - ${second}`;
  if (!second || second.toLowerCase() === first.toLowerCase()) return first;
  return `${first}, ${second}`;
}

const isGenericRemote = (raw: string): boolean => /^remote\s*-\s*remote\s*$/i.test(raw.trim());

/** India office/remote, or an APAC-wide remote location. */
export function atlassianOpenToIndia(job: AtlassianListing): boolean {
  return (job.locations ?? []).some((l) => !isGenericRemote(l) && (isIndiaLocation(l) || /\bremote\b.*\bapac\b/i.test(l)));
}

/** "2026-11-09 12:21 PM" → ISO (iCIMS gives no zone; treated as UTC). */
export function parseAtlassianDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})\s+(\d{1,2}):(\d{2})\s*([AP]M)?$/i.exec(value.trim());
  if (!m) return postedAtFrom(value);
  let hour = Number(m[4]) % 12;
  if ((m[6] ?? "").toUpperCase() === "PM") hour += 12;
  if (!m[6]) hour = Number(m[4]);
  return postedAtFrom(new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), hour, Number(m[5]))).toISOString());
}

function atlassianLevel(category: string | null | undefined): ExperienceLevel | undefined {
  const c = (category ?? "").toLowerCase();
  if (c === "interns") return "intern";
  if (c === "graduates") return "fresher";
  return undefined;
}

function atlassianWorkMode(job: AtlassianListing): WorkMode | undefined {
  const relevant = (job.locations ?? []).filter((l) => !isGenericRemote(l) && (isIndiaLocation(l) || /\bapac\b/i.test(l)));
  if (relevant.length > 0 && relevant.every((l) => /^\s*remote\b/i.test(l))) return "remote";
  return undefined;
}

export function mapAtlassianJob(job: AtlassianListing): RawJob {
  const sourceUrl = atlassianJobUrl(job.id);
  const category = job.category ?? null;
  const jobType = detectJobType({ title: job.title, employmentType: job.type, categories: [category === "Interns" ? "Internship" : null] });
  return buildRawJob(ATLASSIAN, {
    sourceJobId: job.id,
    title: job.title,
    sourceUrl,
    applyUrl: sourceUrl,
    locations: uniqueStrings((job.locations ?? []).map(cleanAtlassianLocation)),
    descriptionHtml: joinSections([
      { body: job.overview },
      { title: "Responsibilities", body: job.responsibilities },
      { title: "Qualifications", body: job.qualifications },
      { title: "Compensation", body: [job.payRanges, job.compensation].filter(Boolean).join("\n") || null },
    ]),
    postedAt: parseAtlassianDate(job.portalJobPost?.updatedDate),
    department: category,
    employmentTypeRaw: job.type ?? null,
    jobType,
    experienceLevel: jobType === "internship" ? "intern" : atlassianLevel(category),
    workMode: atlassianWorkMode(job),
    extra: {
      icimsUrl: job.portalJobPost?.portalUrl,
      icimsApplyUrl: job.applyUrl,
      icimsPortalId: job.portalId ?? job.portalJobPost?.portalId,
      rawLocations: job.locations,
      updatedDate: job.portalJobPost?.updatedDate,
    },
  });
}

export const atlassian = defineCareerSite<AtlassianListing>({
  company: ATLASSIAN,
  name: "Atlassian Careers",
  intervalMinutes: 60,
  endpointType: "json (single listings endpoint)",
  async *list(ctx) {
    const all = await ctx.http.json<AtlassianListing[]>(ATLASSIAN_LISTINGS_URL);
    if (!Array.isArray(all)) throw new Error("atlassian listings: expected a JSON array");
    ctx.reportTotal(all.length);
    yield* all;
  },
  idOf: (j) => j.id,
  keep: (j) => atlassianOpenToIndia(j),
  toRawJob: (j) => mapAtlassianJob(j),
});
