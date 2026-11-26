"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { keepPreviousData, useInfiniteQuery } from "@tanstack/react-query";
import { parseAsArrayOf, parseAsString, useQueryStates } from "nuqs";
import { Search } from "lucide-react";
import { CompanyLogo } from "@/components/company/company-logo";
import { Button } from "@/components/ui/button";
import { COMPANY_TYPES, companiesInfiniteOptions } from "@/lib/companies-query";
import { formatCount } from "@/lib/format";
import { companyTagLabel } from "@/lib/labels";
import { cn } from "@/lib/cn";

export function CompaniesBrowser(): React.JSX.Element {
  const [{ q, ctype }, setParams] = useQueryStates(
    { q: parseAsString.withDefault(""), ctype: parseAsArrayOf(parseAsString).withDefault([]) },
    { history: "replace", shallow: true, scroll: false },
  );
  const [text, setText] = useState(q);
  useEffect(() => {
    const t = setTimeout(() => {
      if (text.trim() !== q) void setParams({ q: text.trim() || null });
    }, 250);
    return () => clearTimeout(t);
  }, [text, q, setParams]);

  const result = useInfiniteQuery({ ...companiesInfiniteOptions(q, ctype), placeholderData: keepPreviousData });
  const companies = result.data?.pages.flatMap((p) => p.data) ?? [];
  const total = result.data?.pages[0]?.total;

  return (
    <div>
      <div className="flex flex-col gap-4">
        <label className="relative block md:w-96">
          <span className="sr-only">Search companies</span>
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-subtle-foreground" />
          <input
            type="search"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Search companies"
            data-primary-search=""
            className="h-11 w-full rounded-xl border border-border bg-background pl-10 pr-3 text-[14.5px] shadow-xs outline-none transition-[border-color,box-shadow] focus:border-brand/60 focus:ring-4 focus:ring-brand/10"
          />
        </label>
        <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none] md:flex-wrap md:overflow-visible" role="group" aria-label="Company type">
          {COMPANY_TYPES.map((t) => {
            const active = ctype.includes(t);
            return (
              <button
                key={t}
                type="button"
                aria-pressed={active}
                onClick={() => void setParams({ ctype: active ? ctype.filter((x) => x !== t) : [...ctype, t] })}
                className={cn(
                  "h-8 shrink-0 rounded-full border px-3 text-[13px] font-medium transition-[background-color,border-color,color,transform] duration-200 ease-[var(--ease-spring)] active:scale-95",
                  active ? "border-brand bg-brand text-brand-foreground" : "border-border text-foreground/80 hover:border-border-strong hover:text-foreground",
                )}
              >
                {companyTagLabel(t)}
              </button>
            );
          })}
        </div>
      </div>
      <p className="mt-5 text-[13px] text-muted-foreground" aria-live="polite">
        {total !== undefined ? (
          <>
            <span className="font-semibold text-foreground tabular">{formatCount(total)}</span> companies hiring
          </>
        ) : (
          " "
        )}
      </p>
      <ul className={cn("mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4", result.isPlaceholderData && "opacity-60")} data-testid="companies-grid">
        {companies.map((c) => (
          <li key={c.slug}>
            <Link
              href={`/companies/${c.slug}`}
              className="group flex h-full flex-col rounded-2xl border border-border bg-card p-4 transition-[border-color,transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:border-border-strong hover:shadow-md"
            >
              <span className="flex items-center gap-3">
                <CompanyLogo company={c} size={40} defer />
                <span className="min-w-0">
                  <span className="block truncate text-[15px] font-semibold tracking-[-0.01em]">{c.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">{c.hq ?? c.domain ?? " "}</span>
                </span>
              </span>
              <span className="mt-4 flex flex-wrap gap-1.5">
                {c.tags.slice(0, 3).map((t) => (
                  <span key={t} className="rounded-md bg-muted px-1.5 py-0.5 text-[11.5px] font-medium text-muted-foreground">
                    {companyTagLabel(t)}
                  </span>
                ))}
              </span>
              <span className="mt-auto flex items-center justify-between pt-4 text-[13px]">
                <span>
                  <span className="font-mono font-semibold tabular">{formatCount(c.openJobs)}</span>
                  <span className="text-muted-foreground"> open roles</span>
                </span>
                <span className="text-brand-text opacity-0 transition-opacity duration-200 group-hover:opacity-100">View →</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {result.data && companies.length === 0 && (
        <p className="mt-10 rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">No companies match “{q}”.</p>
      )}
      {result.hasNextPage && (
        <div className="mt-8 flex justify-center">
          <Button variant="outline" onClick={() => void result.fetchNextPage()} disabled={result.isFetchingNextPage}>
            {result.isFetchingNextPage ? "Loading…" : "Load more companies"}
          </Button>
        </div>
      )}
    </div>
  );
}
