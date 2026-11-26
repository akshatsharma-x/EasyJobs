/** Normalized WordPress post model shared by the REST, RSS and HTML strategies. */

export interface WpTerm {
  id: number;
  slug: string;
  name: string;
}

/** A post as listed (no content yet). Dates are ISO-8601 UTC ("…Z"). */
export interface WpPostRef {
  id: number;
  link: string;
  /** Decoded plain-text title */
  title: string;
  dateGmt: string;
  modifiedGmt: string;
  categories: WpTerm[];
  tags: WpTerm[];
  /** Listing-only info (HTML/sitemap strategy): id, title and categories are guesses until the page is fetched. */
  partial?: boolean;
}

export interface WpPost extends WpPostRef {
  /** Rendered post HTML (the_content) */
  contentHtml: string;
}

/** Raw REST shape (subset of fields we request with `_fields`). */
export interface WpRestPost {
  id: number;
  date_gmt: string;
  modified_gmt: string;
  link: string;
  title: { rendered: string };
  content?: { rendered: string; protected?: boolean };
  categories?: number[];
  tags?: number[];
}

export interface WpRestTerm {
  id: number;
  slug: string;
  name: string;
}

/** On-disk fixture format used by tests and scripts/fetch-fixtures.ts. */
export interface PostFixture {
  site: string;
  fetchedAt: string;
  post: WpRestPost;
  terms: { categories: WpRestTerm[]; tags: WpRestTerm[] };
  /** Optional note on why this fixture exists ("multi-role", "walk-in", …). */
  shape?: string;
}

/** "2026-11-25T11:51:31" (WP *_gmt without zone) → "2026-11-25T11:51:31.000Z". */
export function wpGmtToIso(value: string | null | undefined): string | null {
  if (!value) return null;
  const withZone = /[zZ]|[+-]\d\d:?\d\d$/.test(value) ? value : `${value}Z`;
  const t = Date.parse(withZone);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}
