import type { InternshalaKind } from "./types";

/**
 * A listing feed: page 1 is `<origin><path>`, page N is `<origin><path>page-N/` (robots.txt forbids query strings).
 * Every feed is crawled newest-first with its own "stop at the first all-known page" rule; ids already
 * emitted in the same run count as known, so overlapping feeds stop quickly.
 */
export interface FeedSpec {
  id: string;
  path: string;
  /** Tags implied by membership in this feed. */
  tags?: readonly string[];
  /** Also revisit a rotating window of deeper pages each run, so long-lived postings keep being "seen". */
  refresh?: boolean;
}

/**
 * Why several feeds: Internshala's default order ranks in-office postings first — fresh work-from-home
 * internships sit 100+ pages deep in /internships/ — so the WFH listing is crawled on its own. /internships-for-women/
 * ("Women wanting to start/restart their career can also apply") gives the `women` tag.
 * There is deliberately no women feed for jobs: /jobs-for-women/ serves *internship* cards (checked 2026-11-25), and job
 * posts never carry the women-restart line (they say "Female candidates preferred" in free text — left to normalize).
 */
export const FEEDS: Record<InternshalaKind, readonly FeedSpec[]> = {
  internship: [
    { id: "main", path: "/internships/", refresh: true },
    { id: "wfh", path: "/internships/work-from-home-internships/" },
    { id: "women", path: "/internships-for-women/", tags: ["women"] },
  ],
  job: [
    { id: "main", path: "/jobs/", refresh: true },
    { id: "wfh", path: "/jobs/work-from-home/" },
    { id: "fresher", path: "/fresher-jobs/" },
  ],
};

export function pageUrl(origin: string, feed: FeedSpec, page: number): string {
  const base = `${origin.replace(/\/+$/, "")}${feed.path}`;
  return page <= 1 ? base : `${base}page-${page}/`;
}
