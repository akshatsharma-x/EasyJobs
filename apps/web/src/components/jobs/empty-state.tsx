"use client";

import { SearchX } from "lucide-react";
import { LABELS, type Facets, type SearchQuery } from "@easyjobs/contract";
import { Button } from "@/components/ui/button";
import { formatCount } from "@/lib/format";
import { companyTagLabel, tagLabel } from "@/lib/labels";
import type { QueryPatch } from "@/lib/search-state";

export interface Suggestion {
  label: string;
  count: number | null;
  patch: QueryPatch;
}

const sum = (buckets: { count: number }[] | undefined): number => (buckets ?? []).reduce((s, b) => s + b.count, 0);

/**
 * Smart relaxations computed from the disjunctive facets: a facet's counts already exclude its own filter,
 * so "remove X" (single-valued keys) and "switch to Y" (multi-valued keys) counts are exact.
 */
export function relaxations(query: SearchQuery, facets: Facets | undefined): Suggestion[] {
  if (!facets) return [];
  const out: Suggestion[] = [];
  const single = [
    ["level", (v: string) => LABELS.level[v as keyof typeof LABELS.level]],
    ["type", (v: string) => LABELS.jobType[v as keyof typeof LABELS.jobType]],
    ["mode", (v: string) => LABELS.workMode[v as keyof typeof LABELS.workMode]],
    ["category", (v: string) => LABELS.category[v as keyof typeof LABELS.category]],
    ["company", (v: string) => facets.company.find((b) => b.value === v)?.label ?? v],
  ] as const;
  for (const [key, label] of single) {
    const values = (query[key] ?? []) as string[];
    if (values.length === 0) continue;
    const total = sum(facets[key]);
    if (total > 0) out.push({ label: `Remove “${values.map(label).join(", ")}”`, count: total, patch: { [key]: null } as QueryPatch });
  }
  const multi = [
    ["location", (v: string) => v],
    ["ctype", (v: string) => companyTagLabel(v)],
    ["skills", (v: string) => v],
    ["source", (v: string) => facets.source.find((b) => b.value === v)?.label ?? v],
    ["tag", (v: string) => tagLabel(v)],
    ["batch", (v: string) => `${v} batch`],
  ] as const;
  for (const [key, label] of multi) {
    const values = ((query[key] ?? []) as (string | number)[]).map(String);
    if (values.length === 0) continue;
    const best = facets[key].find((b) => !values.includes(b.value) && b.count > 0);
    if (best) {
      const value = key === "batch" ? [Number(best.value)] : [best.value];
      out.push({ label: `Try “${label(best.value)}” instead`, count: best.count, patch: { [key]: value } as QueryPatch });
    }
  }
  if (query.official) out.push({ label: "Include job boards", count: null, patch: { official: null } });
  if (query.posted !== "any") out.push({ label: "Any posting date", count: null, patch: { posted: null } });
  if (query.salaryMin) out.push({ label: "Remove minimum pay", count: null, patch: { salaryMin: null } });
  if (query.exp !== undefined) out.push({ label: "Remove experience filter", count: null, patch: { exp: null } });
  if (query.q) out.push({ label: `Clear search “${query.q}”`, count: null, patch: { q: null } });
  return out.sort((a, b) => (b.count ?? -1) - (a.count ?? -1)).slice(0, 5);
}

export function EmptyState({
  query,
  facets,
  onApply,
  onClear,
}: {
  query: SearchQuery;
  facets: Facets | undefined;
  onApply: (patch: QueryPatch) => void;
  onClear: () => void;
}): React.JSX.Element {
  const suggestions = relaxations(query, facets);
  return (
    <div className="rounded-2xl border border-dashed border-border px-6 py-12 text-center" data-testid="empty-state">
      <div className="mx-auto grid size-11 place-items-center rounded-xl bg-muted text-muted-foreground">
        <SearchX className="size-5" />
      </div>
      <h2 className="mt-4 text-[17px] font-semibold">No jobs match all of that</h2>
      <p className="mx-auto mt-1.5 max-w-sm text-sm text-muted-foreground">
        New roles arrive every few minutes — or loosen one filter:
      </p>
      {suggestions.length > 0 && (
        <ul className="mx-auto mt-6 grid max-w-sm gap-2">
          {suggestions.map((s) => (
            <li key={s.label}>
              <button
                type="button"
                onClick={() => onApply(s.patch)}
                className="flex w-full items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-2.5 text-left text-sm transition-[border-color,transform] duration-150 hover:-translate-y-px hover:border-border-strong"
              >
                <span className="font-medium">{s.label}</span>
                {s.count !== null && (
                  <span className="font-mono text-[12.5px] text-muted-foreground tabular">→ {formatCount(s.count)} jobs</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
      <Button variant="outline" className="mt-6" onClick={onClear}>
        Clear all filters
      </Button>
    </div>
  );
}
