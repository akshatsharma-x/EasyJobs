import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { ATS_TYPES, SOURCE_KINDS, type AtsType } from "@easyjobs/contract";
import type { Logger, Scraper } from "@easyjobs/contract/node";
import { DEMO_SCRAPER_ID, demoScraper } from "../demo-scraper";
import { isObject, isOneOf } from "../util";
import { safeImport, treeVersion } from "./safe-import";

export const SCRAPER_ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const INTERNAL_PACKAGE = "(internal)";

export interface DiscoveredScraper {
  scraper: Scraper;
  /** Effective ATS list (unknown values dropped); null for non-ATS scrapers. */
  handlesAts: AtsType[] | null;
  packageName: string;
  packageDir: string | null;
  internal: boolean;
}

export type PackageStatus = "loaded" | "broken" | "no-entry";

export interface PackageReport {
  dir: string;
  name: string;
  status: PackageStatus;
  scraperIds: string[];
  problems: string[];
  version: string;
}

export interface ScraperDiscovery {
  scrapers: DiscoveredScraper[];
  demo: DiscoveredScraper;
  packages: PackageReport[];
  warnings: string[];
}

export interface ScraperCacheEntry {
  version: string;
  report: PackageReport;
  scrapers: DiscoveredScraper[];
}
export type ScraperCache = Map<string, ScraperCacheEntry>;

export const demoDiscovered: DiscoveredScraper = {
  scraper: demoScraper,
  handlesAts: null,
  packageName: INTERNAL_PACKAGE,
  packageDir: null,
  internal: true,
};

export interface ScraperValidation {
  scraper: Scraper | null;
  handlesAts: AtsType[] | null;
  problems: string[];
  notes: string[];
}

/** Runtime shape check for a value claiming to be a contract `Scraper`. The object itself is kept (class instances work). */
export function validateScraper(value: unknown): ScraperValidation {
  const problems: string[] = [];
  const notes: string[] = [];
  if (!isObject(value)) return { scraper: null, handlesAts: null, problems: ["not an object"], notes };
  const v = value;
  if (typeof v.id !== "string" || !SCRAPER_ID_RE.test(v.id)) problems.push(`id must be a kebab-case string (got ${JSON.stringify(v.id)})`);
  if (typeof v.name !== "string" || !v.name.trim()) problems.push("name must be a non-empty string");
  if (!isOneOf(v.kind, SOURCE_KINDS)) problems.push(`kind must be one of ${SOURCE_KINDS.join("|")} (got ${JSON.stringify(v.kind)})`);
  if (typeof v.intervalMinutes !== "number" || !Number.isFinite(v.intervalMinutes) || v.intervalMinutes <= 0) {
    problems.push("intervalMinutes must be a positive number");
  }
  if (typeof v.scrape !== "function") problems.push("scrape must be a function");
  if (v.isEnabled !== undefined && typeof v.isEnabled !== "function") problems.push("isEnabled must be a function when present");
  if (v.attribution !== undefined && typeof v.attribution !== "string") problems.push("attribution must be a string when present");
  let handlesAts: AtsType[] | null = null;
  if (v.handlesAts !== undefined && v.handlesAts !== null) {
    if (!Array.isArray(v.handlesAts)) problems.push("handlesAts must be an array when present");
    else {
      const known = v.handlesAts.filter((a): a is AtsType => isOneOf(a, ATS_TYPES));
      const unknown = v.handlesAts.filter((a) => !isOneOf(a, ATS_TYPES));
      if (unknown.length > 0) notes.push(`ignoring unknown handlesAts values: ${unknown.map(String).join(", ")}`);
      if (v.handlesAts.length > 0 && known.length === 0) problems.push("handlesAts lists no known ATS types");
      handlesAts = known.length > 0 ? [...new Set(known)] : null;
    }
  }
  if (problems.length > 0) return { scraper: null, handlesAts: null, problems, notes };
  return { scraper: value as unknown as Scraper, handlesAts, problems, notes };
}

/** Accepts `export const scrapers = [...]`, `export default [...]`, CJS-style `default.scrapers`, or a single Scraper export. */
export function extractScraperList(mod: Record<string, unknown>): unknown[] | null {
  const def = mod.default;
  const candidates: unknown[] = [mod.scrapers, def, isObject(def) ? def.scrapers : undefined, isObject(def) ? def.default : undefined];
  for (const c of candidates) if (Array.isArray(c)) return c;
  for (const c of [mod.scraper, def]) if (isObject(c) && typeof c.scrape === "function") return [c];
  return null;
}

function readPackageName(dir: string): string | null {
  try {
    const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8")) as { name?: unknown };
    return typeof pkg.name === "string" && pkg.name ? pkg.name : null;
  } catch {
    return null;
  }
}

async function loadPackage(dir: string, entry: string, name: string, version: string, opts: DiscoverScrapersOptions): Promise<ScraperCacheEntry> {
  const report: PackageReport = { dir, name, status: "broken", scraperIds: [], problems: [], version };
  const scrapers: DiscoveredScraper[] = [];
  const res = await safeImport(entry, { timeoutMs: opts.importTimeoutMs, version });
  if (!res.ok) {
    report.problems.push(`import failed: ${res.error}`);
    opts.log.warn(`scraper package ${name} skipped: import failed`, { error: res.error });
    return { version, report, scrapers };
  }
  const list = extractScraperList(res.module);
  if (!list) {
    report.problems.push("module exports neither `scrapers` nor a default Scraper[] (see prompts.md §0.9)");
    opts.log.warn(`scraper package ${name} skipped: no scrapers export`, { exports: Object.keys(res.module) });
    return { version, report, scrapers };
  }
  const ids = new Set<string>();
  list.forEach((item, i) => {
    const v = validateScraper(item);
    const label = isObject(item) && typeof item.id === "string" ? `scrapers[${i}] "${item.id}"` : `scrapers[${i}]`;
    for (const note of v.notes) report.problems.push(`${label}: ${note}`);
    if (!v.scraper) {
      report.problems.push(`${label} invalid: ${v.problems.join("; ")}`);
      return;
    }
    if (ids.has(v.scraper.id)) {
      report.problems.push(`${label}: duplicate id within package — skipped`);
      return;
    }
    ids.add(v.scraper.id);
    scrapers.push({ scraper: v.scraper, handlesAts: v.handlesAts, packageName: name, packageDir: dir, internal: false });
  });
  report.scraperIds = scrapers.map((s) => s.scraper.id);
  report.status = scrapers.length > 0 ? "loaded" : "broken";
  if (report.status === "broken") opts.log.warn(`scraper package ${name} skipped: no valid scrapers`, { problems: report.problems });
  else if (report.problems.length > 0) opts.log.warn(`scraper package ${name}: some exports were skipped`, { problems: report.problems });
  else opts.log.info(`loaded scraper package ${name}: ${report.scraperIds.join(", ")}`);
  return { version, report, scrapers };
}

export interface DiscoverScrapersOptions {
  /** <repo>/packages/scrapers */
  scrapersDir: string;
  importTimeoutMs: number;
  log: Logger;
  /** Re-scan cache: unchanged packages are not re-imported. */
  cache?: ScraperCache;
}

/** Scans <scrapersDir>/<pkg>/src/index.ts. Broken packages are reported, never thrown. */
export async function discoverScrapers(opts: DiscoverScrapersOptions): Promise<ScraperDiscovery> {
  const packages: PackageReport[] = [];
  const scrapers: DiscoveredScraper[] = [];
  const warnings: string[] = [];
  const owners = new Map<string, string>([[DEMO_SCRAPER_ID, INTERNAL_PACKAGE]]);
  let dirs: string[] = [];
  try {
    dirs = readdirSync(opts.scrapersDir, { withFileTypes: true })
      .filter((d) => d.isDirectory() && !d.name.startsWith(".") && d.name !== "node_modules")
      .map((d) => d.name)
      .sort();
  } catch {
    dirs = [];
  }
  for (const dirName of dirs) {
    const dir = join(opts.scrapersDir, dirName);
    const entry = join(dir, "src", "index.ts");
    const name = readPackageName(dir) ?? dirName;
    if (!existsSync(entry)) {
      packages.push({ dir, name, status: "no-entry", scraperIds: [], problems: ["src/index.ts not found (package not ready yet?)"], version: "" });
      continue;
    }
    const version = treeVersion([join(dir, "src"), join(dir, "package.json")]);
    let cached = opts.cache?.get(dir);
    if (!cached || cached.version !== version) {
      cached = await loadPackage(dir, entry, name, version, opts);
      opts.cache?.set(dir, cached);
    }
    packages.push(cached.report);
    for (const d of cached.scrapers) {
      const owner = owners.get(d.scraper.id);
      if (owner) {
        warnings.push(`duplicate scraper id "${d.scraper.id}" in ${name} (already provided by ${owner}) — skipped`);
        continue;
      }
      owners.set(d.scraper.id, name);
      scrapers.push(d);
    }
  }
  for (const p of packages) {
    if (p.status === "broken") warnings.push(`${p.name}: ${p.problems.join("; ")}`);
    else if (p.status === "loaded" && p.problems.length > 0) warnings.push(`${p.name}: ${p.problems.join("; ")}`);
  }
  return { scrapers, demo: demoDiscovered, packages, warnings };
}
