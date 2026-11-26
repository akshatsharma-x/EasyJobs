import type { JobType, RawJob } from "@easyjobs/contract";
import type { Env, ScrapeContext, Scraper } from "@easyjobs/contract/node";
import { stripInline, textToHtml } from "../lib/html";
import { fetchJson } from "../lib/http";
import { makeSalary } from "../lib/salary";
import { cleanText, envInt, envStr, hasEnv, httpUrl, isDisabledByEnv, pause, prune, reachedLimit, toIso } from "../lib/util";

export interface AdzunaJob {
  id: string | number;
  title?: string;
  description?: string;
  created?: string;
  redirect_url?: string;
  company?: { display_name?: string } | null;
  location?: { display_name?: string; area?: string[] } | null;
  category?: { label?: string; tag?: string } | null;
  salary_min?: number | null;
  salary_max?: number | null;
  salary_is_predicted?: string | number | null;
  contract_type?: string | null;
  contract_time?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}

export interface AdzunaResponse {
  count?: number;
  mean?: number;
  results?: AdzunaJob[];
}

function adzunaJobType(j: AdzunaJob): JobType | undefined {
  if (j.contract_time === "part_time") return "part_time";
  if (j.contract_type === "contract") return "contract";
  if (j.contract_time === "full_time" || j.contract_type === "permanent") return "full_time";
  return undefined;
}

function adzunaLocation(j: AdzunaJob): string[] {
  const name = cleanText(j.location?.display_name);
  if (!name) return [];
  const area = j.location?.area ?? [];
  const inIndia = area[0] === "India" || /india/i.test(name);
  return [inIndia && !/india/i.test(name) ? `${name}, India` : name];
}

/** One Adzuna result → RawJob (null when unusable). */
export function mapAdzunaJob(j: AdzunaJob): RawJob | null {
  const title = stripInline(j.title ?? "");
  const company = stripInline(j.company?.display_name ?? "");
  const url = httpUrl(j.redirect_url);
  if (!j.id || !title || !company || !url) return null;
  const predicted = String(j.salary_is_predicted ?? "0") === "1";
  // Predicted salaries are Adzuna estimates, not the employer's — never present them as the posted salary.
  const salary = predicted ? null : makeSalary({ min: j.salary_min, max: j.salary_max, currency: "INR", period: "year" });
  const text = cleanText(stripInline(j.description ?? ""));
  return prune<RawJob>({
    source: "adzuna",
    sourceKind: "aggregator",
    sourceJobId: String(j.id),
    sourceUrl: url,
    target: null,
    // redirect_url is Adzuna's tracked link; resolving it with a bot would register fake clicks, so we keep it.
    applyUrl: url,
    title,
    company,
    locations: adzunaLocation(j),
    descriptionHtml: text ? textToHtml(text) : null,
    descriptionText: text || null,
    postedAt: toIso(j.created),
    department: cleanText(j.category?.label).replace(/\s+Jobs$/i, "") || null,
    employmentTypeRaw: [j.contract_type, j.contract_time].filter(Boolean).join(", ") || null,
    salaryRaw: salary?.raw ?? null,
    jobType: adzunaJobType(j),
    salary,
    extra: prune({
      adzunaCategory: j.category?.tag ?? undefined,
      predictedSalary: predicted && (j.salary_min || j.salary_max) ? { min: j.salary_min ?? null, max: j.salary_max ?? null, currency: "INR", period: "year" } : undefined,
      geo: typeof j.latitude === "number" && typeof j.longitude === "number" ? { lat: j.latitude, lng: j.longitude } : undefined,
    }),
  });
}

const BASE = "https://api.adzuna.com/v1/api/jobs/in/search";

/** Days of history to request: since-based when known, else ADZUNA_MAX_DAYS_OLD (default 3). */
export function adzunaMaxDaysOld(env: Env, since: Date | undefined, now = Date.now()): number {
  if (since) return Math.min(30, Math.max(1, Math.ceil((now - since.getTime()) / 86_400_000) + 1));
  return envInt(env, "ADZUNA_MAX_DAYS_OLD", 3, 1, 30);
}

export function adzunaUrl(env: Env, page: number, maxDaysOld: number, perPage: number): string {
  const params = new URLSearchParams({
    app_id: envStr(env, "ADZUNA_APP_ID") ?? "",
    app_key: envStr(env, "ADZUNA_APP_KEY") ?? "",
    results_per_page: String(perPage),
    max_days_old: String(maxDaysOld),
    sort_by: "date",
    "content-type": "application/json",
  });
  const what = envStr(env, "ADZUNA_WHAT");
  if (what) params.set("what", what);
  return `${BASE}/${page}?${params.toString()}`;
}

async function* scrapeAdzuna(ctx: ScrapeContext): AsyncGenerator<RawJob> {
  const secrets = [envStr(ctx.env, "ADZUNA_APP_ID"), envStr(ctx.env, "ADZUNA_APP_KEY")];
  const maxPages = envInt(ctx.env, "ADZUNA_MAX_PAGES", 5, 1, 50);
  const perPage = 50;
  const days = adzunaMaxDaysOld(ctx.env, ctx.since);
  const seen = new Set<string>();
  let emitted = 0;
  for (let page = 1; page <= maxPages; page++) {
    // Free tier ≈ 25 req/min: keep ≥ 2.5 s between calls.
    if (page > 1) await pause(ctx, 2500);
    const body = await fetchJson<AdzunaResponse>(ctx, "adzuna", adzunaUrl(ctx.env, page, days, perPage), { robots: false }, { secrets });
    const results = body.results ?? [];
    for (const r of results) {
      const job = mapAdzunaJob(r);
      if (!job || seen.has(job.sourceJobId)) continue;
      seen.add(job.sourceJobId);
      yield job;
      if (reachedLimit(ctx, ++emitted)) return;
    }
    if (results.length < perPage || page * perPage >= (body.count ?? 0)) break;
  }
}

export const adzunaScraper: Scraper = {
  id: "adzuna",
  name: "Adzuna",
  kind: "aggregator",
  // Free keys allow roughly 250 calls/day: 5 pages every 2 h ≈ 60/day.
  intervalMinutes: 120,
  attribution: "Jobs by Adzuna (https://www.adzuna.in)",
  isEnabled: (env) => !isDisabledByEnv(env, "adzuna") && hasEnv(env, "ADZUNA_APP_ID", "ADZUNA_APP_KEY"),
  scrape: scrapeAdzuna,
};
