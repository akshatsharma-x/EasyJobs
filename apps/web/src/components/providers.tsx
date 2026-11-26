"use client";

import { useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import { useRehydrateSavedStore } from "@/lib/hooks/use-hydrated";
import dynamic from "next/dynamic";

// Loaded right after hydration (toasts are only ever triggered by user actions).
const Toaster = dynamic(() => import("@/components/ui/toaster").then((m) => m.Toaster), { ssr: false });

function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { staleTime: 30_000, gcTime: 5 * 60_000, refetchOnWindowFocus: false, retry: 1 },
    },
  });
}

export function Providers({ children }: { children: ReactNode }): React.JSX.Element {
  const [queryClient] = useState(makeQueryClient);
  useRehydrateSavedStore();
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <NuqsAdapter>
        <QueryClientProvider client={queryClient}>
          {children}
          <Toaster />
        </QueryClientProvider>
      </NuqsAdapter>
    </ThemeProvider>
  );
}
