"use client";

import { useRef, type KeyboardEvent } from "react";
import type { ExperienceLevel, Facets } from "@easyjobs/contract";
import { formatCount } from "@/lib/format";
import { cn } from "@/lib/cn";

export const LEVEL_TABS: { id: string; label: string; levels: ExperienceLevel[] }[] = [
  { id: "all", label: "All", levels: [] },
  { id: "intern", label: "Internships", levels: ["intern"] },
  { id: "fresher", label: "Freshers", levels: ["fresher"] },
  { id: "entry", label: "Entry 0–2", levels: ["entry"] },
  { id: "mid", label: "Mid 2–5", levels: ["mid"] },
  { id: "senior", label: "Senior 5+", levels: ["senior", "lead", "executive"] },
];

const sameSet = (a: readonly string[], b: readonly string[]): boolean => a.length === b.length && a.every((x) => b.includes(x));

export function activeLevelTab(levels: ExperienceLevel[] | undefined): string | null {
  const current = levels ?? [];
  return LEVEL_TABS.find((t) => sameSet(t.levels, current))?.id ?? null;
}

/** Experience quick tabs (map to `level`); counts come from the disjunctive level facet. ARIA tablist, roving focus. */
export function LevelTabs({
  levels,
  facets,
  onChange,
  controls,
}: {
  levels: ExperienceLevel[] | undefined;
  facets: Facets | undefined;
  onChange: (levels: ExperienceLevel[]) => void;
  controls?: string;
}): React.JSX.Element {
  const listRef = useRef<HTMLDivElement>(null);
  const active = activeLevelTab(levels);
  const focusable = active ?? "all";
  const count = (tab: (typeof LEVEL_TABS)[number]): number | null => {
    if (!facets) return null;
    const buckets = facets.level;
    if (tab.levels.length === 0) return buckets.reduce((sum, b) => sum + b.count, 0);
    return buckets.filter((b) => tab.levels.includes(b.value as ExperienceLevel)).reduce((s, b) => s + b.count, 0);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>): void => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
    const tabs = [...(listRef.current?.querySelectorAll<HTMLButtonElement>("[role=tab]") ?? [])];
    const i = tabs.indexOf(document.activeElement as HTMLButtonElement);
    const next = e.key === "Home" ? 0 : e.key === "End" ? tabs.length - 1 : (i + (e.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
    e.preventDefault();
    tabs[next]?.focus();
  };
  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label="Experience level"
      onKeyDown={onKeyDown}
      className="scroll-quiet -mx-1 flex gap-1 overflow-x-auto px-1 pb-px [scrollbar-width:none] max-md:pr-8 max-md:[mask-image:linear-gradient(to_right,#000_82%,transparent)]"
      data-testid="level-tabs"
    >
      {LEVEL_TABS.map((tab) => {
        const isActive = active === tab.id;
        const n = count(tab);
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            aria-controls={controls}
            tabIndex={tab.id === focusable ? 0 : -1}
            onClick={() => onChange(tab.levels)}
            className={cn(
              "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium outline-none transition-[background-color,color] duration-200",
              "focus-visible:ring-2 focus-visible:ring-brand",
              isActive ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {tab.label}
            {n !== null && (
              <span className={cn("font-mono text-[11px] tabular", isActive ? "text-background/70" : "text-subtle-foreground")}>{formatCount(n)}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
