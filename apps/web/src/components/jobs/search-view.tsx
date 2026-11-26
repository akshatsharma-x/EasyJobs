"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { keepPreviousData, useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { SlidersHorizontal, TriangleAlert, Keyboard } from "lucide-react";
import { notify } from "@/lib/notify";
import { jobPath, type JobListItem, type SearchQuery } from "@easyjobs/contract";
import { api } from "@/lib/api";
import { jobOptions, jobsInfiniteOptions, searchKey } from "@/lib/query-keys";
import {
  activeFilterCount,
  streamFilters,
  useSearchState,
  useSelectedJob,
  type QueryPatch,
} from "@/lib/search-state";
import { useHotkeys } from "@/lib/hooks/use-hotkeys";
import { SPLIT_VIEW_QUERY } from "@/lib/hooks/use-media-query";
import { useSavedStore } from "@/lib/saved-store";
import { formatCount, formatTookMs } from "@/lib/format";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { JobCard, JobCardSkeleton } from "./job-card";
import { JobPreview } from "./job-preview";
import { FilterPanel, type CompanyInfo } from "./filters";
import { ActiveFilters, activeChips } from "./active-filters";
import { LevelTabs } from "./level-tabs";
import { SortMenu } from "./sort-menu";
import { LivePill } from "./live-pill";
import { EmptyState } from "./empty-state";
import { SearchBox } from "./search-box";

export interface SearchViewProps {
  /** "/jobs" (URL is the state) or a landing/company path whose changes navigate to /jobs. */
  basePath?: string;
  preset?: Partial<SearchQuery>;
  showSearchBar?: boolean;
  showSidebar?: boolean;
  header?: ReactNode;
  footer?: ReactNode;
}

const AUTO_PAGES = 3;
const RESULTS_ID = "search-results";

function useCompanyIndex(): Map<string, CompanyInfo> {
  const { data } = useQuery({
    queryKey: ["companies", "index"],
    queryFn: ({ signal }) => api.companies({ pageSize: 100 }, { signal }),
    staleTime: 5 * 60_000,
  });
  return useMemo(() => new Map((data?.data ?? []).map((c) => [c.slug, { name: c.name, domain: c.domain, logoUrl: c.logoUrl }])), [data]);
}

interface LiveState {
  key: string;
  pending: JobListItem[];
  shown: JobListItem[];
}

export function SearchView({
  basePath = "/jobs",
  preset,
  showSearchBar = true,
  showSidebar = true,
  header,
  footer,
}: SearchViewProps): React.JSX.Element {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { query, setQuery, replaceQuery, clearAll } = useSearchState({ basePath, preset });
  const [selectedId, setSelectedId] = useSelectedJob();
  const [previewClosed, setPreviewClosed] = useState(false);
  const companies = useCompanyIndex();
  const key = searchKey(query);

  /* ── Results ── */
  const results = useInfiniteQuery({ ...jobsInfiniteOptions(query), placeholderData: keepPreviousData });
  const pages = results.data?.pages ?? [];
  const first = pages[0];
  const facets = first?.facets;
  const fetched = useMemo(() => pages.flatMap((p) => p.data), [pages]);

  /* ── Live stream: buffer → pill → prepend ── */
  const [live, setLive] = useState<LiveState>({ key, pending: [], shown: [] });
  const liveNow: LiveState = live.key === key ? live : { key, pending: [], shown: [] };
  const filtersKey = JSON.stringify(streamFilters(query));
  useEffect(() => {
    const filters = JSON.parse(filtersKey) as Partial<SearchQuery>;
    return api.subscribe(filters, (event) => {
      if (event.type !== "job") return;
      setLive((s) => {
        const base = s.key === key ? s : { key, pending: [], shown: [] };
        if (base.pending.some((j) => j.id === event.job.id) || base.shown.some((j) => j.id === event.job.id)) return base;
        return { ...base, pending: [event.job, ...base.pending].slice(0, 50) };
      });
    });
  }, [filtersKey, key]);

  const jobs = useMemo(() => {
    const seen = new Set<string>();
    const out: JobListItem[] = [];
    for (const j of [...liveNow.shown, ...fetched]) {
      if (seen.has(j.id)) continue;
      seen.add(j.id);
      out.push(j);
    }
    return out;
  }, [liveNow.shown, fetched]);
  const freshIds = useMemo(() => new Set(liveNow.shown.map((j) => j.id)), [liveNow.shown]);
  const total = (first?.total ?? 0) + liveNow.shown.filter((j) => !fetched.some((f) => f.id === j.id)).length;

  const resultsTop = useRef<HTMLDivElement>(null);
  const showLive = useCallback(() => {
    setLive((s) => (s.key === key ? { ...s, shown: [...s.pending, ...s.shown], pending: [] } : s));
    resultsTop.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [key]);

  /* ── Selection / split preview ── */
  const fromList = selectedId ? jobs.find((j) => j.id === selectedId) : undefined;
  const { data: selectedDetail } = useQuery({ ...jobOptions(selectedId ?? ""), enabled: Boolean(selectedId) && !fromList });
  const previewJob: JobListItem | null = previewClosed ? null : (fromList ?? selectedDetail ?? (selectedId ? null : (jobs[0] ?? null)));
  const activeId = previewJob?.id ?? selectedId;

  const select = useCallback(
    (job: JobListItem) => {
      setPreviewClosed(false);
      setSelectedId(job.id);
    },
    [setSelectedId],
  );
  const prefetch = useCallback((job: JobListItem) => void queryClient.prefetchQuery(jobOptions(job.id)), [queryClient]);

  const isSplit = (): boolean => typeof window !== "undefined" && window.matchMedia(SPLIT_VIEW_QUERY).matches;

  const focusCard = (id: string): void => {
    const el = document.querySelector<HTMLElement>(`[data-job-id="${CSS.escape(id)}"]`);
    el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    el?.querySelector<HTMLAnchorElement>("[data-testid=job-title]")?.focus({ preventScroll: true });
  };

  const move = (delta: number): void => {
    if (jobs.length === 0) return;
    const index = activeId ? jobs.findIndex((j) => j.id === activeId) : -1;
    const next = jobs[Math.min(jobs.length - 1, Math.max(0, index + delta))];
    if (!next) return;
    select(next);
    focusCard(next.id);
    prefetch(next);
    if (index + delta >= jobs.length - 3 && results.hasNextPage && !results.isFetchingNextPage) void results.fetchNextPage();
  };

  const current = (): JobListItem | undefined => jobs.find((j) => j.id === activeId);

  useHotkeys({
    j: () => move(1),
    k: () => move(-1),
    ArrowDown: (e) => {
      if (!isSplit()) return;
      e.preventDefault();
      move(1);
    },
    ArrowUp: (e) => {
      if (!isSplit()) return;
      e.preventDefault();
      move(-1);
    },
    Enter: (e) => {
      const job = current();
      if (!job || (e.target instanceof HTMLElement && e.target.closest("button, a"))) return;
      router.push(jobPath(job));
    },
    s: () => {
      const job = current();
      if (!job) return;
      const saved = useSavedStore.getState().toggle(job);
      notify.message(saved ? "Saved" : "Removed from saved", { description: job.title });
    },
    o: () => {
      const job = current();
      if (job) window.open(job.applyUrl, "_blank", "noopener,noreferrer");
    },
    Escape: () => {
      setPreviewClosed(true);
      setSelectedId(null);
    },
  });

  /* ── Infinite scroll ── */
  const sentinel = useRef<HTMLDivElement>(null);
  const autoLoad = pages.length < AUTO_PAGES;
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = results;
  useEffect(() => {
    const node = sentinel.current;
    if (!node || !autoLoad || !hasNextPage) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting) && !isFetchingNextPage) void fetchNextPage();
      },
      { rootMargin: "800px 0px" },
    );
    io.observe(node);
    return () => io.disconnect();
  }, [autoLoad, hasNextPage, isFetchingNextPage, fetchNextPage, pages.length]);

  /* ── Search box ── */
  const [what, setWhat] = useState(query.q ?? "");
  const [where, setWhere] = useState((query.location ?? []).join(", "));
  const [whereDirty, setWhereDirty] = useState(false);
  const lastQ = useRef(query.q ?? "");
  useEffect(() => {
    const q = query.q ?? "";
    if (q !== lastQ.current) {
      lastQ.current = q;
      setWhat(q);
    }
  }, [query.q]);
  useEffect(() => {
    setWhere((query.location ?? []).join(", "));
    setWhereDirty(false);
  }, [query.location]);

  // Live text search: 250 ms debounce, replace history (Enter pushes).
  useEffect(() => {
    if (basePath !== "/jobs") return;
    const text = what.trim();
    if (text === (query.q ?? "")) return;
    const t = setTimeout(() => {
      lastQ.current = text;
      setQuery({ q: text || null }, { history: "replace" });
    }, 250);
    return () => clearTimeout(t);
  }, [what, query.q, setQuery, basePath]);

  const submit = useCallback(
    async (whatText: string, whereText: string) => {
      const { smartSubmit } = await import("@/lib/smart-submit");
      const list = [...companies.entries()].map(([slug, c]) => ({ slug, name: c.name }));
      const previous = query;
      const { next, tokens } = smartSubmit(query, whatText, whereDirty ? whereText : null, list);
      lastQ.current = next.q ?? "";
      setWhat(next.q ?? "");
      replaceQuery(next);
      if (tokens.length > 0) {
        notify.message("Smart filters applied", {
          description: tokens.map((t) => t.label).join(" · "),
          action: {
            label: "Undo",
            onClick: () => {
              lastQ.current = whatText.trim();
              setWhat(whatText.trim());
              replaceQuery({ ...previous, q: whatText.trim() || undefined });
            },
          },
        });
      }
    },
    [companies, query, replaceQuery, whereDirty],
  );

  /* ── Derived UI ── */
  const chips = activeChips(query, facets, companies);
  const filterCount = activeFilterCount(query, preset);
  const panelProps = { query, facets, setQuery: (p: QueryPatch) => setQuery(p), companies };
  const isInitialLoading = results.isPending && !first;
  const isRefreshing = results.isPlaceholderData;
  const pendingCount = liveNow.pending.filter((j) => !jobs.some((x) => x.id === j.id)).length;
  const stickyTop = showSearchBar ? "top-[136px]" : "top-[72px]";
  const stickyHeight = showSearchBar ? "h-[calc(100dvh-152px)]" : "h-[calc(100dvh-88px)]";

  return (
    <div>
      {showSearchBar && (
        <div className="glass sticky top-14 z-30 border-b border-border">
          <div className="container-wide flex items-center gap-2 py-3">
            <SearchBox
              variant="bar"
              className="flex-1"
              what={what}
              where={where}
              primary
              onWhatChange={setWhat}
              onWhereChange={(v) => {
                setWhere(v);
                setWhereDirty(true);
              }}
              onSubmit={(w, l) => void submit(w, l)}
              onPickCompany={(c) => {
                lastQ.current = "";
                setWhat("");
                replaceQuery({ ...query, q: undefined, company: [...new Set([...(query.company ?? []), c.slug])] });
              }}
              onPickSkill={(s) => {
                lastQ.current = "";
                setWhat("");
                replaceQuery({ ...query, q: undefined, skills: [...new Set([...(query.skills ?? []), s])] });
              }}
              onPickLocation={(l) => {
                setWhere(l);
                setWhereDirty(false);
                setQuery({ location: [l] });
              }}
            />
            <MobileFilters count={filterCount} total={first?.total} panelProps={panelProps} />
          </div>
        </div>
      )}

      <div className={cn("container-wide grid gap-6 pt-6", showSidebar && "lg:grid-cols-[240px_minmax(0,1fr)] xl:gap-8")}>
        {showSidebar && (
          <aside aria-label="Filters" className={cn("scroll-quiet sticky hidden self-start overflow-y-auto pb-6 pr-1 lg:block", stickyTop, stickyHeight)}>
            <FilterPanel {...panelProps} idPrefix="d" />
          </aside>
        )}

        <section aria-label="Results" className="min-w-0">
          {header}
          <div ref={resultsTop} className="scroll-mt-40" />
          {/* Toolbar spans list + preview */}
          <LevelTabs levels={query.level} facets={facets} onChange={(levels) => setQuery({ level: levels })} controls={RESULTS_ID} />
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
            <p className="flex h-7 items-center text-[13px] text-muted-foreground" aria-live="polite" data-testid="result-count">
              {first ? (
                <>
                  <span className="font-semibold text-foreground tabular" data-testid="result-total">{formatCount(total)}</span>&nbsp;{total === 1 ? "job" : "jobs"}
                  <span className="mx-1.5 text-border-strong">·</span>
                  <span className="font-mono text-xs tabular">{formatTookMs(first.tookMs)}</span>
                  {first.corrections && Object.keys(first.corrections).length > 0 && (
                    <span className="ml-2 text-muted-foreground" data-testid="search-corrected">
                      · Showing results for{" "}
                      <span className="font-medium text-foreground">
                        {Object.values(first.corrections).join(" ")}
                      </span>
                    </span>
                  )}
                  {first.fuzzy && <span className="ml-2 text-muted-foreground">· Closest matches</span>}
                </>
              ) : (
                <span className="skeleton inline-block h-3.5 w-24 align-middle" />
              )}
            </p>
            {!showSearchBar && <MobileFilters count={filterCount} total={first?.total} panelProps={panelProps} className="h-8 rounded-lg lg:hidden" />}
            <div className="order-2 ml-auto sm:order-3">
              <SortMenu sort={query.sort} onChange={(sort) => setQuery({ sort })} />
            </div>
            {chips.length > 0 && (
              <div className="order-3 w-full sm:order-2 sm:w-auto sm:flex-1">
                <ActiveFilters chips={chips} onRemove={(c) => setQuery(c.patch)} onClear={clearAll} />
              </div>
            )}
          </div>

          <div className="mt-4 grid gap-6 xl:grid-cols-[minmax(0,440px)_minmax(0,1fr)]">
            <div className="min-w-0">
              <LivePill count={pendingCount} onClick={showLive} />
              <div
                id={RESULTS_ID}
                role="list"
                aria-busy={isRefreshing || isInitialLoading}
                className={cn("relative grid grid-cols-1 gap-3 transition-opacity duration-200", isRefreshing && "opacity-60")}
              >
                {isRefreshing && (
                  <div aria-hidden="true" className="absolute -top-2 left-0 right-0 h-0.5 overflow-hidden rounded-full">
                    <div className="skeleton h-full w-full bg-brand-soft-strong" />
                  </div>
                )}
                {isInitialLoading && Array.from({ length: 6 }, (_, i) => <JobCardSkeleton key={i} />)}
                {results.isError && !first && (
                  <div role="alert" className="flex items-center gap-3 rounded-xl border border-border p-4 text-sm">
                    <TriangleAlert className="size-4 text-danger" />
                    <span className="flex-1">We couldn&apos;t load jobs right now.</span>
                    <Button size="sm" variant="outline" onClick={() => void results.refetch()}>
                      Retry
                    </Button>
                  </div>
                )}
                {jobs.map((job, i) => (
                  <div role="listitem" key={job.id} className="min-w-0">
                    <JobCard
                      job={job}
                      selected={job.id === previewJob?.id}
                      implicitSelection={!selectedId}
                      onSelect={(j) => {
                        if (isSplit()) select(j);
                        else router.push(jobPath(j));
                      }}
                      onPrefetch={prefetch}
                      fresh={freshIds.has(job.id)}
                      priority={i < 4}
                    />
                  </div>
                ))}
                {first && jobs.length === 0 && !isRefreshing && (
                  <EmptyState query={query} facets={facets} onApply={(patch) => setQuery(patch)} onClear={clearAll} />
                )}
                {isFetchingNextPage && Array.from({ length: 2 }, (_, i) => <JobCardSkeleton key={`more-${i}`} />)}
              </div>

              <div ref={sentinel} aria-hidden="true" />
              {hasNextPage && !isFetchingNextPage && (
                <div className="mt-6 flex justify-center">
                  <Button variant="outline" onClick={() => void fetchNextPage()} data-testid="load-more">
                    Load more jobs
                  </Button>
                </div>
              )}
              {first && !hasNextPage && jobs.length > 0 && (
                <p className="mt-8 text-center text-[13px] text-subtle-foreground">You&apos;re all caught up · new roles appear here live</p>
              )}
              {footer}
            </div>

            <aside aria-label="Job preview" className={cn("sticky hidden self-start xl:block", stickyTop, stickyHeight)}>
              {previewJob ? <JobPreview job={previewJob} /> : <KeyboardHints />}
            </aside>
          </div>
        </section>
      </div>
    </div>
  );
}

function KeyboardHints(): React.JSX.Element {
  const rows: [string, string][] = [
    ["j / k", "Next / previous job"],
    ["Enter", "Open the full page"],
    ["s", "Save or unsave"],
    ["o", "Open the apply link"],
    ["/", "Focus search"],
    ["⌘ K", "Command palette"],
    ["Esc", "Close preview"],
  ];
  return (
    <div className="grid h-full place-items-center rounded-2xl border border-dashed border-border p-8">
      <div className="w-full max-w-xs">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Keyboard className="size-4 text-muted-foreground" /> Keyboard shortcuts
        </div>
        <dl className="mt-4 grid gap-2.5 text-[13px]">
          {rows.map(([k, label]) => (
            <div key={k} className="flex items-center justify-between gap-4">
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="flex gap-1">
                {k.split(" / ").map((part) => (
                  <Kbd key={part}>{part}</Kbd>
                ))}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}

const loadFilterSheet = () => import("./filter-sheet").then((m) => m.FilterSheet);
const FilterSheet = dynamic(loadFilterSheet, { ssr: false });

function MobileFilters({
  count,
  total,
  panelProps,
  className,
}: {
  count: number;
  total: number | undefined;
  panelProps: React.ComponentProps<typeof FilterPanel>;
  className?: string;
}): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  return (
    <>
      <Button
        variant="outline"
        size="md"
        className={cn("h-11 rounded-xl lg:hidden", className)}
        data-testid="mobile-filters"
        aria-haspopup="dialog"
        aria-expanded={open}
        onPointerEnter={() => void loadFilterSheet()}
        onTouchStart={() => void loadFilterSheet()}
        onClick={() => {
          setLoaded(true);
          setOpen(true);
        }}
      >
        <SlidersHorizontal className="size-4" />
        <span className="max-sm:sr-only">Filters</span>
        {count > 0 && (
          <span className="grid h-[18px] min-w-[18px] place-items-center rounded-full bg-brand px-1 font-mono text-[10.5px] font-semibold text-brand-foreground tabular">
            {count}
          </span>
        )}
      </Button>
      {loaded && <FilterSheet open={open} onOpenChange={setOpen} total={total} panelProps={panelProps} />}
    </>
  );
}
