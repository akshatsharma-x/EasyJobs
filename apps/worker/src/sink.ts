import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { IngestRequest, IngestResponse, RunReport, SweepRequest, SweepResponse } from "@easyjobs/contract";

/** sent → API accepted · spooled → queued on disk for replay · failed → dropped (reported) · written → dry-run file. */
export type DeliveryOutcome<T> =
  | { status: "sent"; data: T }
  | { status: "spooled" }
  | { status: "failed"; error: string }
  | { status: "written"; note?: string };

/** Where the pipeline ships its results: the API (with spool) or dry-run files. */
export interface JobSink {
  readonly kind: "api" | "dry-run";
  known(source: string, target: string | null): Promise<Set<string> | null>;
  jobs(req: IngestRequest): Promise<DeliveryOutcome<IngestResponse>>;
  sweep(req: SweepRequest): Promise<DeliveryOutcome<SweepResponse>>;
  run(report: RunReport): Promise<DeliveryOutcome<unknown>>;
}

interface DryRunFiles {
  jobsFile: string;
  reportFile: string;
  jobs: number;
  runs: RunReport[];
  sweeps: { target: string | null; seen: number }[];
}

/** --dry-run: normalized JobInputs → <outDir>/<source>.jsonl (truncated on first use), plus <source>.report.json. */
export class DryRunSink implements JobSink {
  readonly kind = "dry-run" as const;
  private readonly files = new Map<string, DryRunFiles>();

  constructor(readonly outDir: string) {}

  private ensure(source: string): DryRunFiles {
    let f = this.files.get(source);
    if (!f) {
      mkdirSync(this.outDir, { recursive: true });
      f = { jobsFile: join(this.outDir, `${source}.jsonl`), reportFile: join(this.outDir, `${source}.report.json`), jobs: 0, runs: [], sweeps: [] };
      writeFileSync(f.jobsFile, "");
      this.files.set(source, f);
    }
    return f;
  }

  outputs(): { source: string; jobsFile: string; reportFile: string; jobs: number }[] {
    return [...this.files.entries()].map(([source, f]) => ({ source, jobsFile: f.jobsFile, reportFile: f.reportFile, jobs: f.jobs }));
  }

  async known(): Promise<Set<string> | null> {
    return null;
  }

  async jobs(req: IngestRequest): Promise<DeliveryOutcome<IngestResponse>> {
    const f = this.ensure(req.source);
    if (req.jobs.length > 0) appendFileSync(f.jobsFile, `${req.jobs.map((j) => JSON.stringify(j)).join("\n")}\n`);
    f.jobs += req.jobs.length;
    return { status: "written" };
  }

  async sweep(req: SweepRequest): Promise<DeliveryOutcome<SweepResponse>> {
    this.ensure(req.source).sweeps.push({ target: req.target, seen: req.seenSourceJobIds.length });
    return { status: "written", note: "dry-run: sweep not sent" };
  }

  async run(report: RunReport): Promise<DeliveryOutcome<unknown>> {
    const f = this.ensure(report.source);
    f.runs.push(report);
    writeFileSync(f.reportFile, `${JSON.stringify({ dryRun: true, jobsFile: f.jobsFile, jobs: f.jobs, runs: f.runs, wouldSweep: f.sweeps }, null, 2)}\n`);
    return { status: "written" };
  }
}
