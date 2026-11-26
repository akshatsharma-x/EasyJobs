import * as React from "react";
import { cn } from "@/lib/cn";

/** Native checkbox with role="switch" (zero JS), styled as a toggle. */
export function Switch({ className, ...props }: Omit<React.ComponentProps<"input">, "type" | "role">): React.JSX.Element {
  return (
    <span className={cn("relative inline-flex h-5 w-9 shrink-0", className)}>
      <input
        type="checkbox"
        role="switch"
        className="peer absolute inset-0 cursor-pointer appearance-none rounded-full bg-border-strong transition-colors duration-200 checked:bg-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:opacity-50"
        {...props}
      />
      <span aria-hidden="true" className="pointer-events-none absolute left-0.5 top-0.5 size-4 rounded-full bg-white shadow-sm transition-transform duration-200 ease-[var(--ease-spring)] peer-checked:translate-x-4" />
    </span>
  );
}
