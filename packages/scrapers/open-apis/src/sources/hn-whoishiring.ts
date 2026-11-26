import { slugify, type RawJob } from "@easyjobs/contract";
import type { ScrapeContext, Scraper } from "@easyjobs/contract/node";
import { fetchJson } from "../lib/http";
import { applyLinkScore, isAtsUrl, isBoardUrl, isCareersUrl, isFormUrl, isShortenerUrl } from "../lib/links";
import { defaultCacheFile, RedirectResolver } from "../lib/redirect";
import { classifyRegion, ELIGIBLE_SCOPES, remoteLocationLabel } from "../lib/region";
import { envInt, envStr, isDisabledByEnv, pause, prune, reachedLimit, uniq } from "../lib/util";
import { jobTypeForRole, parseHnComment, type HnItem, type HnPost, type HnSkipReason } from "./hn/parse";

export interface AlgoliaHit {
  objectID: string;
  title?: string;
  created_at?: string;
  created_at_i?: number;
  num_comments?: number;
}

export interface AlgoliaSearchResponse {
  hits?: AlgoliaHit[];
}

export interface HnThread {
  id: number;
  title: string;
  createdAtMs: number;
}

const ALGOLIA = "https://hn.algolia.com/api/v1";
/** Posts whose apply links are resolved concurrently. */
const RESOLVE_BATCH = 8;
export const THREAD_TITLE_RE = /^Ask HN: Who is hiring\?/i;

/** Monthly "Who is hiring?" threads, newest first (ignores "Who wants to be hired?" and freelancer threads). */
export function pickThreads(hits: AlgoliaHit[]): HnThread[] {
  return hits
    .filter((h) => THREAD_TITLE_RE.test(h.title ?? "") && /^\d+$/.test(h.objectID))
    .map((h) => ({ id: Number(h.objectID), title: h.title ?? "", createdAtMs: (h.created_at_i ?? 0) * 1000 || Date.parse(h.created_at ?? "") || 0 }))
    .sort((a, b) => b.createdAtMs - a.createdAtMs);
}

const hnUrl = (id: number): string => `https://news.ycombinator.com/item?id=${id}`;

function remoteLabels(post: HnPost): string[] {
  if (!post.remote) return [];
  if (post.remoteRegions.length === 0) return ["Remote"];
  return post.remoteRegions.map((r) => {
    const scope = classifyRegion(r.replace(/\b(?:us|Us)\b/g, " "));
    return ELIGIBLE_SCOPES.includes(scope) ? remoteLocationLabel(scope, r) : `Remote (${r})`;
  });
}

/**
 * HnPost → one RawJob per role. `applyFor(i)` gives the (resolved) apply URL for role i, or null.
 * Multi-role posts that share one generic link get applyUrl null: the same URL on several jobs would
 * give them the same fingerprint and collapse them into one record.
 */
export function hnPostToJobs(post: HnPost, thread: HnThread, applyFor: (i: number) => string | null): RawJob[] {
  const multi = post.roles.length > 1;
  const locations = uniq([...remoteLabels(post), ...post.locations]);
  const tags = post.remote ? ["remote"] : [];
  if (post.visa && /\b(?:visa|sponsor)/i.test(post.visa) && !/\bno\b|\bnot\b|\bwithout\b|\bunable\b/i.test(post.visa)) tags.push("visa-sponsorship");
  return post.roles.map((role, i) => {
    const applyUrl = applyFor(i);
    return prune<RawJob>({
      source: "hn-whoishiring",
      sourceKind: "job_board",
      sourceJobId: multi ? `${post.commentId}:${slugify(role) || i}` : String(post.commentId),
      sourceUrl: hnUrl(post.commentId),
      target: "whoishiring",
      applyUrl,
      title: role,
      company: post.company,
      locations,
      descriptionHtml: post.descriptionHtml,
      postedAt: post.postedAt,
      companyDomain: post.companyDomain,
      employmentTypeRaw: post.typeText || null,
      salaryRaw: post.salaryRaw ?? null,
      jobType: jobTypeForRole(role, post.typeText),
      workMode: post.workMode,
      isRemote: post.remote,
      tags,
      extra: prune({
        hnThreadId: thread.id,
        hnThread: thread.title,
        remoteScope: post.remoteScope ?? undefined,
        remoteRegions: post.remoteRegions.length > 0 ? post.remoteRegions : undefined,
        ycBatch: post.ycBatch,
        companyNote: post.companyNote,
        visa: post.visa,
        careersUrl: applyUrl === null ? post.bestLink : undefined,
        rolesInPost: multi ? post.roles.length : undefined,
        titleInferred: post.titleInferred || undefined,
      }),
    });
  });
}

export interface HnRunStats {
  comments: number;
  posts: number;
  jobs: number;
  skipped: Partial<Record<HnSkipReason, number>>;
}

/** Only links that may redirect to a posting: shorteners, careers pages, company homepages (not ATS, forms or boards). */
export function worthResolving(url: string): boolean {
  if (isAtsUrl(url) || isBoardUrl(url) || isFormUrl(url) || applyLinkScore(url) < 0) return false;
  return isShortenerUrl(url) || isCareersUrl(url) || applyLinkScore(url) === 3;
}

async function* scrapeHn(ctx: ScrapeContext): AsyncGenerator<RawJob> {
  const resolveLinks = envStr(ctx.env, "HN_RESOLVE_LINKS") !== "0";
  const previousDays = envInt(ctx.env, "HN_PREVIOUS_THREAD_DAYS", 7, 0, 31);
  const resolver = new RedirectResolver({
    cacheFile: defaultCacheFile(ctx.env),
    maxPerRun: envInt(ctx.env, "HN_RESOLVE_MAX", 150, 0, 2000),
    log: ctx.log,
  });
  const search = await fetchJson<AlgoliaSearchResponse>(ctx, "hn-whoishiring", `${ALGOLIA}/search_by_date?tags=story,author_whoishiring&hitsPerPage=12`);
  const threads = pickThreads(search.hits ?? []);
  const latest = threads[0];
  if (!latest) throw new Error("hn-whoishiring: no 'Who is hiring?' thread found via Algolia");
  // Early in the month the new thread is thin; keep last month's posts (minus companies that reposted) for continuity.
  const selected = [latest];
  const prev = threads[1];
  if (prev && previousDays > 0 && Date.now() - latest.createdAtMs < previousDays * 86_400_000) selected.push(prev);

  const stats: HnRunStats = { comments: 0, posts: 0, jobs: 0, skipped: {} };
  const companies = new Set<string>();
  let emitted = 0;

  /** Apply URL per role: unique links only (a shared link would collide fingerprints), resolved unless already ATS. */
  const applyUrlsFor = async (post: HnPost): Promise<(string | null)[]> => {
    const candidates = post.roles.length > 1 ? post.roleLinks : [post.bestLink];
    const uses = new Map<string, number>();
    for (const l of candidates) if (l) uses.set(l, (uses.get(l) ?? 0) + 1);
    return Promise.all(
      candidates.map(async (raw) => {
        if (!raw || (uses.get(raw) ?? 0) !== 1) return null;
        return resolveLinks && worthResolving(raw) ? resolver.resolve(raw, ctx.http, ctx.signal) : raw;
      }),
    );
  };

  try {
    for (const [t, thread] of selected.entries()) {
      await pause(ctx, 1000);
      const item = await fetchJson<HnItem>(ctx, "hn-whoishiring", `${ALGOLIA}/items/${thread.id}`);
      const posts: HnPost[] = [];
      for (const comment of item.children ?? []) {
        stats.comments++;
        const parsed = parseHnComment(comment);
        if ("skip" in parsed) {
          stats.skipped[parsed.skip] = (stats.skipped[parsed.skip] ?? 0) + 1;
          continue;
        }
        if (t > 0 && companies.has(slugify(parsed.post.company))) continue;
        posts.push(parsed.post);
      }
      // Links point at many different hosts; resolve a small batch concurrently (per-host politeness still
      // applies inside the shared client), then emit it — so ctx.limit stops further network work early.
      for (let i = 0; i < posts.length; i += RESOLVE_BATCH) {
        const batch = posts.slice(i, i + RESOLVE_BATCH);
        const urls = await Promise.all(batch.map(applyUrlsFor));
        for (const [b, post] of batch.entries()) {
          stats.posts++;
          for (const job of hnPostToJobs(post, thread, (r) => urls[b]?.[r] ?? null)) {
            stats.jobs++;
            yield job;
            if (reachedLimit(ctx, ++emitted)) return;
          }
        }
      }
      for (const p of posts) companies.add(slugify(p.company));
    }
  } finally {
    resolver.flush();
    ctx.log.info("hn-whoishiring: parsed", { threads: selected.map((s) => s.title), ...stats });
  }
}

export const hnWhoIsHiringScraper: Scraper = {
  id: "hn-whoishiring",
  name: "Hacker News: Who is hiring?",
  kind: "job_board",
  intervalMinutes: 360,
  attribution: "From Hacker News “Ask HN: Who is hiring?” (https://news.ycombinator.com)",
  isEnabled: (env) => !isDisabledByEnv(env, "hn-whoishiring"),
  scrape: scrapeHn,
};
