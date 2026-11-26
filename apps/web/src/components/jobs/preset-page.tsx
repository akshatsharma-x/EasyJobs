import { Suspense } from "react";
import type { Metadata } from "next";
import { HydrationBoundary } from "@tanstack/react-query";
import { parseSearchQuery } from "@easyjobs/contract";
import { prefetchSearch } from "@/lib/server/prefetch";
import { mergePreset } from "@/lib/query-utils";
import type { LandingPreset } from "@/lib/presets";
import { SearchView } from "./search-view";
import { SearchSkeleton } from "./search-skeleton";

export type SearchParamsProp = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export function presetMetadata(preset: LandingPreset): Metadata {
  return {
    title: preset.title,
    description: preset.description,
    alternates: { canonical: preset.path },
    openGraph: { title: preset.title, description: preset.description, url: preset.path },
  };
}

/** Landing page = the search view with preset filters + short SEO copy. */
export async function PresetPage({ preset, searchParams }: { preset: LandingPreset } & SearchParamsProp): Promise<React.JSX.Element> {
  const sp = await searchParams;
  const query = mergePreset(preset.query, parseSearchQuery(sp));
  const state = await prefetchSearch(query, typeof sp.job === "string" ? sp.job : null);
  const header = (
    <header className="mb-5">
      <h1 className="text-[28px] font-semibold tracking-[-0.035em] sm:text-[32px]">{preset.heading}</h1>
      <p className="mt-1.5 max-w-xl text-[14.5px] text-muted-foreground">{preset.lede}</p>
    </header>
  );
  const footer = (
    <section className="mt-14 border-t border-border pt-8" aria-labelledby="seo-copy">
      <h2 id="seo-copy" className="text-[15px] font-semibold">
        {preset.seo.heading}
      </h2>
      {preset.seo.paragraphs.map((p) => (
        <p key={p.slice(0, 24)} className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          {p}
        </p>
      ))}
    </section>
  );
  return (
    <HydrationBoundary state={state}>
      <Suspense fallback={<SearchSkeleton />}>
        <SearchView basePath={preset.path} preset={preset.query} header={header} footer={footer} />
      </Suspense>
    </HydrationBoundary>
  );
}
