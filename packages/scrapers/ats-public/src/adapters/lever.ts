/**
 * Lever Postings API (public, documented: https://github.com/lever/postings-api)
 *   GET https://api.lever.co/v0/postings/{site}?mode=json&limit=100&skip={n}
 *   EU accounts ("eu:{site}" tokens): https://api.eu.lever.co/v0/postings/{site}?…
 * Paginated with skip/limit (verified stable ordering). Unknown site → 404 {"ok":false}.
 * `createdAt` is epoch ms. `salaryRange` {min,max,currency,interval} where interval is
 * per-year-salary | per-month-salary | per-hour-wage | … ; 0–0 ranges are placeholders.
 */
import type { CompanyTarget, RawJob, WorkMode } from "@easyjobs/contract";
import { UnexpectedResponseError } from "../core/errors";
import { getBoardJson } from "../core/http";
import { buildJob } from "../core/job";
import { paginateOffset } from "../core/paginate";
import type { AtsAdapter } from "../core/types";
import { htmlSection, htmlToPlain, joinHtml, joinText } from "../lib/html";
import { jobTypeFromLabel } from "../lib/hints";
import { withCountry } from "../lib/location";
import { makeSalary, periodFromInterval } from "../lib/salary";
import { clean, extraOf } from "../lib/text";
import { bareToken, tokenUrl } from "../lib/tokens";

export interface LeverList {
  text?: string | null;
  content?: string | null;
}

export interface LeverPosting {
  id: string;
  text?: string | null;
  categories?: {
    commitment?: string | null;
    location?: string | null;
    allLocations?: string[] | null;
    team?: string | null;
    department?: string | null;
  } | null;
  country?: string | null;
  workplaceType?: string | null;
  createdAt?: number | null;
  hostedUrl?: string | null;
  applyUrl?: string | null;
  description?: string | null;
  descriptionPlain?: string | null;
  opening?: string | null;
  descriptionBody?: string | null;
  lists?: LeverList[] | null;
  additional?: string | null;
  additionalPlain?: string | null;
  salaryRange?: { min?: number | null; max?: number | null; currency?: string | null; interval?: string | null } | null;
  salaryDescription?: string | null;
  salaryDescriptionPlain?: string | null;
}

export type LeverRegion = "global" | "eu";
export interface LeverSite {
  site: string;
  region: LeverRegion;
}

export const LEVER_PAGE_SIZE = 100;

/** "palantir" | "eu:creatio" | "https://jobs.lever.co/palantir" | "https://jobs.eu.lever.co/creatio/…" */
export function parseLeverToken(raw: string): LeverSite {
  const s = raw.trim();
  const eu = /^eu:/i.exec(s);
  if (eu) return { site: bareToken(s.slice(3)), region: "eu" };
  const parsed = tokenUrl(s, /(^|\.)lever\.co$/i);
  if (parsed) {
    const region: LeverRegion = /\.eu\.lever\.co$/i.test(parsed.url.hostname) ? "eu" : "global";
    const parts = parsed.parts[0] === "v0" && parsed.parts[1] === "postings" ? parsed.parts.slice(2) : parsed.parts;
    if (!parts[0]) throw new Error(`Cannot read a Lever site from "${raw}"`);
    return { site: parts[0], region };
  }
  return { site: bareToken(s), region: "global" };
}

const apiBase = (region: LeverRegion): string =>
  region === "eu" ? "https://api.eu.lever.co/v0/postings" : "https://api.lever.co/v0/postings";

export const leverPageUrl = ({ site, region }: LeverSite, skip: number, limit = LEVER_PAGE_SIZE): string =>
  `${apiBase(region)}/${encodeURIComponent(site)}?mode=json&limit=${limit}&skip=${skip}`;

const WORKPLACE: Record<string, WorkMode> = { remote: "remote", hybrid: "hybrid", onsite: "onsite", "on-site": "onsite" };

const listHtml = (l: LeverList): string | null => {
  const content = clean(l.content) ? (l.content as string).trim() : null;
  if (!content) return null;
  return htmlSection(l.text, /^<(ul|ol)\b/i.test(content) ? content : `<ul>${content}</ul>`);
};

const listText = (l: LeverList): string | null => joinText([clean(l.text), htmlToPlain(l.content)]);

export function mapLeverPosting(p: LeverPosting, target: CompanyTarget, site: LeverSite): RawJob | null {
  const cats = p.categories ?? {};
  const all = (cats.allLocations ?? []).map((l) => clean(l)).filter((l): l is string => l !== null);
  const primary = clean(cats.location);
  let locations = all.length > 0 ? all : primary ? [primary] : [];
  // The posting-level ISO country belongs to the primary location; add it when there is only one.
  if (locations.length === 1 && p.country) locations = [withCountry(locations[0], p.country) ?? locations[0]!];
  const workMode = WORKPLACE[clean(p.workplaceType)?.toLowerCase() ?? ""];
  const range = p.salaryRange;
  const salary = range
    ? makeSalary({ min: range.min, max: range.max, currency: range.currency, period: periodFromInterval(range.interval) })
    : null;
  const host = site.region === "eu" ? "jobs.eu.lever.co" : "jobs.lever.co";
  const fallbackUrl = `https://${host}/${encodeURIComponent(site.site)}/${encodeURIComponent(p.id)}`;
  return buildJob("lever", target, {
    sourceJobId: p.id,
    title: p.text,
    url: clean(p.hostedUrl) ?? fallbackUrl,
    locations,
    descriptionHtml: joinHtml([
      p.description ?? joinHtml([p.opening, p.descriptionBody]),
      ...(p.lists ?? []).map(listHtml),
      p.additional,
    ]),
    descriptionText: joinText([p.descriptionPlain, ...(p.lists ?? []).map(listText), p.additionalPlain]),
    postedAt: p.createdAt,
    department: clean(cats.department) ?? clean(cats.team),
    jobType: jobTypeFromLabel(cats.commitment),
    employmentTypeRaw: cats.commitment,
    workMode,
    salary,
    salaryRaw: salary?.raw ?? clean(p.salaryDescriptionPlain),
    extra: extraOf({
      team: clean(cats.team),
      commitment: clean(cats.commitment),
      country: clean(p.country),
      workplaceType: clean(p.workplaceType),
      allLocations: all.length > 1 ? all : undefined,
      applyFormUrl: clean(p.applyUrl),
      salaryDescription: clean(p.salaryDescriptionPlain),
      region: site.region === "eu" ? "eu" : undefined,
    }),
  });
}

export const lever: AtsAdapter = {
  id: "lever",
  name: "Lever",
  ats: "lever",
  endpoint: "https://api.lever.co/v0/postings/{site}?mode=json&limit=100&skip={n} (api.eu.lever.co for eu: tokens)",
  async *scrapeTarget(ctx) {
    const site = parseLeverToken(ctx.target.token);
    const postings = paginateOffset<LeverPosting>({
      pageSize: LEVER_PAGE_SIZE,
      signal: ctx.signal,
      log: ctx.log,
      idOf: (p) => p.id,
      fetchPage: async (skip) => {
        const url = leverPageUrl(site, skip);
        const page = await getBoardJson<unknown>(ctx, url);
        if (!Array.isArray(page)) throw new UnexpectedResponseError(url, "expected an array of postings");
        return { items: page.filter((p): p is LeverPosting => typeof p?.id === "string") };
      },
    });
    for await (const p of postings) {
      const raw = mapLeverPosting(p, ctx.target, site);
      if (raw) yield raw;
      else ctx.skip("missing id/title/url");
    }
  },
};
