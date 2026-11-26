import type { Env } from "@easyjobs/contract/node";

export * from "./dates";
export * from "./feed";
export * from "./hints";
export * from "./html";
export * from "./http";
export * from "./memo";
export * from "./paginate";
export * from "./raw";
export * from "./site";

/** Page size for list calls: the site default, overridable by BIGTECH_PAGE_SIZE (tests), clamped to [1, max]. */
export function pageSizeFrom(env: Env, fallback: number, max = fallback): number {
  const n = Number(env.BIGTECH_PAGE_SIZE);
  return Number.isInteger(n) && n > 0 ? Math.min(n, max) : fallback;
}

/** Max pages per run: BIGTECH_MAX_PAGES (default `fallback`). */
export function maxPagesFrom(env: Env, fallback = 100): number {
  const n = Number(env.BIGTECH_MAX_PAGES);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}
