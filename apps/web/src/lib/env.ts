/**
 * Public runtime configuration. NEXT_PUBLIC_* values are inlined at build time,
 * so switching between the mock and the real API needs a restart / rebuild.
 */
const trimSlash = (url: string): string => url.replace(/\/+$/, "");

/** "0" (default since W1, §0.7) → real API at NEXT_PUBLIC_API_URL; "1" → in-memory mock API (offline UI work, e2e). */
export const USE_MOCKS: boolean = (process.env.NEXT_PUBLIC_USE_MOCKS ?? "0").trim() === "1";

/** Public API base URL (browser + server). */
export const API_URL: string = trimSlash(process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000");

/** Canonical site origin, used for metadata, sitemap, JSON-LD and share links. */
export const SITE_URL: string = trimSlash(process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000");

/** Simulated latency for the browser-side mock API (ms). The server-side mock never waits. */
export const MOCK_LATENCY_MS: number = Math.max(0, Number(process.env.NEXT_PUBLIC_MOCK_LATENCY_MS ?? 120) || 0);

export const SITE_NAME = "EasyJobs";
export const SITE_TAGLINE = "Every internship and job. The minute it's posted.";
export const SITE_DESCRIPTION =
  "Real-time internships and jobs in India — straight from 1,000+ official career sites and top job boards. Filter by experience, batch, location, salary and company type.";
