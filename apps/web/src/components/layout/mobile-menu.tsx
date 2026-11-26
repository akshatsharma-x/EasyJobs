"use client";

import Link from "next/link";
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from "@/components/ui/drawer";

const LINKS = [
  { href: "/jobs", label: "Jobs" },
  { href: "/internships", label: "Internships" },
  { href: "/freshers", label: "Freshers" },
  { href: "/remote", label: "Remote" },
  { href: "/companies", label: "Companies" },
  { href: "/off-campus", label: "Off-campus drives" },
  { href: "/work-from-home", label: "Work from home" },
  { href: "/saved", label: "Saved jobs" },
  { href: "/about", label: "About" },
];

/** Mobile navigation sheet (vaul) — loaded on first open. */
export function MobileMenu({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }): React.JSX.Element {
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerTitle className="sr-only">Menu</DrawerTitle>
        <DrawerDescription className="sr-only">Site navigation</DrawerDescription>
        <nav aria-label="Mobile" className="grid gap-1 px-4 pb-8 pt-2">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} onClick={() => onOpenChange(false)} className="rounded-xl px-3 py-3 text-[15px] font-medium transition-colors hover:bg-muted">
              {l.label}
            </Link>
          ))}
        </nav>
      </DrawerContent>
    </Drawer>
  );
}
