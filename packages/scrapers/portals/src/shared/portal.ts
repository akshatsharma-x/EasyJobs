import { DEFAULT_USER_AGENT, RobotsDisallowedError, type Env, type RobotsRules, type ScrapeContext } from "@easyjobs/contract/node";
import { detectBlock, type ResponseLike } from "./block";
import { systemClock, type Clock, type RandomSource } from "./clock";
import { envInt } from "./env";
import { createPacer, MIN_GAP_FLOOR_MS, type Pacer } from "./pacer";
import { judgeRobots, robotsPath } from "./robots";
import type { RequestKind, RunGuard } from "./run-guard";
import type { PortalId, StateStore } from "./state";
import { defaultStateStore } from "./state";
import { errorMessage } from "./text";

/** Injection points for tests; production uses the real clock, Math.random and the .state/ files. */
export interface PortalDeps {
  clock: Clock;
  random: RandomSource;
  stateStore: (portal: PortalId, env: Env) => StateStore;
}

export function resolveDeps(partial: Partial<PortalDeps> = {}): PortalDeps {
  return {
    clock: partial.clock ?? systemClock,
    random: partial.random ?? Math.random,
    stateStore: partial.stateStore ?? defaultStateStore,
  };
}

/** The identity every request carries (prompts.md §0.8.6). */
export function userAgentOf(env: Env): string {
  return env.SCRAPER_USER_AGENT?.trim() || DEFAULT_USER_AGENT;
}

/** 4–6 s between requests by default; PORTALS_MIN_GAP_MS / PORTALS_MAX_GAP_MS may only slow it down. */
export function pacerFromEnv(env: Env, deps: PortalDeps): Pacer {
  const minGapMs = envInt(env, "PORTALS_MIN_GAP_MS", MIN_GAP_FLOOR_MS, MIN_GAP_FLOOR_MS, 600_000);
  const maxGapMs = envInt(env, "PORTALS_MAX_GAP_MS", Math.max(6000, minGapMs), minGapMs, 900_000);
  return createPacer({ minGapMs, maxGapMs, clock: deps.clock, random: deps.random });
}

export type FetchOutcome =
  | { kind: "ok"; status: number; url: string; body: string }
  /** 404/410 — the posting is gone; not an error */
  | { kind: "gone"; status: number }
  /** non-block failure (5xx, timeout); the run may continue */
  | { kind: "error" }
  /** cap reached, blocked, robots-disallowed or too many errors — send nothing more */
  | { kind: "stop" };

/**
 * One paced, capped request through the shared contract HTTP client (robots.txt enforced by the client too).
 * retries: 0 — a 429 must end the run and start an hours-long backoff, not be retried within seconds.
 */
export async function guardedFetch(ctx: ScrapeContext, guard: RunGuard, clock: Clock, url: string, kind: RequestKind, accept: string): Promise<FetchOutcome> {
  if (!(await guard.acquire(kind))) return { kind: "stop" };
  let res: Response | undefined;
  let body = "";
  let failure: unknown;
  try {
    res = await ctx.http.fetch(url, { retries: 0, signal: ctx.signal, headers: { accept } });
    body = await res.text();
  } catch (e) {
    failure = e;
  } finally {
    guard.release();
  }
  if (!res || failure !== undefined) {
    if (ctx.signal.aborted) throw failure ?? ctx.signal.reason;
    if (failure instanceof RobotsDisallowedError) {
      guard.robotsDisallowed(url, `robots.txt disallows ${robotsPath(url)}`);
      return { kind: "stop" };
    }
    guard.noteError(`request failed for ${url}: ${errorMessage(failure)}`);
    return guard.stopped ? { kind: "stop" } : { kind: "error" };
  }
  const finalUrl = res.url || url;
  const signal = detectBlock({ status: res.status, url: finalUrl, body, headers: res.headers }, clock.now());
  if (signal) {
    guard.block(signal, url);
    return { kind: "stop" };
  }
  if (res.status === 404 || res.status === 410) return { kind: "gone", status: res.status };
  if (!res.ok) {
    guard.noteError(`HTTP ${res.status} for ${url}`);
    return guard.stopped ? { kind: "stop" } : { kind: "error" };
  }
  return { kind: "ok", status: res.status, url: finalUrl, body };
}

/** Loads robots.txt through the shared contract client (robots: false — it IS robots.txt; no retries). */
export function httpRobotsLoader(ctx: ScrapeContext, robotsUrl: string): () => Promise<ResponseLike> {
  return async () => {
    const res = await ctx.http.fetch(robotsUrl, { robots: false, retries: 0, signal: ctx.signal, headers: { accept: "text/plain,*/*;q=0.5" } });
    return { status: res.status, url: res.url || robotsUrl, body: await res.text(), headers: res.headers };
  };
}

/**
 * Paced, capped robots.txt check (one request) using judgeRobots. Returns the rules when every path in `paths`
 * is allowed for `userAgent`; otherwise records robots/denied/unavailable on the guard and returns null.
 */
export async function robotsGate(
  ctx: ScrapeContext,
  guard: RunGuard,
  robotsUrl: string,
  userAgent: string,
  paths: readonly string[],
  load: () => Promise<ResponseLike>,
): Promise<RobotsRules | null> {
  if (!(await guard.acquire("robots"))) return null;
  let res: ResponseLike | undefined;
  let failure: unknown;
  try {
    res = await load();
  } catch (e) {
    failure = e;
  } finally {
    guard.release();
  }
  if (failure !== undefined && ctx.signal.aborted) throw failure;
  const verdict = judgeRobots(res ?? null, userAgent, paths, failure !== undefined ? errorMessage(failure) : undefined);
  switch (verdict.verdict) {
    case "allowed":
      return verdict.rules;
    case "disallowed":
      guard.robotsDisallowed(robotsUrl, `rule "Disallow: ${verdict.rule ?? "?"}" matches ${verdict.path} for user-agent "${userAgent}"`);
      return null;
    case "denied":
      guard.block(verdict.signal, robotsUrl);
      return null;
    case "unreachable":
      guard.unavailable(robotsUrl, `robots.txt unreachable (${verdict.detail}); RFC 9309 says assume complete disallow`);
      return null;
  }
}
