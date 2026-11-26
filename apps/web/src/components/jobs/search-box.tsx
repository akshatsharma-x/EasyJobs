"use client";

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Briefcase, Clock, Globe, MapPin, Search, Sparkles } from "lucide-react";
import { CompanyLogo } from "@/components/company/company-logo";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { suggestOptions } from "@/lib/query-keys";
import { useDebouncedValue } from "@/lib/hooks/use-debounced";
import { formatCount } from "@/lib/format";
import { cn } from "@/lib/cn";

/* ───────────────────────── Combobox primitive ───────────────────────── */

export interface ComboOption {
  id: string;
  group: string;
  label: string;
  hint?: string;
  icon?: ReactNode;
  onPick: () => void;
}

interface ComboInputProps {
  value: string;
  onChange: (value: string) => void;
  onEnter: (value: string) => void;
  options: ComboOption[];
  placeholder: string;
  label: string;
  icon: ReactNode;
  size: "hero" | "bar";
  inputClassName?: string;
  className?: string;
  primary?: boolean;
  testId?: string;
  onFocusChange?: (focused: boolean) => void;
  name: string;
}

function ComboInput({
  value,
  onChange,
  onEnter,
  options,
  placeholder,
  label,
  icon,
  size,
  inputClassName,
  className,
  primary,
  testId,
  onFocusChange,
  name,
}: ComboInputProps): React.JSX.Element {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const visible = open && options.length > 0;

  useEffect(() => setActive(-1), [options]);
  useEffect(() => () => clearTimeout(blurTimer.current), []);

  const pick = (option: ComboOption): void => {
    option.onPick();
    setOpen(false);
    setActive(-1);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((i) => (options.length === 0 ? -1 : (i + 1) % options.length));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (options.length === 0 ? -1 : (i - 1 + options.length) % options.length));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const option = visible && active >= 0 ? options[active] : undefined;
      if (option) pick(option);
      else {
        setOpen(false);
        onEnter(value);
      }
    } else if (e.key === "Escape") {
      if (visible) {
        e.preventDefault();
        e.stopPropagation();
        setOpen(false);
      } else e.currentTarget.blur();
    }
  };

  let lastGroup = "";
  return (
    <div className={cn("relative min-w-0", className)}>
      <label className="flex h-full items-center gap-2.5">
        <span className="sr-only">{label}</span>
        <span aria-hidden="true" className="shrink-0 text-subtle-foreground">
          {icon}
        </span>
        <input
          name={name}
          role="combobox"
          aria-expanded={visible}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={visible && active >= 0 ? `${listId}-${active}` : undefined}
          autoComplete="off"
          spellCheck={false}
          enterKeyHint="search"
          type="text"
          value={value}
          placeholder={placeholder}
          data-primary-search={primary ? "" : undefined}
          data-testid={testId}
          onChange={(e) => {
            onChange(e.target.value);
            setOpen(true);
          }}
          onFocus={() => {
            clearTimeout(blurTimer.current);
            setOpen(true);
            onFocusChange?.(true);
          }}
          onBlur={() => {
            blurTimer.current = setTimeout(() => setOpen(false), 120);
            onFocusChange?.(false);
          }}
          onKeyDown={onKeyDown}
          className={cn(
            "h-full w-full min-w-0 bg-transparent text-foreground outline-none placeholder:text-subtle-foreground",
            size === "hero" ? "text-[16px]" : "text-[14.5px]",
            inputClassName,
          )}
        />
      </label>
      {visible && (
        <ul
          id={listId}
          role="listbox"
          aria-label={`${label} suggestions`}
          className="scroll-quiet absolute left-0 right-0 top-[calc(100%+10px)] z-50 max-h-[22rem] min-w-[18rem] overflow-y-auto rounded-xl border border-border bg-popover p-1.5 shadow-lg animate-in fade-in-0 zoom-in-[0.98]"
          onMouseDown={(e) => e.preventDefault()}
        >
          {options.map((o, i) => {
            const header = o.group !== lastGroup ? o.group : null;
            lastGroup = o.group;
            return (
              <li key={o.id} role="presentation">
                {header && (
                  <div role="presentation" className="px-2.5 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wider text-subtle-foreground first:pt-1">
                    {header}
                  </div>
                )}
                <div
                  id={`${listId}-${i}`}
                  role="option"
                  aria-selected={i === active}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => pick(o)}
                  className={cn(
                    "flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors",
                    i === active ? "bg-muted" : "hover:bg-muted/60",
                  )}
                >
                  <span className="grid size-5 shrink-0 place-items-center text-subtle-foreground">{o.icon}</span>
                  <span className="min-w-0 flex-1 truncate">{o.label}</span>
                  {o.hint && <span className="shrink-0 font-mono text-[11.5px] text-subtle-foreground tabular">{o.hint}</span>}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/* ───────────────────────── Search box ───────────────────────── */

const POPULAR_ROLES = ["Software Engineer Intern", "Data Analyst", "Frontend Developer", "Product Manager", "Business Analyst"];
const POPULAR_PLACES = ["Bengaluru", "Hyderabad", "Pune", "Gurugram", "Chennai", "Mumbai", "Noida"];

export interface SearchBoxProps {
  variant: "hero" | "bar";
  what: string;
  where: string;
  onWhatChange: (text: string) => void;
  onWhereChange: (text: string) => void;
  onSubmit: (what: string, where: string) => void;
  onPickCompany: (company: { slug: string; name: string }) => void;
  onPickSkill: (skill: string) => void;
  onPickLocation: (location: string) => void;
  primary?: boolean;
  className?: string;
  trailing?: ReactNode;
}

export function SearchBox({
  variant,
  what,
  where,
  onWhatChange,
  onWhereChange,
  onSubmit,
  onPickCompany,
  onPickSkill,
  onPickLocation,
  primary = false,
  className,
  trailing,
}: SearchBoxProps): React.JSX.Element {
  const [focus, setFocus] = useState<"what" | "where" | null>(null);
  const term = useDebouncedValue(focus === "where" ? where : what, 120);
  const { data: suggest } = useQuery({
    ...suggestOptions(term),
    enabled: focus !== null,
    placeholderData: keepPreviousData,
  });

  const whatOptions = useMemo<ComboOption[]>(() => {
    const options: ComboOption[] = [];
    const text = what.trim();
    if (!suggest) return options;
    for (const c of suggest.companies.slice(0, text ? 4 : 5)) {
      options.push({
        id: `c-${c.slug}`,
        group: "Companies",
        label: c.name,
        hint: `${formatCount(c.openJobs)} open`,
        icon: <CompanyLogo company={{ name: c.name, domain: null, logoUrl: c.logoUrl }} size={20} />,
        onPick: () => onPickCompany(c),
      });
    }
    const titles = text ? suggest.titles.slice(0, 5) : POPULAR_ROLES;
    for (const t of titles)
      options.push({
        id: `t-${t}`,
        group: text ? "Roles" : "Popular searches",
        label: t,
        icon: text ? <Briefcase className="size-4" /> : <Clock className="size-4" />,
        onPick: () => {
          onWhatChange(t);
          onSubmit(t, where);
        },
      });
    if (text)
      for (const s of suggest.skills.slice(0, 3))
        options.push({ id: `s-${s}`, group: "Skills", label: s, icon: <Sparkles className="size-4" />, onPick: () => onPickSkill(s) });
    return options;
  }, [suggest, what, where, onPickCompany, onPickSkill, onSubmit, onWhatChange]);

  const whereOptions = useMemo<ComboOption[]>(() => {
    const text = where.trim().toLowerCase();
    const places = text ? (suggest?.locations ?? []).filter((l) => l.toLowerCase() !== "remote") : POPULAR_PLACES;
    const options: ComboOption[] = [];
    if (!text || "remote".startsWith(text) || "wfh".startsWith(text))
      options.push({ id: "remote", group: "Work mode", label: "Remote", icon: <Globe className="size-4" />, onPick: () => onPickLocation("Remote") });
    for (const p of places.slice(0, 7))
      options.push({ id: `l-${p}`, group: "Cities", label: p, icon: <MapPin className="size-4" />, onPick: () => onPickLocation(p) });
    return options;
  }, [suggest, where, onPickLocation]);

  const hero = variant === "hero";
  return (
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(what, where);
      }}
      className={cn(
        "flex items-center rounded-2xl border border-border bg-background transition-[border-color,box-shadow] duration-200",
        "focus-within:border-brand/60 focus-within:ring-4 focus-within:ring-brand/10",
        hero ? "h-[60px] p-1.5 pl-4 shadow-md" : "h-11 p-1 pl-3.5 shadow-xs",
        className,
      )}
    >
      <ComboInput
        name="what"
        size={variant}
        value={what}
        onChange={onWhatChange}
        onEnter={(v) => onSubmit(v, where)}
        options={focus === "what" ? whatOptions : []}
        placeholder="Role, skill or company"
        label="What"
        icon={<Search className={hero ? "size-[18px]" : "size-4"} />}
        className="h-full flex-[1.4]"
        primary={primary}
        testId="search-what"
        onFocusChange={(f) => setFocus((cur) => (f ? "what" : cur === "what" ? null : cur))}
      />
      <span aria-hidden="true" className={cn("mx-3 h-6 w-px shrink-0 bg-border", hero ? "hidden sm:block" : "hidden md:block")} />
      <ComboInput
        name="where"
        size={variant}
        value={where}
        onChange={onWhereChange}
        onEnter={(v) => onSubmit(what, v)}
        options={focus === "where" ? whereOptions : []}
        placeholder="City or remote"
        label="Where"
        icon={<MapPin className={hero ? "size-[18px]" : "size-4"} />}
        className={cn("h-full flex-1", hero ? "hidden sm:block" : "hidden md:block")}
        testId="search-where"
        onFocusChange={(f) => setFocus((cur) => (f ? "where" : cur === "where" ? null : cur))}
      />
      {primary && !hero && (
        <Kbd className="mr-2 hidden lg:inline-flex" aria-hidden="true">
          /
        </Kbd>
      )}
      {trailing}
      <Button type="submit" size={hero ? "lg" : "md"} className={cn(hero ? "h-12 rounded-xl px-6" : "rounded-[10px]")} data-testid="search-submit">
        <Search className="size-4 sm:hidden" />
        <span className="max-sm:sr-only">Search</span>
      </Button>
    </form>
  );
}
