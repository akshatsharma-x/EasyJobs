"use client";

import { useCallback, useSyncExternalStore } from "react";

/** SSR-safe matchMedia hook (returns `fallback` on the server / first render). */
export function useMediaQuery(query: string, fallback = false): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const mql = window.matchMedia(query);
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    },
    [query],
  );
  return useSyncExternalStore(subscribe, () => window.matchMedia(query).matches, () => fallback);
}

/** ≥ 1280px: the search page shows the split preview. */
export const SPLIT_VIEW_QUERY = "(min-width: 1280px)";
