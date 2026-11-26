"use client";

import { formatRelativeTime } from "@/lib/format";
import { useNow } from "@/lib/hooks/use-now";

export function TimeAgo({ iso, className }: { iso: string; className?: string }): React.JSX.Element {
  const now = useNow();
  return (
    <time dateTime={iso} className={className} suppressHydrationWarning title={new Date(iso).toUTCString()}>
      {formatRelativeTime(iso, now)}
    </time>
  );
}
