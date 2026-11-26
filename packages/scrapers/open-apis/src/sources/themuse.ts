import type { ExperienceLevel, RawJob } from "@easyjobs/contract";
import { HttpError, type ScrapeContext, type Scraper } from "@easyjobs/contract/node";
import { htmlToPlain, stripInline } from "../lib/html";
import { fetchJson } from "../lib/http";
import { INDIA_RE } from "../lib/places";
import { assessRemote, remoteLocationLabel } from "../lib/region";
import { lowestLevel } from "../lib/taxonomy";
import { cleanList, envInt, envList, envStr, httpUrl, isDisabledByEnv, pause, prune, reachedLimit, textOrNull, toIso, uniq } from "../lib/util";

export interface MuseJob {
  id: number;
  name?: string;
  contents?: string | null;
  publication_date?: string;
  short_name?: string;
  type?: string;
  locations?: { name?: string }[];
  categories?: { name?: string }[];
  levels?: { name?: string; short_name?: string }[];
  tags?: { name?: string; short_name?: string }[];
  refs?: { landing_page?: string };
  company?: { id?: number; short_name?: string; name?: string };
}

export interface MuseResponse {
  page?: number;
  page_count?: number;
  items_per_page?: number;
  total?: number;
  results?: MuseJob[];
}

/** The four levels the task asks for, plus their mapping. */
export const MUSE_LEVELS: Record<string, ExperienceLevel> = {
  Internship: "intern",
  "Entry Level": "entry",
  "Mid Level": "mid",
  "Senior Level": "senior",
  management: "lead",
};

export const DEFAULT_MUSE_LOCATIONS = [
  "Flexible / Remote", "Bengaluru, India", "Bangalore, India", "Mumbai, India", "Hyderabad, India", "Pune, India",
  "Chennai, India", "Gurgaon, India", "Gurugram, India", "New Delhi, India", "Noida, India", "Kolkata, India",
];

const isRemoteLocation = (name: string): boolean => /flexible|remote/i.test(name);

const REMOTE_INDIA_RE = /\bremote\b[^.\n]{0,40}\bindia\b|\bindia\b[^.\n]{0,40}\bremote\b/i;
const ANYWHERE_PHRASE_RE =
  /\b(?:work (?:remotely )?from anywhere|anywhere in the world|remote[- ](?:worldwide|global|anywhere)|(?:worldwide|globally|anywhere)[- ]remote|open to (?:candidates|applicants) (?:worldwide|globally|from anywhere|anywhere)|hire (?:from )?anywhere|location:\s*(?:anywhere|worldwide))\b/i;

/** "Flexible / Remote" carries no region; derive one only from explicit description phrases. */
function museRemoteRegion(text: string | null): string {
  if (!text) return "";
  if (REMOTE_INDIA_RE.test(text)) return "India";
  if (ANYWHERE_PHRASE_RE.test(text)) return "Worldwide";
  return "";
}

/** One Muse job → RawJob, keeping only India-based roles and remote roles open to India/anywhere. */
export function mapMuseJob(j: MuseJob): RawJob | null {
  const title = stripInline(j.name ?? "");
  const company = stripInline(j.company?.name ?? "");
  const url = httpUrl(j.refs?.landing_page);
  if (!j.id || !title || !company || !url) return null;
  const locations = cleanList((j.locations ?? []).map((l) => l.name));
  const indian = locations.filter((l) => INDIA_RE.test(l));
  const remote = locations.some(isRemoteLocation);
  let outLocations = indian;
  if (indian.length === 0) {
    if (!remote) return null;
    const text = j.contents ? htmlToPlain(j.contents) : null;
    // Most Muse remote roles are US-only, so require positive evidence of India/anywhere eligibility.
    const verdict = assessRemote({ locations: [museRemoteRegion(text)], title, descriptionText: text });
    if (!verdict.eligible) return null;
    outLocations = [remoteLocationLabel(verdict.scope)];
  } else if (remote) {
    outLocations = ["Remote (India)", ...indian];
  }
  const levelNames = cleanList((j.levels ?? []).map((l) => l.name));
  const level = lowestLevel(levelNames.map((n) => MUSE_LEVELS[n]));
  return prune<RawJob>({
    source: "themuse",
    sourceKind: "job_board",
    sourceJobId: String(j.id),
    sourceUrl: url,
    target: null,
    applyUrl: url,
    title,
    company,
    locations: uniq(outLocations),
    descriptionHtml: textOrNull(j.contents) ? (j.contents as string) : null,
    postedAt: toIso(j.publication_date),
    department: textOrNull(j.categories?.[0]?.name),
    jobType: level === "intern" ? "internship" : undefined,
    experienceLevel: level,
    workMode: remote ? "remote" : undefined,
    isRemote: remote,
    tags: remote ? ["remote"] : [],
    extra: prune({
      museLevels: levelNames,
      museCategories: cleanList((j.categories ?? []).map((c) => c.name)),
      museCompany: textOrNull(j.company?.short_name) ?? undefined,
    }),
  });
}

const API = "https://www.themuse.com/api/public/jobs";

export function museUrl(page: number, levels: string[], locations: string[], apiKey?: string): string {
  const params = new URLSearchParams({ page: String(page), descending: "true" });
  for (const l of levels) params.append("level", l);
  for (const l of locations) params.append("location", l);
  if (apiKey) params.set("api_key", apiKey);
  return `${API}?${params.toString()}`;
}

async function* scrapeMuse(ctx: ScrapeContext): AsyncGenerator<RawJob> {
  const apiKey = envStr(ctx.env, "THEMUSE_API_KEY");
  const levels = envList(ctx.env, "THEMUSE_LEVELS", ["Internship", "Entry Level", "Mid Level", "Senior Level"]);
  const locations = envList(ctx.env, "THEMUSE_LOCATIONS", DEFAULT_MUSE_LOCATIONS);
  const maxPages = envInt(ctx.env, "THEMUSE_MAX_PAGES", 10, 1, 100);
  const seen = new Set<string>();
  let emitted = 0;
  // Pages are 0-based; if an API revision rejects page 0 we fall back to starting at 1.
  let page = 0;
  for (let fetched = 0; fetched < maxPages; fetched++, page++) {
    if (fetched > 0) await pause(ctx, 1000);
    let body: MuseResponse;
    try {
      body = await fetchJson<MuseResponse>(ctx, "themuse", museUrl(page, levels, locations, apiKey), {}, { secrets: [apiKey] });
    } catch (e) {
      if (page === 0 && e instanceof HttpError && e.status === 400) continue;
      throw e;
    }
    const results = body.results ?? [];
    for (const r of results) {
      const job = mapMuseJob(r);
      if (!job || seen.has(job.sourceJobId)) continue;
      seen.add(job.sourceJobId);
      yield job;
      if (reachedLimit(ctx, ++emitted)) return;
    }
    const pageCount = body.page_count ?? 0;
    if (results.length === 0 || page + 1 >= pageCount) break;
  }
}

export const themuseScraper: Scraper = {
  id: "themuse",
  name: "The Muse",
  kind: "job_board",
  // 500 req/h without a key; India + remote volume is small, so a few runs a day suffice.
  intervalMinutes: 360,
  attribution: "Jobs via The Muse",
  isEnabled: (env) => !isDisabledByEnv(env, "themuse"),
  scrape: scrapeMuse,
};
