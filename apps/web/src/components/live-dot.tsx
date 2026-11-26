import { cn } from "@/lib/cn";

export function LiveDot({ className }: { className?: string }): React.JSX.Element {
  return <span aria-hidden="true" className={cn("inline-block size-2 shrink-0 rounded-full bg-live animate-live-pulse", className)} />;
}
