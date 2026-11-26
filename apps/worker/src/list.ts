import type { Env, Logger } from "@easyjobs/contract/node";
import type { WorkerConfig } from "./config";
import { allScrapers, discoverAll } from "./discovery";
import { StateStore } from "./state";
import { spreadWindowMs } from "./scheduler";
import { buildTasks, checkEnabled, targetsFor } from "./tasks";
import { formatClock, formatDuration, parseTime, truncate } from "./util";

function table(rows: string[][]): string {
  const widths: number[] = [];
  for (const row of rows) row.forEach((cell, i) => (widths[i] = Math.max(widths[i] ?? 0, cell.length)));
  return rows.map((row) => row.map((cell, i) => (i === row.length - 1 ? cell : cell.padEnd(widths[i] ?? 0))).join("  ").trimEnd()).join("\n");
}

/** `worker list`: discovered scrapers, normalizer/registry choice, every task with its last and next run. */
export async function listCommand(cfg: WorkerConfig, log: Logger, env: Env, opts: { json?: boolean } = {}): Promise<string> {
  const d = await discoverAll({ repoRoot: cfg.repoRoot, importTimeoutMs: cfg.importTimeoutMs, log });
  const plan = buildTasks({ ...d, config: cfg, env });
  const store = StateStore.forDir(cfg.stateDir).load();
  const now = Date.now();
  const tasks = plan.tasks.map((t) => {
    const st = store.get(t.id);
    const paused = parseTime(st?.pausedUntil);
    const next = parseTime(st?.nextRunAt);
    const spread = spreadWindowMs(t, cfg.initialSpreadMs);
    const nextText = !t.enabled
      ? "disabled"
      : paused !== null && paused > now
        ? `paused until ${formatClock(paused, now)}`
        : next !== null && next > now
          ? `${formatClock(next, now)} (in ${formatDuration(next - now)})`
          : st?.lastRunAt
            ? "due — spread over the first minutes after start"
            : `on start (within ${formatDuration(spread)})`;
    return { def: t, st, nextText };
  });

  if (opts.json) {
    return JSON.stringify(
      {
        repoRoot: cfg.repoRoot,
        normalizer: { kind: d.normalizer.kind, note: d.normalizer.note },
        registry: { kind: d.registry.kind, note: d.registry.note, companies: d.registry.companies.length },
        packages: d.packages,
        warnings: d.warnings,
        notes: plan.notes,
        scrapers: allScrapers(d).map((s) => ({
          id: s.scraper.id,
          name: s.scraper.name,
          kind: s.scraper.kind,
          package: s.packageName,
          handlesAts: s.handlesAts,
          intervalMinutes: s.scraper.intervalMinutes,
          enabled: checkEnabled(s.scraper, env).enabled,
          targets: s.handlesAts ? targetsFor(s, d.registry).length : null,
        })),
        tasks: tasks.map(({ def, st, nextText }) => ({
          id: def.id,
          source: def.scraperId,
          target: def.target?.slug ?? null,
          priority: def.priority,
          intervalMinutes: def.intervalMs / 60_000,
          enabled: def.enabled,
          lastRunAt: st?.lastRunAt ?? null,
          lastStatus: st?.lastStatus ?? null,
          nextRunAt: st?.nextRunAt ?? null,
          pausedUntil: st?.pausedUntil ?? null,
          next: nextText,
        })),
      },
      null,
      2,
    );
  }

  const out: string[] = [];
  out.push(`EasyJobs worker — ${cfg.repoRoot}`);
  out.push(`  normalizer  ${d.normalizer.kind.padEnd(8)} ${d.normalizer.note}`);
  out.push(`  registry    ${d.registry.kind.padEnd(8)} ${d.registry.note} [${d.registry.companies.length} companies]`);
  out.push(`  api         ${cfg.apiUrl}   state ${store.file ?? "-"}`);
  out.push("");
  out.push(`SCRAPERS (${d.scrapers.length} discovered + internal demo)`);
  const scraperRows = [["ID", "NAME", "KIND", "PACKAGE", "SCHEDULE", "ENABLED", "TASKS"]];
  for (const s of allScrapers(d)) {
    const en = checkEnabled(s.scraper, env);
    const n = plan.tasks.filter((t) => t.scraperId === s.scraper.id).length;
    const schedule = s.handlesAts
      ? `per target (${s.handlesAts.join(",")}: ${targetsFor(s, d.registry).length})`
      : `every ${formatDuration(Math.max(cfg.minIntervalMs, s.scraper.intervalMinutes * 60_000))}`;
    const scheduled = n > 0 ? String(n) : s.internal ? "0 (once only)" : "0";
    scraperRows.push([s.scraper.id, truncate(s.scraper.name, 28), s.scraper.kind, truncate(s.packageName, 34), schedule, en.enabled ? "yes" : `no (${en.reason})`, scheduled]);
  }
  out.push(table(scraperRows));
  const problems = d.packages.filter((p) => p.status !== "loaded" || p.problems.length > 0);
  if (problems.length > 0) {
    out.push("");
    out.push("PACKAGES WITH PROBLEMS");
    for (const p of problems) out.push(`  ${p.status.padEnd(8)} ${p.name}: ${truncate(p.problems.join("; "), 300)}`);
  }
  for (const note of plan.notes) out.push(`  note: ${note}`);
  out.push("");
  out.push(`TASKS (${plan.tasks.length})`);
  const taskRows = [["TASK", "PRIO", "EVERY", "LAST RUN", "STATUS", "NEXT RUN"]];
  for (const { def, st, nextText } of tasks) {
    const last = parseTime(st?.lastRunAt);
    taskRows.push([
      def.id,
      def.priority === null ? "-" : String(def.priority),
      formatDuration(def.intervalMs),
      last !== null ? formatClock(last, now) : "never",
      st?.lastStatus ? `${st.lastStatus}${st.consecutiveFailures ? ` ×${st.consecutiveFailures}` : ""}` : "-",
      nextText,
    ]);
  }
  out.push(table(taskRows));
  return out.join("\n");
}
