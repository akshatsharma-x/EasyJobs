/**
 * Generic pagination for list endpoints (offset- or page-based). Stops on: a short/empty page,
 * reaching `total`, a page with no new ids (the API ignoring our offset), `maxPages`, or abort.
 */

export interface PageResult<T> {
  items: T[];
  /** Total number of results if the API reports it. */
  total?: number | null;
  /** Explicit "more pages" flag if the API reports it. */
  hasMore?: boolean | null;
}

export interface PaginateOptions<T> {
  /** Fetch page `index` (0-based). Compute offset as index * pageSize yourself. */
  fetchPage: (index: number) => Promise<PageResult<T>>;
  pageSize: number;
  /** Safety cap (default 200 pages). */
  maxPages?: number;
  /** Stable id per item, used to detect APIs that repeat the same page. */
  idOf?: (item: T) => string;
  signal?: AbortSignal;
  /**
   * Called when the listing was cut off by `maxPages` (more pages existed). Sites pass
   * `(reason) => ctx.markIncomplete?.(reason)` so a truncated listing is never swept.
   */
  onTruncated?: (reason: string) => void;
}

export async function* paginate<T>(opts: PaginateOptions<T>): AsyncGenerator<T> {
  const maxPages = opts.maxPages ?? 200;
  const seen = new Set<string>();
  let yielded = 0;
  for (let index = 0; index < maxPages; index++) {
    if (opts.signal?.aborted) return;
    const page = await opts.fetchPage(index);
    const items = page.items ?? [];
    let fresh = 0;
    for (const item of items) {
      if (opts.idOf) {
        const id = opts.idOf(item);
        if (seen.has(id)) continue;
        seen.add(id);
      }
      fresh++;
      yielded++;
      yield item;
    }
    if (items.length === 0 || fresh === 0) return;
    if (page.hasMore === false) return;
    if (typeof page.total === "number" && page.total >= 0 && (index + 1) * opts.pageSize >= page.total) return;
    if (page.hasMore !== true && items.length < opts.pageSize) return;
    if (typeof page.total === "number" && yielded >= page.total) return;
  }
  // The loop ran out of pages before the listing ended.
  opts.onTruncated?.(`listing truncated at maxPages=${maxPages}`);
}
