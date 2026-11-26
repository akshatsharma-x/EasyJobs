"use client";

import { LazyMotion } from "motion/react";
import type { ReactNode } from "react";

// Animation features (incl. layout animations) load after hydration — keeps them off the critical path.
const loadFeatures = () => import("./motion-features").then((m) => m.default);

export function MotionProvider({ children }: { children: ReactNode }): React.JSX.Element {
  return (
    <LazyMotion features={loadFeatures} strict>
      {children}
    </LazyMotion>
  );
}
