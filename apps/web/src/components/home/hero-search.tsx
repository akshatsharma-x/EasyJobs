"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { notify } from "@/lib/notify";
import { DEFAULT_SEARCH_QUERY } from "@easyjobs/contract";
import { SearchBox } from "@/components/jobs/search-box";
import { api } from "@/lib/api";
import { jobsHref } from "@/lib/presets";


export function HeroSearch(): React.JSX.Element {
  const router = useRouter();
  const [what, setWhat] = useState("");
  const [where, setWhere] = useState("");
  const [engaged, setEngaged] = useState(false);
  // Company names for smart detection — fetched once the user starts interacting, not on page load.
  const { data: companies } = useQuery({
    queryKey: ["companies", "index"],
    queryFn: ({ signal }) => api.companies({ pageSize: 100 }, { signal }),
    staleTime: 5 * 60_000,
    enabled: engaged,
  });

  const submit = async (whatText: string, whereText: string): Promise<void> => {
    // The smart-query parser is loaded on first submit (keeps it off the critical path).
    const { normalizeWhere, smartSubmit } = await import("@/lib/smart-submit");
    const list = (companies?.data ?? []).map((c) => ({ slug: c.slug, name: c.name }));
    const { next, tokens } = smartSubmit(DEFAULT_SEARCH_QUERY, whatText, whereText, list);
    router.push(jobsHref(next));
    if (tokens.length > 0) {
      const plain = { ...DEFAULT_SEARCH_QUERY, q: whatText.trim() || undefined, location: normalizeWhere(whereText) ? [normalizeWhere(whereText) as string] : undefined };
      notify.message("Smart filters applied", {
        description: tokens.map((t) => t.label).join(" · "),
        action: { label: "Undo", onClick: () => router.replace(jobsHref(plain)) },
      });
    }
  };

  return (
    <SearchBox
      variant="hero"
      primary
      what={what}
      where={where}
      onWhatChange={(v) => {
        setEngaged(true);
        setWhat(v);
      }}
      onWhereChange={(v) => {
        setEngaged(true);
        setWhere(v);
      }}
      onSubmit={(w, l) => void submit(w, l)}
      onPickCompany={(c) => router.push(jobsHref({ company: [c.slug] }))}
      onPickSkill={(s) => router.push(jobsHref({ skills: [s] }))}
      onPickLocation={(l) => {
        setWhere(l);
      }}
    />
  );
}
