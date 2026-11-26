/**
 * Database handle: postgres.js when DATABASE_URL is set, otherwise embedded PGlite (with pg_trgm)
 * persisted at <repo>/.data/pglite. Same schema, migrations and SQL for both drivers.
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { sql, type SQL } from "drizzle-orm";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import postgres from "postgres";
import { DEFAULT_PGLITE_DIR, fromRepoRoot } from "./paths";
import * as schema from "./schema";

export type Driver = "postgres" | "pglite";
export type Schema = typeof schema;
export type Orm = PgDatabase<PgQueryResultHKT, Schema>;

/** Something that can run SQL: the database itself or an open transaction. */
export interface Executor {
  readonly orm: Orm;
  /** Run raw SQL and return its rows (normalised across drivers). */
  query<T = Record<string, unknown>>(q: SQL): Promise<T[]>;
  /**
   * Same, with sequential scans disabled for this statement (SET LOCAL in its own transaction). Used for
   * full-text conditions: a seq scan would evaluate `search @@ q` by detoasting every row's tsvector,
   * while the GIN bitmap answers it from the index. The planner cannot see detoast cost, so we hint.
   */
  queryIndexed<T = Record<string, unknown>>(q: SQL): Promise<T[]>;
}

export interface Database extends Executor {
  readonly driver: Driver;
  /** Human-readable location without credentials — "pglite:/…/.data/pglite", "postgres://host:5432/db". */
  readonly location: string;
  transaction<T>(fn: (tx: Executor) => Promise<T>): Promise<T>;
  /** Postgres only: LISTEN/NOTIFY for multi-instance fan-out. */
  readonly pubsub: PubSub | null;
  /**
   * Run fn while holding a cross-process advisory lock (one reserved connection takes and releases it).
   * `wait: false` → returns { acquired: false } immediately if another process holds it. PGlite: no-op lock.
   */
  withSessionLock<T>(key: number, fn: () => Promise<T>, opts?: { wait?: boolean }): Promise<{ acquired: boolean; value?: T }>;
  close(): Promise<void>;
}

export interface PubSub {
  listen(channel: string, onMessage: (payload: string) => void): Promise<() => Promise<void>>;
  notify(channel: string, payload: string): Promise<void>;
}

export interface DatabaseOptions {
  /** postgres:// URL. Default: env DATABASE_URL. If empty → PGlite. */
  url?: string | null;
  /** PGlite data dir, or "memory://" for an in-memory database. Default: env PGLITE_DIR or <repo>/.data/pglite. */
  pgliteDir?: string;
  /** postgres.js pool size (default env DB_POOL_MAX or 20). */
  poolMax?: number;
  /** Per-statement timeout in ms for Postgres (default env DB_STATEMENT_TIMEOUT_MS or 30 000). */
  statementTimeoutMs?: number;
  /** application_name reported to Postgres. */
  appName?: string;
}

/** Session settings applied on every connection (both drivers). */
const SESSION_SETTINGS: Record<string, string> = {
  TimeZone: "UTC",
  // websearch-style queries never need JIT; on large scans JIT adds 20–100 ms of compile time.
  jit: "off",
  // trigram fallback: "devloper" <% "software developer" = 0.58
  "pg_trgm.word_similarity_threshold": "0.5",
  "pg_trgm.similarity_threshold": "0.3",
  // data lives in RAM/SSD: random access is nearly as cheap as sequential
  random_page_cost: "1.1",
  // A search already fans out into ~8 concurrent statements; intra-query workers only add CPU under load.
  max_parallel_workers_per_gather: process.env.DB_PARALLEL_WORKERS ?? "0",
};

const rowsOf = <T>(res: unknown): T[] =>
  Array.isArray(res) ? (res as T[]) : ((res as { rows?: T[] } | null)?.rows ?? []);

/** Only bitmap scans remain (GIN answers `@@` / trigram operators without touching TOAST). */
const NO_SEQSCAN = sql`SELECT set_config('enable_seqscan', 'off', true), set_config('enable_indexscan', 'off', true), set_config('enable_indexonlyscan', 'off', true)`;

function executor(orm: Orm, inTransaction: boolean): Executor {
  return {
    orm,
    async query<T = Record<string, unknown>>(q: SQL): Promise<T[]> {
      return rowsOf<T>(await orm.execute(q));
    },
    async queryIndexed<T = Record<string, unknown>>(q: SQL): Promise<T[]> {
      if (inTransaction) {
        await orm.execute(NO_SEQSCAN);
        return rowsOf<T>(await orm.execute(q));
      }
      return orm.transaction(async (tx) => {
        await tx.execute(NO_SEQSCAN);
        return rowsOf<T>(await tx.execute(q));
      });
    },
  };
}

function redact(url: string): string {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.hostname}${u.port ? `:${u.port}` : ""}${u.pathname}`;
  } catch {
    return "postgres://(unparseable url)";
  }
}

export async function createDatabase(options: DatabaseOptions = {}): Promise<Database> {
  const url = options.url === undefined ? process.env.DATABASE_URL : options.url;
  if (url && url.trim()) return createPostgres(url.trim(), options);
  return createPglite(options.pgliteDir ?? process.env.PGLITE_DIR ?? DEFAULT_PGLITE_DIR);
}

async function createPostgres(url: string, options: DatabaseOptions): Promise<Database> {
  const statementTimeout = options.statementTimeoutMs ?? Number(process.env.DB_STATEMENT_TIMEOUT_MS ?? 30_000);
  const client = postgres(url, {
    max: options.poolMax ?? Number(process.env.DB_POOL_MAX ?? 20),
    idle_timeout: 60,
    connect_timeout: 15,
    onnotice: () => {},
    connection: {
      application_name: options.appName ?? "easyjobs",
      statement_timeout: String(statementTimeout),
      ...SESSION_SETTINGS,
    } as Record<string, string>,
  });
  const orm = drizzlePostgres({ client, schema }) as unknown as Orm;
  // Fail fast with a clear message if the server is unreachable.
  try {
    await client`select 1`;
  } catch (e) {
    await client.end({ timeout: 1 }).catch(() => {});
    throw new Error(`Cannot connect to Postgres at ${redact(url)}: ${e instanceof Error ? e.message : String(e)}`);
  }
  const base = executor(orm, false);
  return {
    ...base,
    driver: "postgres",
    location: redact(url),
    transaction: (fn) => orm.transaction((tx) => fn(executor(tx as unknown as Orm, true))),
    async withSessionLock(key, fn, opts) {
      const conn = await client.reserve();
      try {
        if (opts?.wait === false) {
          const [row] = await conn<{ ok: boolean }[]>`select pg_try_advisory_lock(${key}) as ok`;
          if (!row?.ok) return { acquired: false };
        } else {
          await conn`select pg_advisory_lock(${key})`;
        }
        try {
          return { acquired: true, value: await fn() };
        } finally {
          await conn`select pg_advisory_unlock(${key})`.catch(() => {});
        }
      } finally {
        conn.release();
      }
    },
    pubsub: {
      async listen(channel, onMessage) {
        const sub = await client.listen(channel, (payload) => onMessage(payload));
        return () => sub.unlisten();
      },
      async notify(channel, payload) {
        await client.notify(channel, payload);
      },
    },
    close: () => client.end({ timeout: 5 }),
  };
}

/* ─────────────── PGlite ─────────────── */

interface LockInfo {
  pid: number;
  startedAt: string;
  argv: string;
}

function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === "EPERM";
  }
}

/** PGlite is single-process: two processes on one data dir corrupt it. Guard with a pid lock file. */
function acquirePgliteLock(dir: string): () => void {
  const lockFile = `${dir}.lock`;
  mkdirSync(dirname(lockFile), { recursive: true });
  if (existsSync(lockFile)) {
    let info: LockInfo | null = null;
    try {
      info = JSON.parse(readFileSync(lockFile, "utf8")) as LockInfo;
    } catch {
      info = null;
    }
    if (info && info.pid !== process.pid && pidAlive(info.pid)) {
      throw new PgliteLockedError(dir, info);
    }
  }
  const info: LockInfo = { pid: process.pid, startedAt: new Date().toISOString(), argv: process.argv.slice(1).join(" ") };
  writeFileSync(lockFile, JSON.stringify(info));
  let released = false;
  const release = (): void => {
    if (released) return;
    released = true;
    try {
      const cur = JSON.parse(readFileSync(lockFile, "utf8")) as LockInfo;
      if (cur.pid === process.pid) rmSync(lockFile, { force: true });
    } catch {
      /* already gone */
    }
  };
  process.once("exit", release);
  return release;
}

export class PgliteLockedError extends Error {
  readonly dir: string;
  readonly holder: LockInfo;
  constructor(dir: string, holder: LockInfo) {
    super(
      `PGlite data dir ${dir} is in use by pid ${holder.pid} (${holder.argv}). ` +
        `PGlite allows one process at a time — stop that process, or set DATABASE_URL to use Postgres.`,
    );
    this.name = "PgliteLockedError";
    this.dir = dir;
    this.holder = holder;
  }
}

async function createPglite(dirOption: string): Promise<Database> {
  const memory = dirOption === "memory://" || dirOption === ":memory:";
  const dir = memory ? "memory://" : fromRepoRoot(dirOption);
  let release: () => void = () => {};
  if (!memory) {
    mkdirSync(dir, { recursive: true });
    release = acquirePgliteLock(dir);
  }
  let client: PGlite;
  try {
    client = await PGlite.create(memory ? undefined : dir, { extensions: { pg_trgm } });
  } catch (e) {
    release();
    throw new Error(`Cannot open PGlite at ${dir}: ${e instanceof Error ? e.message : String(e)}`);
  }
  for (const [k, v] of Object.entries(SESSION_SETTINGS)) {
    await client.query(`SET "${k}" = '${v}'`);
  }
  const orm = drizzlePglite({ client, schema }) as unknown as Orm;
  const base = executor(orm, false);
  let closed = false;
  return {
    ...base,
    driver: "pglite",
    location: `pglite:${dir}`,
    transaction: (fn) => orm.transaction((tx) => fn(executor(tx as unknown as Orm, true))),
    pubsub: null,
    async withSessionLock(_key, fn) {
      return { acquired: true, value: await fn() };
    },
    async close() {
      if (closed) return;
      closed = true;
      try {
        await client.close();
      } finally {
        release();
      }
    },
  };
}
