import Link from "next/link";
import type { Metadata } from "next";
import { BadgeCheck, Clock, GitMerge, Link2, ShieldCheck } from "lucide-react";
import { LABELS, isOfficialKind } from "@easyjobs/contract";
import { api } from "@/lib/api";
import { formatCount, formatRelativeTime } from "@/lib/format";

export const metadata: Metadata = {
  title: "About EasyJobs & our sources",
  description: "How EasyJobs finds jobs: official career sites (Greenhouse, Lever, Workday, Oracle, Eightfold and custom portals) plus trusted job boards, refreshed every few minutes.",
  alternates: { canonical: "/about" },
};

export const dynamic = "force-dynamic";

const PRINCIPLES = [
  { icon: Link2, title: "We always link to the original posting", body: "Every card has an Apply link to the company's own page whenever one exists. We never host applications or ask you to pay." },
  { icon: GitMerge, title: "One role, one card", body: "When the same job appears on a career site, CourseJoiner and LinkedIn, we merge it and list every source under “Also listed on”." },
  { icon: ShieldCheck, title: "Official first", body: "Listings from company career sites and their ATS boards get the Official ✓ badge; job-board-only listings say “via …”." },
  { icon: Clock, title: "Fresh, then gone", body: "Closed roles drop out of search as soon as a full scan no longer sees them. Board-only listings expire after 21 days unseen." },
];

const FREQUENCY = [
  ["Priority companies (big tech, unicorns, mass hirers)", "every ~15 min"],
  ["Other company career sites & ATS boards", "hourly"],
  ["Long-tail companies", "daily"],
  ["Fresher blogs & job boards (CourseJoiner, Internshala, Unstop)", "every 30–60 min"],
];

export default async function AboutPage(): Promise<React.JSX.Element> {
  const stats = await api.stats();
  const now = Date.now();
  const sources = [...stats.sources].sort((a, b) => Number(isOfficialKind(b.kind)) - Number(isOfficialKind(a.kind)) || b.open - a.open);
  return (
    <div className="container-page max-w-[1040px] pt-12 sm:pt-16">
      <h1 className="text-[34px] font-semibold tracking-[-0.04em] sm:text-[44px]">How EasyJobs works</h1>
      <p className="mt-3 max-w-2xl text-[17px] leading-relaxed text-muted-foreground">
        We read the official career portals of MNCs, Indian IT companies and startups — Greenhouse, Lever, Ashby, Workday, Oracle, Eightfold and custom
        sites — plus CourseJoiner, Internshala, Unstop and open job APIs. Everything lands in one clean, fast search.
      </p>

      <dl className="mt-10 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-4 [&>div]:bg-card">
        {[
          ["Open roles", formatCount(stats.totalOpen)],
          ["New today", formatCount(stats.newLast24h)],
          ["Companies", formatCount(stats.companies)],
          ["Sources", formatCount(stats.sources.length)],
        ].map(([label, value]) => (
          <div key={label} className="px-5 py-4">
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="mt-1 font-mono text-[24px] font-semibold tabular">{value}</dd>
          </div>
        ))}
      </dl>

      <section className="mt-16" aria-labelledby="principles">
        <h2 id="principles" className="text-[22px] font-semibold tracking-[-0.03em]">
          Our principles
        </h2>
        <ul className="mt-6 grid gap-4 sm:grid-cols-2">
          {PRINCIPLES.map((p) => (
            <li key={p.title} className="rounded-2xl border border-border p-5">
              <p.icon className="size-5 text-brand-text" />
              <h3 className="mt-3 text-[15px] font-semibold">{p.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{p.body}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-16" aria-labelledby="sources">
        <h2 id="sources" className="text-[22px] font-semibold tracking-[-0.03em]">
          Sources
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">Live status of every source we read.</p>
        <div className="mt-6 overflow-x-auto rounded-2xl border border-border">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="bg-surface text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Source</th>
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 text-right font-medium">Open roles</th>
                <th className="px-4 py-3 text-right font-medium">Last scan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {sources.map((s) => (
                <tr key={s.id}>
                  <td className="px-4 py-3 font-medium">
                    <span className="inline-flex items-center gap-2">
                      {isOfficialKind(s.kind) && <BadgeCheck className="size-4 text-brand-text" />}
                      {s.name}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{LABELS.sourceKind[s.kind]}</td>
                  <td className="px-4 py-3 text-right font-mono tabular">{formatCount(s.open)}</td>
                  <td className="px-4 py-3 text-right font-mono text-muted-foreground tabular">{s.lastRunAt ? formatRelativeTime(s.lastRunAt, now) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-subtle-foreground">
          LinkedIn and Naukri restrict automated access, so those adapters are off by default. Scrapers follow robots.txt, rate limits and each API&apos;s terms.
        </p>
      </section>

      <section className="mt-16" aria-labelledby="frequency">
        <h2 id="frequency" className="text-[22px] font-semibold tracking-[-0.03em]">
          How often we check
        </h2>
        <dl className="mt-6 divide-y divide-border rounded-2xl border border-border">
          {FREQUENCY.map(([what, when]) => (
            <div key={what} className="flex items-center justify-between gap-6 px-5 py-3.5 text-sm">
              <dt>{what}</dt>
              <dd className="shrink-0 font-mono text-muted-foreground">{when}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="mt-16 rounded-2xl bg-surface p-6 sm:p-8" aria-labelledby="report">
        <h2 id="report" className="text-[17px] font-semibold">
          Spotted something wrong?
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Use “Report” on any job page to flag a closed, duplicate or suspicious listing. Never pay anyone to apply for a job.
        </p>
        <Link href="/jobs" className="mt-4 inline-flex text-sm font-medium text-brand-text hover:underline">
          Start searching →
        </Link>
      </section>
    </div>
  );
}
