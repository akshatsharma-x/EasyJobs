import Link from "next/link";
import { jobPath, type JobListItem } from "@easyjobs/contract";
import { CompanyLogo } from "@/components/company/company-logo";
import { PostedAt } from "@/components/jobs/job-card";
import { SourceMark } from "@/components/jobs/job-badges";
import { formatLocations, formatSalary } from "@/lib/format";

export const JUST_POSTED_MAX = 6;

export function JustPostedRow({ job }: { job: JobListItem }): React.JSX.Element {
  const salary = formatSalary(job.salary);
  return (
    <Link href={jobPath(job)} prefetch={false} className="group flex items-center gap-3.5 px-5 py-3.5 transition-colors hover:bg-surface">
      <CompanyLogo company={job.company} size={36} defer />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14px] font-medium group-hover:text-foreground">{job.title}</span>
        <span className="mt-0.5 flex items-center gap-1.5 truncate text-[12.5px] text-muted-foreground">
          <span className="truncate">
            {job.company.name} · {formatLocations(job.locations, job.isRemote)}
          </span>
          {salary && <span className="hidden shrink-0 font-mono text-[11.5px] text-foreground/75 tabular sm:inline">· {salary}</span>}
        </span>
      </span>
      <span className="hidden shrink-0 sm:block">
        <SourceMark job={job} />
      </span>
      <PostedAt iso={job.postedAt} />
    </Link>
  );
}

/** Server-rendered list (also the placeholder while the live, animated list loads). */
export function StaticJustPostedList({ jobs }: { jobs: JobListItem[] }): React.JSX.Element {
  return (
    <ul className="divide-y divide-border" aria-live="polite">
      {jobs.slice(0, JUST_POSTED_MAX).map((job) => (
        <li key={job.id}>
          <JustPostedRow job={job} />
        </li>
      ))}
    </ul>
  );
}
