import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Env } from "@easyjobs/contract/node";
import { PACKAGE_CACHE_DIR } from "./cache";
import { envStr } from "./env";

/**
 * What we learned about a job page last time. Sitemap-driven sources have no list data, so
 * this is what lets them emit a light record for a *known* job without refetching its page
 * (keeping the job "seen" for the sweep) — the page-crawl equivalent of a list API.
 */
export interface PageIndexEntry {
  /** title */
  t?: string;
  /** locations */
  l?: string[];
  /** postedAt */
  p?: string | null;
  /** validThrough */
  v?: string | null;
  /** fetched at (epoch ms) */
  at: number;
  /** sitemap lastmod when fetched */
  lm?: string | null;
  /** not a job page (no JobPosting) — re-checked after NOT_JOB_TTL */
  nj?: true;
}

export const NOT_JOB_TTL_MS = 7 * 86_400_000;

export class PageIndex {
  private readonly entries = new Map<string, PageIndexEntry>();
  private dirty = false;

  constructor(readonly file: string | null) {
    if (!file) return;
    try {
      const raw = JSON.parse(readFileSync(file, "utf8")) as Record<string, PageIndexEntry>;
      for (const [k, v] of Object.entries(raw)) if (v && typeof v === "object" && typeof v.at === "number") this.entries.set(k, v);
    } catch {
      /* first run or unreadable — start empty */
    }
  }

  /** `<ATS_ENTERPRISE_STATE_DIR | package/.cache/state>/<scraper>-<target>.json`; ATS_ENTERPRISE_STATE_DIR=off disables persistence. */
  static forTarget(env: Env, scraperId: string, targetSlug: string): PageIndex {
    const dir = envStr(env, "ATS_ENTERPRISE_STATE_DIR") ?? join(PACKAGE_CACHE_DIR, "state");
    if (dir === "off") return new PageIndex(null);
    return new PageIndex(join(dir, `${scraperId}-${targetSlug.replace(/[^a-z0-9-]/gi, "_")}.json`));
  }

  get size(): number {
    return this.entries.size;
  }

  get(key: string): PageIndexEntry | undefined {
    return this.entries.get(key);
  }

  set(key: string, entry: PageIndexEntry): void {
    this.entries.set(key, entry);
    this.dirty = true;
  }

  /** Forget pages no longer listed anywhere (keeps the file bounded). */
  retainOnly(keys: ReadonlySet<string>): void {
    for (const k of [...this.entries.keys()]) {
      if (!keys.has(k)) {
        this.entries.delete(k);
        this.dirty = true;
      }
    }
  }

  save(): void {
    if (!this.file || !this.dirty) return;
    try {
      mkdirSync(dirname(this.file), { recursive: true });
      const tmp = `${this.file}.tmp`;
      writeFileSync(tmp, JSON.stringify(Object.fromEntries(this.entries)));
      renameSync(tmp, this.file);
      this.dirty = false;
    } catch {
      /* best-effort */
    }
  }
}
