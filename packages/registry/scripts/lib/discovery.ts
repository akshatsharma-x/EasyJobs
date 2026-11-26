/**
 * Discovery results (committed, so verify.ts is reproducible without re-crawling):
 *   data/discovery/detect.json — boards found on careers pages (detect-ats.ts)
 *   data/discovery/probe.json  — boards found by probing slug variants / Workday robots / Eightfold (probe.ts)
 * One file per discoverer so both can run at the same time.
 */
import { mkdirSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { AtsType } from "@easyjobs/contract";
import { DATA_DIR, readJsonFile } from "./fetcher";

export type ProposalVia = "hint" | "detect" | "probe" | "workday-robots" | "eightfold-probe" | "previous";

export interface Proposal {
  ats: AtsType;
  token: string;
  via: ProposalVia;
  /** Where it was seen (URL/snippet) or why it was accepted. */
  evidence: string;
  openJobs?: number | null;
  boardName?: string | null;
  verdict?: "match" | "unknown";
  score?: number;
  at: string;
}

export interface DiscoveryRecord {
  slug: string;
  at: string;
  status: "found" | "none" | "error";
  proposals: Proposal[];
  /** Careers page that loaded and pointed at the board (detect only). */
  careersUrl?: string | null;
  /** URLs fetched / probes tried, for debugging. */
  tried?: number;
  pages?: string[];
  detail?: string;
}

export type DiscoveryFile = Record<string, DiscoveryRecord>;

export const DISCOVERY_DIR = join(DATA_DIR, "discovery");
export const DETECT_FILE = join(DISCOVERY_DIR, "detect.json");
export const PROBE_FILE = join(DISCOVERY_DIR, "probe.json");

export function loadDiscovery(file: string): DiscoveryFile {
  return readJsonFile<DiscoveryFile>(file, {});
}

/** Atomic write, keys sorted for stable diffs. */
export function saveDiscovery(file: string, data: DiscoveryFile): void {
  mkdirSync(DISCOVERY_DIR, { recursive: true });
  const sorted = Object.fromEntries(Object.keys(data).sort().map((k) => [k, data[k]!]));
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, JSON.stringify(sorted, null, 1) + "\n");
  renameSync(tmp, file);
}

/** Periodic saver: flushes at most every `everyMs`, plus once at the end. */
export function createSaver(file: string, data: DiscoveryFile, everyMs = 15_000): { touch(): void; flush(): void } {
  let last = Date.now();
  let dirty = false;
  return {
    touch() {
      dirty = true;
      if (Date.now() - last > everyMs) this.flush();
    },
    flush() {
      if (!dirty) return;
      saveDiscovery(file, data);
      last = Date.now();
      dirty = false;
    },
  };
}
