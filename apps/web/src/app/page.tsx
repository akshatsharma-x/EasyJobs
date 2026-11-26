import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { DEFAULT_SEARCH_QUERY } from "@easyjobs/contract";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { QUICK_CHIPS } from "@/lib/presets";
import { HeroSearch } from "@/components/home/hero-search";
import { LiveStrip } from "@/components/home/live-strip";
import { LogoMarquee } from "@/components/home/logo-marquee";
import { JustPosted } from "@/components/home/just-posted";
import { CategoryBento } from "@/components/home/category-bento";
import { TopCompanies } from "@/components/home/top-companies";
import { BatchBand } from "@/components/home/batch-band";

export const dynamic = "force-dynamic";

function SectionHeading({ id, title, sub, href, cta }: { id?: string; title: string; sub?: string; href?: string; cta?: string }): React.JSX.Element {
  return (
    <div className="mb-6 flex items-end justify-between gap-6">
      <div>
        <h2 id={id} className="text-[22px] font-semibold tracking-[-0.03em] sm:text-[26px]">{title}</h2>
        {sub && <p className="mt-1.5 text-[15px] text-muted-foreground">{sub}</p>}
      </div>
      {href && (
        <Link href={href} className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
          {cta} <ArrowRight className="size-4" />
        </Link>
      )}
    </div>
  );
}

export default async function HomePage(): Promise<React.JSX.Element> {
  const [stats, latest, companies] = await Promise.all([
    api.stats(),
    api.searchJobs({ ...DEFAULT_SEARCH_QUERY, sort: "newest", pageSize: 6 }),
    api.companies({ pageSize: 24 }),
  ]);
  // Top skills for the two feature tiles of the bento.
  const featured = latest.facets.category.filter((b) => b.value !== "other").slice(0, 2);
  const featuredSkills = await Promise.all(
    featured.map((b) =>
      api
        .searchJobs({ ...DEFAULT_SEARCH_QUERY, category: [b.value as never], pageSize: 1 })
        .then((r) => [b.value, r.facets.skills.slice(0, 5).map((x) => x.label)] as const)
        .catch(() => [b.value, [] as string[]] as const),
    ),
  );

  return (
    <>
      <section className="relative overflow-hidden border-b border-border">
        <div aria-hidden="true" className="hero-dots pointer-events-none absolute inset-0" />
        <div aria-hidden="true" className="hero-glow pointer-events-none absolute inset-x-0 -top-24 h-[520px]" />
        <div className="container-page relative pb-14 pt-16 sm:pb-20 sm:pt-24">
          <div className="mx-auto max-w-3xl text-center">
            <h1 className="text-[40px] font-semibold leading-[1.04] tracking-[-0.045em] sm:text-[64px]">
              Every internship and job.
              <br />
              The <span className="text-brand-text">minute</span> it&apos;s posted.
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-[16px] leading-relaxed text-muted-foreground sm:text-[18px]">
              We scan 1,000+ official career sites and top job boards every few minutes.
            </p>
          </div>
          <div className="mx-auto mt-9 max-w-3xl">
            <HeroSearch />
          </div>
          <div className="mx-auto max-w-4xl">
            <nav aria-label="Quick filters" className="mt-4 flex flex-wrap justify-center gap-2">
              {QUICK_CHIPS.map((chip) => (
                <Link
                  key={chip.label}
                  href={chip.href}
                  className="inline-flex h-8 items-center rounded-full border border-border bg-background/80 px-3.5 text-[13px] font-medium text-foreground/80 backdrop-blur transition-[border-color,color,transform] duration-200 ease-[var(--ease-spring)] hover:-translate-y-px hover:border-border-strong hover:text-foreground active:scale-95"
                >
                  {chip.label}
                </Link>
              ))}
            </nav>
            <div className="mt-8 flex justify-center">
              <LiveStrip initial={{ totalOpen: stats.totalOpen, newLastHour: stats.newLastHour, newLast24h: stats.newLast24h, lastUpdatedAt: stats.lastUpdatedAt }} />
            </div>
          </div>
        </div>
        <div className="relative border-t border-border bg-background/60 py-5">
          <LogoMarquee companies={companies.data} />
        </div>
      </section>

      <div className="container-page grid gap-20 pt-16 sm:gap-24 sm:pt-20">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:items-start">
          <div className="lg:pt-4">
            <SectionHeading title="Fresh off the career pages" sub="New roles land here seconds after we spot them — official sites first, duplicates merged." />
            <ul className="grid gap-4 text-[14.5px] text-muted-foreground">
              {[
                ["Official first", "Each listing links to the company's own careers page whenever one exists."],
                ["One role, one card", "The same job found on five sites shows up once, with every source listed."],
                ["Filters that understand you", "Batch, years of experience, stipend, company type — not just keywords."],
              ].map(([title, body]) => (
                <li key={title} className="flex gap-3">
                  <span aria-hidden="true" className="mt-2 size-1.5 shrink-0 rounded-full bg-brand" />
                  <span>
                    <span className="font-medium text-foreground">{title}.</span> {body}
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-8 flex flex-wrap gap-2">
              <Button asChild size="lg">
                <Link href="/jobs">
                  Browse all jobs <ArrowRight className="size-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="ghost">
                <Link href="/about">How it works</Link>
              </Button>
            </div>
          </div>
          <JustPosted initial={latest.data} />
        </div>

        <section aria-labelledby="categories">
          <SectionHeading id="categories" title="Browse by category" sub="Counts update live as roles open and close." href="/jobs" cta="All jobs" />
          <CategoryBento buckets={latest.facets.category} skills={Object.fromEntries(featuredSkills)} />
        </section>

        <section aria-labelledby="top-companies-h">
          <SectionHeading id="top-companies-h" title="Top companies hiring" sub="Big tech, unicorns, GCCs and Indian IT — straight from their career sites." href="/companies" cta="All companies" />
          <TopCompanies companies={companies.data.slice(0, 12)} />
        </section>

        <BatchBand buckets={latest.facets.batch} />
      </div>
    </>
  );
}
