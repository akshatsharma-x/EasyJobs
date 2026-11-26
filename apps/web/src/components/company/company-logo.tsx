"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { logoSources, monogram, type LogoSubject } from "@/lib/logos";
import { cn } from "@/lib/cn";

const TILE: Record<number, string> = {
  20: "size-5 rounded-[5px]",
  24: "size-6 rounded-md",
  32: "size-8 rounded-lg",
  36: "size-9 rounded-[9px]",
  40: "size-10 rounded-[10px]",
  48: "size-12 rounded-xl",
  64: "size-16 rounded-2xl",
};

export interface CompanyLogoProps {
  company: LogoSubject;
  size?: 20 | 24 | 32 | 36 | 40 | 48 | 64;
  className?: string;
  /** Eager-load above-the-fold logos. */
  priority?: boolean;
  /** Decorative / below-the-fold: don't request the image until the browser is idle after hydration. */
  defer?: boolean;
}

function useIdle(enabled: boolean): boolean {
  const [idle, setIdle] = useState(!enabled);
  useEffect(() => {
    if (!enabled) return;
    const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void };
    if (w.requestIdleCallback) {
      const id = w.requestIdleCallback(() => setIdle(true), { timeout: 1500 });
      return () => w.cancelIdleCallback?.(id);
    }
    const t = setTimeout(() => setIdle(true), 300);
    return () => clearTimeout(t);
  }, [enabled]);
  return idle;
}

/**
 * White rounded-square tile with a hairline border (so low-res favicons still look crisp).
 * Sources: logoUrl → favicon → deterministic monogram. Fixed size → zero CLS.
 */
export function CompanyLogo({ company, size = 40, className, priority = false, defer = false }: CompanyLogoProps): React.JSX.Element {
  const ready = useIdle(defer);
  const sources = useMemo(() => logoSources(company), [company]);
  const [index, setIndex] = useState(0);
  const [natural, setNatural] = useState<number | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const src = sources[index];

  // Errors/loads that fire before hydration are missed by React — check on mount.
  // A 1×1 image is the proxy's "no usable logo" answer → next source / monogram.
  useEffect(() => {
    const img = imgRef.current;
    if (!img || !img.complete) return;
    if (img.naturalWidth <= 1) setIndex((i) => i + 1);
    else setNatural(img.naturalWidth);
  }, [src]);

  const tile = cn(
    "relative grid shrink-0 place-items-center overflow-hidden border border-black/[0.08] bg-white dark:border-white/10",
    TILE[size],
    className,
  );

  if (src && !ready) return <span aria-hidden="true" className={tile} />;

  if (!src) {
    const m = monogram(company.name);
    return (
      <span
        aria-hidden="true"
        className={tile}
        style={{ background: `hsl(${m.hue} 70% 96%)`, color: `hsl(${m.hue} 60% 26%)` }}
      >
        <span className="font-semibold tracking-tight" style={{ fontSize: Math.round(size * 0.36) }}>
          {m.letters}
        </span>
      </span>
    );
  }

  // Small favicons are drawn at (close to) their natural size so they never look blurry.
  const inner = natural !== null && natural < size ? Math.max(Math.round(size * 0.5), Math.min(natural, Math.round(size * 0.62))) : Math.round(size * 0.68);

  return (
    <span className={tile}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={imgRef}
        key={src}
        src={src}
        alt=""
        width={inner}
        height={inner}
        loading={priority ? "eager" : "lazy"}
        decoding="async"
        draggable={false}
        style={{ width: inner, height: inner }}
        className="object-contain"
        onLoad={(e) => {
          const w = e.currentTarget.naturalWidth;
          if (w <= 1) setIndex((i) => i + 1);
          else setNatural(w);
        }}
        onError={() => {
          setNatural(null);
          setIndex((i) => i + 1);
        }}
      />
    </span>
  );
}
