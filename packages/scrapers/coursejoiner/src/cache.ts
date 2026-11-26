/** Per-site on-disk caches (package .cache/ by default). All are optimizations: deleting them is always safe. */
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { RawJob } from "@easyjobs/contract";
import { openJsonStore, type JsonStore } from "./util/store";
import type { ConditionalEntry } from "./util/conditional";
import type { RedirectEntry } from "./resolve/redirects";
import type { LlmExtraction } from "./llm/extract";
import type { WpPost, WpTerm } from "./wp/types";

/** Bump when parsing changes so cached results are re-parsed (from cached content — no refetch). */
export const PARSER_VERSION = 6;

export interface CachedParse {
  modified: string;
  date: string;
  version: number;
  status: "jobs" | "skipped";
  reason?: string;
  confidence: number;
  jobs: RawJob[];
}

export interface SiteCache {
  /** Post content keyed by post id ("123") — lets parser upgrades re-parse offline. */
  posts: JsonStore<WpPost>;
  /** Parse results keyed by post id. */
  parsed: JsonStore<CachedParse>;
  /** link → post id (HTML strategy, where ids are only known after fetching). */
  links: JsonStore<number>;
  terms: JsonStore<WpTerm>;
  redirects: JsonStore<RedirectEntry>;
  conditional: JsonStore<ConditionalEntry>;
  llm: JsonStore<LlmExtraction>;
  meta: JsonStore<string>;
  flush(): void;
  /** Drop posts/parses published before `cutoff` and stale redirect/LLM entries. */
  prune(cutoff: Date): number;
}

export const DEFAULT_CACHE_ROOT = fileURLToPath(new URL("../.cache/", import.meta.url));

/** WPJOBS_CACHE_DIR=off|none|0 → memory only; otherwise a base directory (default: package .cache/). */
export function resolveCacheRoot(env: Record<string, string | undefined>, explicit?: string | null): string | null {
  if (explicit === null) return null;
  if (explicit) return explicit;
  const v = env.WPJOBS_CACHE_DIR?.trim();
  if (v && /^(?:off|none|0|false|memory)$/i.test(v)) return null;
  return v || DEFAULT_CACHE_ROOT;
}

export function openSiteCache(siteId: string, root: string | null): SiteCache {
  const dir = root ? join(root, siteId) : null;
  const file = (name: string): string | null => (dir ? join(dir, `${name}.json`) : null);
  const stores = {
    posts: openJsonStore<WpPost>(file("posts")),
    parsed: openJsonStore<CachedParse>(file("parsed")),
    links: openJsonStore<number>(file("links")),
    terms: openJsonStore<WpTerm>(file("terms")),
    redirects: openJsonStore<RedirectEntry>(file("redirects")),
    conditional: openJsonStore<ConditionalEntry>(file("http")),
    llm: openJsonStore<LlmExtraction>(file("llm")),
    meta: openJsonStore<string>(file("meta")),
  };
  return {
    ...stores,
    flush() {
      for (const s of Object.values(stores)) s.flush();
    },
    prune(cutoff) {
      let removed = 0;
      const t = cutoff.getTime();
      for (const [k, p] of stores.posts.entries()) if (Date.parse(p.dateGmt) < t) (stores.posts.delete(k), removed++);
      for (const [k, p] of stores.parsed.entries()) if (Date.parse(p.date) < t) (stores.parsed.delete(k), removed++);
      for (const [k, id] of stores.links.entries()) if (!stores.posts.has(String(id))) stores.links.delete(k);
      const stale = Date.now() - 90 * 86_400_000;
      for (const [k, r] of stores.redirects.entries()) if (Date.parse(r.at) < stale) stores.redirects.delete(k);
      for (const [k] of stores.llm.entries()) {
        const id = k.split(":")[0] ?? "";
        if (!stores.posts.has(id)) stores.llm.delete(k);
      }
      return removed;
    },
  };
}
