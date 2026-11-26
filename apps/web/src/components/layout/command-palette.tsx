"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { Command } from "cmdk";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ArrowRight, Bookmark, Briefcase, Building2, Globe, GraduationCap, House, Info, Laptop, Moon, Search, Sparkles, Sun, Zap } from "lucide-react";
import { DEFAULT_SEARCH_QUERY } from "@easyjobs/contract";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Kbd } from "@/components/ui/kbd";
import { CompanyLogo } from "@/components/company/company-logo";
import { api } from "@/lib/api";
import { suggestOptions } from "@/lib/query-keys";
import { useDebouncedValue } from "@/lib/hooks/use-debounced";
import { PALETTE_PRESETS, jobsHref } from "@/lib/presets";
import { smartSubmit } from "@/lib/smart-submit";
import { formatCount } from "@/lib/format";

const PAGES = [
  { href: "/", label: "Home", icon: House },
  { href: "/jobs", label: "All jobs", icon: Briefcase },
  { href: "/internships", label: "Internships", icon: GraduationCap },
  { href: "/freshers", label: "Fresher jobs", icon: Sparkles },
  { href: "/remote", label: "Remote jobs", icon: Globe },
  { href: "/companies", label: "Companies", icon: Building2 },
  { href: "/saved", label: "Saved jobs & tracker", icon: Bookmark },
  { href: "/about", label: "About & sources", icon: Info },
];

const itemClass =
  "flex cursor-pointer select-none items-center gap-3 rounded-lg px-3 py-2 text-sm text-foreground outline-none data-[selected=true]:bg-muted [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-muted-foreground";
const groupClass =
  "[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pb-1.5 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-subtle-foreground";

export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }): React.JSX.Element {
  const router = useRouter();
  const { setTheme } = useTheme();
  const [text, setText] = useState("");
  const term = useDebouncedValue(text.trim(), 120);
  const { data: suggest } = useQuery({ ...suggestOptions(term), enabled: open, placeholderData: keepPreviousData });
  const { data: top } = useQuery({
    queryKey: ["companies", "palette"],
    queryFn: ({ signal }) => api.companies({ pageSize: 8 }, { signal }),
    enabled: open,
    staleTime: 5 * 60_000,
  });

  const close = (): void => {
    onOpenChange(false);
    setText("");
  };
  const go = (href: string): void => {
    close();
    router.push(href);
  };
  const searchFor = (value: string): void => {
    const companies = [...(suggest?.companies ?? []), ...(top?.data ?? [])].map((c) => ({ slug: c.slug, name: c.name }));
    const { next } = smartSubmit(DEFAULT_SEARCH_QUERY, value, null, companies);
    go(jobsHref(next));
  };

  const companies = term ? (suggest?.companies ?? []) : (top?.data ?? []);

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? onOpenChange(true) : close())}>
      <DialogContent
        hideClose
        className="top-[12vh] max-w-[620px] translate-y-0 overflow-hidden p-0 data-[state=open]:slide-in-from-top-2"
        data-testid="command-palette"
      >
        <DialogTitle className="sr-only">Command palette</DialogTitle>
        <DialogDescription className="sr-only">Search jobs and companies, jump to presets and pages, or change the theme.</DialogDescription>
        <Command loop label="Command palette" className="flex max-h-[min(70vh,560px)] flex-col">
          <div className="flex items-center gap-3 border-b border-border px-4">
            <Search className="size-[18px] text-subtle-foreground" />
            <Command.Input
              value={text}
              onValueChange={setText}
              placeholder="Search jobs, companies, presets…"
              className="h-14 flex-1 bg-transparent text-[15px] outline-none placeholder:text-subtle-foreground"
            />
            <Kbd>Esc</Kbd>
          </div>
          <Command.List className="scroll-quiet flex-1 overflow-y-auto overscroll-contain p-2">
            <Command.Empty className="px-3 py-8 text-center text-sm text-muted-foreground">No results — press Enter to search all jobs.</Command.Empty>

            {text.trim() && (
              <Command.Group heading="Search" className={groupClass} forceMount>
                <Command.Item value={`search ${text}`} onSelect={() => searchFor(text)} className={itemClass} forceMount>
                  <Search />
                  <span className="min-w-0 flex-1 truncate">
                    Search jobs for <span className="font-medium">“{text.trim()}”</span>
                  </span>
                  <ArrowRight />
                </Command.Item>
                {(suggest?.titles ?? []).slice(0, 3).map((t) => (
                  <Command.Item key={`t-${t}`} value={`title ${t}`} onSelect={() => searchFor(t)} className={itemClass} forceMount>
                    <Briefcase />
                    <span className="truncate">{t}</span>
                  </Command.Item>
                ))}
              </Command.Group>
            )}

            <Command.Group heading="Presets" className={groupClass}>
              {PALETTE_PRESETS.map((p) => (
                <Command.Item key={p.label} value={p.label} keywords={[p.hint]} onSelect={() => go(jobsHref(p.query))} className={itemClass}>
                  <Zap />
                  <span className="flex-1">{p.label}</span>
                  <span className="text-xs text-subtle-foreground">{p.hint}</span>
                </Command.Item>
              ))}
            </Command.Group>

            {companies.length > 0 && (
              <Command.Group heading="Companies" className={groupClass} forceMount={Boolean(term)}>
                {companies.slice(0, 6).map((c) => (
                  <Command.Item
                    key={c.slug}
                    value={`company ${c.name}`}
                    keywords={[c.slug]}
                    forceMount={Boolean(term)}
                    onSelect={() => go(`/companies/${c.slug}`)}
                    className={itemClass}
                  >
                    <CompanyLogo company={{ name: c.name, domain: (c as { domain?: string | null }).domain ?? null, logoUrl: c.logoUrl }} size={20} />
                    <span className="flex-1 truncate">{c.name}</span>
                    <span className="font-mono text-xs text-subtle-foreground tabular">{formatCount(c.openJobs)} open</span>
                  </Command.Item>
                ))}
              </Command.Group>
            )}

            <Command.Group heading="Go to" className={groupClass}>
              {PAGES.map((p) => (
                <Command.Item key={p.href} value={`go ${p.label}`} onSelect={() => go(p.href)} className={itemClass}>
                  <p.icon />
                  {p.label}
                </Command.Item>
              ))}
            </Command.Group>

            <Command.Group heading="Theme" className={groupClass}>
              <Command.Item value="theme light" onSelect={() => { setTheme("light"); close(); }} className={itemClass}>
                <Sun /> Light theme
              </Command.Item>
              <Command.Item value="theme dark" onSelect={() => { setTheme("dark"); close(); }} className={itemClass} data-testid="palette-dark">
                <Moon /> Dark theme
              </Command.Item>
              <Command.Item value="theme system" onSelect={() => { setTheme("system"); close(); }} className={itemClass}>
                <Laptop /> Match system
              </Command.Item>
            </Command.Group>
          </Command.List>
          <div className="flex items-center gap-4 border-t border-border bg-surface px-4 py-2.5 text-xs text-subtle-foreground">
            <span className="flex items-center gap-1.5">
              <Kbd>↑</Kbd>
              <Kbd>↓</Kbd> navigate
            </span>
            <span className="flex items-center gap-1.5">
              <Kbd>↵</Kbd> select
            </span>
            <span className="ml-auto flex items-center gap-1.5">
              <Kbd>⌘K</Kbd> toggle
            </span>
          </div>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
