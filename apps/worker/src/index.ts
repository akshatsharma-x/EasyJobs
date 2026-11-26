/** @easyjobs/worker — programmatic API (the CLI lives in src/cli.ts). */
export { Worker, type WorkerOptions } from "./worker";
export { loadConfig, type WorkerConfig, type DemoMode, type Priority } from "./config";
export { runOnce, resolveOnceTasks, UsageError, type OnceOptions, type OnceResult } from "./once";
export { listCommand } from "./list";
export { runPipeline, formatSummary, sweepDeferred, type PipelineContext, type PipelineInput, type PipelineResult, type SweepResult } from "./pipeline";
export { Scheduler, type RunOutcome, type RunRequest, type SchedulerConfig, type TaskRunner, type TaskStatus, type TriggerResult } from "./scheduler";
export { buildTasks, checkEnabled, targetsFor, taskId, type TaskDef, type TaskPlan } from "./tasks";
export { StateStore, emptyTaskState, type TaskState, type RunStatus } from "./state";
export { IngestApiClient, WORKER_VERSION, type ApiResult } from "./api-client";
export { Delivery, type DeliveryStats } from "./delivery";
export { Spool, type SpoolEnvelope, type SpoolKind } from "./spool";
export { DryRunSink, type DeliveryOutcome, type JobSink } from "./sink";
export { createStatusServer, listen, closeServer, type StatusProvider } from "./server";
export { fallbackNormalize, computeFingerprint, canonicalUrl, canonicalJobKey } from "./fallback-normalize";
export { demoScraper, demoJob, DEMO_SCRAPER_ID } from "./demo-scraper";
export * from "./discovery";
export { ShutdownAbort, TaskTimeout } from "./abort";
export { silentLogger, filterLogger } from "./log";
