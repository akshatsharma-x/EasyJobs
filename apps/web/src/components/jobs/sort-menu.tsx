import { ArrowDownUp, ChevronDown } from "lucide-react";
import { LABELS, SORTS, type SortBy } from "@easyjobs/contract";

/** Native <select> — accessible, zero JS dependencies. */
export function SortMenu({ sort, onChange }: { sort: SortBy; onChange: (sort: SortBy) => void }): React.JSX.Element {
  return (
    <label className="relative inline-flex h-8 items-center gap-1.5 rounded-lg pl-2 pr-1 text-[13px] text-muted-foreground transition-colors hover:bg-muted has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand">
      <ArrowDownUp aria-hidden="true" className="size-3.5" />
      <span className="hidden sm:inline">Sort:</span>
      <select
        value={sort}
        onChange={(e) => onChange(e.currentTarget.value as SortBy)}
        aria-label="Sort jobs by"
        data-testid="sort-select"
        className="cursor-pointer appearance-none bg-transparent pr-5 font-medium text-foreground outline-none"
      >
        {SORTS.map((s) => (
          <option key={s} value={s}>
            {LABELS.sort[s]}
          </option>
        ))}
      </select>
      <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-1.5 size-3.5" />
    </label>
  );
}
