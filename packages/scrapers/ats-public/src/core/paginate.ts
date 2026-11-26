import type { Logger } from "@easyjobs/contract/node";

export interface OffsetPage<T> {
  items: T[];
  /** Total reported by the API, when it reports one (SmartRecruiters `totalFound`). */
  total?: number | null;
}

export interface OffsetPaginateOptions<T> {
  /** Requested page size. A shorter page ends the walk. */
  pageSize: number;
  fetchPage(offset: number, pageIndex: number): Promise<OffsetPage<T>>;
  idOf(item: T): string;
  signal?: AbortSignal;
  /** Safety cap against APIs that ignore the offset parameter (default 500 pages). */
  maxPages?: number;
  log?: Logger;
}

/**
 * Lazily walks an offset/limit API. The next page is requested only when the consumer asks for more items,
 * so `ctx.limit` costs no extra requests. Duplicates across pages (postings shifting while we read) are
 * dropped; the walk ends on a short page, on `offset >= total`, or on a page with nothing new.
 */
export async function* paginateOffset<T>(opts: OffsetPaginateOptions<T>): AsyncGenerator<T, void, undefined> {
  const maxPages = opts.maxPages ?? 500;
  const seen = new Set<string>();
  let offset = 0;
  for (let page = 0; page < maxPages; page++) {
    opts.signal?.throwIfAborted();
    const { items, total } = await opts.fetchPage(offset, page);
    let fresh = 0;
    for (const item of items) {
      const id = opts.idOf(item);
      if (seen.has(id)) continue;
      seen.add(id);
      fresh++;
      yield item;
    }
    offset += items.length;
    if (items.length < opts.pageSize || fresh === 0) return;
    if (typeof total === "number" && Number.isFinite(total) && offset >= total) return;
  }
  opts.log?.warn(`pagination stopped at the safety cap of ${maxPages} pages`, { offset });
}
