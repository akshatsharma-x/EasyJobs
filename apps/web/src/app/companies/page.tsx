import { Suspense } from "react";
import type { Metadata } from "next";
import { HydrationBoundary, QueryClient, dehydrate } from "@tanstack/react-query";
import { companiesInfiniteOptions } from "@/lib/companies-query";
import { CompaniesBrowser } from "@/components/company/companies-browser";

export const metadata: Metadata = {
  title: "Companies hiring in India",
  description: "Browse companies hiring now — big tech, unicorns, startups, GCCs and Indian IT — with live open-role counts from their official career sites.",
  alternates: { canonical: "/companies" },
};

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function CompaniesPage({ searchParams }: Props): Promise<React.JSX.Element> {
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q : "";
  const ctype = typeof sp.ctype === "string" && sp.ctype ? sp.ctype.split(",") : [];
  const qc = new QueryClient();
  await qc.prefetchInfiniteQuery(companiesInfiniteOptions(q, ctype));
  return (
    <div className="container-page pt-12 sm:pt-16">
      <h1 className="text-[34px] font-semibold tracking-[-0.04em] sm:text-[44px]">Companies hiring</h1>
      <p className="mt-2 max-w-xl text-[16px] text-muted-foreground">Open roles straight from official career sites — updated every few minutes.</p>
      <div className="mt-8">
        <HydrationBoundary state={dehydrate(qc)}>
          <Suspense>
            <CompaniesBrowser />
          </Suspense>
        </HydrationBoundary>
      </div>
    </div>
  );
}
