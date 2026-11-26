"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";
import { isTypingTarget } from "@/lib/hooks/use-hotkeys";

const CommandPalette = dynamic(() => import("./command-palette").then((m) => m.CommandPalette), { ssr: false });

export const OPEN_PALETTE_EVENT = "easyjobs:open-palette";

export function openCommandPalette(): void {
  window.dispatchEvent(new Event(OPEN_PALETTE_EVENT));
}

/** Global ⌘K / Ctrl+K listener; the cmdk palette itself is loaded on first use. */
export function PaletteHost(): React.JSX.Element | null {
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const show = useCallback(() => {
    setLoaded(true);
    setOpen(true);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setLoaded(true);
        setOpen((o) => !o);
        return;
      }
      // "/" focuses the page's primary search box, or opens the palette where there is none.
      if (e.key === "/" && !e.metaKey && !e.ctrlKey && !e.altKey && !isTypingTarget(e.target)) {
        if (document.querySelector("[role='dialog'][data-state='open']")) return;
        e.preventDefault();
        const input = document.querySelector<HTMLInputElement>("[data-primary-search]");
        if (input && input.offsetParent !== null) {
          input.focus();
          input.select();
        } else {
          setLoaded(true);
          setOpen(true);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_PALETTE_EVENT, show);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_PALETTE_EVENT, show);
    };
  }, [show]);

  if (!loaded) return null;
  return <CommandPalette open={open} onOpenChange={setOpen} />;
}
