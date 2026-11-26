import { BadgeCheck } from "lucide-react";
import { LABELS, type ExperienceLevel, type JobListItem } from "@easyjobs/contract";
import { Badge } from "@/components/ui/badge";
import { formatBatches, formatSalary } from "@/lib/format";
import { cn } from "@/lib/cn";

export const LEVEL_SHORT: Record<ExperienceLevel, string> = {
  intern: "Internship",
  fresher: "Fresher",
  entry: "Entry · 0–2 yrs",
  mid: "Mid · 2–5 yrs",
  senior: "Senior · 5–8 yrs",
  lead: "Lead · 8+ yrs",
  executive: "Director+",
};

const NOTABLE_TYPES = new Set(["part_time", "contract", "temporary", "apprenticeship", "freelance"]);

/** ≤ 3 compact badges (+ the source mark = ≤ 4 per card). */
export function JobBadges({ job, className }: { job: JobListItem; className?: string }): React.JSX.Element {
  const salary = formatSalary(job.salary);
  const items: React.ReactNode[] = [];
  items.push(
    <Badge key="level" variant="neutral">
      {LEVEL_SHORT[job.experienceLevel]}
      {NOTABLE_TYPES.has(job.jobType) ? ` · ${LABELS.jobType[job.jobType]}` : ""}
    </Badge>,
  );
  if (salary)
    items.push(
      <Badge key="salary" variant="outline" className="font-mono text-[11.5px] tracking-tight text-foreground/85 tabular">
        {salary}
      </Badge>,
    );
  if (job.batches.length > 0) items.push(<Badge key="batch" variant="outline">{formatBatches(job.batches)}</Badge>);
  else if (job.tags.includes("off-campus")) items.push(<Badge key="tag" variant="outline">Off-campus</Badge>);
  return <div className={cn("flex flex-wrap items-center gap-1.5", className)}>{items.slice(0, 3)}</div>;
}

export function SourceMark({ job, className }: { job: Pick<JobListItem, "isOfficial" | "sources">; className?: string }): React.JSX.Element {
  if (job.isOfficial) {
    return (
      <span className={cn("inline-flex shrink-0 items-center gap-1 text-xs font-medium text-brand-text", className)} title="Listed on the company's official career site">
        <BadgeCheck className="size-3.5" />
        Official
      </span>
    );
  }
  const via = job.sources[0]?.name ?? "job board";
  return <span className={cn("shrink-0 text-xs text-subtle-foreground", className)}>via {via}</span>;
}
