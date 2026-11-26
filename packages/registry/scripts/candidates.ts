/**
 * The curated candidate list: every company we want in the registry, with what we know about it
 * (domain, careers URL, tags, HQ, India presence, known ATS hints). Discovery (detect-ats/probe) and
 * verify.ts turn these into verified CompanyTarget entries.
 *
 *   pnpm --filter @easyjobs/registry candidates            # stats
 *   pnpm --filter @easyjobs/registry candidates --json     # dump merged list
 */
import { pathToFileURL } from "node:url";
import type { CompanyTag } from "@easyjobs/contract";
import ai from "./candidates/ai";
import bigTech from "./candidates/big-tech";
import enterpriseSoftware from "./candidates/enterprise-software";
import finance from "./candidates/finance";
import globalStartups from "./candidates/global-startups";
import indiaStartups from "./candidates/india-startups";
import indianIt from "./candidates/indian-it";
import mncOther from "./candidates/mnc-other";
import more from "./candidates/more";
import semisHardware from "./candidates/semis-hardware";
import yc from "./candidates/yc";
import type { Candidate } from "./candidates/parse";

export type { Candidate } from "./candidates/parse";

const SEGMENTS: Candidate[][] = [bigTech, finance, semisHardware, enterpriseSoftware, indianIt, mncOther, indiaStartups, globalStartups, ai, yc, more];

/** First occurrence wins for scalar fields; tags, hints and aka are unioned; flags are OR-ed. */
function merge(into: Candidate, from: Candidate): void {
  for (const t of from.tags) if (!into.tags.includes(t)) into.tags.push(t);
  for (const h of from.hints) if (!into.hints.some((x) => x.ats === h.ats && x.token === h.token)) into.hints.push(h);
  for (const a of [from.name, ...from.aka]) if (a !== into.name && !into.aka.includes(a)) into.aka.push(a);
  into.domain ??= from.domain;
  into.careersUrl ??= from.careersUrl;
  into.hq ??= from.hq;
  into.indiaPresence ||= from.indiaPresence;
  into.remote ||= from.remote;
  if (from.priority !== null) into.priority = into.priority === null ? from.priority : (Math.min(into.priority, from.priority) as 1 | 2 | 3);
}

function build(): Candidate[] {
  const bySlug = new Map<string, Candidate>();
  const byDomain = new Map<string, Candidate>();
  for (const c of SEGMENTS.flat()) {
    const existing = bySlug.get(c.slug) ?? (c.domain ? byDomain.get(c.domain) : undefined);
    if (existing) {
      merge(existing, c);
      if (existing.domain && !byDomain.has(existing.domain)) byDomain.set(existing.domain, existing);
      continue;
    }
    const copy: Candidate = { ...c, tags: [...c.tags], hints: [...c.hints], aka: [...c.aka] };
    bySlug.set(copy.slug, copy);
    if (copy.domain) byDomain.set(copy.domain, copy);
  }
  return [...bySlug.values()].sort((a, b) => a.slug.localeCompare(b.slug));
}

export const candidates: Candidate[] = build();

export function getCandidate(slug: string): Candidate | undefined {
  return candidates.find((c) => c.slug === slug);
}

/** Registry priority (prompts.md P04 §5): 1 = big India hirers & fresher-friendly, 2 = other MNCs & startups, 3 = the rest. */
export function candidatePriority(c: Candidate): 1 | 2 | 3 {
  if (c.priority !== null) return c.priority;
  const has = (...t: CompanyTag[]): boolean => t.some((x) => c.tags.includes(x));
  if (has("big_tech", "indian_it")) return 1;
  if (has("unicorn") && c.indiaPresence) return 1;
  if (has("mnc", "gcc", "startup", "unicorn", "yc", "ai", "product", "fintech", "bank", "consulting", "service") && (c.indiaPresence || c.remote)) return 2;
  // No India presence and no remote hiring (Domino's US stores, US-only banks…): "the rest" for an India-first site.
  return 3;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(candidates, null, 2));
  } else {
    const by = <K extends string>(f: (c: Candidate) => K[]): Record<string, number> => {
      const out: Record<string, number> = {};
      for (const c of candidates) for (const k of f(c)) out[k] = (out[k] ?? 0) + 1;
      return Object.fromEntries(Object.entries(out).sort((a, b) => b[1] - a[1]));
    };
    console.log(`candidates: ${candidates.length} (raw lines: ${SEGMENTS.flat().length})`);
    console.log("by segment:", by((c) => [c.segment]));
    console.log("by tag:", by((c) => c.tags));
    console.log("by priority:", by((c) => [String(candidatePriority(c))]));
    console.log("with hints:", candidates.filter((c) => c.hints.length > 0).length, "· india presence:", candidates.filter((c) => c.indiaPresence).length);
    console.log("hints by ats:", by((c) => c.hints.map((h) => h.ats)));
  }
}
