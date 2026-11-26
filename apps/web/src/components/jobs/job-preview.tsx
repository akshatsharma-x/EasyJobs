"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Maximize2 } from "lucide-react";
import { jobPath, type JobListItem } from "@easyjobs/contract";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { jobOptions } from "@/lib/query-keys";
import { ApplyLink, ReportButton, SaveButton, ShareButton } from "./job-actions";
import { applyLabel } from "@/lib/logos";
import { ClosedBanner, JobDescription, JobFacts, JobSkills, JobSources, JobTitleBlock } from "./job-detail";

/** Sticky detail preview of the split view (mail-client style). */
export function JobPreview({ job }: { job: JobListItem | null }): React.JSX.Element {
  const { data: detail, isPending } = useQuery({ ...jobOptions(job?.id ?? ""), enabled: Boolean(job) });

  if (!job) {
    return (
      <div className="grid h-full place-items-center rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
        Select a job to preview it here.
      </div>
    );
  }

  const full = detail ?? undefined;
  return (
    <article aria-label={`${job.title} at ${job.company.name}`} data-testid="job-preview" className="flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-card">
      <div className="scroll-quiet flex-1 overflow-y-auto overscroll-contain p-6" key={job.id}>
        <div className="relative">
          <JobTitleBlock job={job} as="h2" size="md" />
          <Button asChild variant="ghost" size="icon-sm" className="absolute -right-2 -top-2">
            <Link href={jobPath(job)} prefetch={false} aria-label="Open full page" title="Open full page">
              <Maximize2 className="size-4" />
            </Link>
          </Button>
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-2">
          <ApplyLink job={job} size="md" label={applyLabel(job)} />
          <SaveButton job={job} variant="full" className="h-9 px-3.5 text-sm" />
        </div>
        {full && <div className="mt-4"><ClosedBanner job={full} /></div>}
        <div className="mt-6">
          <JobFacts job={{ ...job, ...full }} columns={2} />
        </div>
        <div className="mt-6">
          <JobSkills job={job} />
        </div>
        <section className="mt-7" aria-label="Job description">
          {isPending ? (
            <div className="grid gap-2.5">
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-3.5 w-full" />
              <Skeleton className="h-3.5 w-11/12" />
              <Skeleton className="h-3.5 w-4/5" />
              <Skeleton className="mt-4 h-4 w-1/4" />
              <Skeleton className="h-3.5 w-full" />
              <Skeleton className="h-3.5 w-10/12" />
            </div>
          ) : (
            <JobDescription html={full?.descriptionHtml} summary={job.summary} />
          )}
        </section>
        {job.sources.length > 0 && (
          <section className="mt-8" aria-labelledby="preview-sources">
            <h3 id="preview-sources" className="mb-3 text-sm font-semibold">
              {job.sources.length > 1 ? "Also listed on" : "Source"}
            </h3>
            <JobSources job={job} />
          </section>
        )}
        <div className="mt-6 flex items-center gap-1 border-t border-border pt-4">
          <ShareButton job={job} />
          <ReportButton job={job} />
        </div>
      </div>
    </article>
  );
}
