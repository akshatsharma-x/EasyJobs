import { createHash } from "node:crypto";
import { sql, type SQL } from "drizzle-orm";

/** Postgres array literal for a text[] parameter — driver-independent (no reliance on array serialisation). */
export function pgTextArrayLiteral(values: readonly string[]): string {
  return `{${values.map((v) => `"${v.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`).join(",")}}`;
}

export const textArray = (values: readonly string[]): SQL => sql`${pgTextArrayLiteral(values)}::text[]`;
export const intArray = (values: readonly number[]): SQL =>
  sql`${`{${values.map((n) => String(Math.trunc(n))).join(",")}}`}::int[]`;
export const jsonParam = (value: unknown): SQL => sql`${JSON.stringify(value)}::jsonb`;
export const tsParam = (d: Date | string): SQL => sql`${typeof d === "string" ? d : d.toISOString()}::timestamptz`;

/** ISO-8601 UTC string from a timestamptz expression, identical for both drivers. */
export const iso = (expr: SQL): SQL => sql`to_char(${expr} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;

/** Coerce a driver timestamp value (Date or string) to ISO-8601 UTC. */
export function toIso(v: unknown): string {
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "string") {
    const d = new Date(v.includes("T") ? v : v.replace(" ", "T").replace(/([+-]\d\d)$/, "$1:00"));
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  throw new Error(`not a timestamp: ${String(v)}`);
}

const B36 = "0123456789abcdefghijklmnopqrstuvwxyz";

/** Short url-safe id derived from the fingerprint (stable across DB rebuilds): 11 base36 chars ≈ 57 bits. */
export function jobIdFor(fingerprint: string, salt = 0): string {
  const digest = createHash("sha256").update(salt ? `${fingerprint}#${salt}` : fingerprint).digest();
  let n = digest.readBigUInt64BE(0);
  let out = "";
  for (let i = 0; i < 11; i++) {
    out += B36[Number(n % 36n)];
    n /= 36n;
  }
  return out;
}

/** Weak ETag-friendly short hash. */
export function shortHash(input: string): string {
  return createHash("sha1").update(input).digest("base64url").slice(0, 22);
}
