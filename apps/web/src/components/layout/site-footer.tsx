import Link from "next/link";
import { Wordmark } from "./logo";

const SOURCES = {
  "Official career sites": ["Greenhouse", "Lever", "Ashby", "Workday", "Oracle", "Eightfold", "SuccessFactors", "Custom portals"],
  "Job boards & feeds": ["CourseJoiner", "Internshala", "Unstop", "LinkedIn*", "Naukri*", "Open job APIs"],
};

const EXPLORE = [
  { href: "/jobs", label: "All jobs" },
  { href: "/internships", label: "Internships" },
  { href: "/freshers", label: "Fresher jobs" },
  { href: "/remote", label: "Remote jobs" },
  { href: "/off-campus", label: "Off-campus drives" },
  { href: "/work-from-home", label: "Work from home" },
  { href: "/companies", label: "Companies" },
];

export function SiteFooter(): React.JSX.Element {
  return (
    <footer className="mt-24 border-t border-border bg-surface">
      <div className="container-page grid gap-10 py-14 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div className="max-w-xs">
          <Wordmark />
          <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
            Real-time internships and jobs for India. We scan official career sites and top job boards every few minutes and
            always link to the original posting.
          </p>
          <ol className="mt-6 grid gap-2 text-[13px] text-muted-foreground">
            <li className="flex gap-2">
              <span className="font-mono text-subtle-foreground tabular">01</span> Scan 1,000+ career sites & boards
            </li>
            <li className="flex gap-2">
              <span className="font-mono text-subtle-foreground tabular">02</span> Clean, de-duplicate, tag experience & batch
            </li>
            <li className="flex gap-2">
              <span className="font-mono text-subtle-foreground tabular">03</span> You apply on the official page
            </li>
          </ol>
        </div>
        <nav aria-label="Explore">
          <h2 className="text-[13px] font-semibold">Explore</h2>
          <ul className="mt-4 grid gap-2.5 text-sm text-muted-foreground">
            {EXPLORE.map((l) => (
              <li key={l.href}>
                <Link className="transition-colors hover:text-foreground" href={l.href}>
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        {Object.entries(SOURCES).map(([title, items]) => (
          <div key={title}>
            <h2 className="text-[13px] font-semibold">{title}</h2>
            <ul className="mt-4 grid gap-2.5 text-sm text-muted-foreground">
              {items.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-border">
        <div className="container-page flex flex-col gap-2 py-6 text-[13px] text-subtle-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getUTCFullYear()} EasyJobs · We always link to the original posting.</p>
          <p className="flex gap-4">
            <Link className="hover:text-foreground" href="/about">
              About & sources
            </Link>
            <Link className="hover:text-foreground" href="/saved">
              Saved jobs
            </Link>
            <span>*off by default</span>
          </p>
        </div>
      </div>
    </footer>
  );
}
