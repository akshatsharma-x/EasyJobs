"use client";

import Link from "next/link";
import { memo } from "react";
import { jobPath, LABELS, type JobListItem } from "@easyjobs/contract";
import { CompanyLogo } from "@/components/company/company-logo";
import { TimeAgo } from "@/components/time-ago";
import { LiveDot } from "@/components/live-dot";
import { ApplyLink, SaveButton } from "./job-actions";
import { JobBadges, SourceMark } from "./job-badges";
import { formatLocations, isNewJob } from "@/lib/format";
import { useNow } from "@/lib/hooks/use-now";
import { cn } from "@/lib/cn";

export interface JobCardProps {
  job: JobListItem;
  selected?: boolean;
  /** When set, a plain click selects the job (split view) instead of navigating. */
  onSelect?: (job: JobListItem) => void;
  onPrefetch?: (job: JobListItem) => void;
  /** Selection shown by the split preview by default (not chosen by the user) — only visible in split view. */
  implicitSelection?: boolean;
  /** Just arrived via the live stream. */
  fresh?: boolean;
  priority?: boolean;
  /** Heading level of the title (h2 in result lists, h3 under a section heading). */
  headingLevel?: "h2" | "h3";
}

export function PostedAt({ iso }: { iso: string }): React.JSX.Element {
  const now = useNow();
  const fresh = isNewJob(iso, now);
  return (
    <span className="flex shrink-0 items-center gap-2 pt-0.5 text-xs">
      {fresh && (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-live-soft px-1.5 py-0.5 text-[11px] font-medium text-live-foreground">
          <LiveDot className="size-1.5" />
          New
        </span>
      )}
      <TimeAgo iso={iso} className="font-mono text-subtle-foreground tabular" />
    </span>
  );
}

function JobCardImpl({ job, selected = false, implicitSelection = false, onSelect, onPrefetch, fresh = false, priority = false, headingLevel = "h2" }: JobCardProps): React.JSX.Element {
  const Heading = headingLevel;
  const location = formatLocations(job.locations, job.isRemote);
  const mode = job.workMode && !(job.workMode === "remote" && /remote/i.test(location)) ? LABELS.workMode[job.workMode] : null;
  return (
    <article
      data-job-id={job.id}
      data-selected={selected || undefined}
      data-testid="job-card"
      onMouseEnter={() => onPrefetch?.(job)}
      onFocus={() => onPrefetch?.(job)}
      className={cn(
        "group relative rounded-[14px] border border-border bg-card p-4 transition-[transform,border-color,box-shadow,background-color] duration-200 ease-out",
        "hover:-translate-y-px hover:border-border-strong hover:shadow-md",
        selected &&
          (implicitSelection
            ? "xl:border-brand/35 xl:bg-brand-soft xl:hover:border-brand/45 xl:hover:shadow-none"
            : "border-brand/35 bg-brand-soft hover:border-brand/45 hover:shadow-none"),
        fresh && "animate-fade-up",
      )}
    >
      {selected && (
        <span aria-hidden="true" className={cn("absolute inset-y-4 left-0 w-[3px] rounded-r-full bg-brand", implicitSelection && "hidden xl:block")} />
      )}
      <div className="flex gap-3.5">
        <CompanyLogo company={job.company} size={40} priority={priority} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-3">
            <Heading className="min-w-0 flex-1 text-[15px] font-semibold leading-snug tracking-[-0.012em]">
              <Link
                href={jobPath(job)}
                prefetch={false}
                aria-current={selected && !implicitSelection ? "true" : undefined}
                data-testid="job-title"
                onClick={(e) => {
                  if (!onSelect || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
                  e.preventDefault();
                  onSelect(job);
                }}
                className="line-clamp-2 rounded-sm outline-none after:absolute after:inset-0 after:rounded-[14px] focus-visible:after:ring-2 focus-visible:after:ring-brand"
              >
                {job.title}
              </Link>
            </Heading>
            <PostedAt iso={job.postedAt} />
          </div>
          <p className="mt-0.5 truncate text-[13px] text-muted-foreground">
            <span className="font-medium text-foreground/80">{job.company.name}</span>
            <span aria-hidden="true"> · </span>
            {location}
            {mode && (
              <>
                <span aria-hidden="true"> · </span>
                {mode}
              </>
            )}
          </p>
          <JobBadges job={job} className="mt-2.5" />
          <div className="mt-3 flex min-h-8 items-center gap-3">
            <SourceMark job={job} />
            {job.skills.length > 0 && (
              <p className="hidden min-w-0 truncate text-xs text-subtle-foreground sm:block">{job.skills.slice(0, 3).join(" · ")}</p>
            )}
            <div className="relative z-10 ml-auto flex items-center gap-1">
              <SaveButton job={job} />
              <ApplyLink job={job} />
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}

export const JobCard = memo(JobCardImpl);

export function JobCardSkeleton(): React.JSX.Element {
  return (
    <div aria-hidden="true" className="rounded-[14px] border border-border bg-card p-4">
      <div className="flex gap-3.5">
        <div className="skeleton size-10 shrink-0 rounded-[10px]" />
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-3">
            <div className="skeleton h-[18px] flex-1 max-w-[70%]" />
            <div className="skeleton h-3.5 w-12" />
          </div>
          <div className="skeleton mt-2 h-3.5 w-1/2" />
          <div className="mt-3 flex gap-1.5">
            <div className="skeleton h-[22px] w-20" />
            <div className="skeleton h-[22px] w-16" />
            <div className="skeleton h-[22px] w-20" />
          </div>
          <div className="mt-3 flex h-8 items-center gap-3">
            <div className="skeleton h-3.5 w-16" />
            <div className="skeleton h-3.5 w-28" />
            <div className="ml-auto skeleton h-8 w-20 rounded-[10px]" />
          </div>
        </div>
      </div>
    </div>
  );
}
