"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useSavedStore } from "@/lib/saved-store";

const subscribeNoop = (): (() => void) => () => {};

/** false during SSR and the hydration render, true afterwards. */
export function useHydrated(): boolean {
  return useSyncExternalStore(subscribeNoop, () => true, () => false);
}

/** True once the persisted saved-jobs store has been read from localStorage (rehydrated once in <Providers>). */
export function useSavedHydrated(): boolean {
  const [ready, setReady] = useState(() => useSavedStore.persist?.hasHydrated?.() ?? false);
  useEffect(() => {
    const unsub = useSavedStore.persist.onFinishHydration(() => setReady(true));
    if (useSavedStore.persist.hasHydrated()) setReady(true);
    return unsub;
  }, []);
  return ready;
}

/** Call once at the app root: reads the saved-jobs store from localStorage after hydration (SSR-safe). */
export function useRehydrateSavedStore(): void {
  useEffect(() => {
    if (!useSavedStore.persist.hasHydrated()) void useSavedStore.persist.rehydrate();
  }, []);
}
