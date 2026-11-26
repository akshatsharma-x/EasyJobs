import { JobCardSkeleton } from "./job-card";

/** Loading shell that matches the search layout exactly (no layout jump when results arrive). */
export function SearchSkeleton({ withBar = true, withSidebar = true }: { withBar?: boolean; withSidebar?: boolean }): React.JSX.Element {
  return (
    <div aria-busy="true" aria-label="Loading jobs">
      {withBar && (
        <div className="sticky top-14 z-30 border-b border-border bg-background">
          <div className="container-wide flex gap-2 py-3">
            <div className="skeleton h-11 flex-1 rounded-2xl" />
          </div>
        </div>
      )}
      <div className={withSidebar ? "container-wide grid gap-6 pt-6 lg:grid-cols-[240px_minmax(0,1fr)] xl:gap-8" : "container-wide grid gap-6 pt-6"}>
        {withSidebar && (
          <div className="hidden gap-3 lg:grid lg:content-start">
            <div className="skeleton h-[74px] rounded-xl" />
            {Array.from({ length: 7 }, (_, i) => (
              <div key={i} className="skeleton h-4" style={{ width: `${80 - (i % 3) * 14}%` }} />
            ))}
          </div>
        )}
        <div className="min-w-0">
          <div className="flex gap-1">
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="skeleton h-8 w-24 rounded-full" />
            ))}
          </div>
          <div className="skeleton mt-4 h-4 w-28" />
          <div className="mt-4 grid gap-6 xl:grid-cols-[minmax(0,440px)_minmax(0,1fr)]">
            <div className="grid gap-3">
              {Array.from({ length: 5 }, (_, i) => (
                <JobCardSkeleton key={i} />
              ))}
            </div>
            <div className="hidden xl:block">
              <div className="skeleton h-[calc(100dvh-200px)] rounded-2xl" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
