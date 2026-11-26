"use client";

import type { ExternalToast } from "sonner";

/**
 * Lazy toast API: sonner is loaded on first use instead of shipping in every page's initial JS.
 * The <Toaster/> (also lazy, mounted right after hydration) shares the same module instance.
 */
let sonner: Promise<typeof import("sonner")> | undefined;
const load = (): Promise<typeof import("sonner")> => (sonner ??= import("sonner"));

export const notify = {
  message(title: string, options?: ExternalToast): void {
    void load().then((m) => m.toast(title, options));
  },
  success(title: string, options?: ExternalToast): void {
    void load().then((m) => m.toast.success(title, options));
  },
  error(title: string, options?: ExternalToast): void {
    void load().then((m) => m.toast.error(title, options));
  },
};
