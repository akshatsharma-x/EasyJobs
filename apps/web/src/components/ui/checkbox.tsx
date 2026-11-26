import * as React from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/cn";

/** Native checkbox (zero JS, fully accessible), styled to the design system. */
export function Checkbox({ className, ...props }: Omit<React.ComponentProps<"input">, "type">): React.JSX.Element {
  return (
    <span className="relative inline-grid size-4 shrink-0 place-items-center">
      <input
        type="checkbox"
        className={cn(
          "peer size-4 cursor-pointer appearance-none rounded-[5px] border border-border-strong bg-background shadow-xs transition-colors duration-150",
          "checked:border-brand checked:bg-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-default disabled:opacity-50",
          className,
        )}
        {...props}
      />
      <Check aria-hidden="true" strokeWidth={3} className="pointer-events-none absolute size-3 text-brand-foreground opacity-0 transition-opacity duration-100 peer-checked:opacity-100" />
    </span>
  );
}
