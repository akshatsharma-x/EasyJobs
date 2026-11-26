/**
 * Google — the public Google Careers jobs XML feed (one request per run, gzip ≈ 3.7 MB, ~3,100 jobs
 * worldwide; Google, DeepMind and YouTube):
 *
 *   GET https://www.google.com/about/careers/applications/jobs/feed.xml
 *   <jobs><updated>…</updated>
 *     <job><published>ISO</published><jobid>…</jobid><title>…</title><description>(escaped HTML)</description>
 *       <url>https://careers.google.com/jobs/results/{id}-{slug}/</url><jobtype>FULL_TIME|INTERN|PART_TIME</jobtype>
 *       <employer>Google|DeepMind|YouTube</employer><languageCode>en-US</languageCode>
 *       <categories><category>SOFTWARE_ENGINEERING</category></categories>
 *       <remote>onsite|remote</remote><isRemote>No</isRemote><isHybrid>No</isHybrid>
 *       <locations><location><city/><state/><country/></location>…</locations></job>…
 *
 * robots.txt (User-agent: * group) disallows only *paginated* result pages
 * (/about/careers/applications/jobs/results?page= and …&page=) plus candidate-prep pages; the feed
 * and job pages are allowed. The search UI is server-rendered with no JSON API, and walking result
 * pages is exactly what robots.txt asks bots not to do — the feed avoids both. No detail calls are
 * needed: the feed carries the full description.
 *
 * India filter: jobs with at least one India location (the feed's remote roles are country-bound;
 * any remote role whose locations include India is kept as well).
 */
import type { ExperienceLevel, JobType, RawJob, WorkMode } from "@easyjobs/contract";
import {
  buildRawJob, cleanInline, decodeEntities, defineCareerSite, isOpenToIndia, levelFromCategory, postedAtFrom,
  unescapeHtmlIfEscaped, uniqueStrings, type CompanyInfo, type SiteContext,
} from "../lib";

export interface GoogleFeedLocation {
  city: string | null;
  state: string | null;
  country: string | null;
}

export interface GoogleFeedJob {
  jobid: string;
  title: string;
  descriptionHtml: string | null;
  url: string | null;
  published: string | null;
  jobtype: string | null;
  employer: string | null;
  languageCode: string | null;
  categories: string[];
  remote: string | null;
  isRemote: boolean;
  isHybrid: boolean;
  locations: GoogleFeedLocation[];
}

export const GOOGLE: CompanyInfo = {
  slug: "google",
  name: "Google",
  domain: "google.com",
  careersUrl: "https://www.google.com/about/careers/applications/jobs/results/?location=India",
};

export const GOOGLE_FEED_URL = "https://www.google.com/about/careers/applications/jobs/feed.xml";
const JOB_PAGE_BASE = "https://www.google.com/about/careers/applications/jobs/results/";

/* ── tiny XML helpers (the feed is flat and machine-generated; no need for a full parser) ── */

function decodeXmlText(raw: string): string {
  const cdata = /^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/.exec(raw);
  return cdata ? (cdata[1] ?? "") : decodeEntities(raw);
}

/** Text of the first <tag>…</tag> (null for missing or self-closing <tag/>). */
export function xmlText(block: string, tag: string): string | null {
  const m = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`).exec(block);
  if (!m) return null;
  const v = decodeXmlText(m[1] ?? "").trim();
  return v.length > 0 ? v : null;
}

function xmlBlocks(block: string, tag: string): string[] {
  return [...block.matchAll(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "g"))].map((m) => m[1] ?? "");
}

const yes = (v: string | null): boolean => /^(yes|true|1)$/i.test(v ?? "");

export function parseGoogleFeed(xml: string): { updated: string | null; jobs: GoogleFeedJob[] } {
  if (!/<jobs[\s>]/.test(xml)) throw new Error("google feed: <jobs> root not found (format changed?)");
  const head = xml.slice(0, 500);
  const jobs: GoogleFeedJob[] = [];
  for (const m of xml.matchAll(/<job>([\s\S]*?)<\/job>/g)) {
    const b = m[1] ?? "";
    const jobid = xmlText(b, "jobid");
    const title = xmlText(b, "title");
    if (!jobid || !title) continue;
    const description = xmlText(b, "description");
    jobs.push({
      jobid,
      title,
      descriptionHtml: description ? unescapeHtmlIfEscaped(description) : null,
      url: xmlText(b, "url"),
      published: xmlText(b, "published"),
      jobtype: xmlText(b, "jobtype"),
      employer: xmlText(b, "employer"),
      languageCode: xmlText(b, "languageCode"),
      categories: xmlBlocks(b, "category").map((c) => decodeXmlText(c).trim()).filter(Boolean),
      remote: xmlText(b, "remote"),
      isRemote: yes(xmlText(b, "isRemote")) || /^remote$/i.test(xmlText(b, "remote") ?? ""),
      isHybrid: yes(xmlText(b, "isHybrid")),
      locations: xmlBlocks(b, "location").map((l) => ({ city: xmlText(l, "city"), state: xmlText(l, "state"), country: xmlText(l, "country") })),
    });
  }
  return { updated: xmlText(head, "updated"), jobs };
}

export function googleLocationLabel(l: GoogleFeedLocation): string {
  return uniqueStrings([l.city, l.state, l.country]).join(", ");
}

/** Legacy careers.google.com/jobs/results/{id}-{slug}/ → canonical www.google.com/about/careers/… page. */
export function googleJobUrl(job: Pick<GoogleFeedJob, "jobid" | "url">): string {
  const m = /\/jobs\/results\/(\d+(?:-[a-z0-9-]+)?)\/?/i.exec(job.url ?? "");
  return `${JOB_PAGE_BASE}${m?.[1] ?? job.jobid}`;
}

export function isGoogleIndiaJob(job: GoogleFeedJob): boolean {
  return isOpenToIndia(job.locations.map(googleLocationLabel));
}

const JOB_TYPES: Record<string, JobType> = {
  FULL_TIME: "full_time", PART_TIME: "part_time", INTERN: "internship", INTERNSHIP: "internship",
  CONTRACTOR: "contract", CONTRACT: "contract", TEMPORARY: "temporary", TEMP: "temporary",
};

/** "SOFTWARE_ENGINEERING" → "Software Engineering" */
export function categoryLabel(code: string): string {
  return code
    .toLowerCase()
    .split("_")
    .filter(Boolean)
    .map((w) => (w === "ux" || w === "it" ? w.toUpperCase() : w[0]!.toUpperCase() + w.slice(1)))
    .join(" ");
}

/** Highest "N years of experience" among the minimum qualifications. */
export function googleMinYears(html: string | null): { min: number; raw: string } | null {
  if (!html) return null;
  const mq = /minimum qualifications:?<\/h3>([\s\S]*?)(?:<h3|$)/i.exec(html)?.[1];
  if (!mq) return null;
  let best: { min: number; raw: string } | null = null;
  for (const m of mq.matchAll(/(\d{1,2})\+?\s*years?\s+of\s+(?:relevant\s+)?(?:work\s+|professional\s+|industry\s+)?experience[^<]*/gi)) {
    const n = Number(m[1]);
    if (n <= 30 && (!best || n > best.min)) best = { min: n, raw: cleanInline(m[0]) };
  }
  return best;
}

function googleLevel(job: GoogleFeedJob, jobType: JobType | undefined): ExperienceLevel | undefined {
  if (jobType === "internship") return "intern";
  // Google's own level markers in titles ("…, Early Career", "University Graduate").
  if (/\buniversity graduate\b/i.test(job.title)) return "fresher";
  if (/\bearly career\b/i.test(job.title)) return levelFromCategory("Early Career");
  return undefined;
}

/** Feed jobtype, except that an explicit "(Fixed-Term Contract)" title marker wins over FULL_TIME. */
export function googleJobType(job: Pick<GoogleFeedJob, "jobtype" | "title">): JobType | undefined {
  const fromFeed = job.jobtype ? JOB_TYPES[job.jobtype.toUpperCase()] : undefined;
  if (fromFeed !== "internship" && /\(fixed[- ]term[^)]*\)|\bfixed[- ]term contract\b/i.test(job.title)) return "contract";
  return fromFeed;
}

export function mapGoogleJob(job: GoogleFeedJob): RawJob {
  const url = googleJobUrl(job);
  const jobType = googleJobType(job);
  const workMode: WorkMode = job.isRemote ? "remote" : job.isHybrid ? "hybrid" : "onsite";
  const years = googleMinYears(job.descriptionHtml);
  const categories = job.categories.filter((c) => c !== "JOB_CATEGORY_UNSPECIFIED").map(categoryLabel);
  return buildRawJob(GOOGLE, {
    sourceJobId: job.jobid,
    title: job.title,
    sourceUrl: url,
    applyUrl: url,
    locations: job.locations.map(googleLocationLabel),
    descriptionHtml: job.descriptionHtml,
    postedAt: postedAtFrom(job.published),
    department: categories[0] ?? null,
    employmentTypeRaw: job.jobtype,
    jobType,
    experienceLevel: googleLevel(job, jobType),
    experienceRaw: years?.raw ?? null,
    experienceMin: years?.min ?? null,
    workMode,
    extra: {
      employer: job.employer && job.employer !== "Google" ? job.employer : null,
      categories: categories.length > 1 ? categories : null,
      languageCode: job.languageCode && job.languageCode !== "en-US" ? job.languageCode : null,
    },
  });
}

export const google = defineCareerSite<GoogleFeedJob>({
  company: GOOGLE,
  name: "Google Careers",
  intervalMinutes: 60,
  endpointType: "xml feed (jobs/feed.xml)",
  async *list(ctx: SiteContext) {
    const xml = await ctx.http.text(GOOGLE_FEED_URL, { timeoutMs: 90_000, headers: { accept: "application/xml,text/xml" } });
    const { jobs } = parseGoogleFeed(xml);
    if (jobs.length === 0) throw new Error("google feed: no <job> entries parsed");
    const india = jobs.filter(isGoogleIndiaJob);
    ctx.log.debug(`google feed: ${jobs.length} jobs worldwide, ${india.length} open to India`);
    ctx.reportTotal(india.length);
    yield* india;
  },
  idOf: (j) => j.jobid,
  toRawJob: (j) => mapGoogleJob(j),
});
