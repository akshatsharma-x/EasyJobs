import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ATS_TYPES, slugify, type CompanyTarget } from "@easyjobs/contract";
import type { Logger } from "@easyjobs/contract/node";
import { WORKER_DIR } from "../paths";
import { errorMessage, isObject, isOneOf } from "../util";
import { safeImport, treeVersion } from "./safe-import";

export const SAMPLE_REGISTRY_FILE = join(WORKER_DIR, "fixtures", "companies.sample.json");

export interface RegistryHandle {
  kind: "package" | "fallback";
  /** Entry module or JSON file the companies came from. */
  entry: string;
  version: string;
  note: string;
  companies: CompanyTarget[];
  /** Exact slug lookup. */
  get(slug: string): CompanyTarget | undefined;
  /** Name / domain / slug lookup (the registry package's fuzzy findCompany when available). */
  find(query: string): CompanyTarget | undefined;
}

/** Validates and fills defaults; returns null (with a reason) for entries the worker cannot schedule. */
export function coerceCompanyTarget(x: unknown): { company: CompanyTarget | null; problem?: string } {
  if (!isObject(x)) return { company: null, problem: "not an object" };
  const slug = typeof x.slug === "string" ? x.slug.trim() : "";
  if (!slug) return { company: null, problem: "missing slug" };
  if (!isOneOf(x.ats, ATS_TYPES)) return { company: null, problem: `${slug}: unknown ats ${JSON.stringify(x.ats)}` };
  const token = typeof x.token === "string" ? x.token.trim() : "";
  if (!token) return { company: null, problem: `${slug}: missing token` };
  const company: CompanyTarget = {
    ...(x as Partial<CompanyTarget>),
    slug,
    name: typeof x.name === "string" && x.name.trim() ? x.name.trim() : slug,
    domain: typeof x.domain === "string" && x.domain.trim() ? x.domain.trim() : null,
    ats: x.ats,
    token,
    careersUrl: typeof x.careersUrl === "string" ? x.careersUrl : "",
    tags: Array.isArray(x.tags) ? x.tags.filter((t): t is string => typeof t === "string") : [],
    hq: typeof x.hq === "string" ? x.hq : null,
    indiaPresence: x.indiaPresence === true,
    priority: x.priority === 1 || x.priority === 2 || x.priority === 3 ? x.priority : 2,
  };
  return { company };
}

const LEGAL_SUFFIX =
  /\b(private|pvt|limited|ltd|inc|incorporated|llc|llp|plc|gmbh|ag|sa|corp|corporation|co|company|technologies|technology|labs|software|solutions|services|india|global)\b\.?/g;

export function normalizeCompanyName(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(LEGAL_SUFFIX, " ")
    .replace(/[^a-z0-9]+/g, "");
}

const hostFrom = (q: string): string | null => {
  const s = q.trim().toLowerCase();
  if (/^https?:\/\//.test(s)) {
    try {
      return new URL(s).hostname.replace(/^www\./, "");
    } catch {
      return null;
    }
  }
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(s) ? s.replace(/^www\./, "") : null;
};

export function createRegistryHandle(
  companies: CompanyTarget[],
  meta: { kind: RegistryHandle["kind"]; entry: string; version: string; note: string },
  finder?: (q: string) => unknown,
): RegistryHandle {
  const bySlug = new Map<string, CompanyTarget>();
  const byName = new Map<string, CompanyTarget>();
  const byDomain = new Map<string, CompanyTarget>();
  for (const c of companies) {
    if (!bySlug.has(c.slug)) bySlug.set(c.slug, c);
    const names = [c.name, ...(isObject(c.extra) && Array.isArray(c.extra.aliases) ? c.extra.aliases : [])];
    for (const n of names) {
      const key = typeof n === "string" ? normalizeCompanyName(n) : "";
      if (key && !byName.has(key)) byName.set(key, c);
    }
    const d = c.domain ? hostFrom(c.domain) : null;
    if (d && !byDomain.has(d)) byDomain.set(d, c);
  }
  const fromResult = (r: unknown): CompanyTarget | undefined => {
    const obj = isObject(r) && isObject(r.company) ? r.company : r;
    return isObject(obj) && typeof obj.slug === "string" ? bySlug.get(obj.slug) : undefined;
  };
  const local = (query: string): CompanyTarget | undefined => {
    const q = query.trim();
    if (!q) return undefined;
    const host = hostFrom(q);
    if (host) {
      const parts = host.split(".");
      for (let i = 0; i < parts.length - 1; i++) {
        const hit = byDomain.get(parts.slice(i).join("."));
        if (hit) return hit;
      }
    }
    return bySlug.get(q) ?? bySlug.get(slugify(q)) ?? byName.get(normalizeCompanyName(q));
  };
  return {
    ...meta,
    companies,
    get: (slug) => bySlug.get(slug),
    find: (query) => {
      if (finder) {
        try {
          const hit = fromResult(finder(query));
          if (hit) return hit;
        } catch {
          /* fall through to local matching */
        }
      }
      return local(query);
    },
  };
}

function coerceAll(list: unknown[]): { companies: CompanyTarget[]; dropped: string[] } {
  const companies: CompanyTarget[] = [];
  const dropped: string[] = [];
  const seen = new Set<string>();
  for (const item of list) {
    const { company, problem } = coerceCompanyTarget(item);
    if (!company) dropped.push(problem ?? "invalid");
    else if (seen.has(company.slug)) dropped.push(`${company.slug}: duplicate slug`);
    else {
      seen.add(company.slug);
      companies.push(company);
    }
  }
  return { companies, dropped };
}

export function loadSampleRegistry(note: string, file = SAMPLE_REGISTRY_FILE): RegistryHandle {
  let list: unknown[] = [];
  try {
    const parsed: unknown = JSON.parse(readFileSync(file, "utf8"));
    list = Array.isArray(parsed) ? parsed : [];
  } catch {
    list = [];
  }
  const { companies } = coerceAll(list);
  return createRegistryHandle(companies, { kind: "fallback", entry: file, version: treeVersion([file]), note });
}

/** Uses <repo>/packages/registry (companies + findCompany) when it loads with ≥1 valid company; else the 10-entry sample. */
export async function discoverRegistry(opts: {
  repoRoot: string;
  importTimeoutMs: number;
  log: Logger;
  previous?: RegistryHandle | null;
}): Promise<RegistryHandle> {
  const dir = join(opts.repoRoot, "packages", "registry");
  const entry = join(dir, "src", "index.ts");
  const fallback = (why: string): RegistryHandle => {
    const prev = opts.previous;
    if (prev && prev.kind === "fallback" && prev.note.startsWith(why)) return prev;
    const handle = loadSampleRegistry(`${why} — using fixtures/companies.sample.json`);
    opts.log.warn(`registry: ${handle.note} (${handle.companies.length} companies)`);
    return handle;
  };
  if (!existsSync(entry)) return fallback("packages/registry/src/index.ts not found");
  const version = treeVersion([join(dir, "src"), join(dir, "data"), join(dir, "package.json")]);
  if (opts.previous && opts.previous.entry === entry && opts.previous.version === version) return opts.previous;

  const res = await safeImport(entry, { timeoutMs: opts.importTimeoutMs, version });
  if (!res.ok) return fallback(`packages/registry failed to load (${res.error})`);
  const def = isObject(res.module.default) ? res.module.default : {};
  let list: unknown = res.module.companies ?? def.companies;
  if (typeof list === "function") {
    try {
      list = (list as () => unknown)();
    } catch (e) {
      return fallback(`packages/registry companies() threw (${errorMessage(e)})`);
    }
  }
  if (!Array.isArray(list)) return fallback("packages/registry does not export companies[]");
  const { companies, dropped } = coerceAll(list);
  if (companies.length === 0) return fallback("packages/registry exports no valid companies");
  const finderCandidate = res.module.findCompany ?? def.findCompany;
  const finder = typeof finderCandidate === "function" ? (finderCandidate as (q: string) => unknown) : undefined;
  const note = `using @easyjobs/registry (${companies.length} companies${dropped.length ? `, ${dropped.length} invalid entries skipped` : ""}${finder ? "" : ", no findCompany export — exact matching"})`;
  const handle = createRegistryHandle(companies, { kind: "package", entry, version, note }, finder);
  opts.log.info(`registry: ${note}`);
  if (dropped.length > 0) opts.log.warn(`registry: skipped ${dropped.length} invalid entries`, { examples: dropped.slice(0, 5) });
  return handle;
}
