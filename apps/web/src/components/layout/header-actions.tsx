"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bookmark, Menu, Search } from "lucide-react";
import { useState } from "react";
import dynamic from "next/dynamic";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { ThemeToggle } from "./theme-toggle";
import { openCommandPalette } from "./palette-host";
import { useSavedStore } from "@/lib/saved-store";
import { useSavedHydrated } from "@/lib/hooks/use-hydrated";
import { cn } from "@/lib/cn";

export const NAV_LINKS = [
  { href: "/jobs", label: "Jobs" },
  { href: "/internships", label: "Internships" },
  { href: "/freshers", label: "Freshers" },
  { href: "/remote", label: "Remote" },
  { href: "/companies", label: "Companies" },
] as const;

export function NavLinks(): React.JSX.Element {
  const pathname = usePathname();
  return (
    <nav aria-label="Primary" className="hidden items-center gap-0.5 md:flex">
      {NAV_LINKS.map((l) => {
        const active = pathname === l.href || (l.href !== "/jobs" && pathname.startsWith(l.href)) || (l.href === "/jobs" && pathname.startsWith("/jobs"));
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "rounded-lg px-2.5 py-1.5 text-[13.5px] font-medium text-muted-foreground transition-colors duration-150 hover:text-foreground",
              active && "text-foreground",
            )}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}

function SavedCount(): React.JSX.Element | null {
  const ready = useSavedHydrated();
  const count = useSavedStore((s) => s.order.length);
  if (!ready || count === 0) return null;
  return (
    <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-brand px-1 font-mono text-[10px] font-semibold leading-none text-brand-foreground tabular">
      {count > 99 ? "99+" : count}
    </span>
  );
}

const loadMobileMenu = () => import("./mobile-menu").then((m) => m.MobileMenu);
const MobileMenu = dynamic(loadMobileMenu, { ssr: false });

export function HeaderActions(): React.JSX.Element {
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuLoaded, setMenuLoaded] = useState(false);
  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={openCommandPalette}
        data-testid="open-palette"
        className="hidden h-8 w-56 items-center gap-2 rounded-[10px] border border-border bg-surface px-2.5 text-[13px] text-subtle-foreground transition-colors duration-150 hover:border-border-strong hover:text-muted-foreground lg:flex"
      >
        <Search className="size-3.5" />
        <span className="flex-1 text-left">Search jobs, companies…</span>
        <Kbd>⌘K</Kbd>
      </button>
      <Button variant="ghost" size="icon-sm" className="lg:hidden" aria-label="Search" onClick={openCommandPalette}>
        <Search className="size-[18px]" />
      </Button>
      <Button variant="ghost" size="icon-sm" asChild className="relative">
        <Link href="/saved" aria-label="Saved jobs">
          <Bookmark className="size-[18px]" />
          <SavedCount />
        </Link>
      </Button>
      <ThemeToggle />
      <Button
        variant="ghost"
        size="icon-sm"
        className="md:hidden"
        aria-label="Open menu"
        aria-expanded={menuOpen}
        onPointerEnter={() => void loadMobileMenu()}
        onClick={() => {
          setMenuLoaded(true);
          setMenuOpen(true);
        }}
      >
        <Menu className="size-[18px]" />
      </Button>
      {menuLoaded && <MobileMenu open={menuOpen} onOpenChange={setMenuOpen} />}
    </div>
  );
}

const WIDE_PATHS = ["/jobs", "/internships", "/freshers", "/remote", "/off-campus", "/work-from-home"];

/** Header content width matches the page below it (wide 3-pane search views vs 1280 content pages). */
export function HeaderContainer({ children }: { children: React.ReactNode }): React.JSX.Element {
  const pathname = usePathname();
  const wide = WIDE_PATHS.includes(pathname) || /^\/companies\/[^/]+$/.test(pathname);
  return <div className={cn(wide ? "container-wide" : "container-page", "flex h-14 items-center gap-6")}>{children}</div>;
}
