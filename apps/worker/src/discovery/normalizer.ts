import { existsSync } from "node:fs";
import { join } from "node:path";
import { validateJobInput, type CompanyTarget, type JobInput, type RawJob } from "@easyjobs/contract";
import type { Logger } from "@easyjobs/contract/node";
import { fallbackNormalize, type NormalizeOptions } from "../fallback-normalize";
import { errorMessage, isObject, truncate } from "../util";
import { safeImport, treeVersion } from "./safe-import";

export type { NormalizeOptions };
export type NormalizeFn = (raw: RawJob, opts: NormalizeOptions) => JobInput | Promise<JobInput>;

export interface NormalizerHandle {
  kind: "package" | "fallback";
  /** Entry file of @easyjobs/normalize, when found. */
  entry: string | null;
  version: string;
  /** Why this normalizer was chosen (shown by `list` and /status). */
  note: string;
  normalize: NormalizeFn;
}

export function fallbackNormalizerHandle(note: string, entry: string | null = null, version = ""): NormalizerHandle {
  return { kind: "fallback", entry, version, note, normalize: (raw, opts) => fallbackNormalize(raw, opts) };
}

const SMOKE_RAW: RawJob = {
  source: "worker-smoke-test",
  sourceKind: "ats",
  sourceJobId: "4012345",
  sourceUrl: "https://job-boards.greenhouse.io/acme/jobs/4012345",
  target: "acme",
  applyUrl: "https://job-boards.greenhouse.io/acme/jobs/4012345",
  title: "Software Engineer Intern",
  company: "Acme",
  locations: ["Bengaluru, Karnataka, India"],
  descriptionHtml: "<p>Build product features with <strong>TypeScript</strong> and React. 2026 batch.</p>",
  postedAt: "2026-01-15T10:00:00.000Z",
};

const SMOKE_COMPANY: CompanyTarget = {
  slug: "acme",
  name: "Acme",
  domain: "acme.example",
  ats: "greenhouse",
  token: "acme",
  careersUrl: "https://job-boards.greenhouse.io/acme",
  tags: ["startup"],
  hq: null,
  indiaPresence: true,
  priority: 2,
};

/** Returns a problem description, or null when `fn` turns a plain RawJob into a valid JobInput. */
export async function smokeTestNormalizer(fn: NormalizeFn): Promise<string | null> {
  try {
    const out = await fn(structuredClone(SMOKE_RAW), { sourceName: "Smoke Test", company: SMOKE_COMPANY, now: new Date("2026-01-16T00:00:00Z") });
    const problems = validateJobInput(out);
    return problems.length > 0 ? `output fails validateJobInput: ${problems.slice(0, 4).join("; ")}` : null;
  } catch (e) {
    return `normalizeJob threw: ${truncate(errorMessage(e), 200)}`;
  }
}

/** Uses <repo>/packages/normalize's normalizeJob when it loads and passes a smoke test; otherwise the local fallback. */
export async function discoverNormalizer(opts: {
  repoRoot: string;
  importTimeoutMs: number;
  log: Logger;
  previous?: NormalizerHandle | null;
}): Promise<NormalizerHandle> {
  const dir = join(opts.repoRoot, "packages", "normalize");
  const entry = join(dir, "src", "index.ts");
  if (!existsSync(entry)) return fallbackNormalizerHandle("packages/normalize/src/index.ts not found — using the built-in fallback normalizer");
  const version = treeVersion([join(dir, "src"), join(dir, "package.json")]);
  if (opts.previous && opts.previous.entry === entry && opts.previous.version === version) return opts.previous;

  const res = await safeImport(entry, { timeoutMs: opts.importTimeoutMs, version });
  let handle: NormalizerHandle;
  if (!res.ok) {
    handle = fallbackNormalizerHandle(`packages/normalize failed to load (${res.error}) — using the fallback normalizer`, entry, version);
  } else {
    const def = isObject(res.module.default) ? res.module.default : {};
    const candidate = res.module.normalizeJob ?? def.normalizeJob;
    if (typeof candidate !== "function") {
      handle = fallbackNormalizerHandle("packages/normalize does not export normalizeJob() — using the fallback normalizer", entry, version);
    } else {
      const fn = candidate as (raw: RawJob, opts?: NormalizeOptions) => JobInput | Promise<JobInput>;
      const normalize: NormalizeFn = (raw, o) => fn(raw, o);
      const problem = await smokeTestNormalizer(normalize);
      handle = problem
        ? fallbackNormalizerHandle(`packages/normalize normalizeJob() failed the smoke test (${problem}) — using the fallback normalizer`, entry, version)
        : { kind: "package", entry, version, note: "using @easyjobs/normalize (packages/normalize)", normalize };
    }
  }
  if (handle.kind === "package") opts.log.info("normalizer: @easyjobs/normalize");
  else opts.log.warn(`normalizer: ${handle.note}`);
  return handle;
}
