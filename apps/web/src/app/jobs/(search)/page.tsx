import { Suspense } from "react";
import type { Metadata } from "next";
import { HydrationBoundary } from "@tanstack/react-query";
import { parseSearchQuery } from "@easyjobs/contract";
import { SearchView } from "@/components/jobs/search-view";
import { SearchSkeleton } from "@/components/jobs/search-skeleton";
import { prefetchSearch } from "@/lib/server/prefetch";
import { searchTitle } from "@/lib/seo-titles";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const query = parseSearchQuery(await searchParams);
  const title = searchTitle(query);
  return {
    title: title === "Jobs" ? "Search jobs & internships" : title,
    description: "Search real-time jobs and internships in India from official career sites and top job boards. Filter by experience, batch, salary, location and company type.",
    alternates: { canonical: "/jobs" },
  };
}

export default async function JobsPage({ searchParams }: Props): Promise<React.JSX.Element> {
  const sp = await searchParams;
  const query = parseSearchQuery(sp);
  const selected = typeof sp.job === "string" ? sp.job : null;
  const state = await prefetchSearch(query, selected);
  return (
    <HydrationBoundary state={state}>
      <h1 className="sr-only">{searchTitle(query)}</h1>
      <Suspense fallback={<SearchSkeleton />}>
        <SearchView basePath="/jobs" />
      </Suspense>
    </HydrationBoundary>
  );
}
