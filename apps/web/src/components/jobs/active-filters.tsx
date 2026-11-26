"use client";

import { X } from "lucide-react";
import { LABELS, type Facets, type SearchQuery } from "@easyjobs/contract";
import { formatInrYearly } from "@/lib/format";
import { companyTagLabel, tagLabel } from "@/lib/labels";
import type { QueryPatch } from "@/lib/search-state";
import type { CompanyInfo } from "./filters";

export interface ActiveChip {
  key: string;
  label: string;
  patch: QueryPatch;
}

const labelFrom = (facet: { value: string; label: string }[] | undefined, value: string): string =>
  facet?.find((b) => b.value.toLowerCase() === value.toLowerCase())?.label ?? value;

/** Every active filter as a removable chip (the free-text query lives in the search box). */
export function activeChips(query: SearchQuery, facets: Facets | undefined, companies: Map<string, CompanyInfo>): ActiveChip[] {
  const chips: ActiveChip[] = [];
  const list = <K extends "type" | "level" | "mode" | "category" | "location" | "country" | "company" | "ctype" | "skills" | "source" | "tag">(
    key: K,
    label: (v: string) => string,
  ): void => {
    const values = (query[key] ?? []) as string[];
    for (const v of values) chips.push({ key: `${key}:${v}`, label: label(v), patch: { [key]: values.filter((x) => x !== v) } as QueryPatch });
  };
  list("level", (v) => LABELS.level[v as keyof typeof LABELS.level] ?? v);
  list("type", (v) => LABELS.jobType[v as keyof typeof LABELS.jobType] ?? v);
  list("mode", (v) => LABELS.workMode[v as keyof typeof LABELS.workMode] ?? v);
  list("location", (v) => v);
  list("country", (v) => v);
  list("company", (v) => companies.get(v)?.name ?? labelFrom(facets?.company, v));
  list("ctype", (v) => companyTagLabel(v));
  list("category", (v) => LABELS.category[v as keyof typeof LABELS.category] ?? v);
  list("skills", (v) => v);
  list("source", (v) => `via ${labelFrom(facets?.source, v)}`);
  list("tag", (v) => tagLabel(v));
  for (const b of query.batch ?? []) chips.push({ key: `batch:${b}`, label: `${b} batch`, patch: { batch: (query.batch ?? []).filter((x) => x !== b) } });
  if (query.official) chips.push({ key: "official", label: "Official sites only", patch: { official: null } });
  if (query.exp !== undefined) chips.push({ key: "exp", label: `${query.exp}${query.exp >= 8 ? "+" : ""} yrs experience`, patch: { exp: null } });
  if (query.salaryMin) chips.push({ key: "salaryMin", label: `${formatInrYearly(query.salaryMin)}+`, patch: { salaryMin: null } });
  if (query.posted !== "any") chips.push({ key: "posted", label: LABELS.posted[query.posted], patch: { posted: null } });
  return chips;
}

export function ActiveFilters({
  chips,
  onRemove,
  onClear,
}: {
  chips: ActiveChip[];
  onRemove: (chip: ActiveChip) => void;
  onClear: () => void;
}): React.JSX.Element | null {
  if (chips.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5" aria-label="Active filters" data-testid="active-filters">
      {chips.map((chip) => (
          <span
            key={chip.key}
            className="inline-flex h-7 items-center gap-1 rounded-full border border-brand/25 bg-brand-soft pl-2.5 pr-1 text-[12.5px] font-medium text-brand-text animate-in fade-in-0 zoom-in-90 duration-200 ease-[var(--ease-spring)]"
          >
            {chip.label}
            <button
              type="button"
              onClick={() => onRemove(chip)}
              aria-label={`Remove filter: ${chip.label}`}
              className="grid size-5 place-items-center rounded-full transition-colors hover:bg-brand-soft-strong"
            >
              <X className="size-3" />
            </button>
          </span>
        ))}
      <button
        type="button"
        onClick={onClear}
        className="ml-1 h-7 rounded-full px-2 text-[12.5px] font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        Clear all
      </button>
    </div>
  );
}
