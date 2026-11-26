import Link from "next/link";
import type { CompanySummary } from "@easyjobs/contract";
import { CompanyLogo } from "@/components/company/company-logo";

/** Infinite logo marquee: grayscale → colour on hover; pauses on hover; static with reduced motion. */
export function LogoMarquee({ companies }: { companies: CompanySummary[] }): React.JSX.Element {
  const row = (hidden: boolean): React.JSX.Element => (
    <ul className="flex shrink-0 items-center gap-10 pr-10" aria-hidden={hidden || undefined}>
      {companies.map((c) => (
        <li key={c.slug}>
          <Link
            href={`/companies/${c.slug}`}
            tabIndex={hidden ? -1 : undefined}
            className="logo-mono flex items-center gap-2.5 rounded-lg text-[15px] font-semibold tracking-[-0.01em] text-foreground"
          >
            <CompanyLogo company={{ name: c.name, domain: c.domain, logoUrl: c.logoUrl }} size={32} defer />
            {c.name}
          </Link>
        </li>
      ))}
    </ul>
  );
  return (
    <div className="mask-fade-x relative overflow-hidden py-2" aria-label="Companies hiring on EasyJobs">
      <div className="marquee-track flex w-max animate-marquee">
        {row(false)}
        {row(true)}
      </div>
    </div>
  );
}
