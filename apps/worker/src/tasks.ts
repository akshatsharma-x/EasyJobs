import type { AtsType, CompanyTarget } from "@easyjobs/contract";
import type { Env, Scraper } from "@easyjobs/contract/node";
import type { WorkerConfig, Priority } from "./config";
import type { DiscoveredScraper } from "./discovery/scrapers";
import type { RegistryHandle } from "./discovery/registry";
import { errorMessage } from "./util";

export interface TaskDef {
  /** "<scraperId>" or "<scraperId>:<targetSlug>" */
  id: string;
  scraperId: string;
  scraper: Scraper;
  packageName: string;
  target: CompanyTarget | null;
  /** Registry priority for ATS tasks; null for feed scrapers. */
  priority: Priority | null;
  intervalMs: number;
  enabled: boolean;
  disabledReason: string | null;
}

export interface TaskPlan {
  tasks: TaskDef[];
  notes: string[];
  demoScheduled: boolean;
}

export const taskId = (scraperId: string, targetSlug?: string | null): string => (targetSlug ? `${scraperId}:${targetSlug}` : scraperId);

/** `WORKER_DISABLED_SOURCES=workday,themuse` — operator kill switch for any scraper id (W1). */
export function disabledSources(env: Env): Set<string> {
  return new Set(
    String(env.WORKER_DISABLED_SOURCES ?? "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
}

/** Evaluates WORKER_DISABLED_SOURCES, then scraper.isEnabled(env); a throwing isEnabled counts as disabled. */
export function checkEnabled(scraper: Scraper, env: Env): { enabled: boolean; reason: string | null } {
  if (disabledSources(env).has(scraper.id.toLowerCase())) return { enabled: false, reason: "listed in WORKER_DISABLED_SOURCES" };
  if (typeof scraper.isEnabled !== "function") return { enabled: true, reason: null };
  try {
    return scraper.isEnabled(env) === false ? { enabled: false, reason: "isEnabled(env) returned false" } : { enabled: true, reason: null };
  } catch (e) {
    return { enabled: false, reason: `isEnabled(env) threw: ${errorMessage(e)}` };
  }
}

/** Registry targets a given ATS scraper can handle (`custom` portals are never fed by the worker, §0.6). */
export function targetsFor(ds: DiscoveredScraper, registry: RegistryHandle): CompanyTarget[] {
  const ats = ds.handlesAts;
  if (!ats) return [];
  return registry.companies.filter((t) => t.ats !== "custom" && ats.includes(t.ats));
}

export function intervalForPriority(config: Pick<WorkerConfig, "priorityIntervalsMs">, priority: Priority): number {
  return config.priorityIntervalsMs[priority];
}

/** Whether the internal demo scraper is put on the schedule (it is always runnable with `once --source demo`). */
export function shouldScheduleDemo(mode: WorkerConfig["demo"], realScrapers: number): boolean {
  return mode === "on" || (mode === "auto" && realScrapers === 0);
}

/**
 * Builds the task list:
 * - scrapers without handlesAts → one task each, every intervalMinutes (floored at WORKER_MIN_INTERVAL_MINUTES)
 * - ATS scrapers → one task per (scraper, registry target), cadence by target.priority.
 *   If two scrapers claim the same ATS, the first discovered one owns it (no double-scraping a board).
 */
export function buildTasks(input: {
  scrapers: DiscoveredScraper[];
  demo: DiscoveredScraper;
  registry: RegistryHandle;
  config: Pick<WorkerConfig, "priorityIntervalsMs" | "minIntervalMs" | "demo">;
  env: Env;
}): TaskPlan {
  const notes: string[] = [];
  const demoScheduled = shouldScheduleDemo(input.config.demo, input.scrapers.length);
  const list = demoScheduled ? [...input.scrapers, input.demo] : [...input.scrapers];
  const owners = new Map<AtsType, string>();
  for (const ds of list) {
    for (const ats of ds.handlesAts ?? []) {
      const owner = owners.get(ats);
      if (!owner) owners.set(ats, ds.scraper.id);
      else notes.push(`ATS "${ats}" is claimed by both ${owner} and ${ds.scraper.id}; ${owner} owns its targets`);
    }
  }
  const tasks: TaskDef[] = [];
  for (const ds of list) {
    const { scraper } = ds;
    const { enabled, reason } = checkEnabled(scraper, input.env);
    const base = { scraperId: scraper.id, scraper, packageName: ds.packageName, enabled, disabledReason: reason };
    if (ds.handlesAts) {
      if (ds.handlesAts.includes("custom")) notes.push(`${scraper.id}: "custom" targets are not fed by the worker (§0.6)`);
      const targets = targetsFor(ds, input.registry).filter((t) => owners.get(t.ats) === scraper.id);
      if (targets.length === 0) notes.push(`${scraper.id}: no registry targets for ${ds.handlesAts.join(", ")}`);
      for (const target of targets) {
        tasks.push({ ...base, id: taskId(scraper.id, target.slug), target, priority: target.priority, intervalMs: intervalForPriority(input.config, target.priority) });
      }
    } else {
      tasks.push({ ...base, id: taskId(scraper.id), target: null, priority: null, intervalMs: Math.max(input.config.minIntervalMs, scraper.intervalMinutes * 60_000) });
    }
  }
  tasks.sort((a, b) => a.id.localeCompare(b.id));
  return { tasks, notes, demoScheduled };
}
