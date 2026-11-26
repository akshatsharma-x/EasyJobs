/** Tiny defensive readers for third-party JSON whose shape is undocumented and may change. */

export type Json = Record<string, unknown>;

export function asRecord(v: unknown): Json | null {
  return v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Json) : null;
}

export function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

/** String or finite number → trimmed string; else null. */
export function str(v: unknown): string | null {
  if (typeof v === "string") {
    const t = v.trim();
    return t.length > 0 ? t : null;
  }
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return null;
}

/** Number or numeric string → number; else null. */
export function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  return null;
}

export function bool(v: unknown): boolean {
  return v === true || v === 1 || v === "1" || v === "true" || v === "Y" || v === "y";
}

/** ["a", {label: "b"}, "c,d"] or "a,b" → ["a", "b", "c", "d"] */
export function labels(v: unknown): string[] {
  const out: string[] = [];
  const push = (s: string | null): void => {
    if (!s) return;
    for (const part of s.split(",")) {
      const t = part.trim();
      if (t) out.push(t);
    }
  };
  if (typeof v === "string") push(v);
  for (const item of asArray(v)) {
    if (typeof item === "string") push(item);
    else push(str(asRecord(item)?.label) ?? str(asRecord(item)?.name));
  }
  return out;
}
