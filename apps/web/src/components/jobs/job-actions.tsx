"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { ArrowUpRight, Bookmark, BookmarkCheck, Flag, Share2 } from "lucide-react";
import { notify } from "@/lib/notify";
import { jobPath, type JobListItem } from "@easyjobs/contract";
import { Button } from "@/components/ui/button";
import { useSavedStore } from "@/lib/saved-store";
import { useSavedHydrated } from "@/lib/hooks/use-hydrated";
import { absoluteUrl } from "@/lib/seo";
import { cn } from "@/lib/cn";

export function useSaveToggle(job: JobListItem): { saved: boolean; ready: boolean; toggle: () => void } {
  const ready = useSavedHydrated();
  const saved = useSavedStore((s) => Boolean(s.entries[job.id]));
  const router = useRouter();
  const toggle = (): void => {
    const store = useSavedStore.getState();
    const previous = store.entries[job.id];
    const nowSaved = store.toggle(job);
    if (nowSaved) {
      notify.success("Saved to your tracker", {
        description: `${job.title} · ${job.company.name}`,
        action: { label: "View", onClick: () => router.push("/saved") },
      });
    } else if (previous) {
      notify.message("Removed from saved", { action: { label: "Undo", onClick: () => useSavedStore.getState().restore(previous) } });
    }
  };
  return { saved, ready, toggle };
}

export function SaveButton({
  job,
  variant = "icon",
  className,
}: {
  job: JobListItem;
  variant?: "icon" | "full";
  className?: string;
}): React.JSX.Element {
  const { saved, ready, toggle } = useSaveToggle(job);
  const on = ready && saved;
  const Icon = on ? BookmarkCheck : Bookmark;
  if (variant === "full") {
    return (
      <Button variant="outline" size="lg" aria-pressed={on} onClick={toggle} data-testid="save-job" className={cn(on && "border-brand/40 text-brand-text", className)}>
        <Icon className={cn("size-4", on && "fill-current")} />
        {on ? "Saved" : "Save"}
      </Button>
    );
  }
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-pressed={on}
      aria-label={on ? `Unsave ${job.title}` : `Save ${job.title}`}
      data-testid="save-job"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        toggle();
      }}
      className={cn(on && "text-brand-text hover:text-brand-text", className)}
    >
      <Icon className={cn("size-[17px]", on && "fill-current")} />
    </Button>
  );
}

export function ApplyLink({
  job,
  size = "sm",
  label,
  className,
}: {
  job: Pick<JobListItem, "applyUrl" | "title" | "company">;
  size?: "sm" | "md" | "lg";
  label?: string;
  className?: string;
}): React.JSX.Element {
  return (
    <Button asChild size={size} variant={size === "sm" ? "outline" : "primary"} className={className}>
      <a
        href={job.applyUrl}
        target="_blank"
        rel="noopener noreferrer nofollow"
        onClick={(e) => e.stopPropagation()}
        aria-label={`${label ?? "Apply"} — ${job.title} at ${job.company.name} (opens in a new tab)`}
      >
        {label ?? "Apply"}
        <ArrowUpRight className="size-3.5" />
      </a>
    </Button>
  );
}

export function ShareButton({ job, className }: { job: Pick<JobListItem, "id" | "slug" | "title" | "company">; className?: string }): React.JSX.Element {
  const share = async (): Promise<void> => {
    const url = absoluteUrl(jobPath(job));
    const title = `${job.title} at ${job.company.name}`;
    try {
      if (navigator.share) {
        await navigator.share({ title, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      notify.success("Link copied", { description: url });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      notify.error("Couldn't share this job", { description: "Copy the address bar link instead." });
    }
  };
  return (
    <Button variant="ghost" size="sm" onClick={() => void share()} className={className}>
      <Share2 className="size-3.5" />
      Share
    </Button>
  );
}

const loadReportDialog = () => import("./report-dialog").then((m) => m.ReportDialog);
const ReportDialog = dynamic(loadReportDialog, { ssr: false });

export function ReportButton({ job, className }: { job: Pick<JobListItem, "id" | "title">; className?: string }): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        onPointerEnter={() => void loadReportDialog()}
        onClick={() => {
          setLoaded(true);
          setOpen(true);
        }}
        className={className}
      >
        <Flag className="size-3.5" />
        Report
      </Button>
      {loaded && <ReportDialog job={job} open={open} onOpenChange={setOpen} />}
    </>
  );
}
