"use client";

import { ArrowUp } from "lucide-react";
import { formatCount } from "@/lib/format";

export function LivePill({ count, onClick }: { count: number; onClick: () => void }): React.JSX.Element {
  return (
    <div className="pointer-events-none sticky top-[132px] z-20 flex h-0 justify-center" aria-live="polite">
      {count > 0 && (
        <button
          type="button"
          onClick={onClick}
          data-testid="live-pill"
          className="pointer-events-auto mt-2 inline-flex h-9 items-center gap-2 rounded-full bg-foreground px-4 text-[13px] font-medium text-background shadow-lg outline-none animate-in fade-in-0 slide-in-from-top-3 zoom-in-95 duration-300 ease-[var(--ease-spring)] focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
        >
          <ArrowUp className="size-3.5" />
          <span className="tabular">{formatCount(count)}</span> new {count === 1 ? "job matches" : "jobs match"} your filters
        </button>
      )}
    </div>
  );
}
