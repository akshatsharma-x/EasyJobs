"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AnimatePresence, m, useReducedMotion } from "motion/react";
import { ArrowUpRight, Bookmark, ChevronDown, Download, NotebookPen, Trash2 } from "lucide-react";
import { notify } from "@/lib/notify";
import { jobPath } from "@easyjobs/contract";
import { CompanyLogo } from "@/components/company/company-logo";
import { TimeAgo } from "@/components/time-ago";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SITE_URL } from "@/lib/env";
import { MotionProvider } from "@/components/motion-provider";
import { formatLocations, formatSalary } from "@/lib/format";
import { useSavedHydrated } from "@/lib/hooks/use-hydrated";
import { STATUS_LABELS, TRACKER_STATUSES, trackerToCsv, useSavedStore, type SavedEntry, type TrackerStatus } from "@/lib/saved-store";
import { cn } from "@/lib/cn";

const STATUS_DOT: Record<TrackerStatus, string> = {
  saved: "bg-subtle-foreground",
  applied: "bg-brand",
  interviewing: "bg-amber-500",
  offer: "bg-live",
  rejected: "bg-danger",
};

function StatusMenu({ entry }: { entry: SavedEntry }): React.JSX.Element {
  const setStatus = useSavedStore((s) => s.setStatus);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="w-[136px] justify-between" aria-label={`Status: ${STATUS_LABELS[entry.status]}`} data-testid="status-menu">
          <span className="flex items-center gap-2">
            <span className={cn("size-2 rounded-full", STATUS_DOT[entry.status])} />
            {STATUS_LABELS[entry.status]}
          </span>
          <ChevronDown className="size-3.5 text-subtle-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuRadioGroup value={entry.status} onValueChange={(v) => setStatus(entry.job.id, v as TrackerStatus)}>
          {TRACKER_STATUSES.map((s) => (
            <DropdownMenuRadioItem key={s} value={s}>
              <span className="flex items-center gap-2">
                <span className={cn("size-2 rounded-full", STATUS_DOT[s])} />
                {STATUS_LABELS[s]}
              </span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function SavedRow({ entry }: { entry: SavedEntry }): React.JSX.Element {
  const [notesOpen, setNotesOpen] = useState(entry.notes.length > 0);
  const setNotes = useSavedStore((s) => s.setNotes);
  const remove = useSavedStore((s) => s.remove);
  const { job } = entry;
  const salary = formatSalary(job.salary);
  return (
    <div className="rounded-2xl border border-border bg-card p-4" data-testid="saved-row">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-1 items-center gap-3.5">
          <CompanyLogo company={job.company} size={40} />
          <div className="min-w-0">
            <Link href={jobPath(job)} className="block truncate text-[15px] font-semibold tracking-[-0.01em] hover:underline">
              {job.title}
            </Link>
            <p className="truncate text-[13px] text-muted-foreground">
              {job.company.name} · {formatLocations(job.locations, job.isRemote)}
              {salary && <span className="font-mono text-[12px] text-foreground/75 tabular"> · {salary}</span>}
            </p>
            <p className="mt-0.5 text-xs text-subtle-foreground">
              Saved <TimeAgo iso={entry.savedAt} /> {entry.updatedAt !== entry.savedAt && <>· updated <TimeAgo iso={entry.updatedAt} /></>}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <StatusMenu entry={entry} />
          <Button variant="ghost" size="icon-sm" aria-label="Notes" aria-expanded={notesOpen} onClick={() => setNotesOpen((o) => !o)} className={cn(entry.notes && "text-brand-text")}>
            <NotebookPen className="size-4" />
          </Button>
          <Button asChild variant="ghost" size="icon-sm" aria-label={`Apply — ${job.title} (opens in a new tab)`}>
            <a href={job.applyUrl} target="_blank" rel="noopener noreferrer nofollow">
              <ArrowUpRight className="size-4" />
            </a>
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Remove ${job.title}`}
            onClick={() => {
              remove(job.id);
              notify.message("Removed from saved", { action: { label: "Undo", onClick: () => useSavedStore.getState().restore(entry) } });
            }}
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      </div>
      {notesOpen && (
        <div className="mt-3 sm:pl-[54px]">
          <label htmlFor={`notes-${job.id}`} className="sr-only">
            Notes for {job.title}
          </label>
          <Textarea
            id={`notes-${job.id}`}
            rows={2}
            defaultValue={entry.notes}
            placeholder="Referral from…, interview on…, salary discussed…"
            onBlur={(e) => e.target.value !== entry.notes && setNotes(job.id, e.target.value)}
            className="text-[13px]"
          />
        </div>
      )}
    </div>
  );
}

export function SavedBoard(): React.JSX.Element {
  const ready = useSavedHydrated();
  const entriesMap = useSavedStore((s) => s.entries);
  const order = useSavedStore((s) => s.order);
  const [filter, setFilter] = useState<TrackerStatus | "all">("all");
  const reduce = useReducedMotion();
  const entries = useMemo(() => order.map((id) => entriesMap[id]).filter((e): e is SavedEntry => Boolean(e)), [order, entriesMap]);
  const counts = useMemo(() => {
    const c: Record<TrackerStatus, number> = { saved: 0, applied: 0, interviewing: 0, offer: 0, rejected: 0 };
    for (const e of entries) c[e.status]++;
    return c;
  }, [entries]);
  const shown = filter === "all" ? entries : entries.filter((e) => e.status === filter);

  const exportCsv = (): void => {
    const blob = new Blob([`﻿${trackerToCsv(entries, SITE_URL)}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `easyjobs-tracker-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    notify.success("Exported your tracker", { description: `${entries.length} jobs · CSV` });
  };

  if (!ready) {
    return (
      <div className="grid gap-3" aria-busy="true">
        <div className="skeleton h-[76px] rounded-2xl" />
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="skeleton h-[74px] rounded-2xl" />
        ))}
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border px-6 py-16 text-center" data-testid="saved-empty">
        <div className="mx-auto grid size-11 place-items-center rounded-xl bg-muted text-muted-foreground">
          <Bookmark className="size-5" />
        </div>
        <h2 className="mt-4 text-[17px] font-semibold">No saved jobs yet</h2>
        <p className="mx-auto mt-1.5 max-w-sm text-sm text-muted-foreground">
          Tap the bookmark on any job — or press <kbd className="font-mono">s</kbd> in search — and track it from saved to offer here.
        </p>
        <Button asChild className="mt-6">
          <Link href="/jobs">Browse jobs</Link>
        </Button>
      </div>
    );
  }

  return (
    <div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-6" role="tablist" aria-label="Application stage">
        {(["all", ...TRACKER_STATUSES] as const).map((s, i) => {
          const active = filter === s;
          const n = s === "all" ? entries.length : counts[s];
          return (
            <button
              key={s}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setFilter(s)}
              className={cn(
                "relative flex flex-col items-start rounded-xl border px-3.5 py-2.5 text-left transition-[border-color,background-color] duration-150",
                active ? "border-foreground/70 bg-card" : "border-border hover:border-border-strong",
                i === 0 && "col-span-2 sm:col-span-1",
              )}
            >
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                {s !== "all" && <span className={cn("size-1.5 rounded-full", STATUS_DOT[s])} />}
                {s === "all" ? "All" : STATUS_LABELS[s]}
              </span>
              <span className="mt-0.5 font-mono text-[20px] font-semibold tabular">{n}</span>
            </button>
          );
        })}
      </div>
      <div className="mt-6 flex items-center justify-between">
        <p className="text-[13px] text-muted-foreground">
          {shown.length} {shown.length === 1 ? "job" : "jobs"}
          {filter !== "all" && ` · ${STATUS_LABELS[filter]}`}
        </p>
        <Button variant="outline" size="sm" onClick={exportCsv} data-testid="export-csv">
          <Download className="size-3.5" /> Export CSV
        </Button>
      </div>
      <MotionProvider>
      <m.ul layout={!reduce} className="mt-3 grid gap-2.5">
        <AnimatePresence initial={false}>
          {shown.map((entry) => (
            <m.li
              key={entry.job.id}
              layout={!reduce}
              initial={reduce ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ type: "spring", stiffness: 420, damping: 36 }}
            >
              <SavedRow entry={entry} />
            </m.li>
          ))}
        </AnimatePresence>
      </m.ul>
      </MotionProvider>
    </div>
  );
}
