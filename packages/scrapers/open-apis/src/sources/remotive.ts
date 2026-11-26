import type { RawJob } from "@easyjobs/contract";
import type { ScrapeContext, Scraper } from "@easyjobs/contract/node";
import { htmlToPlain, stripInline } from "../lib/html";
import { fetchJson } from "../lib/http";
import { assessRemote, remoteHints } from "../lib/region";
import { jobTypeFrom } from "../lib/taxonomy";
import { cleanList, httpUrl, isDisabledByEnv, prune, reachedLimit, textOrNull, toIso } from "../lib/util";

export interface RemotiveJob {
  id: number;
  url?: string;
  title?: string;
  company_name?: string;
  company_logo?: string | null;
  category?: string;
  tags?: string[];
  job_type?: string;
  publication_date?: string;
  candidate_required_location?: string;
  salary?: string;
  description?: string;
}

export interface RemotiveResponse {
  "job-count"?: number;
  jobs?: RemotiveJob[];
}

/** Remotive's terms: link back to the Remotive URL, credit Remotive, and do not resubmit to Google Jobs etc. */
export const REMOTIVE_TERMS = { linkBackRequired: true, creditRequired: true, noJobPostingSchema: true, noThirdPartySyndication: true };

/** One Remotive job → RawJob, or null when it is not open to India/anywhere. */
export function mapRemotiveJob(j: RemotiveJob): RawJob | null {
  const title = stripInline(j.title ?? "");
  const company = stripInline(j.company_name ?? "");
  const url = httpUrl(j.url);
  if (!j.id || !title || !company || !url) return null;
  const region = stripInline(j.candidate_required_location ?? "");
  const verdict = assessRemote({ locations: [region], title, descriptionText: j.description ? htmlToPlain(j.description) : null });
  if (!verdict.eligible) return null;
  return prune<RawJob>({
    source: "remotive",
    sourceKind: "job_board",
    sourceJobId: String(j.id),
    sourceUrl: url,
    target: "remotive",
    // Terms require linking to the Remotive URL — never swap in the employer's link.
    applyUrl: url,
    title,
    company,
    descriptionHtml: textOrNull(j.description) ? (j.description as string) : null,
    postedAt: toIso(j.publication_date),
    companyLogoUrl: httpUrl(j.company_logo),
    department: textOrNull(j.category),
    employmentTypeRaw: textOrNull(j.job_type),
    salaryRaw: textOrNull(j.salary),
    jobType: jobTypeFrom(j.job_type),
    skills: cleanList(j.tags, 20),
    ...remoteHints(verdict.scope, region),
    extra: { remoteScope: verdict.scope, candidateRequiredLocation: region || null, terms: REMOTIVE_TERMS },
  });
}

async function* scrapeRemotive(ctx: ScrapeContext): AsyncGenerator<RawJob> {
  // One call returns the whole (24 h-delayed) feed. robots.txt disallows /api/*, but the API is documented
  // and its legal notice grants access for re-sharing (§0.8: robots:false allowed for documented JSON APIs).
  const body = await fetchJson<RemotiveResponse>(ctx, "remotive", "https://remotive.com/api/remote-jobs", { robots: false });
  const seen = new Set<string>();
  let emitted = 0;
  for (const j of body.jobs ?? []) {
    const job = mapRemotiveJob(j);
    if (!job || seen.has(job.sourceJobId)) continue;
    seen.add(job.sourceJobId);
    yield job;
    if (reachedLimit(ctx, ++emitted)) return;
  }
}

export const remotiveScraper: Scraper = {
  id: "remotive",
  name: "Remotive",
  kind: "job_board",
  // Remotive: "we advise max. 4 times a day".
  intervalMinutes: 360,
  attribution: "Jobs via Remotive (https://remotive.com)",
  isEnabled: (env) => !isDisabledByEnv(env, "remotive"),
  scrape: scrapeRemotive,
};
