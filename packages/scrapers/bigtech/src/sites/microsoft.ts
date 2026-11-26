/**
 * Microsoft — Eightfold "PCSX" career site at apply.careers.microsoft.com (the JSON the search
 * page itself calls; robots.txt explicitly allows /api/pcsx and /careers).
 *
 *   GET /api/pcsx/search?domain=microsoft.com&query=&location=India&start={n}&sort_by=timestamp
 *     → { status, data: { count, positions: [{ id, displayJobId, name, locations ["India, Karnataka, Bangalore"],
 *         standardizedLocations ["Bengaluru, KA, IN"], postedTs, creationTs, department, workLocationOption,
 *         positionUrl "/careers/job/{id}" }] } }                         (fixed page size of 10)
 *   GET /api/pcsx/position_details?position_id={id}&domain=microsoft.com&hl=en
 *     → { data: { jobDescription (HTML), publicUrl, efcustomTextWorkSite ["3 days / week in-office"],
 *         efcustomTextEmploymentType ["Full-Time"], efcustomTextRoletype, efcustomTextCurrentProfession,
 *         efcustomTextTaDisciplineName, efcustomTextRequiredTravel, … } }
 *
 * The classic Eightfold API (/api/apply/v2/jobs) answers 403 "Not authorized for PCSX", so P08's
 * eightfold adapter can't read this tenant — the registry should mark microsoft as custom (P09).
 * No token, cookie or login is needed. The site rate-limits cookieless clients hard (HTTP 429
 * after ~5 requests/minute), so this scraper keeps ≥ 15 s between requests (4/min), disables the contract
 * client's fast retries, backs off exponentially (30 s → 60 s → 120 s, or Retry-After) on 429 and fetches at most 30 details per run
 * (the rest are picked up by later runs).
 *
 * Levels: the site has an "Experience level" facet (…&filter_seniority=Intern|Entry|Mid-Level|…), but it
 * is model-inferred and contradicts titles (its "Entry" bucket holds "Software Engineer II" and
 * "Senior Researcher"; "Intern" holds a "Senior Researcher"), so it is NOT mapped — the normalizer
 * reads Microsoft's explicit title levels (II / Senior / Principal / IC3) instead.
 */
import type { RawJob, WorkMode } from "@easyjobs/contract";
import { HttpError, sleep } from "@easyjobs/contract/node";
import {
  buildRawJob, defineCareerSite, detectJobType, detectWorkMode, maxPagesFrom, paginate, postedAtFrom, uniqueStrings,
  type CompanyInfo, type SiteContext,
} from "../lib";

export interface MicrosoftPosition {
  id: number | string;
  displayJobId?: string | null;
  atsJobId?: string | null;
  name: string;
  locations?: string[] | null;
  standardizedLocations?: string[] | null;
  postedTs?: number | null;
  creationTs?: number | null;
  department?: string | null;
  workLocationOption?: string | null;
  locationFlexibility?: string | null;
  isHot?: number | null;
  positionUrl?: string | null;
}

export interface MicrosoftPositionDetails extends MicrosoftPosition {
  jobDescription?: string | null;
  publicUrl?: string | null;
  efcustomTextWorkSite?: string[] | null;
  efcustomTextRequiredTravel?: string[] | null;
  efcustomTextCurrentProfession?: string[] | null;
  efcustomTextTaDisciplineName?: string[] | null;
  efcustomTextRoletype?: string[] | null;
  efcustomTextEmploymentType?: string[] | null;
}

interface PcsxEnvelope<T> {
  status?: number;
  error?: { message?: string } | null;
  data?: T | null;
}

export type MicrosoftSearchResponse = PcsxEnvelope<{
  count?: number;
  positions?: MicrosoftPosition[];
  appliedFilters?: Record<string, string[] | undefined> | null;
}>;
export type MicrosoftDetailResponse = PcsxEnvelope<MicrosoftPositionDetails>;

export const MICROSOFT: CompanyInfo = {
  slug: "microsoft",
  name: "Microsoft",
  domain: "microsoft.com",
  careersUrl: "https://apply.careers.microsoft.com/careers?domain=microsoft.com&location=India",
};

const BASE = "https://apply.careers.microsoft.com";
const PAGE_SIZE = 10; // fixed by the API

export function microsoftSearchUrl(start: number): string {
  const p = new URLSearchParams({ domain: "microsoft.com", query: "", location: "India", start: String(start), sort_by: "timestamp" });
  return `${BASE}/api/pcsx/search?${p.toString()}`;
}

export function microsoftDetailUrl(id: string | number): string {
  return `${BASE}/api/pcsx/position_details?${new URLSearchParams({ position_id: String(id), domain: "microsoft.com", hl: "en" }).toString()}`;
}

export function microsoftJobUrl(id: string | number): string {
  return `${BASE}/careers/job/${id}`;
}

/** "India, Karnataka, Bangalore" → "Bangalore, Karnataka, India"; "India, Multiple Locations, Multiple Locations" → "India". */
export function microsoftLocation(raw: string): string {
  const parts = raw.split(",").map((p) => p.trim()).filter((p) => p && !/^multiple locations$/i.test(p));
  return parts.reverse().join(", ");
}

/** Microsoft's "N days / week in-office" work-site labels → work mode. */
export function microsoftWorkMode(workSite: string | null | undefined): WorkMode | undefined {
  const s = (workSite ?? "").toLowerCase();
  if (!s) return undefined;
  if (/fully on-?site|on-?site only/.test(s)) return "onsite";
  if (/\b0 days? \/ week in-office|\bremote\b|100% work from home/.test(s)) return "remote";
  if (/\b[1-4] days? \/ week in-office|up to \d+% work from home/.test(s)) return "hybrid";
  return detectWorkMode(s);
}

/* ─────────── throttling: one state object per run ─────────── */

interface RunState {
  detailsThrottled: boolean;
}
const runState = new WeakMap<object, RunState>();
const stateOf = (ctx: SiteContext): RunState => {
  let s = runState.get(ctx);
  if (!s) {
    s = { detailsThrottled: false };
    runState.set(ctx, s);
  }
  return s;
};

/**
 * GET JSON with this site's own 429 back-off (the contract client's 1–4 s retries are too eager here):
 * exponential from MICROSOFT_429_BACKOFF_MS (30 s → 60 s → 120 s), or the server's Retry-After if longer.
 */
async function getPolitely<T>(ctx: SiteContext, url: string, attempts = 4): Promise<T> {
  const base = Number(ctx.env.MICROSOFT_429_BACKOFF_MS ?? 30_000);
  for (let attempt = 1; ; attempt++) {
    const res = await ctx.http.fetch(url, { retries: 0, headers: { accept: "application/json" } });
    if (res.ok) return (await res.json()) as T;
    const body = await res.text().catch(() => "");
    if (res.status !== 429 || attempt >= attempts) throw new HttpError(res.status, url, body);
    const retryAfterS = Number(res.headers.get("retry-after"));
    const waitMs = Math.max(base * 2 ** (attempt - 1), Number.isFinite(retryAfterS) && retryAfterS > 0 ? retryAfterS * 1000 : 0);
    ctx.log.warn(`microsoft: 429 — backing off ${Math.round(waitMs / 1000)} s`, { url, attempt });
    await sleep(waitMs, ctx.signal);
  }
}

async function* searchPages(ctx: SiteContext): AsyncGenerator<MicrosoftPosition> {
  yield* paginate<MicrosoftPosition>({
    onTruncated: (reason) => ctx.markIncomplete?.(reason),
    pageSize: PAGE_SIZE,
    maxPages: maxPagesFrom(ctx.env, 100),
    signal: ctx.signal,
    idOf: (p) => String(p.id),
    fetchPage: async (i) => {
      const res = await getPolitely<MicrosoftSearchResponse>(ctx, microsoftSearchUrl(i * PAGE_SIZE));
      if (!res.data) throw new Error(`pcsx search: ${res.error?.message || `status ${res.status}`}`);
      if (typeof res.data.count === "number") ctx.reportTotal(res.data.count);
      return { items: res.data.positions ?? [], total: res.data.count ?? null };
    },
  });
}

export function mapMicrosoftPosition(pos: MicrosoftPosition, detail: MicrosoftPositionDetails | null): RawJob {
  const d = detail ?? null;
  const sourceUrl = d?.publicUrl ?? microsoftJobUrl(pos.id);
  const employment = d?.efcustomTextEmploymentType?.[0] ?? null;
  const workSite = d?.efcustomTextWorkSite?.[0] ?? null;
  const jobType = detectJobType({ title: pos.name, employmentType: employment });
  return buildRawJob(MICROSOFT, {
    sourceJobId: String(pos.id),
    title: d?.name ?? pos.name,
    sourceUrl,
    applyUrl: sourceUrl,
    locations: uniqueStrings((d?.locations ?? pos.locations ?? []).map(microsoftLocation)),
    descriptionHtml: d?.jobDescription ?? null,
    postedAt: postedAtFrom(pos.postedTs ?? d?.postedTs ?? pos.creationTs ?? null),
    department: d?.department ?? pos.department ?? null,
    employmentTypeRaw: employment,
    jobType,
    experienceLevel: jobType === "internship" ? "intern" : undefined,
    workMode: microsoftWorkMode(workSite),
    extra: {
      jobNumber: pos.displayJobId ?? pos.atsJobId ?? d?.displayJobId,
      workSite,
      roleType: d?.efcustomTextRoletype?.[0],
      profession: d?.efcustomTextCurrentProfession?.[0],
      discipline: d?.efcustomTextTaDisciplineName?.[0],
      travel: d?.efcustomTextRequiredTravel?.[0],
      standardizedLocations: pos.standardizedLocations,
      createdAt: postedAtFrom(pos.creationTs ?? null),
    },
  });
}

export const microsoft = defineCareerSite<MicrosoftPosition, MicrosoftPositionDetails>({
  company: MICROSOFT,
  name: "Microsoft Careers",
  intervalMinutes: 60,
  endpointType: "json (Eightfold PCSX search + position_details)",
  minGapMs: 15_000,
  maxDetails: 30,
  list: (ctx) => searchPages(ctx),
  idOf: (p) => p.id,
  async detail(p, ctx) {
    const state = stateOf(ctx);
    if (state.detailsThrottled) return null;
    try {
      const res = await getPolitely<MicrosoftDetailResponse>(ctx, microsoftDetailUrl(p.id), 2);
      return res.data ?? null;
    } catch (e) {
      if (e instanceof HttpError && e.status === 429) {
        state.detailsThrottled = true;
        ctx.log.warn("microsoft: still rate-limited — skipping remaining details this run");
        return null;
      }
      throw e;
    }
  },
  toRawJob(p, detail, ctx) {
    const known = ctx.isKnown?.(String(p.id), MICROSOFT.slug) ?? false;
    // A new job whose detail call failed/was throttled is retried next run instead of being stored without a description.
    if (!detail && !known) return null;
    return mapMicrosoftPosition(p, detail);
  },
});
