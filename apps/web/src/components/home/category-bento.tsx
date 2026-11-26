import Link from "next/link";
import {
  ArrowUpRight,
  BookOpen,
  Briefcase,
  Bug,
  Calculator,
  Cloud,
  CodeXml,
  Cpu,
  Database,
  FileText,
  FlaskConical,
  Handshake,
  Headset,
  Megaphone,
  PenTool,
  Scale,
  Shield,
  Stethoscope,
  Target,
  TrendingUp,
  Users,
} from "lucide-react";
import { LABELS, type FacetBucket, type JobCategory } from "@easyjobs/contract";
import { formatCount } from "@/lib/format";
import { jobsHref } from "@/lib/presets";
import { cn } from "@/lib/cn";

const ICONS: Partial<Record<JobCategory, React.ComponentType<{ className?: string }>>> = {
  software_engineering: CodeXml,
  data_ai: Database,
  devops_cloud: Cloud,
  security: Shield,
  qa_testing: Bug,
  product: Target,
  design: PenTool,
  marketing: Megaphone,
  sales: TrendingUp,
  business_ops: Handshake,
  finance: Calculator,
  hr: Users,
  core_engineering: Cpu,
  consulting: Briefcase,
  customer_support: Headset,
  research: FlaskConical,
  content: FileText,
  legal: Scale,
  healthcare: Stethoscope,
  education: BookOpen,
};

const BLURB: Partial<Record<JobCategory, string>> = {
  software_engineering: "SDE, frontend, backend, mobile & full-stack",
  data_ai: "Analytics, data engineering, ML & GenAI",
};

/** Bento: one 2×2 feature tile, one 2×1 tile, six 1×1 tiles (3 even rows on desktop). */
export function CategoryBento({ buckets, skills = {} }: { buckets: FacetBucket[]; skills?: Record<string, readonly string[]> }): React.JSX.Element {
  const top = buckets.filter((b) => b.value !== "other").slice(0, 8);
  return (
    <ul className="grid auto-rows-[120px] grid-cols-2 gap-3 md:grid-cols-4" data-testid="category-bento">
      {top.map((b, i) => {
        const category = b.value as JobCategory;
        const Icon = ICONS[category] ?? CodeXml;
        const big = i === 0;
        const wide = i === 1;
        const tileSkills = skills[b.value] ?? [];
        return (
          <li key={b.value} className={cn(big && "col-span-2 row-span-2", wide && "col-span-2")}>
            <Link
              href={jobsHref({ category: [category] })}
              className={cn(
                "group relative flex h-full flex-col justify-between overflow-hidden rounded-2xl border border-border bg-card p-4 transition-[border-color,transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:border-border-strong hover:shadow-md",
                big && "p-5 sm:p-6",
              )}
            >
              <span className="flex items-start justify-between">
                <span className={cn("grid place-items-center rounded-xl bg-muted text-foreground transition-colors duration-200 group-hover:bg-brand-soft group-hover:text-brand-text", big ? "size-11" : "size-9")}>
                  <Icon className={big ? "size-5" : "size-[18px]"} />
                </span>
                <ArrowUpRight className="size-4 text-subtle-foreground transition-[color,transform] duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-foreground" />
              </span>
              <span className={cn(wide && "flex items-end justify-between gap-4")}>
                <span className="min-w-0">
                  <span className={cn("block font-semibold tracking-[-0.015em]", big ? "text-[19px] sm:text-[22px]" : "text-[14.5px]")}>
                    {LABELS.category[category] ?? b.label}
                  </span>
                  {big && BLURB[category] && <span className="mt-1 block text-[13px] text-muted-foreground">{BLURB[category]}</span>}
                  <span className={cn("mt-1 block font-mono text-muted-foreground tabular", big ? "text-[13px]" : "text-xs")}>
                    {formatCount(b.count)} open roles
                  </span>
                </span>
                {(big || wide) && tileSkills.length > 0 && (
                  <span className={cn("flex flex-wrap gap-1.5", big ? "mt-4" : "max-w-[60%] justify-end max-md:hidden")}>
                    {tileSkills.slice(0, big ? 5 : 4).map((sk) => (
                      <span key={sk} className="rounded-md border border-border bg-background px-1.5 py-0.5 text-[11.5px] font-medium text-muted-foreground">
                        {sk}
                      </span>
                    ))}
                  </span>
                )}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
