import type { RawJob } from "@easyjobs/contract";
import type { ScrapeContext, Scraper } from "@easyjobs/contract/node";
import { fixMojibake, htmlToPlain, stripInline } from "../lib/html";
import { fetchJson } from "../lib/http";
import { assessRemote, remoteHints } from "../lib/region";
import { makeSalary } from "../lib/salary";
import { cleanList, httpUrl, isDisabledByEnv, prune, reachedLimit, toIso } from "../lib/util";

export interface RemoteOkJob {
  id?: string | number;
  slug?: string;
  epoch?: number;
  date?: string;
  company?: string;
  company_logo?: string;
  logo?: string;
  position?: string;
  tags?: string[];
  description?: string;
  location?: string;
  apply_url?: string;
  url?: string;
  salary_min?: number;
  salary_max?: number;
  verified?: boolean;
  original?: boolean;
  /** Present only on the first (legal notice) element. */
  legal?: string;
}

/** Remote OK's terms: link back (followed, no rel=nofollow) to the Remote OK URL and name Remote OK as the source. */
export const REMOTEOK_TERMS = { linkBackRequired: true, followLinkRequired: true, creditRequired: true, noLogoUse: true };

/** Remote OK tags that are categories, not skills. */
const GENERIC_TAGS = new Set([
  "dev", "developer", "engineer", "engineering", "senior", "junior", "lead", "other", "exec", "executive", "management",
  "manager", "digital nomad", "non tech", "support", "customer support", "sales", "marketing", "admin", "ops",
  "operations", "finance", "legal", "medical", "education", "recruiter", "hr", "design", "product", "programming",
  "technical", "analyst", "saas", "consulting", "content", "writing", "teaching", "security", "infosec", "cloud",
  "full time", "part time", "contract", "remote", "travel", "web", "mobile", "game", "games", "crypto", "web3",
]);

/** One Remote OK job → RawJob, or null when it is not open to India/anywhere (or is the legal-notice row). */
export function mapRemoteOkJob(j: RemoteOkJob): RawJob | null {
  if (j.legal !== undefined || !j.id) return null;
  const title = fixMojibake(stripInline(j.position ?? ""));
  const company = fixMojibake(stripInline(j.company ?? ""));
  const url = httpUrl(j.url) ?? httpUrl(j.apply_url);
  if (!title || !company || !url) return null;
  const description = j.description ? fixMojibake(j.description) : null;
  const region = stripInline(j.location ?? "");
  // A blank location gives no evidence either way; Remote OK labels open roles "Worldwide", so we skip blanks.
  const verdict = assessRemote({ locations: [region], title, descriptionText: description ? htmlToPlain(description) : null });
  if (!verdict.eligible) return null;
  const tags = cleanList(j.tags);
  const salary = makeSalary({ min: j.salary_min, max: j.salary_max, currency: "USD", period: "year" });
  return prune<RawJob>({
    source: "remoteok",
    sourceKind: "job_board",
    sourceJobId: String(j.id),
    sourceUrl: url,
    target: null,
    // Terms require linking to the Remote OK URL (apply_url is the same page today).
    applyUrl: url,
    title,
    company,
    descriptionHtml: description,
    postedAt: toIso(j.date) ?? toIso(j.epoch),
    companyLogoUrl: httpUrl(j.company_logo) ?? httpUrl(j.logo),
    salaryRaw: salary?.raw ?? null,
    salary,
    skills: tags.filter((t) => !GENERIC_TAGS.has(t.toLowerCase())).slice(0, 20),
    ...remoteHints(verdict.scope, region),
    extra: prune({ remoteScope: verdict.scope, locationRaw: region || null, sourceTags: tags, verified: j.verified ?? undefined, terms: REMOTEOK_TERMS }),
  });
}

async function* scrapeRemoteOk(ctx: ScrapeContext): AsyncGenerator<RawJob> {
  const rows = await fetchJson<RemoteOkJob[]>(ctx, "remoteok", "https://remoteok.com/api");
  if (!Array.isArray(rows)) throw new Error("remoteok: expected a JSON array");
  const seen = new Set<string>();
  let emitted = 0;
  for (const row of rows) {
    const job = mapRemoteOkJob(row);
    if (!job || seen.has(job.sourceJobId)) continue;
    seen.add(job.sourceJobId);
    yield job;
    if (reachedLimit(ctx, ++emitted)) return;
  }
}

export const remoteokScraper: Scraper = {
  id: "remoteok",
  name: "Remote OK",
  kind: "job_board",
  intervalMinutes: 120,
  attribution: "Jobs via Remote OK (https://remoteok.com)",
  isEnabled: (env) => !isDisabledByEnv(env, "remoteok"),
  scrape: scrapeRemoteOk,
};
