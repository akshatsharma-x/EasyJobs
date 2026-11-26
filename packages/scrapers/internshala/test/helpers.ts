import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { RawJob } from "@easyjobs/contract";
import { createLogger, createScrapeContext, type HttpClient, type HttpRequestInit, type ScrapeContext } from "@easyjobs/contract/node";
import { createInternshalaScraper } from "../src/scrapers";
import type { InternshalaOptions } from "../src/config";
import { Throttle } from "../src/throttle";
import type { InternshalaKind } from "../src/types";

const here = dirname(fileURLToPath(import.meta.url));

/** Fixtures were captured on 2026-11-25 between 21:51 and 22:06 UTC. */
export const FIXED_NOW = new Date("2026-11-25T22:10:00.000Z");
export const ORIGIN = "https://internshala.com";

export function fixture(name: string): string {
  return readFileSync(join(here, "fixtures", `${name}.html`), "utf8");
}

/* ───────────── fake HTTP client ───────────── */

export interface Route {
  status?: number;
  body?: string;
  headers?: Record<string, string>;
}

export interface FakeHttp {
  http: HttpClient;
  calls: string[];
}

/** An HttpClient whose responses come from `route(url)`; unknown URLs get a 404. Records every requested URL. */
export function fakeHttp(route: (url: string) => Route | undefined): FakeHttp {
  const calls: string[] = [];
  const fetch = async (url: string, init?: HttpRequestInit): Promise<Response> => {
    calls.push(url);
    if (init?.signal?.aborted) throw init.signal.reason;
    const r = route(url) ?? { status: 404, body: "<html><title>404: Page not found</title></html>" };
    return new Response(r.body ?? "", { status: r.status ?? 200, headers: r.headers });
  };
  return {
    calls,
    http: {
      fetch,
      json: async <T>(url: string, init?: HttpRequestInit) => (await (await fetch(url, init)).json()) as T,
      text: async (url: string, init?: HttpRequestInit) => (await fetch(url, init)).text(),
    },
  };
}

/* ───────────── synthetic pages (same markup as the real fixtures, minimal content) ───────────── */

export interface CardSpec {
  id: string;
  title?: string;
  company?: string;
  location?: string;
  stipend?: string;
  posted?: string;
  /** Unix seconds embedded at the end of the detail URL. */
  ts?: number;
}

export function detailPath(kind: InternshalaKind, id: string, ts = 1795600000): string {
  return `/${kind}/detail/role-${id}-${kind}-at-acme${ts}`;
}

export function cardHtml(kind: InternshalaKind, spec: CardSpec): string {
  const href = detailPath(kind, spec.id, spec.ts);
  const company = spec.company ?? `Acme ${spec.id}`;
  return `<div class="container-fluid individual_internship logged_out_jd_summary  visibilityTrackerItem " id="individual_internship_${spec.id}" internshipId="${spec.id}" employment_type="${kind}" sequential_apply_referral="similar_internships" data-href='${href}'>
  <div class="internship_meta duration_meta"><div class="internship-heading-container"><div class="company generic_company">
    <div class='generic_container'><h2 class="job-internship-name"><a class="job-title-href" id="job_title" href="${href}" target="_blank">${spec.title ?? `Role ${spec.id}`}</a></h2></div>
    <div class="heading_6 company_name"><div class="company_and_premium"><p class="company-name">${company}</p><div class="actively-hiring-badge">Actively hiring</div></div></div>
  </div><div class="internship_logo"><img src="/static/images/search/placeholder_logo.svg" alt="${company}"></div></div>
  <div class="individual_internship_details  individual_internship_${kind}"><div class="detail-row-1">
    <div class="row-1-item locations"><i class="ic-16-map-pin"></i><span><a>${spec.location ?? "Delhi"}</a></span></div>
    <div class="row-1-item"><i class="ic-16-money"></i><span class='stipend'>${spec.stipend ?? "₹ 10,000 /month"}</span></div>
    <div class="row-1-item"><i class="ic-16-calendar"></i><span>3 Months</span></div>
  </div>
  <div class="about_job"><div class="ic-16-assignment icon"></div><div class="text">Selected intern's day-to-day responsibilities include working on role ${spec.id} with the te</div></div>
  <div class="detail-row-2-container"><div class="detail-row-2"><div class="color-labels"><div class="status-success"><i class="ic-16-reschedule"></i><span>${spec.posted ?? "Few hours ago"}</span></div></div></div></div>
  </div></div></div>`;
}

export function listingHtml(opts: {
  kind?: InternshalaKind;
  page: number;
  lastPage: number;
  cards: (string | CardSpec)[];
  feedPath?: string;
  /** Page number the server claims to render (defaults to `page`). */
  renderedPage?: number;
}): string {
  const kind = opts.kind ?? "internship";
  const path = opts.feedPath ?? (kind === "internship" ? "/internships/" : "/jobs/");
  const shown = opts.renderedPage ?? opts.page;
  const cards = opts.cards.map((c) => cardHtml(kind, typeof c === "string" ? { id: c } : c)).join("\n");
  const last = shown >= opts.lastPage ? 1 : 0;
  return `<!DOCTYPE html><html><head><title>Page ${shown}</title></head><body>
<h1 class="heading heading_4_6 page-heading">${opts.lastPage * 40} Total</h1>
<div class="internship_list_container with_breadcrumbs" id="internship_list_container"><div id='internship_list_container_${shown}'>
${cards}
</div></div>
<nav><div id="pagination" data-employment-type=${kind}><div class="pagination_desktop">
<input type="hidden" name="isLastPage" id="isLastPage" value="${last}">
<a class="pagination_block current_block" href=${path}page-${shown}/ data-page="${shown}"> ${shown} </a>
<a class="pagination_block block" href=${path}page-${opts.lastPage}/ data-page="${opts.lastPage}"> ${opts.lastPage} </a>
</div></div></nav></body></html>`;
}

export function detailHtml(kind: InternshalaKind, id: string, opts: { status?: string } = {}): string {
  return `<!DOCTYPE html><html><head><title>Role ${id}</title></head><body>
<script>var internship_id = ${id}; var employment_type = '${kind}';</script>
<div class="detail_view"><div class="container-fluid individual_internship visibilityTrackerItem " id="individual_internship_${id}" internshipId="${id}">
<div class="internship_meta"><div class="individual_internship_header"><div class="company"><div class='generic_container'><div class="heading_4_5 profile">Role ${id}</div></div>
<div class="heading_6 company_name"><a class="link_display_like_text" href="/company/acme-1">Acme ${id}</a></div></div></div>
<div class="individual_internship_details  individual_internship_${kind}"><div id="location_names"><i class="ic-16-map-pin"></i><span><a>Delhi</a></span></div>
<div class="internship_other_details_container"><div class="other_detail_item_row"><div class="other_detail_item  apply_by"><div class="item_heading"><i class="ic-16-hourglass"></i><span>APPLY BY</span></div><div class="item_body">16 Dec' 26</div></div></div></div></div></div></div>
<div class="internship_details"><h2 class="section_heading heading_5_5 about_heading">About the internship</h2><div class="text-container">Full description of role ${id}.</div>
<div class="buttons_container"><input type="hidden" id="status" value="${opts.status ?? "active"}"></div></div></div></body></html>`;
}

/* ───────────── running a scraper against fake responses ───────────── */

export interface RunResult {
  jobs: RawJob[];
  calls: string[];
  error: unknown;
}

export async function runScraper(
  kind: InternshalaKind,
  route: (url: string) => Route | undefined,
  opts: { options?: InternshalaOptions; ctx?: Partial<ScrapeContext> } = {},
): Promise<RunResult> {
  const { http, calls } = fakeHttp(route);
  const scraper = createInternshalaScraper(kind, {
    throttle: new Throttle(0),
    now: () => FIXED_NOW,
    refreshPages: 0,
    devCacheDir: null,
    ...opts.options,
  });
  const ctx = createScrapeContext({ http, log: quietLogger(), env: {}, ...opts.ctx });
  const jobs: RawJob[] = [];
  let error: unknown = null;
  try {
    for await (const job of scraper.scrape(ctx)) jobs.push(job);
  } catch (e) {
    error = e;
  }
  return { jobs, calls, error };
}

export function quietLogger(): ReturnType<typeof createLogger> {
  const noop = (): void => undefined;
  const log = { debug: noop, info: noop, warn: noop, error: noop, child: () => log };
  return log;
}

/** Route helper: listing pages by number for one feed, detail pages for any card id. */
export function siteRoutes(opts: {
  kind?: InternshalaKind;
  feeds: Record<string, (page: number) => Route | undefined>;
  details?: (id: string) => Route | undefined;
}): (url: string) => Route | undefined {
  const kind = opts.kind ?? "internship";
  return (url) => {
    const u = new URL(url);
    const detail = u.pathname.match(new RegExp(`^/${kind}/detail/role-(\\d+)-`));
    if (detail?.[1]) return opts.details?.(detail[1]) ?? { body: detailHtml(kind, detail[1]) };
    const byLongestPath = Object.entries(opts.feeds).sort((a, b) => b[0].length - a[0].length);
    for (const [path, pages] of byLongestPath) {
      if (!u.pathname.startsWith(path)) continue;
      const rest = u.pathname.slice(path.length);
      if (rest === "") return pages(1);
      const m = rest.match(/^page-(\d+)\/$/);
      if (m?.[1]) return pages(Number(m[1]));
    }
    return undefined;
  };
}

export const ids = (from: number, to: number): string[] => Array.from({ length: to - from + 1 }, (_, i) => String(from + i));
