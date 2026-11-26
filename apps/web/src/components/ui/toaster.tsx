"use client";

import { Toaster as Sonner } from "sonner";
import { useTheme } from "next-themes";

export function Toaster(): React.JSX.Element {
  const { resolvedTheme } = useTheme();
  return (
    <Sonner
      theme={resolvedTheme === "dark" ? "dark" : "light"}
      position="bottom-center"
      offset={20}
      gap={8}
      toastOptions={{
        classNames: {
          toast:
            "!rounded-xl !border !border-border !bg-popover !text-foreground !shadow-lg !font-sans !text-[13px] !py-3",
          description: "!text-muted-foreground",
          actionButton: "!bg-brand !text-brand-foreground !rounded-md !font-medium",
          cancelButton: "!bg-muted !text-foreground !rounded-md",
        },
      }}
    />
  );
}
