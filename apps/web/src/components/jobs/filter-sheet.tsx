"use client";

import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { formatCount } from "@/lib/format";
import { FilterPanel, type FilterPanelProps } from "./filters";

/** Mobile filter bottom sheet (vaul) — loaded on first open. */
export function FilterSheet({
  open,
  onOpenChange,
  total,
  panelProps,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  total: number | undefined;
  panelProps: FilterPanelProps;
}): React.JSX.Element {
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent data-testid="filter-sheet">
        <div className="flex items-center justify-between px-5 pb-2 pt-1">
          <DrawerTitle className="text-base font-semibold">Filters</DrawerTitle>
          <DrawerDescription className="sr-only">Narrow down the job list</DrawerDescription>
        </div>
        <div className="scroll-quiet flex-1 overflow-y-auto px-5 pb-4">
          <FilterPanel {...panelProps} idPrefix="m" />
        </div>
        <div className="border-t border-border p-4">
          <Button size="lg" className="w-full" onClick={() => onOpenChange(false)} data-testid="apply-filters">
            Show {total === undefined ? "" : formatCount(total)} jobs
          </Button>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
