import type { MetadataRoute } from "next";
import { DEFAULT_SEARCH_QUERY, jobPath } from "@easyjobs/contract";
import { api } from "@/lib/api";
import { SITE_URL } from "@/lib/env";
import { LANDING_PRESETS } from "@/lib/presets";
import { allowsSyndication } from "@/lib/seo";

export const revalidate = 900;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, lastModified: now, changeFrequency: "hourly", priority: 1 },
    { url: `${SITE_URL}/jobs`, lastModified: now, changeFrequency: "always", priority: 0.9 },
    { url: `${SITE_URL}/companies`, lastModified: now, changeFrequency: "daily", priority: 0.7 },
    { url: `${SITE_URL}/about`, changeFrequency: "monthly", priority: 0.3 },
    ...Object.values(LANDING_PRESETS).map((p) => ({ url: `${SITE_URL}${p.path}`, lastModified: now, changeFrequency: "hourly" as const, priority: 0.8 })),
  ];
  try {
    const [companies, ...pages] = await Promise.all([
      api.companies({ pageSize: 100 }),
      ...[1, 2, 3, 4, 5].map((page) => api.searchJobs({ ...DEFAULT_SEARCH_QUERY, sort: "newest", pageSize: 50, page })),
    ]);
    return [
      ...staticRoutes,
      ...companies.data.map((c) => ({ url: `${SITE_URL}/companies/${c.slug}`, changeFrequency: "daily" as const, priority: 0.6 })),
      ...pages.flatMap((p) => p.data).filter(allowsSyndication).map((j) => ({ url: `${SITE_URL}${jobPath(j)}`, lastModified: new Date(j.postedAt), changeFrequency: "daily" as const, priority: 0.5 })),
    ];
  } catch {
    return staticRoutes;
  }
}
