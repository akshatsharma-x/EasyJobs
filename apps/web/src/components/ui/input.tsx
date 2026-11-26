import * as React from "react";
import { cn } from "@/lib/cn";

export function Input({ className, type = "text", ...props }: React.ComponentProps<"input">): React.JSX.Element {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-9 w-full min-w-0 rounded-[10px] border border-input bg-background px-3 text-sm text-foreground shadow-xs outline-none transition-[border-color,box-shadow] duration-150",
        "focus-visible:border-brand focus-visible:ring-[3px] focus-visible:ring-brand/20 focus-visible:outline-none",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

export function Textarea({ className, ...props }: React.ComponentProps<"textarea">): React.JSX.Element {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "w-full min-w-0 rounded-[10px] border border-input bg-background px-3 py-2 text-sm text-foreground shadow-xs outline-none transition-[border-color,box-shadow] duration-150",
        "focus-visible:border-brand focus-visible:ring-[3px] focus-visible:ring-brand/20 focus-visible:outline-none",
        className,
      )}
      {...props}
    />
  );
}
