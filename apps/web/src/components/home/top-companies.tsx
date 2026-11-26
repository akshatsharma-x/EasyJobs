import Link from "next/link";
import type { CompanySummary } from "@easyjobs/contract";
import { CompanyLogo } from "@/components/company/company-logo";
import { formatCount } from "@/lib/format";
import { companyTagLabel } from "@/lib/labels";

export function TopCompanies({ companies }: { companies: CompanySummary[] }): React.JSX.Element {
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4" data-testid="top-companies">
      {companies.map((c) => (
        <li key={c.slug}>
          <Link
            href={`/companies/${c.slug}`}
            className="group flex h-full items-center gap-3 rounded-2xl border border-border bg-card p-3.5 transition-[border-color,transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:border-border-strong hover:shadow-md"
          >
            <CompanyLogo company={{ name: c.name, domain: c.domain, logoUrl: c.logoUrl }} size={40} defer />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14px] font-semibold tracking-[-0.01em]">{c.name}</span>
              <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                <span className="font-mono text-foreground/80 tabular">{formatCount(c.openJobs)}</span> open
                {c.tags[0] && <> · {companyTagLabel(c.tags[0])}</>}
              </span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
