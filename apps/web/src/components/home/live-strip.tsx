"use client";

import { useEffect, useState } from "react";
import type { StatsResponse } from "@easyjobs/contract";
import { LiveDot } from "@/components/live-dot";
import { NumberTicker } from "@/components/number-ticker";
import { api } from "@/lib/api";
import { formatRelativeTime } from "@/lib/format";
import { useNow } from "@/lib/hooks/use-now";

type LiveStats = Pick<StatsResponse, "totalOpen" | "newLastHour" | "newLast24h" | "lastUpdatedAt">;

export function LiveStrip({ initial }: { initial: LiveStats }): React.JSX.Element {
  const [stats, setStats] = useState<LiveStats>(initial);
  const now = useNow();
  useEffect(() => api.subscribe({}, (e) => e.type === "stats" && setStats(e.stats)), []);
  const updated = stats.lastUpdatedAt ? formatRelativeTime(stats.lastUpdatedAt, now) : null;
  return (
    <p
      className="inline-flex flex-wrap items-center justify-center gap-x-2.5 gap-y-1 rounded-full border border-border bg-background/70 px-3.5 py-1.5 text-[13px] text-muted-foreground backdrop-blur"
      data-testid="live-strip"
    >
      <LiveDot />
      <span>
        <NumberTicker value={stats.totalOpen} className="font-mono font-medium text-foreground" /> open roles
      </span>
      <span aria-hidden="true" className="text-border-strong">·</span>
      <span>
        <NumberTicker value={stats.newLast24h} className="font-mono font-medium text-foreground" /> new today
      </span>
      {updated && (
        <span className="hidden items-center gap-2.5 sm:inline-flex">
          <span aria-hidden="true" className="text-border-strong">·</span>
          <span suppressHydrationWarning>updated {updated}</span>
        </span>
      )}
    </p>
  );
}
