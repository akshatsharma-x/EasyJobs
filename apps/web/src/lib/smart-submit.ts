import type { SearchQuery } from "@easyjobs/contract";
import { applySmartPatch, canonicalCity, parseSmartQuery, type SmartCompany, type SmartToken } from "@/lib/smart-query";

const titleCase = (s: string): string => s.replace(/\b\p{L}/gu, (c) => c.toUpperCase());

/** "where" box → canonical location filter value ("bangalore" → "Bengaluru", "wfh" → "Remote"). */
export function normalizeWhere(where: string): string | null {
  const w = where.trim();
  if (!w) return null;
  if (/^(remote|wfh|work from home|anywhere)$/i.test(w)) return "Remote";
  return canonicalCity(w) ?? titleCase(w.toLowerCase());
}

export interface SmartSubmitResult {
  next: SearchQuery;
  tokens: SmartToken[];
}

/**
 * Turns free text into filters (smart search) and merges the "where" box.
 * `where === null` leaves the location filter untouched; "" clears it.
 */
export function smartSubmit(base: SearchQuery, what: string, where: string | null, companies: SmartCompany[]): SmartSubmitResult {
  const parsed = parseSmartQuery(what, companies);
  let next = applySmartPatch(base, parsed);
  if (where !== null) {
    const location = normalizeWhere(where);
    next = { ...next, location: location ? [location] : undefined };
    // A city typed in "what" still wins over an empty "where".
    if (!location && parsed.patch.location?.length) next = { ...next, location: parsed.patch.location };
  }
  return { next: { ...next, page: 1 }, tokens: parsed.tokens };
}
