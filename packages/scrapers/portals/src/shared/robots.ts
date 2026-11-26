import { isPathAllowed, parseRobots, type RobotsRules } from "@easyjobs/contract/node";
import { detectBlock, type BlockSignal, type ResponseLike } from "./block";

export type RobotsVerdict =
  | { verdict: "allowed"; status: number; rules: RobotsRules }
  | { verdict: "disallowed"; status: number; rules: RobotsRules; path: string; rule: string | null }
  | { verdict: "denied"; status: number | null; signal: BlockSignal }
  | { verdict: "unreachable"; status: number | null; detail: string };

const NO_RULES: RobotsRules = { allow: [], disallow: [] };

/**
 * Stricter than the contract client's built-in check (which treats any robots.txt failure as allow-all):
 * - 2xx → parse with the contract's parseRobots/isPathAllowed and test every path we intend to fetch
 * - a block page (403/429/999, edge "Access Denied", CAPTCHA) → "denied" → caller backs off
 * - other 4xx → no robots.txt → allowed (RFC 9309 §2.3.1.3)
 * - 5xx / network error → "unreachable" → caller must assume complete disallow (RFC 9309 §2.3.1.4)
 */
export function judgeRobots(res: ResponseLike | null, userAgent: string, paths: readonly string[], failure?: string): RobotsVerdict {
  if (!res) return { verdict: "unreachable", status: null, detail: failure ?? "network error" };
  const signal = detectBlock(res);
  if (signal) return { verdict: "denied", status: res.status, signal };
  if (res.status >= 200 && res.status < 300) {
    const rules = parseRobots(res.body, userAgent);
    for (const path of paths) {
      if (!isPathAllowed(rules, path)) return { verdict: "disallowed", status: res.status, rules, path, rule: matchingDisallowRule(rules, path) };
    }
    return { verdict: "allowed", status: res.status, rules };
  }
  if (res.status >= 400 && res.status < 500) return { verdict: "allowed", status: res.status, rules: NO_RULES };
  return { verdict: "unreachable", status: res.status, detail: `HTTP ${res.status}` };
}

/** The longest Disallow rule that matches `path` (for log lines), using the contract's matcher. */
export function matchingDisallowRule(rules: RobotsRules, path: string): string | null {
  let best: string | null = null;
  for (const rule of rules.disallow) {
    if (!isPathAllowed({ allow: [], disallow: [rule] }, path) && (best === null || rule.length > best.length)) best = rule;
  }
  return best;
}

/** "/jobs-guest/jobs/api/…?keywords=…" — what robots rules are matched against. */
export function robotsPath(url: string): string {
  const u = new URL(url);
  return u.pathname + u.search;
}
