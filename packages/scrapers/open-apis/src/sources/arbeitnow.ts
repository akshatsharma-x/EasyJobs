import type { ExperienceLevel, JobType, RawJob } from "@easyjobs/contract";
import type { ScrapeContext, Scraper } from "@easyjobs/contract/node";
import { htmlToPlain, stripInline } from "../lib/html";
import { fetchJson } from "../lib/http";
import { englishShare } from "../lib/lang";
import { assessRemote, remoteHints } from "../lib/region";
import { cleanList, envInt, httpUrl, isDisabledByEnv, pause, prune, reachedLimit, textOrNull, toIso } from "../lib/util";

export interface ArbeitnowJob {
  slug: string;
  company_name?: string;
  title?: string;
  description?: string;
  remote?: boolean;
  url?: string;
  tags?: string[];
  job_types?: string[];
  location?: string;
  created_at?: number;
}

export interface ArbeitnowResponse {
  data?: ArbeitnowJob[];
  links?: { next?: string | null };
  meta?: { current_page?: number; per_page?: number };
}

/** Arbeitnow location values that mean "remote, no region given". */
const GENERIC_REMOTE_RE = /^(?:remote(?: job| work| only| first)?|fully remote|100% remote|anywhere|worldwide|homeoffice|home office)$/i;

/** Arbeitnow job_types (English, German, French, Dutch) → JobType. */
export function arbeitnowJobType(types: string[]): JobType | undefined {
  const s = types.join(" | ").toLowerCase();
  if (/intern|praktikum|\bstage\b/.test(s)) return "internship";
  if (/apprentice|ausbildung|duales studium|dual stud/.test(s)) return "apprenticeship";
  if (/werkstudent|working student/.test(s)) return "part_time";
  if (/freelance|auto-entrepreneur|freiberuf/.test(s)) return "freelance";
  if (/part[- ]?time|teilzeit/.test(s)) return "part_time";
  if (/fixed[- ]term|(?<!un)befristet|temporary|tijdelijk|\bcdd\b/.test(s)) return "temporary";
  if (/\bcontract\b/.test(s) && !/permanent|open-ended|unbefristet/.test(s)) return "contract";
  if (/full[- ]?time|fulltime|permanent|unbefristet|\bcdi\b/.test(s)) return "full_time";
  return undefined;
}

/** Arbeitnow seniority job_types → ExperienceLevel. */
export function arbeitnowLevel(types: string[]): ExperienceLevel | undefined {
  const s = types.join(" | ").toLowerCase();
  if (/no experience|berufseinstieg|\bentry\b|aucune expérience/.test(s)) return "entry";
  if (/senior executive|geschäftsleitung/.test(s)) return "executive";
  if (/teamleitung|\bmanager\b|superviseur/.test(s)) return "lead";
  if (/\bmid\b|mid-senior|berufserfahren|experienced|professional|ervaren|expérimenté/.test(s)) return "mid";
  return undefined;
}

/** One Arbeitnow job → RawJob, or null unless it is remote, English-language and open to India/anywhere. */
export function mapArbeitnowJob(j: ArbeitnowJob): RawJob | null {
  const title = stripInline(j.title ?? "");
  const company = stripInline(j.company_name ?? "");
  const url = httpUrl(j.url);
  if (!j.slug || !title || !company || !url || j.remote !== true) return null;
  const text = j.description ? htmlToPlain(j.description) : null;
  // Most Arbeitnow listings are German-language roles for local candidates; skip non-English postings.
  if (englishShare(text) < 0.6) return null;
  const region = stripInline(j.location ?? "");
  const verdict = assessRemote({
    locations: [region],
    title,
    descriptionText: text,
    unknownMeans: GENERIC_REMOTE_RE.test(region) ? "anywhere" : "unknown",
  });
  if (!verdict.eligible) return null;
  const types = cleanList(j.job_types);
  const tags = cleanList(j.tags);
  return prune<RawJob>({
    source: "arbeitnow",
    sourceKind: "job_board",
    sourceJobId: j.slug,
    sourceUrl: url,
    target: null,
    applyUrl: url,
    title,
    company,
    descriptionHtml: textOrNull(j.description) ? (j.description as string) : null,
    postedAt: toIso(j.created_at),
    department: tags[0] ?? null,
    employmentTypeRaw: types.join(", ") || null,
    jobType: arbeitnowJobType(types),
    experienceLevel: arbeitnowLevel(types),
    ...remoteHints(verdict.scope, region),
    extra: prune({ remoteScope: verdict.scope, locationRaw: region || null, sourceTags: tags, jobTypes: types }),
  });
}

async function* scrapeArbeitnow(ctx: ScrapeContext): AsyncGenerator<RawJob> {
  const maxPages = envInt(ctx.env, "ARBEITNOW_MAX_PAGES", 3, 1, 50);
  const sinceSec = ctx.since ? ctx.since.getTime() / 1000 : null;
  const seen = new Set<string>();
  let emitted = 0;
  for (let page = 1; page <= maxPages; page++) {
    // API allows 50 req/min; pages are large (~300 jobs, ~2 MB), so space them generously.
    if (page > 1) await pause(ctx, 1500);
    const body = await fetchJson<ArbeitnowResponse>(ctx, "arbeitnow", `https://www.arbeitnow.com/api/job-board-api?page=${page}`);
    const rows = body.data ?? [];
    for (const row of rows) {
      const job = mapArbeitnowJob(row);
      if (!job || seen.has(job.sourceJobId)) continue;
      seen.add(job.sourceJobId);
      yield job;
      if (reachedLimit(ctx, ++emitted)) return;
    }
    // Sorted by created_at desc: stop once a whole page predates the incremental cutoff.
    const newest = Math.max(0, ...rows.map((r) => r.created_at ?? 0));
    if (rows.length === 0 || !body.links?.next || (sinceSec !== null && newest < sinceSec)) break;
  }
}

export const arbeitnowScraper: Scraper = {
  id: "arbeitnow",
  name: "Arbeitnow",
  kind: "job_board",
  // "Jobs are updated every hour".
  intervalMinutes: 120,
  attribution: "Jobs via Arbeitnow (https://www.arbeitnow.com)",
  isEnabled: (env) => !isDisabledByEnv(env, "arbeitnow"),
  scrape: scrapeArbeitnow,
};
