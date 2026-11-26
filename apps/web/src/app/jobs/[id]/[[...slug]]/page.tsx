import Link from "next/link";
import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { ChevronRight, ExternalLink } from "lucide-react";
import { jobPath, type JobDetail } from "@easyjobs/contract";
import { api } from "@/lib/api";
import { getJobCached } from "@/lib/server/prefetch";
import { sanitizeHtml } from "@/lib/sanitize";
import { absoluteUrl, allowsJobPostingSchema, jobPostingJsonLd, serializeJsonLd } from "@/lib/seo";
import { applyLabel, hostOf } from "@/lib/logos";
import { formatCount, formatLocations, formatSalary } from "@/lib/format";
import { companyTagLabel } from "@/lib/labels";
import { CompanyLogo } from "@/components/company/company-logo";
import { JobCard } from "@/components/jobs/job-card";
import { ApplyLink, ReportButton, SaveButton, ShareButton } from "@/components/jobs/job-actions";
import { ClosedBanner, JobDescription, JobFacts, JobSkills, JobSources, JobTitleBlock } from "@/components/jobs/job-detail";
import { Badge } from "@/components/ui/badge";

type Props = { params: Promise<{ id: string; slug?: string[] }> };

function describe(job: JobDetail): string {
  const salary = formatSalary(job.salary);
  const bits = [`${job.company.name} is hiring a ${job.title}`, formatLocations(job.locations, job.isRemote), salary].filter(Boolean);
  return (job.summary ?? `${bits.join(" · ")}. Apply on the official page via EasyJobs.`).slice(0, 300);
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const job = await getJobCached(decodeURIComponent(id));
  if (!job) return { title: "Job not found", robots: { index: false } };
  const title = `${job.title} at ${job.company.name}`;
  const description = describe(job);
  const image = `/og/jobs/${encodeURIComponent(job.id)}`;
  return {
    title,
    description,
    alternates: { canonical: jobPath(job) },
    openGraph: { type: "article", title, description, url: jobPath(job), images: [{ url: image, width: 1200, height: 630, alt: title }] },
    twitter: { card: "summary_large_image", title, description, images: [image] },
    robots: job.status === "closed" ? { index: false, follow: true } : undefined,
  };
}

export default async function JobPage({ params }: Props): Promise<React.JSX.Element> {
  const { id, slug } = await params;
  const job = await getJobCached(decodeURIComponent(id));
  if (!job) notFound();
  if (slug?.[0] !== job.slug || (slug?.length ?? 0) > 1) permanentRedirect(jobPath(job));

  const [similar, company] = await Promise.all([api.similar(job.id, 6), api.company(job.company.slug)]);
  const html = sanitizeHtml(job.descriptionHtml);
  const url = absoluteUrl(jobPath(job));
  const applyHost = hostOf(job.applyUrl);

  return (
    <>
      {allowsJobPostingSchema(job) && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(jobPostingJsonLd({ ...job, descriptionHtml: html || null }, url)) }} />
      )}
      <div className="container-page pb-28 pt-6 lg:pb-16">
        <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-[13px] text-muted-foreground">
          <Link href="/jobs" className="hover:text-foreground">
            Jobs
          </Link>
          <ChevronRight className="size-3.5 text-subtle-foreground" />
          <Link href={`/companies/${job.company.slug}`} className="hover:text-foreground">
            {job.company.name}
          </Link>
          <ChevronRight className="size-3.5 text-subtle-foreground" />
          <span aria-current="page" className="truncate text-foreground/80">
            {job.title}
          </span>
        </nav>

        <div className="mt-6 grid gap-10 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-14">
          <article className="min-w-0" data-testid="job-page">
            <ClosedBanner job={job} />
            <div className={job.status === "closed" ? "mt-5" : undefined}>
              <JobTitleBlock job={job} />
            </div>
            <div className="mt-8">
              <JobFacts job={job} />
            </div>
            <div className="mt-6">
              <JobSkills job={job} />
            </div>
            <section className="mt-10" aria-labelledby="description">
              <h2 id="description" className="mb-4 text-lg font-semibold tracking-[-0.02em]">
                Job description
              </h2>
              <JobDescription html={html} summary={job.summary} />
              <p className="mt-8 rounded-xl bg-surface px-4 py-3 text-[13px] text-muted-foreground">
                Details are summarised from the original posting{applyHost ? ` on ${applyHost}` : ""}. Always confirm on the company&apos;s page
                before applying — legitimate employers never ask for money.
              </p>
            </section>
          </article>

          <aside className="grid content-start gap-6 lg:sticky lg:top-20 lg:self-start">
            <div className="rounded-2xl border border-border bg-card p-5">
              <ApplyLink job={job} size="lg" label={applyLabel(job)} className="w-full" />
              <SaveButton job={job} variant="full" className="mt-2 w-full" />
              <div className="mt-3 flex items-center justify-between">
                <ShareButton job={job} />
                <ReportButton job={job} />
              </div>
              <p className="mt-3 border-t border-border pt-3 text-xs leading-relaxed text-subtle-foreground">
                We always link to the original posting. EasyJobs never charges candidates.
              </p>
            </div>

            <section aria-labelledby="sources">
              <h2 id="sources" className="mb-3 text-sm font-semibold">
                {job.sources.length > 1 ? "Also listed on" : "Source"}
              </h2>
              <JobSources job={job} />
            </section>

            {company && (
              <section aria-labelledby="about-company" className="rounded-2xl border border-border p-5">
                <div className="flex items-center gap-3">
                  <CompanyLogo company={company} size={40} />
                  <div className="min-w-0">
                    <h2 id="about-company" className="truncate text-[15px] font-semibold">
                      {company.name}
                    </h2>
                    {company.hq && <p className="text-xs text-muted-foreground">HQ · {company.hq}</p>}
                  </div>
                </div>
                {company.tags.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {company.tags.slice(0, 4).map((t) => (
                      <Badge key={t} variant="outline">
                        {companyTagLabel(t)}
                      </Badge>
                    ))}
                  </div>
                )}
                <div className="mt-4 flex items-center justify-between text-[13px]">
                  <Link href={`/companies/${company.slug}`} className="font-medium text-brand-text hover:underline">
                    {formatCount(company.openJobs)} open roles
                  </Link>
                  {company.careersUrl && (
                    <a href={company.careersUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground">
                      Careers site <ExternalLink className="size-3" />
                    </a>
                  )}
                </div>
              </section>
            )}
          </aside>
        </div>

        {similar.data.length > 0 && (
          <section className="mt-20" aria-labelledby="similar">
            <h2 id="similar" className="text-[22px] font-semibold tracking-[-0.03em]">
              Similar jobs
            </h2>
            <div className="mt-6 grid gap-3 md:grid-cols-2">
              {similar.data.map((s) => (
                <JobCard key={s.id} job={s} headingLevel="h3" />
              ))}
            </div>
          </section>
        )}
      </div>

      {/* Mobile sticky CTA */}
      <div className="glass fixed inset-x-0 bottom-0 z-30 border-t border-border p-3 lg:hidden">
        <div className="mx-auto flex max-w-lg items-center gap-2">
          <ApplyLink job={job} size="lg" label={applyHost ? `Apply on ${applyHost}` : "Apply"} className="flex-1 truncate" />
          <SaveButton job={job} variant="full" className="w-auto px-4" />
        </div>
      </div>
    </>
  );
}
