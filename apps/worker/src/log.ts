import type { LogMeta, Logger } from "@easyjobs/contract/node";

type Level = "debug" | "info" | "warn" | "error";
const ORDER: Record<Level, number> = { debug: 0, info: 1, warn: 2, error: 3 };

/** Wraps a logger and drops lines below `min` (used by `list`, whose stdout is a report). */
export function filterLogger(base: Logger, min: Level): Logger {
  const ok = (l: Level): boolean => ORDER[l] >= ORDER[min];
  return {
    debug: (m: string, x?: LogMeta) => ok("debug") && base.debug(m, x),
    info: (m: string, x?: LogMeta) => ok("info") && base.info(m, x),
    warn: (m: string, x?: LogMeta) => ok("warn") && base.warn(m, x),
    error: (m: string, x?: LogMeta) => ok("error") && base.error(m, x),
    child: (scope: string) => filterLogger(base.child(scope), min),
  };
}

/** A logger that discards everything (tests, embedding). */
export const silentLogger: Logger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
  child: () => silentLogger,
};
