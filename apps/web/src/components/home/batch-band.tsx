import Link from "next/link";
import { ArrowRight, GraduationCap } from "lucide-react";
import type { FacetBucket } from "@easyjobs/contract";
import { formatCount } from "@/lib/format";
import { jobsHref } from "@/lib/presets";

const YEARS = [2025, 2026, 2027];

export function BatchBand({ buckets }: { buckets: FacetBucket[] }): React.JSX.Element {
  const count = (y: number): number => buckets.find((b) => b.value === String(y))?.count ?? 0;
  return (
    <section aria-labelledby="batch-band" className="overflow-hidden rounded-3xl border border-border bg-surface">
      <div className="grid gap-8 p-6 sm:p-10 lg:grid-cols-[1fr_auto] lg:items-center">
        <div className="max-w-md">
          <span className="inline-flex items-center gap-2 text-[13px] font-medium text-brand-text">
            <GraduationCap className="size-4" /> For students & new grads
          </span>
          <h2 id="batch-band" className="mt-3 text-[26px] font-semibold leading-tight tracking-[-0.03em] sm:text-[30px]">
            Graduating soon? Pick your batch.
          </h2>
          <p className="mt-2 text-[15px] text-muted-foreground">
            See only internships, off-campus drives and new grad roles open to your graduation year.
          </p>
        </div>
        <ul className="grid grid-cols-3 gap-3" role="list">
          {YEARS.map((y) => (
            <li key={y}>
              <Link
                href={jobsHref({ batch: [y] })}
                className="group flex w-full flex-col items-start rounded-2xl border border-border bg-card px-5 py-4 transition-[border-color,transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:border-brand/50 hover:shadow-md sm:w-40"
              >
                <span className="font-mono text-[26px] font-semibold tracking-tight tabular sm:text-[30px]">{y}</span>
                <span className="mt-1 flex w-full items-center justify-between text-xs text-muted-foreground">
                  <span className="tabular">{formatCount(count(y))} roles</span>
                  <ArrowRight className="size-3.5 transition-transform duration-200 group-hover:translate-x-0.5" />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
