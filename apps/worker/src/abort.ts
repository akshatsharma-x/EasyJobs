/** Abort reasons used on task signals, so the pipeline can tell a shutdown from a timeout. */

export class ShutdownAbort extends Error {
  constructor(message = "worker is shutting down") {
    super(message);
    this.name = "ShutdownAbort";
  }
}

export class TaskTimeout extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TaskTimeout";
  }
}

export type AbortKind = "shutdown" | "timeout";

/** Classifies an aborted signal. Unknown reasons count as "shutdown" (not the source's fault). */
export function abortKind(signal: AbortSignal): AbortKind | null {
  if (!signal.aborted) return null;
  return signal.reason instanceof TaskTimeout ? "timeout" : "shutdown";
}
