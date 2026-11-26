import type { RawJob } from "@easyjobs/contract";
import type { ScrapeContext, Scraper } from "@easyjobs/contract/node";
import { stripInline } from "../lib/html";
import { fetchJson, quoteBigIntegers, withRetries } from "../lib/http";
import { jobTypeFrom } from "../lib/taxonomy";
import { cleanText, envInt, envList, envStr, hasEnv, httpUrl, isDisabledByEnv, pause, prune, reachedLimit, textOrNull, toIso } from "../lib/util";

export interface JoobleJob {
  /** Often a 64-bit integer — we read it as a string so it survives JSON.parse. */
  id: string | number;
  title?: string;
  location?: string;
  snippet?: string;
  salary?: string;
  source?: string;
  type?: string;
  link?: string;
  company?: string;
  updated?: string;
}

export interface JoobleResponse {
  totalCount?: number;
  jobs?: JoobleJob[];
}

/** Parses a Jooble response body, keeping 64-bit ids exact. */
export function parseJoobleBody(raw: string): JoobleResponse {
  return JSON.parse(quoteBigIntegers(raw, ["id"])) as JoobleResponse;
}

/** One Jooble job → RawJob (null when unusable). */
export function mapJoobleJob(j: JoobleJob): RawJob | null {
  const title = stripInline(j.title ?? "");
  const company = stripInline(j.company ?? "");
  const url = httpUrl(j.link);
  const id = cleanText(String(j.id ?? ""));
  if (!id || !title || !company || !url) return null;
  const location = cleanText(stripInline(j.location ?? ""));
  return prune<RawJob>({
    source: "jooble",
    sourceKind: "aggregator",
    sourceJobId: id,
    sourceUrl: url,
    target: null,
    // jooble.org/desc|away links are disallowed by Jooble's robots.txt, so we do not resolve them.
    applyUrl: url,
    title,
    company,
    locations: location ? [location] : [],
    descriptionHtml: textOrNull(j.snippet) ? (j.snippet as string) : null,
    postedAt: toIso(j.updated),
    employmentTypeRaw: textOrNull(j.type),
    salaryRaw: textOrNull(stripInline(j.salary ?? "")),
    jobType: jobTypeFrom(j.type),
    extra: prune({ originalSource: textOrNull(j.source) ?? undefined }),
  });
}

const DEFAULT_KEYWORDS = ["internship", "fresher", "graduate trainee", "software engineer"];

async function* scrapeJooble(ctx: ScrapeContext): AsyncGenerator<RawJob> {
  const key = envStr(ctx.env, "JOOBLE_API_KEY") ?? "";
  const url = `https://jooble.org/api/${encodeURIComponent(key)}`;
  const keywords = envList(ctx.env, "JOOBLE_KEYWORDS", DEFAULT_KEYWORDS);
  const location = envStr(ctx.env, "JOOBLE_LOCATION") ?? "India";
  const maxPages = envInt(ctx.env, "JOOBLE_MAX_PAGES", 1, 1, 20);
  const perPage = envInt(ctx.env, "JOOBLE_PER_PAGE", 50, 10, 100);
  const since = ctx.since ? ctx.since.toISOString().slice(0, 10) : undefined;
  const seen = new Set<string>();
  let emitted = 0;
  let calls = 0;
  for (const keyword of keywords) {
    for (let page = 1; page <= maxPages; page++) {
      if (calls++ > 0) await pause(ctx, 1500);
      const body = JSON.stringify(prune({ keywords: keyword, location, page: String(page), ResultOnPage: String(perPage), datecreatedfrom: since }));
      // The key lives in the URL path: disable the shared client's retries (its retry log prints the path) and retry here.
      const res = await withRetries(ctx, `jooble "${keyword}" p${page}`, () =>
        fetchJson<JoobleResponse>(
          ctx,
          "jooble",
          url,
          { method: "POST", body, headers: { "content-type": "application/json" }, retries: 0, robots: false },
          { secrets: [key], preprocess: (raw) => quoteBigIntegers(raw, ["id"]) },
        ),
      );
      const jobs = res.jobs ?? [];
      for (const j of jobs) {
        const job = mapJoobleJob(j);
        if (!job || seen.has(job.sourceJobId)) continue;
        seen.add(job.sourceJobId);
        yield job;
        if (reachedLimit(ctx, ++emitted)) return;
      }
      if (jobs.length < perPage) break;
    }
  }
}

export const joobleScraper: Scraper = {
  id: "jooble",
  name: "Jooble",
  kind: "aggregator",
  intervalMinutes: 180,
  attribution: "Jobs via Jooble",
  isEnabled: (env) => !isDisabledByEnv(env, "jooble") && hasEnv(env, "JOOBLE_API_KEY"),
  scrape: scrapeJooble,
};
