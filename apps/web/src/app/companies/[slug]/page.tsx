import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { HydrationBoundary } from "@tanstack/react-query";
import { ArrowUpRight, MapPin } from "lucide-react";
import { parseSearchQuery } from "@easyjobs/contract";
import { api } from "@/lib/api";
import { prefetchSearch } from "@/lib/server/prefetch";
import { mergePreset } from "@/lib/query-utils";
import { formatCount } from "@/lib/format";
import { companyTagLabel } from "@/lib/labels";
import { hostOf } from "@/lib/logos";
import { CompanyLogo } from "@/components/company/company-logo";
import { SearchView } from "@/components/jobs/search-view";
import { SearchSkeleton } from "@/components/jobs/search-skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

const getCompany = cache((slug: string) => api.company(slug));

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const company = await getCompany(slug);
  if (!company) return { title: "Company not found", robots: { index: false } };
  return {
    title: `${company.name} jobs & internships`,
    description: `${formatCount(company.openJobs)} open roles at ${company.name}${company.hq ? ` (${company.hq})` : ""}, straight from the official careers site. Updated every few minutes.`,
    alternates: { canonical: `/companies/${company.slug}` },
  };
}

export default async function CompanyPage({ params, searchParams }: Props): Promise<React.JSX.Element> {
  const { slug } = await params;
  const company = await getCompany(slug);
  if (!company) notFound();
  const preset = { company: [company.slug] };
  const sp = await searchParams;
  const query = mergePreset(preset, parseSearchQuery(sp));
  const state = await prefetchSearch(query, typeof sp.job === "string" ? sp.job : null);

  return (
    <>
      <section className="border-b border-border bg-surface">
        <div className="container-wide flex flex-col gap-6 py-10 sm:flex-row sm:items-center">
          <CompanyLogo company={company} size={64} priority />
          <div className="min-w-0 flex-1">
            <h1 className="text-[30px] font-semibold tracking-[-0.035em] sm:text-[36px]">{company.name}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
              {company.hq && (
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="size-3.5" /> {company.hq}
                </span>
              )}
              <span>
                <span className="font-mono font-semibold text-foreground tabular">{formatCount(company.openJobs)}</span> open roles
              </span>
              <span className="flex flex-wrap gap-1.5">
                {company.tags.slice(0, 4).map((t) => (
                  <Badge key={t} variant="outline">
                    {companyTagLabel(t)}
                  </Badge>
                ))}
              </span>
            </div>
          </div>
          {company.careersUrl && (
            <Button asChild variant="outline" size="lg">
              <a href={company.careersUrl} target="_blank" rel="noopener noreferrer">
                {hostOf(company.careersUrl) ?? "Careers site"}
                <ArrowUpRight className="size-4" />
              </a>
            </Button>
          )}
        </div>
      </section>
      <HydrationBoundary state={state}>
        <Suspense fallback={<SearchSkeleton withBar={false} withSidebar={false} />}>
          <SearchView basePath={`/companies/${company.slug}`} preset={preset} showSearchBar={false} showSidebar={false} />
        </Suspense>
      </HydrationBoundary>
    </>
  );
}
