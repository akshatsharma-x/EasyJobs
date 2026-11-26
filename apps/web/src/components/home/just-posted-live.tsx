"use client";

import { useEffect, useLayoutEffect, useState } from "react";
import { AnimatePresence, m, useReducedMotion } from "motion/react";
import type { JobListItem } from "@easyjobs/contract";
import { MotionProvider } from "@/components/motion-provider";
import { api } from "@/lib/api";
import { JUST_POSTED_MAX, JustPostedRow } from "./just-posted-row";

/** Live list: new jobs from the stream slide in on top while the rest glide down (motion layout animation). */
export default function JustPostedLive({ initial, onReady }: { initial: JobListItem[]; onReady: () => void }): React.JSX.Element {
  const [jobs, setJobs] = useState(initial.slice(0, JUST_POSTED_MAX));
  const reduce = useReducedMotion();
  useLayoutEffect(() => onReady(), [onReady]);
  useEffect(
    () =>
      api.subscribe({}, (e) => {
        if (e.type !== "job") return;
        setJobs((list) => (list.some((j) => j.id === e.job.id) ? list : [e.job, ...list].slice(0, JUST_POSTED_MAX)));
      }),
    [],
  );
  return (
    <MotionProvider>
      <ul className="divide-y divide-border" aria-live="polite">
        <AnimatePresence initial={false}>
          {jobs.map((job) => (
            <m.li
              key={job.id}
              layout={!reduce}
              initial={reduce ? false : { opacity: 0, y: -16, backgroundColor: "var(--live-soft)" }}
              animate={{ opacity: 1, y: 0, backgroundColor: "rgba(0,0,0,0)" }}
              exit={{ opacity: 0 }}
              transition={{ type: "spring", stiffness: 380, damping: 34, backgroundColor: { duration: 2.4 } }}
            >
              <JustPostedRow job={job} />
            </m.li>
          ))}
        </AnimatePresence>
      </ul>
    </MotionProvider>
  );
}
