import { isCountryLabel, levelFromWorkerType, mentionsCountry } from "../lib/mapping";

export interface FacetValue {
  id: string;
  descriptor: string;
  count: number;
}

export interface FlatFacet {
  param: string;
  descriptor: string;
  values: FacetValue[];
  /** Parent group parameter (e.g. "locationMainGroup"), if nested. */
  group: string | null;
}

export type AppliedFacets = Record<string, string[]>;

/** Workday's result cap: some tenants report total ≤ 2000 and wrap offsets ≥ 2000 to page 1. */
export const WORKDAY_RESULT_CAP = 2000;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown): string => (typeof v === "string" ? v : "");

/** Facets arrive nested ("locationMainGroup" → "locationCountry", "locations"); flatten to leaf facets. */
export function flattenFacets(facets: readonly unknown[] | null | undefined, group: string | null = null): FlatFacet[] {
  const out: FlatFacet[] = [];
  for (const f of facets ?? []) {
    if (!isObj(f)) continue;
    const param = str(f.facetParameter);
    const values = Array.isArray(f.values) ? f.values : [];
    const nested = values.some((v) => isObj(v) && Array.isArray(v.values) && typeof v.facetParameter === "string");
    if (nested) {
      out.push(...flattenFacets(values, param || group));
      continue;
    }
    if (!param) continue;
    const leaf: FacetValue[] = [];
    for (const v of values) {
      if (!isObj(v)) continue;
      const id = str(v.id);
      const count = typeof v.count === "number" && Number.isFinite(v.count) ? v.count : 0;
      if (id) leaf.push({ id, descriptor: str(v.descriptor), count });
    }
    if (leaf.length > 0) out.push({ param, descriptor: str(f.descriptor), values: leaf, group });
  }
  return out;
}

const sum = (f: FlatFacet): number => f.values.reduce((a, v) => a + v.count, 0);
const maxCount = (f: FlatFacet): number => f.values.reduce((a, v) => Math.max(a, v.count), 0);

export const isLocationFacet = (f: FlatFacet): boolean =>
  /location|country|region|state|province|city|site|distance|geo|address/i.test(`${f.param} ${f.descriptor} ${f.group ?? ""}`);

/** A worker-type facet ("Job Type" = Regular Employee / Intern (Fixed Term) / New College Graduate …). */
export const isWorkerTypeFacet = (f: FlatFacet): boolean =>
  /worker_?sub_?type|worker_?type|employee_?type|employment_?type|jobtype/i.test(f.param) ||
  /^(?:job type|worker (?:sub )?type|employee type|employment type)$/i.test(f.descriptor.trim());

/** Best estimate of the true result count of a (possibly capped) segment. */
export function estimateTotal(facets: readonly FlatFacet[], reportedTotal: number): number {
  let best = reportedTotal;
  for (const f of facets) if (!isLocationFacet(f)) best = Math.max(best, sum(f));
  return best;
}

/**
 * Facet to partition a listing by, so every job is tagged with its worker type (structured
 * internship / new-grad hints) — only when it is single-valued and complete (Σ counts == total).
 */
export function pickHintFacet(facets: readonly FlatFacet[], total: number, applied: AppliedFacets): FlatFacet | null {
  if (total <= 0) return null;
  const f = facets.find((x) => isWorkerTypeFacet(x) && !applied[x.param] && x.values.length >= 2 && sum(x) === total);
  return f ?? null;
}

/** Process early-career values first so they get detail budget, then larger buckets. */
export function orderHintValues(values: readonly FacetValue[]): FacetValue[] {
  const rank = (v: FacetValue): number => (levelFromWorkerType(v.descriptor) ? 0 : 1);
  return [...values].filter((v) => v.count > 0).sort((a, b) => rank(a) - rank(b) || a.count - b.count);
}

/**
 * For a capped segment: a facet whose values cover every job (Σ ≥ estimated total) and split it
 * into buckets below the cap. Prefers single-valued (non-location) facets with the least overlap.
 */
export function pickPartitionFacet(facets: readonly FlatFacet[], applied: AppliedFacets, estimatedTotal: number): FlatFacet | null {
  const candidates = facets
    .filter((f) => !applied[f.param] && f.values.filter((v) => v.count > 0).length >= 2 && sum(f) >= estimatedTotal)
    .sort((a, b) => {
      const underCap = Number(maxCount(b) < WORKDAY_RESULT_CAP) - Number(maxCount(a) < WORKDAY_RESULT_CAP);
      if (underCap !== 0) return underCap;
      const loc = Number(isLocationFacet(a)) - Number(isLocationFacet(b));
      if (loc !== 0) return loc;
      return sum(a) - sum(b) || maxCount(a) - maxCount(b) || a.values.length - b.values.length;
    });
  return candidates[0] ?? null;
}

export interface CountrySelection {
  param: string;
  ids: string[];
  labels: string[];
  count: number;
}

/**
 * India-only (or any country) mode: find the tenant's country facet value; tenants without one
 * get every site-level location value that mentions the country ("Bangalore, India", "IND-Pune").
 */
export function selectCountryFacet(facets: readonly FlatFacet[], country: { code: string | null; names: string[] }): CountrySelection | null {
  const exact = (f: FlatFacet): FacetValue[] => f.values.filter((v) => v.count > 0 && isCountryLabel(v.descriptor, country));
  const tiers: ((f: FlatFacet) => boolean)[] = [
    (f) => /country/i.test(`${f.param} ${f.descriptor}`),
    (f) => /hierarchy|^locations?$/i.test(f.param) || /^locations?$/i.test(f.descriptor),
  ];
  for (const tier of tiers) {
    for (const f of facets.filter(tier)) {
      const hits = exact(f);
      if (hits.length > 0) return { param: f.param, ids: hits.map((v) => v.id), labels: hits.map((v) => v.descriptor), count: hits.reduce((a, v) => a + v.count, 0) };
    }
  }
  for (const f of facets.filter((x) => isLocationFacet(x) && !/distance/i.test(x.param))) {
    const hits = f.values.filter((v) => v.count > 0 && mentionsCountry(v.descriptor, country));
    if (hits.length > 0) return { param: f.param, ids: hits.map((v) => v.id), labels: hits.map((v) => v.descriptor), count: hits.reduce((a, v) => a + v.count, 0) };
  }
  return null;
}
