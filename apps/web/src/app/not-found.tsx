import Link from "next/link";
import { HeroSearch } from "@/components/home/hero-search";

export default function NotFound(): React.JSX.Element {
  return (
    <div className="container-page grid min-h-[60dvh] place-items-center py-16">
      <div className="w-full max-w-xl text-center">
        <p className="font-mono text-sm font-medium text-brand-text">404</p>
        <h1 className="mt-3 text-[32px] font-semibold tracking-[-0.04em] sm:text-[40px]">This page isn&apos;t hiring.</h1>
        <p className="mt-3 text-[15px] text-muted-foreground">The link may be old, or the job may have been removed. Try a search instead.</p>
        <div className="mt-8 text-left">
          <HeroSearch />
        </div>
        <div className="mt-6 flex flex-wrap justify-center gap-x-5 gap-y-2 text-sm">
          {[
            ["/jobs", "All jobs"],
            ["/internships", "Internships"],
            ["/freshers", "Fresher jobs"],
            ["/companies", "Companies"],
          ].map(([href, label]) => (
            <Link key={href} href={href} className="font-medium text-muted-foreground hover:text-foreground">
              {label}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
