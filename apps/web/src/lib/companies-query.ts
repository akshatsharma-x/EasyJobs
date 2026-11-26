import { infiniteQueryOptions } from "@tanstack/react-query";
import { api } from "@/lib/api";

export const COMPANY_TYPES = ["big_tech", "mnc", "unicorn", "startup", "indian_it", "product", "fintech", "gcc", "bank", "consulting", "ai"];
export const COMPANIES_PAGE_SIZE = 48;

/** Shared by the /companies server prefetch and the client browser. */
export function companiesInfiniteOptions(q: string, ctype: string[]) {
  return infiniteQueryOptions({
    queryKey: ["companies", "browse", q.trim().toLowerCase(), [...ctype].sort().join(",")] as const,
    queryFn: ({ pageParam, signal }) =>
      api.companies({ q: q || undefined, ctype: ctype.length ? ctype : undefined, page: pageParam, pageSize: COMPANIES_PAGE_SIZE }, { signal }),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page * last.pageSize < last.total ? last.page + 1 : undefined),
  });
}
