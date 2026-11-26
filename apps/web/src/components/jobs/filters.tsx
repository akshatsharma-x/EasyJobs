"use client";

import { useMemo, useState, type ReactNode } from "react";
import { ChevronDown, Search, ShieldCheck } from "lucide-react";
import {
  EXPERIENCE_LEVELS,
  JOB_TYPES,
  LABELS,
  POSTED_WITHIN,
  WORK_MODES,
  type FacetBucket,
  type Facets,
  type SearchQuery,
} from "@easyjobs/contract";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { CompanyLogo } from "@/components/company/company-logo";
import { formatCount, formatInrYearly } from "@/lib/format";
import { FILTER_TAGS, companyTagLabel, tagLabel } from "@/lib/labels";
import type { QueryPatch } from "@/lib/search-state";
import { cn } from "@/lib/cn";

export interface CompanyInfo {
  name: string;
  domain: string | null;
  logoUrl: string | null;
}

export interface FilterPanelProps {
  query: SearchQuery;
  facets: Facets | undefined;
  setQuery: (patch: QueryPatch) => void;
  companies: Map<string, CompanyInfo>;
  idPrefix?: string;
}

type ListKey = "type" | "level" | "mode" | "category" | "location" | "company" | "ctype" | "source" | "tag";

const countOf = (facet: FacetBucket[] | undefined, value: string): number =>
  facet?.find((b) => b.value.toLowerCase() === value.toLowerCase())?.count ?? 0;

function toggleValue<T extends string | number>(list: T[] | undefined, value: T): T[] {
  const current = list ?? [];
  return current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
}

/* ───────────────────────── Section ───────────────────────── */

function Section({
  title,
  children,
  active = 0,
  defaultOpen = false,
}: {
  title: string;
  children: ReactNode;
  active?: number;
  defaultOpen?: boolean;
}): React.JSX.Element {
  const [open, setOpen] = useState(defaultOpen || active > 0);
  // Native disclosure: keyboard + screen-reader support without any JS library.
  return (
    <details open={open} onToggle={(e) => setOpen(e.currentTarget.open)} className="group border-b border-border py-1 last:border-b-0">
      <summary className="flex cursor-pointer list-none items-center gap-2 rounded-lg py-2.5 text-left text-[13px] font-semibold text-foreground outline-none focus-visible:ring-2 focus-visible:ring-brand">
        <span className="flex-1">{title}</span>
        {active > 0 && (
          <span className="grid h-[18px] min-w-[18px] place-items-center rounded-full bg-brand px-1 font-mono text-[10.5px] font-semibold text-brand-foreground tabular">
            {active}
          </span>
        )}
        <ChevronDown aria-hidden="true" className="size-4 text-subtle-foreground transition-transform duration-200 group-open:rotate-180" />
      </summary>
      {/* Closed sections render nothing: keeps the SSR HTML and DOM small. */}
      {open && <div className="pb-3 pt-0.5 animate-in fade-in-0 duration-200">{children}</div>}
    </details>
  );
}

/* ───────────────────────── Option rows ───────────────────────── */

function CheckRow({
  id,
  label,
  count,
  checked,
  onChange,
  icon,
}: {
  id: string;
  label: string;
  count: number;
  checked: boolean;
  onChange: () => void;
  icon?: ReactNode;
}): React.JSX.Element {
  const disabled = count === 0 && !checked;
  return (
    <div className={cn("flex items-center gap-2.5 rounded-lg px-1 py-[5px] transition-colors hover:bg-muted/70", disabled && "opacity-45")}>
      <Checkbox id={id} checked={checked} onChange={onChange} disabled={disabled} />
      <label htmlFor={id} className={cn("flex min-w-0 flex-1 items-center gap-2 text-[13px]", disabled && "cursor-default")}>
        {icon}
        <span className="truncate">{label}</span>
      </label>
      <span className="font-mono text-[11.5px] text-subtle-foreground tabular">{formatCount(count)}</span>
    </div>
  );
}

function Chip({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count?: number;
  active: boolean;
  onClick: () => void;
}): React.JSX.Element {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-[12.5px] font-medium transition-[background-color,border-color,color,transform] duration-200 ease-[var(--ease-spring)] active:scale-95",
        active
          ? "border-brand bg-brand text-brand-foreground"
          : "border-border bg-background text-foreground/80 hover:border-border-strong hover:text-foreground",
      )}
    >
      {label}
      {count !== undefined && (
        <span className={cn("font-mono text-[10.5px] tabular", active ? "text-brand-foreground/80" : "text-subtle-foreground")}>
          {formatCount(count)}
        </span>
      )}
    </button>
  );
}

/* ───────────────────────── Generic lists ───────────────────────── */

function EnumChecklist<T extends string>({
  facetKey,
  values,
  labels,
  props,
}: {
  facetKey: "type" | "level" | "mode";
  values: readonly T[];
  labels: Record<T, string>;
  props: FilterPanelProps;
}): React.JSX.Element {
  const facet = props.facets?.[facetKey];
  const selected = (props.query[facetKey] ?? []) as string[];
  // Hide values with no jobs at all, unless selected.
  const shown = values.filter((v) => countOf(facet, v) > 0 || selected.includes(v) || !facet);
  return (
    <div className="grid">
      {shown.map((v) => (
        <CheckRow
          key={v}
          id={`${props.idPrefix ?? "f"}-${facetKey}-${v}`}
          label={labels[v]}
          count={countOf(facet, v)}
          checked={selected.includes(v)}
          onChange={() => props.setQuery({ [facetKey]: toggleValue(selected, v) } as QueryPatch)}
        />
      ))}
    </div>
  );
}

function SearchableChecklist({
  facetKey,
  placeholder,
  props,
  withLogos = false,
  initial = 6,
}: {
  facetKey: ListKey;
  placeholder: string;
  props: FilterPanelProps;
  withLogos?: boolean;
  initial?: number;
}): React.JSX.Element {
  const [term, setTerm] = useState("");
  const [expanded, setExpanded] = useState(false);
  const facet = props.facets?.[facetKey] ?? [];
  const selected = (props.query[facetKey] ?? []) as string[];
  const selectedLower = selected.map((s) => s.toLowerCase());

  const options = useMemo(() => {
    const byValue = new Map(facet.map((b) => [b.value.toLowerCase(), b]));
    // Selected values first (even when their count is 0), then the rest by count.
    const pinned = selected.map(
      (v) => byValue.get(v.toLowerCase()) ?? { value: v, label: props.companies.get(v)?.name ?? v, count: 0 },
    );
    const rest = facet.filter((b) => !selectedLower.includes(b.value.toLowerCase()));
    const all = [...pinned, ...rest];
    const t = term.trim().toLowerCase();
    return t ? all.filter((b) => b.label.toLowerCase().includes(t)) : all;
  }, [facet, selected, selectedLower, term, props.companies]);

  const visible = expanded || term ? options : options.slice(0, Math.max(initial, selected.length));
  const inputId = `${props.idPrefix ?? "f"}-${facetKey}-search`;

  return (
    <div>
      {facet.length > initial && (
        <div className="relative mb-1.5">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-subtle-foreground" />
          <label htmlFor={inputId} className="sr-only">
            {placeholder}
          </label>
          <input
            id={inputId}
            type="search"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder={placeholder}
            className="h-8 w-full rounded-lg border border-border bg-background pl-8 pr-2 text-[13px] outline-none transition-colors focus:border-brand"
          />
        </div>
      )}
      <div className={cn("grid", (expanded || term) && "scroll-quiet max-h-64 overflow-y-auto")}>
        {visible.map((b) => {
          const company = withLogos ? props.companies.get(b.value) : undefined;
          return (
            <CheckRow
              key={b.value}
              id={`${props.idPrefix ?? "f"}-${facetKey}-${b.value}`}
              label={b.label}
              count={b.count}
              checked={selectedLower.includes(b.value.toLowerCase())}
              onChange={() => {
                const exists = selected.find((s) => s.toLowerCase() === b.value.toLowerCase());
                props.setQuery({ [facetKey]: exists ? selected.filter((s) => s !== exists) : [...selected, b.value] } as QueryPatch);
              }}
              icon={
                withLogos ? (
                  <CompanyLogo company={company ?? { name: b.label, domain: null, logoUrl: null }} size={20} />
                ) : undefined
              }
            />
          );
        })}
        {visible.length === 0 && <p className="px-1 py-2 text-[13px] text-subtle-foreground">No matches</p>}
      </div>
      {!term && options.length > visible.length && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="mt-1 px-1 text-[12.5px] font-medium text-brand-text hover:underline"
        >
          Show all {options.length}
        </button>
      )}
      {expanded && !term && options.length > initial && (
        <button type="button" onClick={() => setExpanded(false)} className="mt-1 px-1 text-[12.5px] font-medium text-muted-foreground hover:underline">
          Show less
        </button>
      )}
    </div>
  );
}

/* ───────────────────────── Specific controls ───────────────────────── */

const EXP_OPTIONS = [
  { value: 0, label: "0" },
  { value: 1, label: "1" },
  { value: 2, label: "2" },
  { value: 3, label: "3" },
  { value: 5, label: "5" },
  { value: 8, label: "8+" },
];

const BATCHES = [2024, 2025, 2026, 2027, 2028];

/** Slider stops in INR per year. */
export const SALARY_STEPS = [
  0, 100_000, 200_000, 300_000, 400_000, 500_000, 600_000, 800_000, 1_000_000, 1_200_000, 1_500_000, 2_000_000,
  2_500_000, 3_000_000, 4_000_000, 5_000_000, 7_500_000, 10_000_000,
];

function nearestStep(value: number | undefined): number {
  if (!value) return 0;
  let best = 0;
  for (let i = 0; i < SALARY_STEPS.length; i++) if ((SALARY_STEPS[i] ?? 0) <= value) best = i;
  return best;
}

function SalarySlider({ props }: { props: FilterPanelProps }): React.JSX.Element {
  const committed = nearestStep(props.query.salaryMin);
  const [draft, setDraft] = useState<number | null>(null);
  const index = draft ?? committed;
  const value = SALARY_STEPS[index] ?? 0;
  const commit = (): void => {
    if (draft === null) return;
    setDraft(null);
    if (draft === committed) return;
    const next = SALARY_STEPS[draft] ?? 0;
    props.setQuery({ salaryMin: next > 0 ? next : null });
  };
  return (
    <div className="px-1">
      <div className="flex items-baseline justify-between">
        <span className="font-mono text-[13px] font-medium tabular">{value === 0 ? "Any amount" : `${formatInrYearly(value)}+`}</span>
        {value > 0 && <span className="font-mono text-[11.5px] text-subtle-foreground tabular">≈ ₹{Math.round(value / 12 / 1000)}k/mo</span>}
      </div>
      <Slider
        className="mt-2"
        min={0}
        max={SALARY_STEPS.length - 1}
        step={1}
        value={index}
        aria-label="Minimum salary or stipend per year"
        aria-valuetext={value === 0 ? "Any amount" : `${formatInrYearly(value)} or more per year`}
        onChange={(e) => setDraft(Number(e.currentTarget.value))}
        onPointerUp={() => commit()}
        onKeyUp={() => commit()}
        onBlur={() => commit()}
      />
      <p className="mt-1.5 text-[11.5px] leading-snug text-subtle-foreground">Per year. Monthly stipends count ×12.</p>
    </div>
  );
}

export function OfficialToggle({ props }: { props: FilterPanelProps }): React.JSX.Element {
  const id = `${props.idPrefix ?? "f"}-official`;
  return (
    <div className="rounded-xl border border-border bg-surface p-3">
      <label htmlFor={id} className="flex items-center gap-2 text-[13px] font-semibold">
        <ShieldCheck className="size-4 shrink-0 text-brand-text" />
        Official career sites only
      </label>
      <div className="mt-1.5 flex items-center gap-3 pl-6">
        <p className="min-w-0 flex-1 text-xs leading-snug text-muted-foreground">Hide job-board listings</p>
        <Switch
          id={id}
          checked={Boolean(props.query.official)}
          onChange={(e) => props.setQuery({ official: e.currentTarget.checked ? true : null })}
          data-testid="official-switch"
        />
      </div>
    </div>
  );
}

/* ───────────────────────── Panel ───────────────────────── */

export function FilterPanel(props: FilterPanelProps): React.JSX.Element {
  const { query, facets, setQuery } = props;
  const prefix = props.idPrefix ?? "f";
  const len = (k: keyof SearchQuery): number => {
    const v = query[k];
    return Array.isArray(v) ? v.length : 0;
  };
  return (
    <div className="grid" data-testid="filter-panel">
      <OfficialToggle props={props} />
      <div className="mt-2">
        <Section title="Job type" defaultOpen active={len("type")}>
          <EnumChecklist facetKey="type" values={JOB_TYPES} labels={LABELS.jobType} props={props} />
        </Section>
        <Section title="Experience level" defaultOpen active={len("level")}>
          <EnumChecklist facetKey="level" values={EXPERIENCE_LEVELS} labels={LABELS.level} props={props} />
        </Section>
        <Section title="Your experience" defaultOpen active={query.exp !== undefined ? 1 : 0}>
          <div className="flex flex-wrap gap-1.5 px-1" role="group" aria-label="Your years of experience">
            {EXP_OPTIONS.map((o) => (
              <Chip
                key={o.value}
                label={`${o.label} ${o.value === 1 ? "yr" : "yrs"}`}
                active={query.exp === o.value}
                onClick={() => setQuery({ exp: query.exp === o.value ? null : o.value })}
              />
            ))}
          </div>
          <p className="mt-2 px-1 text-[11.5px] leading-snug text-subtle-foreground">Shows roles whose experience range includes yours.</p>
        </Section>
        <Section title="Batch" defaultOpen active={len("batch")}>
          <div className="flex flex-wrap gap-1.5 px-1" role="group" aria-label="Graduation batch">
            {BATCHES.map((b) => (
              <Chip
                key={b}
                label={String(b)}
                count={countOf(facets?.batch, String(b))}
                active={query.batch?.includes(b) ?? false}
                onClick={() => setQuery({ batch: toggleValue(query.batch, b) })}
              />
            ))}
          </div>
        </Section>
        <Section title="Work mode" defaultOpen active={len("mode")}>
          <EnumChecklist facetKey="mode" values={WORK_MODES} labels={LABELS.workMode} props={props} />
        </Section>
        <Section title="Location" defaultOpen active={len("location")}>
          <SearchableChecklist facetKey="location" placeholder="Search cities" props={props} />
        </Section>
        <Section title="Company" active={len("company")}>
          <SearchableChecklist facetKey="company" placeholder="Search companies" props={props} withLogos />
        </Section>
        <Section title="Company type" active={len("ctype")}>
          <div className="flex flex-wrap gap-1.5 px-1" role="group" aria-label="Company type">
            {(facets?.ctype ?? []).slice(0, 12).map((b) => (
              <Chip
                key={b.value}
                label={companyTagLabel(b.value)}
                count={b.count}
                active={query.ctype?.includes(b.value) ?? false}
                onClick={() => setQuery({ ctype: toggleValue(query.ctype, b.value) })}
              />
            ))}
          </div>
        </Section>
        <Section title="Category" active={len("category")}>
          <SearchableChecklist facetKey="category" placeholder="Search categories" props={props} initial={7} />
        </Section>
        <Section title="Minimum salary / stipend" active={query.salaryMin ? 1 : 0}>
          <SalarySlider props={props} />
        </Section>
        <Section title="Posted within" active={query.posted !== "any" ? 1 : 0}>
          <div role="radiogroup" aria-label="Posted within" className="grid">
            {[...POSTED_WITHIN].reverse().map((p) => {
              const id = `${prefix}-posted-${p}`;
              return (
                <label
                  key={p}
                  htmlFor={id}
                  className="flex items-center gap-2.5 rounded-lg px-1 py-[5px] text-[13px] transition-colors hover:bg-muted/70"
                >
                  <input
                    id={id}
                    type="radio"
                    name={`${prefix}-posted`}
                    checked={query.posted === p}
                    onChange={() => setQuery({ posted: p === "any" ? null : p })}
                    className="size-4 accent-[var(--brand)]"
                  />
                  {LABELS.posted[p]}
                </label>
              );
            })}
          </div>
        </Section>
        <Section title="Source" active={len("source")}>
          <SearchableChecklist facetKey="source" placeholder="Search sources" props={props} />
        </Section>
        <Section title="Tags" active={len("tag")}>
          <div className="flex flex-wrap gap-1.5 px-1" role="group" aria-label="Tags">
            {FILTER_TAGS.map((t) => (
              <Chip
                key={t}
                label={tagLabel(t)}
                count={countOf(facets?.tag, t)}
                active={query.tag?.includes(t) ?? false}
                onClick={() => setQuery({ tag: toggleValue(query.tag, t) })}
              />
            ))}
          </div>
        </Section>
      </div>
    </div>
  );
}
