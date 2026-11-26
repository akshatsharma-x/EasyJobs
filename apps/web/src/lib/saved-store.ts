"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { JobListItem } from "@easyjobs/contract";

export const TRACKER_STATUSES = ["saved", "applied", "interviewing", "offer", "rejected"] as const;
export type TrackerStatus = (typeof TRACKER_STATUSES)[number];

export const STATUS_LABELS: Record<TrackerStatus, string> = {
  saved: "Saved",
  applied: "Applied",
  interviewing: "Interviewing",
  offer: "Offer",
  rejected: "Rejected",
};

/** Snapshot of the job at save time, so the tracker works offline and after the job closes. */
export type SavedJobSnapshot = Pick<
  JobListItem,
  "id" | "slug" | "title" | "company" | "locations" | "isRemote" | "workMode" | "jobType" | "experienceLevel" | "salary" | "postedAt" | "applyUrl" | "isOfficial"
>;

export interface SavedEntry {
  job: SavedJobSnapshot;
  status: TrackerStatus;
  notes: string;
  savedAt: string;
  updatedAt: string;
}

interface SavedState {
  entries: Record<string, SavedEntry>;
  /** Insertion order, newest first. */
  order: string[];
  toggle: (job: JobListItem) => boolean;
  save: (job: JobListItem) => void;
  remove: (id: string) => void;
  restore: (entry: SavedEntry) => void;
  setStatus: (id: string, status: TrackerStatus) => void;
  setNotes: (id: string, notes: string) => void;
}

const snapshot = (job: JobListItem): SavedJobSnapshot => ({
  id: job.id,
  slug: job.slug,
  title: job.title,
  company: job.company,
  locations: job.locations,
  isRemote: job.isRemote,
  workMode: job.workMode,
  jobType: job.jobType,
  experienceLevel: job.experienceLevel,
  salary: job.salary,
  postedAt: job.postedAt,
  applyUrl: job.applyUrl,
  isOfficial: job.isOfficial,
});

export const useSavedStore = create<SavedState>()(
  persist(
    (set, get) => ({
      entries: {},
      order: [],
      toggle(job) {
        if (get().entries[job.id]) {
          get().remove(job.id);
          return false;
        }
        get().save(job);
        return true;
      },
      save(job) {
        const now = new Date().toISOString();
        set((s) => ({
          entries: { ...s.entries, [job.id]: { job: snapshot(job), status: "saved", notes: "", savedAt: now, updatedAt: now } },
          order: [job.id, ...s.order.filter((id) => id !== job.id)],
        }));
      },
      remove(id) {
        set((s) => {
          const { [id]: _removed, ...rest } = s.entries;
          return { entries: rest, order: s.order.filter((x) => x !== id) };
        });
      },
      restore(entry) {
        set((s) => ({ entries: { ...s.entries, [entry.job.id]: entry }, order: [entry.job.id, ...s.order.filter((x) => x !== entry.job.id)] }));
      },
      setStatus(id, status) {
        set((s) => {
          const entry = s.entries[id];
          if (!entry) return s;
          return { entries: { ...s.entries, [id]: { ...entry, status, updatedAt: new Date().toISOString() } } };
        });
      },
      setNotes(id, notes) {
        set((s) => {
          const entry = s.entries[id];
          if (!entry) return s;
          return { entries: { ...s.entries, [id]: { ...entry, notes, updatedAt: new Date().toISOString() } } };
        });
      },
    }),
    {
      name: "easyjobs:saved",
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ entries: s.entries, order: s.order }),
      skipHydration: true,
    },
  ),
);

/** CSV export of the tracker (RFC 4180 quoting). */
export function trackerToCsv(entries: SavedEntry[], siteUrl: string): string {
  const header = ["Title", "Company", "Location", "Status", "Saved at", "Updated at", "Notes", "Job page", "Apply link"];
  const quote = (v: string): string => (/[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const rows = entries.map((e) => [
    e.job.title,
    e.job.company.name,
    e.job.locations.join(" / ") || (e.job.isRemote ? "Remote" : ""),
    STATUS_LABELS[e.status],
    e.savedAt,
    e.updatedAt,
    e.notes,
    `${siteUrl}/jobs/${encodeURIComponent(e.job.id)}/${e.job.slug}`,
    e.job.applyUrl,
  ]);
  return [header, ...rows].map((r) => r.map((c) => quote(String(c ?? ""))).join(",")).join("\r\n");
}
