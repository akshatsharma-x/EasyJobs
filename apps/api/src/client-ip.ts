import type { Context } from "hono";
import { getConnInfo } from "@hono/node-server/conninfo";

/** Client IP: socket address, or the first X-Forwarded-For hop when TRUST_PROXY=1. */
export function clientIp(c: Context, trustProxy: boolean): string {
  if (trustProxy) {
    const xff = c.req.header("x-forwarded-for");
    if (xff) return xff.split(",")[0]!.trim();
    const real = c.req.header("x-real-ip");
    if (real) return real.trim();
  }
  try {
    return getConnInfo(c).remote.address ?? "unknown";
  } catch {
    return "unknown"; // in-memory requests (tests)
  }
}
