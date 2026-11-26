/**
 * Breezy HR public positions JSON (behind every {company}.breezy.hr portal):
 *   GET https://{company}.breezy.hr/json?verbose=true
 * `verbose=true` adds each position's HTML description, so one request covers the board.
 * Unknown subdomain → 404 (HTML). robots.txt is respected (it allows /json today).
 * `salary` is display text ("$75,000 – $80,000 / year", "$14 / hour"); "$" is resolved by the job's country
 * (a Toronto job's "$" is CAD — matches the CAD in the page's JSON-LD).
 */
import type { CompanyTarget, JobType, RawJob, WorkMode } from "@easyjobs/contract";
import { UnexpectedResponseError } from "../core/errors";
import { getBoardJson } from "../core/http";
import { buildJob } from "../core/job";
import type { AtsAdapter } from "../core/types";
import { jobTypeFromLabel } from "../lib/hints";
import { joinLocation, withCountry } from "../lib/location";
import { parseSalaryText } from "../lib/salary";
import { clean, extraOf, uniqStrings } from "../lib/text";
import { careersOrigin } from "../lib/tokens";

export interface BreezyLocation {
  country?: { name?: string | null; id?: string | null } | null;
  state?: { id?: string | null; name?: string | null } | null;
  city?: string | null;
  name?: string | null;
  is_remote?: boolean | null;
  remote_details?: { value?: string | null; label?: string | null } | null;
  primary?: boolean | null;
}

export interface BreezyPosition {
  id: string;
  friendly_id?: string | null;
  name?: string | null;
  url?: string | null;
  published_date?: string | null;
  type?: { id?: string | null; name?: string | null } | null;
  location?: BreezyLocation | null;
  locations?: BreezyLocation[] | null;
  department?: string | null;
  salary?: string | null;
  description?: string | null;
  company?: { name?: string | null; logo_url?: string | null; friendly_id?: string | null } | null;
}

export const breezyOrigin = (token: string): string => careersOrigin(token, "breezy.hr");
export const breezyPositionsUrl = (origin: string): string => `${origin}/json?verbose=true`;

const TYPE: Record<string, JobType> = {
  fulltime: "full_time",
  parttime: "part_time",
  contract: "contract",
  contracttohire: "contract",
  temporary: "temporary",
  seasonal: "temporary",
  internship: "internship",
  intern: "internship",
  perdiem: "part_time",
  freelance: "freelance",
};

const key = (v: unknown): string => clean(v)?.toLowerCase().replace(/[^a-z]/g, "") ?? "";

export function breezyWorkMode(loc: BreezyLocation | null | undefined): WorkMode | undefined {
  const value = key(loc?.remote_details?.value);
  if (value === "remote" || value === "remotelocation") return "remote";
  if (value === "hybrid") return "hybrid";
  if (value === "onsite" || value === "inoffice") return "onsite";
  return loc?.is_remote === true ? "remote" : undefined;
}

export function breezyLocationText(loc: BreezyLocation): string | null {
  const country = clean(loc.country?.name) ?? clean(loc.country?.id);
  const name = clean(loc.name);
  const composed = name ? withCountry(name, country) : joinLocation([loc.city, loc.state?.name, country]);
  if (composed) return composed;
  return loc.is_remote === true ? "Remote" : null;
}

export function mapBreezyPosition(p: BreezyPosition, target: CompanyTarget, origin: string): RawJob | null {
  const locs = p.locations?.length ? p.locations : p.location ? [p.location] : [];
  const primary = p.location ?? locs[0] ?? null;
  const salaryText = clean(p.salary);
  const typeId = key(p.type?.id);
  return buildJob("breezy", target, {
    sourceJobId: p.id,
    title: p.name,
    url: clean(p.url) ?? (p.friendly_id ? `${origin}/p/${encodeURIComponent(p.friendly_id)}` : null),
    company: p.company?.name,
    companyLogoUrl: p.company?.logo_url,
    locations: uniqStrings(locs.map(breezyLocationText)),
    descriptionHtml: p.description,
    postedAt: p.published_date,
    department: p.department,
    jobType: TYPE[typeId] ?? (typeId === "other" ? undefined : jobTypeFromLabel(p.type?.name)),
    employmentTypeRaw: p.type?.name,
    workMode: breezyWorkMode(primary),
    isRemote: typeof primary?.is_remote === "boolean" ? primary.is_remote : undefined,
    salary: salaryText ? parseSalaryText(salaryText, primary?.country?.id ?? primary?.country?.name) : null,
    salaryRaw: salaryText,
    extra: extraOf({ friendlyId: clean(p.friendly_id), remoteDetails: clean(primary?.remote_details?.label) }),
  });
}

export const breezy: AtsAdapter = {
  id: "breezy",
  name: "Breezy HR",
  ats: "breezy",
  endpoint: "https://{company}.breezy.hr/json?verbose=true",
  async *scrapeTarget(ctx) {
    const origin = breezyOrigin(ctx.target.token);
    const url = breezyPositionsUrl(origin);
    const positions = await getBoardJson<unknown>(ctx, url, { robots: true });
    if (!Array.isArray(positions)) throw new UnexpectedResponseError(url, "expected an array of positions");
    for (const p of positions as BreezyPosition[]) {
      const raw = clean(p?.id) ? mapBreezyPosition(p, ctx.target, origin) : null;
      if (raw) yield raw;
      else ctx.skip("missing id/title/url");
    }
  },
};
