import { cn } from "@/lib/cn";

/** EasyJobs mark: three feed bars (newest on top) in a cobalt tile. */
export function LogoMark({ className }: { className?: string }): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={cn("size-6", className)}>
      <rect width="24" height="24" rx="7" fill="var(--brand)" />
      <rect x="6" y="6.5" width="12" height="2.6" rx="1.3" fill="#fff" />
      <rect x="6" y="10.7" width="8.5" height="2.6" rx="1.3" fill="#fff" fillOpacity=".78" />
      <rect x="6" y="14.9" width="5.2" height="2.6" rx="1.3" fill="#fff" fillOpacity=".55" />
    </svg>
  );
}

export function Wordmark({ className }: { className?: string }): React.JSX.Element {
  return (
    <span className={cn("inline-flex items-center gap-2 text-[15px] font-semibold tracking-[-0.02em]", className)}>
      <LogoMark />
      EasyJobs
    </span>
  );
}
