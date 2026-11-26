import { appendFile, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Logger } from "@easyjobs/contract/node";
import { errorMessage, isObject, isProcessAlive } from "./util";

export type SpoolKind = "jobs" | "sweep" | "run";

export interface SpoolEnvelope {
  v: 1;
  kind: SpoolKind;
  /** When the request was originally made. */
  at: string;
  body: unknown;
}

interface Segment {
  name: string;
  path: string;
  lines: number;
  offset: number;
  bytes: number;
  /** Still receiving appends from this process. */
  open: boolean;
  cache: string[] | null;
}

export interface SpoolItem {
  readonly segment: Segment;
  readonly index: number;
  readonly envelope: SpoolEnvelope;
}

/** Undeliverable items end up here (never replayed; kept for inspection / manual re-injection). */
export const DEAD_LETTER_FILE = "dead-letter.jsonl";

export interface SpoolStats {
  pending: number;
  segments: number;
  bytes: number;
  dir: string;
}

/** <ms timestamp>-<pid>-<seq>.jsonl — sortable by creation time; the pid tells whether its writer is still alive. */
const SEGMENT_RE = /^(\d{13,})-(\d+)-(\d+)\.jsonl$/;

function isEnvelope(v: unknown): v is SpoolEnvelope {
  return isObject(v) && v.v === 1 && (v.kind === "jobs" || v.kind === "sweep" || v.kind === "run") && typeof v.at === "string" && "body" in v;
}

/**
 * Durable FIFO of ingest requests that could not be delivered (apps/worker/.spool/*.jsonl).
 * - Appends go to this process's open segment (one JSON envelope per line); segments rotate by size/lines.
 * - The head segment is sealed before it is read, so reads never race appends.
 * - Progress is kept in a `<segment>.offset` sidecar, so a crash mid-replay re-sends at most one item.
 * - Segments left by dead processes (crash, previous run, `once`) are adopted; live writers' segments are left alone.
 * Not internally synchronized: the Delivery layer serializes every call through one mutex.
 */
export class Spool {
  private readonly segments: Segment[] = [];
  private seq = 0;
  private readonly pid: number;

  constructor(
    readonly dir: string,
    private readonly opts: { log?: Logger; maxBytes?: number; segmentMaxBytes?: number; segmentMaxLines?: number; pid?: number } = {},
  ) {
    this.pid = opts.pid ?? process.pid;
  }

  async init(): Promise<number> {
    await mkdir(this.dir, { recursive: true });
    return this.adoptOrphans();
  }

  /** Adopts segments whose writer process is gone (oldest first). Returns the number of pending items adopted. */
  async adoptOrphans(): Promise<number> {
    let names: string[];
    try {
      names = (await readdir(this.dir)).filter((n) => SEGMENT_RE.test(n)).sort();
    } catch {
      return 0;
    }
    const known = new Set(this.segments.map((s) => s.name));
    let adopted = 0;
    for (const name of names) {
      if (known.has(name)) continue;
      const pid = Number(SEGMENT_RE.exec(name)?.[2]);
      if (pid !== this.pid && isProcessAlive(pid)) continue;
      const path = join(this.dir, name);
      let text = "";
      try {
        text = await readFile(path, "utf8");
      } catch {
        continue;
      }
      const lines = text.split("\n").filter((l) => l.trim().length > 0);
      const offset = await this.readOffset(path);
      if (offset >= lines.length) {
        await this.removeFiles(path);
        continue;
      }
      this.segments.push({ name, path, lines: lines.length, offset, bytes: Buffer.byteLength(text), open: false, cache: lines });
      adopted += lines.length - offset;
    }
    if (adopted > 0) this.opts.log?.info(`spool: adopted ${adopted} pending request(s) from earlier runs`, { dir: this.dir });
    return adopted;
  }

  get pending(): number {
    let n = 0;
    for (const s of this.segments) n += s.lines - s.offset;
    return n;
  }

  stats(): SpoolStats {
    return { pending: this.pending, segments: this.segments.length, bytes: this.segments.reduce((n, s) => n + s.bytes, 0), dir: this.dir };
  }

  async append(kind: SpoolKind, body: unknown, at = new Date()): Promise<void> {
    const envelope: SpoolEnvelope = { v: 1, kind, at: at.toISOString(), body };
    const line = `${JSON.stringify(envelope)}\n`;
    const size = Buffer.byteLength(line);
    let seg = this.segments.at(-1);
    const maxBytes = this.opts.segmentMaxBytes ?? 32 * 1024 * 1024;
    const maxLines = this.opts.segmentMaxLines ?? 2000;
    if (!seg || !seg.open || (seg.lines > 0 && (seg.bytes + size > maxBytes || seg.lines >= maxLines))) {
      if (seg) seg.open = false;
      seg = this.newSegment();
    }
    await mkdir(this.dir, { recursive: true });
    await appendFile(seg.path, line);
    seg.lines++;
    seg.bytes += size;
    await this.enforceLimit();
  }

  /** Oldest pending item, or null. */
  async peek(): Promise<SpoolItem | null> {
    for (;;) {
      const seg = this.segments[0];
      if (!seg) return null;
      if (seg.offset >= seg.lines) {
        if (seg.open) return null;
        await this.dropSegment(seg);
        continue;
      }
      seg.open = false; // seal: later appends start a new segment
      if (!seg.cache) {
        try {
          seg.cache = (await readFile(seg.path, "utf8")).split("\n").filter((l) => l.trim().length > 0);
        } catch (e) {
          this.opts.log?.error("spool: segment unreadable — dropping it", { file: seg.path, error: errorMessage(e) });
          await this.dropSegment(seg);
          continue;
        }
        seg.lines = seg.cache.length;
        if (seg.offset >= seg.lines) continue;
      }
      const text = seg.cache[seg.offset] ?? "";
      try {
        const env: unknown = JSON.parse(text);
        if (!isEnvelope(env)) throw new Error("not a spool envelope");
        return { segment: seg, index: seg.offset, envelope: env };
      } catch (e) {
        this.opts.log?.warn("spool: dropping a corrupt line", { file: seg.path, line: seg.offset + 1, error: errorMessage(e) });
        seg.offset++;
        await this.writeOffset(seg);
      }
    }
  }

  /** Marks a peeked item as delivered (or permanently dropped). Idempotent. */
  async commit(item: SpoolItem): Promise<void> {
    const seg = item.segment;
    if (seg.offset !== item.index || !this.segments.includes(seg)) return;
    seg.offset++;
    if (seg.offset >= seg.lines && !seg.open) await this.dropSegment(seg);
    else await this.writeOffset(seg);
  }

  /** Moves a peeked item out of the queue into dead-letter.jsonl, so one poison request can't block the FIFO forever. */
  async deadLetter(item: SpoolItem, reason: string): Promise<void> {
    const line = `${JSON.stringify({ ...item.envelope, deadLetteredAt: new Date().toISOString(), reason })}\n`;
    try {
      await appendFile(join(this.dir, DEAD_LETTER_FILE), line);
    } catch (e) {
      this.opts.log?.error("spool: could not write the dead-letter file", { error: errorMessage(e) });
    }
    await this.commit(item);
  }

  private newSegment(): Segment {
    const name = `${String(Date.now()).padStart(13, "0")}-${this.pid}-${String(this.seq++).padStart(4, "0")}.jsonl`;
    const seg: Segment = { name, path: join(this.dir, name), lines: 0, offset: 0, bytes: 0, open: true, cache: null };
    this.segments.push(seg);
    return seg;
  }

  private async dropSegment(seg: Segment): Promise<void> {
    const i = this.segments.indexOf(seg);
    if (i >= 0) this.segments.splice(i, 1);
    await this.removeFiles(seg.path);
  }

  private async removeFiles(path: string): Promise<void> {
    await rm(path, { force: true }).catch(() => undefined);
    await rm(`${path}.offset`, { force: true }).catch(() => undefined);
  }

  private async readOffset(path: string): Promise<number> {
    try {
      const n = Number((await readFile(`${path}.offset`, "utf8")).trim());
      return Number.isInteger(n) && n >= 0 ? n : 0;
    } catch {
      return 0;
    }
  }

  private async writeOffset(seg: Segment): Promise<void> {
    try {
      await writeFile(`${seg.path}.offset`, `${seg.offset}\n`);
    } catch (e) {
      this.opts.log?.warn("spool: could not persist replay offset", { file: seg.path, error: errorMessage(e) });
    }
  }

  /** Keeps the spool under WORKER_SPOOL_MAX_MB by dropping the oldest sealed segments (fresh data is re-scraped anyway). */
  private async enforceLimit(): Promise<void> {
    const max = this.opts.maxBytes;
    if (!max) return;
    let total = this.segments.reduce((n, s) => n + s.bytes, 0);
    while (total > max && this.segments.length > 1) {
      const victim = this.segments.find((s) => !s.open);
      if (!victim) break;
      total -= victim.bytes;
      this.opts.log?.error(`spool over ${Math.round(max / 1048576)} MB — dropped ${victim.lines - victim.offset} oldest request(s)`, { file: victim.name });
      await this.dropSegment(victim);
    }
  }
}
