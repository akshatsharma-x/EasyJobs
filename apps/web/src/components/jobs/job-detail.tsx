import Link from "next/link";
import {
  BadgeCheck,
  Briefcase,
  CalendarClock,
  Clock,
  ExternalLink,
  GraduationCap,
  Laptop,
  MapPin,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";
import { LABELS, isOfficialKind, type JobDetail, type JobListItem } from "@easyjobs/contract";
import { CompanyLogo } from "@/components/company/company-logo";
import { TimeAgo } from "@/components/time-ago";
import { Badge } from "@/components/ui/badge";
import { formatBatches, formatDate, formatExperience, formatSalary } from "@/lib/format";
import { HIDDEN_TAGS, tagLabel } from "@/lib/labels";
import { cn } from "@/lib/cn";

export function JobTitleBlock({
  job,
  as: Heading = "h1",
  size = "lg",
}: {
  job: JobListItem;
  as?: "h1" | "h2";
  size?: "lg" | "md";
}): React.JSX.Element {
  return (
    <div className="flex items-start gap-4">
      <CompanyLogo company={job.company} size={size === "lg" ? 64 : 48} priority />
      <div className={cn("min-w-0 flex-1", size === "md" && "pr-8")}>
        <Link
          href={`/companies/${job.company.slug}`}
          className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          {job.company.name}
        </Link>
        <Heading
          className={cn(
            "mt-1 font-semibold leading-[1.15] tracking-[-0.03em]",
            size === "lg" ? "text-[28px] sm:text-[34px]" : "text-[22px]",
          )}
        >
          {job.title}
        </Heading>
        <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <MapPin className="size-3.5" />
            {job.locations.length > 0 ? job.locations.join(" · ") : job.isRemote ? "Remote" : "Location not specified"}
          </span>
          {job.isOfficial && (
            <span className="inline-flex items-center gap-1 font-medium text-brand-text">
              <BadgeCheck className="size-3.5" /> Official listing
            </span>
          )}
        </p>
      </div>
    </div>
  );
}

interface Fact {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}

export function JobFacts({ job, columns = 3 }: { job: JobListItem & Partial<JobDetail>; columns?: 2 | 3 }): React.JSX.Element {
  const salary = formatSalary(job.salary);
  const facts: Fact[] = [
    { icon: TrendingUp, label: "Experience", value: formatExperience(job.experienceMin, job.experienceMax, job.experienceLevel) },
    {
      icon: Wallet,
      label: job.jobType === "internship" ? "Stipend" : "Salary",
      value: salary ?? <span className="text-subtle-foreground">Not disclosed</span>,
      mono: Boolean(salary),
    },
    { icon: MapPin, label: "Location", value: job.locations.length > 0 ? job.locations.join(", ") : job.isRemote ? "Remote" : "—" },
    { icon: Laptop, label: "Work mode", value: job.workMode ? LABELS.workMode[job.workMode] : job.isRemote ? "Remote" : "—" },
    { icon: Briefcase, label: "Job type", value: LABELS.jobType[job.jobType] },
    { icon: Users, label: "Batch", value: job.batches.length > 0 ? formatBatches(job.batches).replace(/ batch$/, "") : "Any" },
    { icon: GraduationCap, label: "Degrees", value: job.degrees && job.degrees.length > 0 ? job.degrees.join(", ") : "Any" },
    {
      icon: Clock,
      label: "Posted",
      value: (
        <span>
          {formatDate(job.postedAt)} · <TimeAgo iso={job.postedAt} className="text-muted-foreground" />
        </span>
      ),
    },
    {
      icon: CalendarClock,
      label: "Apply by",
      value: job.validThrough ? formatDate(job.validThrough) : <span className="text-subtle-foreground">Open until filled</span>,
    },
  ];
  return (
    <dl
      className={cn(
        "grid overflow-hidden rounded-xl border border-border bg-border",
        "gap-px [&>div]:bg-card",
        columns === 3
          ? "grid-cols-2 sm:grid-cols-3 max-sm:[&>div:last-child:nth-child(odd)]:col-span-2"
          : "grid-cols-2 [&>div:last-child:nth-child(odd)]:col-span-2",
      )}
    >
      {facts.map((f) => (
        <div key={f.label} className="min-w-0 px-4 py-3">
          <dt className="flex items-center gap-1.5 text-xs text-subtle-foreground">
            <f.icon className="size-3.5" />
            {f.label}
          </dt>
          <dd className={cn("mt-1 text-sm font-medium leading-snug break-words", f.mono && "font-mono text-[13px] tabular")}>{f.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function JobDescription({ html, summary }: { html: string | null | undefined; summary?: string | null }): React.JSX.Element {
  if (!html) {
    return (
      <div className="prose-job">
        <p>{summary ?? "The full description is available on the original posting."}</p>
      </div>
    );
  }
  return <div className="prose-job" dangerouslySetInnerHTML={{ __html: html }} />;
}

export function JobSkills({ job }: { job: JobListItem }): React.JSX.Element | null {
  const tags = job.tags.filter((t) => !HIDDEN_TAGS.has(t));
  if (job.skills.length === 0 && tags.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {tags.map((t) => (
        <Badge key={`t-${t}`} variant="brand">
          {tagLabel(t)}
        </Badge>
      ))}
      {job.skills.map((s) => (
        <Badge key={s} variant="outline">
          {s}
        </Badge>
      ))}
    </div>
  );
}

export function JobSources({ job }: { job: JobListItem }): React.JSX.Element {
  return (
    <ul className="grid gap-2">
      {job.sources.map((s) => {
        const official = isOfficialKind(s.kind);
        return (
          <li key={`${s.id}-${s.url}`}>
            <a
              href={s.url}
              target="_blank"
              // Some sources' terms require a followed link back (contract 1.1 SourceTerms.followLinkRequired).
              rel={s.terms?.followLinkRequired ? "noopener noreferrer" : "noopener noreferrer nofollow"}
              className="group flex items-center gap-3 rounded-xl border border-border px-3.5 py-2.5 text-sm transition-colors hover:border-border-strong hover:bg-surface"
            >
              <span
                className={cn(
                  "grid size-7 place-items-center rounded-lg",
                  official ? "bg-brand-soft text-brand-text" : "bg-muted text-muted-foreground",
                )}
              >
                {official ? <BadgeCheck className="size-4" /> : <ExternalLink className="size-3.5" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{s.name}</span>
                <span className="block text-xs text-subtle-foreground">{s.attribution ?? LABELS.sourceKind[s.kind]}</span>
              </span>
              <ExternalLink className="size-3.5 text-subtle-foreground transition-colors group-hover:text-foreground" />
            </a>
          </li>
        );
      })}
    </ul>
  );
}

export function ClosedBanner({ job }: { job: Partial<JobDetail> }): React.JSX.Element | null {
  if (job.status !== "closed") return null;
  return (
    <div role="status" className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-200">
      <strong className="font-semibold">This job is closed.</strong> It was last seen{" "}
      {job.lastSeenAt ? formatDate(job.lastSeenAt) : "recently"}. Similar open roles are listed below.
    </div>
  );
}
