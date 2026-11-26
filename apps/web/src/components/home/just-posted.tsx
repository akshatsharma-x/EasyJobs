"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useState } from "react";
import { ArrowRight } from "lucide-react";
import type { JobListItem } from "@easyjobs/contract";
import { LiveDot } from "@/components/live-dot";
import { StaticJustPostedList } from "./just-posted-row";

/** Newest jobs. The animated live list (motion) loads after hydration; until then the identical static list shows. */
export function JustPosted({ initial }: { initial: JobListItem[] }): React.JSX.Element {
  return (
    <section aria-labelledby="just-posted" className="rounded-2xl border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <h2 id="just-posted" className="flex items-center gap-2.5 text-[15px] font-semibold">
          <LiveDot />
          Just posted
        </h2>
        <Link href="/jobs?sort=newest" className="inline-flex items-center gap-1 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground">
          View all <ArrowRight className="size-3.5" />
        </Link>
      </div>
      <LiveList initial={initial} />
    </section>
  );
}

const Live = dynamic<{ initial: JobListItem[]; onReady: () => void }>(() => import("./just-posted-live"), { ssr: false });

/** Static (SSR) list until the animated live list has mounted — swapped before paint, so no flicker. */
function LiveList({ initial }: { initial: JobListItem[] }): React.JSX.Element {
  const [ready, setReady] = useState(false);
  return (
    <>
      {!ready && <StaticJustPostedList jobs={initial} />}
      <Live initial={initial} onReady={() => setReady(true)} />
    </>
  );
}
