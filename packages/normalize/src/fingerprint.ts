import { createHash } from "node:crypto";
import type { JobLocation } from "@easyjobs/contract";
import { bag } from "./text";
import { titleKey } from "./title";
import { canonicalJobKey, isJobSpecificUrl, isOfficialHost, parseHttpUrl } from "./url";

export function sha1(input: string): string {
  return createHash("sha1").update(input).digest("hex");
}

export interface FingerprintInput {
  applyUrl?: string | null;
  companySlug: string;
  title: string;
  locations?: readonly JobLocation[];
  isRemote?: boolean;
  jobType: string;
  /** Set when `title` is already the cleanTitle() output (skips re-cleaning). */
  titleIsClean?: boolean;
  /** Scraper's own verdict on whether applyUrl points at ONE posting (RawJob.extra.applyUrlSpecific); overrides the heuristic. */
  applyUrlSpecific?: boolean | null;
}

export interface FingerprintResult {
  fingerprint: string;
  /** "k" = official apply URL key (rule 1) · "t" = company|title|city|type hash (rule 2) */
  rule: "k" | "t";
  /** The pre-hash key, useful for debugging merges. */
  key: string;
}

/**
 * prompts.md §0.4:
 * 1. applyUrl on an official host (not an aggregator/job board) → "k:" + sha1(canonicalJobKey(applyUrl)).
 *    Guard: the URL must point at ONE posting — a generic careers/campus page shared by many roles
 *    ("https://nextstep.tcs.com/campus") falls through to rule 2 instead of merging different jobs.
 * 2. Otherwise "t:" + sha1(companySlug | normalized title | primary city or "remote" | jobType).
 */
export function fingerprintDetailed(input: FingerprintInput): FingerprintResult {
  const job = bag(input);
  const url = typeof job.applyUrl === "string" ? job.applyUrl : null;
  const specific = typeof job.applyUrlSpecific === "boolean" ? job.applyUrlSpecific : url ? isJobSpecificUrl(url) : false;
  if (url && parseHttpUrl(url) && isOfficialHost(url) && specific) {
    const key = canonicalJobKey(url);
    return { fingerprint: `k:${sha1(key)}`, rule: "k", key };
  }
  const city = Array.isArray(job.locations) ? (job.locations.find((l) => l?.city)?.city ?? null) : null;
  const primary = job.isRemote ? "remote" : (city?.toLowerCase() ?? "");
  const key = [job.companySlug, titleKey(job.title, { alreadyClean: job.titleIsClean === true }), primary, job.jobType].join("|");
  return { fingerprint: `t:${sha1(key)}`, rule: "t", key };
}

export function fingerprint(job: FingerprintInput): string {
  return fingerprintDetailed(job).fingerprint;
}
