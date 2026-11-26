"use client";

import { useEffect, useRef } from "react";
import { formatCount } from "@/lib/format";
import { cn } from "@/lib/cn";

/** Animated count (tabular, no layout shift; rAF, no animation library). Server renders the final value. */
export function NumberTicker({ value, className, duration = 800 }: { value: number; className?: string; duration?: number }): React.JSX.Element {
  const ref = useRef<HTMLSpanElement>(null);
  const previous = useRef(value);

  useEffect(() => {
    const node = ref.current;
    const from = previous.current;
    previous.current = value;
    if (!node || from === value) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      node.textContent = formatCount(value);
      return;
    }
    const start = performance.now();
    let raf = 0;
    const tick = (now: number): void => {
      const p = Math.min(1, (now - start) / duration);
      const eased = 1 - (1 - p) ** 3;
      node.textContent = formatCount(Math.round(from + (value - from) * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);

  return (
    <span ref={ref} className={cn("tabular", className)}>
      {formatCount(value)}
    </span>
  );
}
