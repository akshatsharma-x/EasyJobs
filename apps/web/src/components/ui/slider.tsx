import * as React from "react";
import { cn } from "@/lib/cn";

/** Native range input (keyboard + screen-reader support for free); the filled track is a CSS gradient. */
export function Slider({ className, value, min = 0, max = 100, style, ...props }: Omit<React.ComponentProps<"input">, "type" | "value"> & { value: number; min?: number; max?: number }): React.JSX.Element {
  const pct = max > min ? ((value - min) / (max - min)) * 100 : 0;
  return (
    <input
      type="range"
      min={min}
      max={max}
      value={value}
      className={cn("range-input w-full", className)}
      style={{ ...style, ["--fill" as string]: `${pct}%` }}
      {...props}
    />
  );
}
