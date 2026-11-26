/**
 * Normalize RawJob JSONL → JobInput JSONL (stdout) and print field distributions (stderr).
 *
 *   pnpm -s --filter @easyjobs/normalize run cli <file.jsonl> [more.jsonl] [options] > normalized.jsonl
 *
 * Options: --now <ISO>  --source-name <name>  --llm  --llm-max <n>  --stats-only  --out <file>  --top <n>  --help
 * Relative paths resolve from the directory you ran pnpm in (INIT_CWD), then the package and repo root.
 * Use "-" to read stdin. Env: packages/normalize/.env and <repo>/.env are loaded if present (the shell wins).
 */
import { createReadStream, createWriteStream, existsSync, readFileSync, type WriteStream } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";
import { validateJobInput, type JobInput, type RawJob } from "@easyjobs/contract";
import { enrichWithLLM, needsEnrichment } from "./llm";
import { normalizeJob } from "./normalize";

interface CliOptions {
  files: string[];
  now?: Date;
  sourceName?: string;
  llm: boolean;
  /** Max API requests per run with --llm; cache hits don't count. */
  llmMax: number;
  statsOnly: boolean;
  out?: string;
  top: number;
}

const DEFAULT_LLM_MAX = 100;

const HELP = `Usage: pnpm -s --filter @easyjobs/normalize run cli <file.jsonl|-> [...] [options]

  --now <ISO>           reference time (deterministic output; default: now)
  --source-name <name>  JobInput.sourceName override
  --llm                 run enrichWithLLM on low-confidence records (needs ANTHROPIC_API_KEY)
  --llm-max <n>         max API requests per run (default env NORMALIZE_LLM_MAX_CALLS or ${DEFAULT_LLM_MAX});
                        cached answers are still applied once the budget is spent
  --stats-only          don't print JobInputs, only the distributions
  --out <file>          write JobInput JSONL to a file instead of stdout
  --top <n>             entries per top-list (default 12)
`;

function parseCount(value: string, name: string): number {
  const n = Number(value.trim());
  if (value.trim() === "" || !Number.isInteger(n) || n < 0) throw new Error(`${name} must be a non-negative integer, got "${value}"`);
  return n;
}

function parseArgs(argv: string[]): CliOptions {
  const envMax = process.env.NORMALIZE_LLM_MAX_CALLS;
  const llmMax = envMax?.trim() ? parseCount(envMax, "NORMALIZE_LLM_MAX_CALLS") : DEFAULT_LLM_MAX;
  const opts: CliOptions = { files: [], llm: false, llmMax, statsOnly: false, top: 12 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i] as string;
    const value = (): string => {
      const v = argv[++i];
      if (v === undefined) throw new Error(`${a} needs a value`);
      return v;
    };
    if (a === "--help" || a === "-h") {
      process.stdout.write(HELP);
      process.exit(0);
    } else if (a === "--now") {
      const d = new Date(value());
      if (!Number.isFinite(d.getTime())) throw new Error("--now must be an ISO date");
      opts.now = d;
    } else if (a === "--source-name") opts.sourceName = value();
    else if (a === "--llm") opts.llm = true;
    else if (a === "--llm-max") opts.llmMax = parseCount(value(), "--llm-max");
    else if (a === "--stats-only") opts.statsOnly = true;
    else if (a === "--out") opts.out = value();
    else if (a === "--top") opts.top = Math.max(1, Number(value()) || 12);
    else if (a === "--") continue;
    else if (a.startsWith("--")) throw new Error(`Unknown option ${a}`);
    else opts.files.push(a);
  }
  if (opts.files.length === 0) throw new Error(`No input file.\n\n${HELP}`);
  return opts;
}

const PKG_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");
const REPO_DIR = join(PKG_DIR, "..", "..");

/**
 * Load packages/normalize/.env, then <repo>/.env (the worker's file), when present. A variable that is already set
 * (including set to "") wins, as with `node --env-file`; the package file wins over the repo file.
 */
function loadEnvFiles(): void {
  for (const file of [join(PKG_DIR, ".env"), join(REPO_DIR, ".env")]) {
    if (!existsSync(file)) continue;
    try {
      const vars = parseEnv(readFileSync(file, "utf8")) as Record<string, string>;
      for (const [key, value] of Object.entries(vars)) if (process.env[key] === undefined) process.env[key] = value;
    } catch (error) {
      process.stderr.write(`warning: ignoring ${file}: ${error instanceof Error ? error.message : String(error)}\n`);
    }
  }
}

function resolveInput(file: string): string {
  if (file === "-" || isAbsolute(file)) return file;
  const bases = [process.env.INIT_CWD, process.cwd(), PKG_DIR, REPO_DIR].filter((b): b is string => !!b);
  for (const base of bases) {
    const p = resolve(base, file);
    if (existsSync(p)) return p;
  }
  throw new Error(`File not found: ${file} (looked in ${bases.join(", ")})`);
}

/* ─────────────────────────── Stats ─────────────────────────── */

class Stats {
  total = 0;
  unparseable = 0;
  invalid = 0;
  private readonly counts = new Map<string, Map<string, number>>();
  private readonly fill = new Map<string, number>();
  private readonly quality: number[] = [];
  private readonly fingerprints = new Map<string, number>();

  private bump(group: string, key: string | number | null | undefined): void {
    const k = key === null || key === undefined || key === "" ? "∅" : String(key);
    let m = this.counts.get(group);
    if (!m) {
      m = new Map();
      this.counts.set(group, m);
    }
    m.set(k, (m.get(k) ?? 0) + 1);
  }

  private filled(field: string, yes: boolean): void {
    if (yes) this.fill.set(field, (this.fill.get(field) ?? 0) + 1);
  }

  add(j: JobInput): void {
    this.total++;
    const meta = (j.extra.normalize ?? {}) as { fingerprintRule?: string; confidence?: { level?: string; category?: string } };
    this.bump("source", j.source);
    this.bump("sourceKind", j.sourceKind);
    this.bump("jobType", j.jobType);
    this.bump("level", j.experienceLevel);
    this.bump("levelConfidence", meta.confidence?.level);
    this.bump("workMode", j.workMode);
    this.bump("category", j.category);
    this.bump("fingerprintRule", meta.fingerprintRule);
    if (j.salary) this.bump("salary", `${j.salary.currency}/${j.salary.period}`);
    for (const l of j.locations) {
      if (l.city) this.bump("city", l.city);
      if (l.country) this.bump("country", l.country);
    }
    if (j.isRemote) this.bump("city", "(remote)");
    for (const s of j.skills) this.bump("skill", s);
    for (const t of j.tags) this.bump("tag", t);
    for (const b of j.batches) this.bump("batch", b);
    for (const d of j.degrees) this.bump("degree", d);
    this.bump("company", j.company);
    this.filled("salary", j.salary !== null);
    this.filled("experience", j.experienceMin !== null || j.experienceMax !== null);
    this.filled("skills", j.skills.length > 0);
    this.filled("batches", j.batches.length > 0);
    this.filled("degrees", j.degrees.length > 0);
    this.filled("locations", j.locations.some((l) => l.city || l.country) || j.isRemote);
    this.filled("workMode", j.workMode !== null);
    this.filled("descriptionHtml", j.descriptionHtml !== null);
    this.filled("summary", j.summary !== null);
    this.filled("department", j.department !== null);
    this.filled("companyDomain", j.companyDomain !== null);
    this.filled("companyLogoUrl", j.companyLogoUrl !== null);
    this.filled("validThrough", j.validThrough !== null);
    this.quality.push(j.qualityScore);
    this.fingerprints.set(j.fingerprint, (this.fingerprints.get(j.fingerprint) ?? 0) + 1);
  }

  render(elapsedMs: number, files: number, top: number): string {
    const pct = (n: number): string => `${((n / Math.max(1, this.total)) * 100).toFixed(1)}%`;
    const fmt = (n: number): string => n.toLocaleString("en-IN");
    const list = (group: string, limit = 99): string => {
      const m = this.counts.get(group);
      if (!m) return "–";
      return [...m.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, limit)
        .map(([k, v]) => `${k} ${fmt(v)}${limit === 99 ? ` (${pct(v)})` : ""}`)
        .join(" · ");
    };
    const q = [...this.quality].sort((a, b) => a - b);
    const at = (p: number): number => q[Math.min(q.length - 1, Math.floor(p * q.length))] ?? 0;
    const dupes = [...this.fingerprints.values()].filter((n) => n > 1);
    const rate = this.total / Math.max(0.001, elapsedMs / 1000);
    const lines = [
      `normalized ${fmt(this.total)} jobs from ${files} file(s) in ${(elapsedMs / 1000).toFixed(2)} s (${fmt(Math.round(rate))} jobs/s) · ${this.invalid} invalid · ${this.unparseable} unparseable lines`,
      `source          ${list("source")}`,
      `sourceKind      ${list("sourceKind")}`,
      `jobType         ${list("jobType")}`,
      `level           ${list("level")}`,
      `level conf.     ${list("levelConfidence")}`,
      `workMode        ${list("workMode")}`,
      `category        ${list("category")}`,
      `fingerprint     ${list("fingerprintRule")} · ${dupes.length} fingerprints shared by ${dupes.reduce((a, b) => a + b, 0)} records`,
      `salary          ${list("salary")}`,
      `fill rates      ${[...this.fill.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${pct(v)}`).join(" · ")}`,
      `quality         avg ${q.length ? Math.round(q.reduce((a, b) => a + b, 0) / q.length) : 0} · p10 ${at(0.1)} · p50 ${at(0.5)} · p90 ${at(0.9)}`,
      `top cities      ${list("city", top)}`,
      `countries       ${list("country", top)}`,
      `top skills      ${list("skill", top)}`,
      `top companies   ${list("company", top)}`,
      `tags            ${list("tag", top)}`,
      `batches         ${list("batch", top)}`,
      `degrees         ${list("degree", top)}`,
    ];
    return `${lines.join("\n")}\n`;
  }
}

/* ─────────────────────────── Main ─────────────────────────── */

async function write(stream: NodeJS.WritableStream, line: string): Promise<void> {
  if (!stream.write(line)) await new Promise<void>((r) => stream.once("drain", () => r()));
}

async function main(): Promise<void> {
  loadEnvFiles();
  const opts = parseArgs(process.argv.slice(2));
  const out: NodeJS.WritableStream = opts.out ? createWriteStream(resolve(process.env.INIT_CWD ?? process.cwd(), opts.out)) : process.stdout;
  const stats = new Stats();
  const t0 = performance.now();
  const llmOn = opts.llm && !!process.env.ANTHROPIC_API_KEY?.trim();
  if (opts.llm && !llmOn) process.stderr.write("--llm: ANTHROPIC_API_KEY is not set, skipping enrichment\n");
  const llm = { requests: 0, enriched: 0, cached: 0, overBudget: 0 };
  const llmLog = (m: string, meta?: Record<string, unknown>): void => void process.stderr.write(`${m} ${meta ? JSON.stringify(meta) : ""}\n`);
  for (const file of opts.files) {
    const path = resolveInput(file);
    const input = path === "-" ? process.stdin : createReadStream(path, { encoding: "utf8" });
    const rl = createInterface({ input, crlfDelay: Number.POSITIVE_INFINITY });
    for await (const line of rl) {
      if (!line.trim()) continue;
      let raw: RawJob;
      try {
        raw = JSON.parse(line) as RawJob;
      } catch {
        stats.unparseable++;
        continue;
      }
      let job = normalizeJob(raw, { sourceName: opts.sourceName, now: opts.now });
      if (llmOn && needsEnrichment(job)) {
        const inBudget = llm.requests < opts.llmMax;
        const before = job;
        job = await enrichWithLLM(job, { cacheOnly: !inBudget, log: llmLog });
        const meta = (job.extra as { normalize?: { llm?: { cached?: boolean } } } | null)?.normalize?.llm;
        if (job !== before && meta?.cached) llm.cached++;
        else if (inBudget) {
          llm.requests++;
          if (job !== before) llm.enriched++;
        } else llm.overBudget++;
      }
      const errs = validateJobInput(job);
      if (errs.length > 0) {
        stats.invalid++;
        if (stats.invalid <= 5) process.stderr.write(`invalid JobInput ${job.source}/${job.sourceJobId}: ${errs.join(", ")}\n`);
      }
      stats.add(job);
      if (!opts.statsOnly) await write(out, `${JSON.stringify(job)}\n`);
    }
  }
  if (opts.out) await new Promise<void>((r) => (out as WriteStream).end(() => r()));
  process.stderr.write(stats.render(performance.now() - t0, opts.files.length, opts.top));
  if (llmOn) {
    process.stderr.write(
      `llm: ${llm.requests} request(s) (max ${opts.llmMax}) · ${llm.enriched} enriched · ${llm.cached} from cache · ${llm.overBudget} skipped over budget\n`,
    );
  }
  if (stats.invalid > 0) process.exitCode = 1;
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 2;
});
