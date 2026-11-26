/**
 * In-memory columnar facet index — computes all 11 disjunctive facets (and the total) in one pass over
 * dictionary-encoded typed arrays (~ms for 100k jobs), instead of ~8 aggregate statements per search.
 *
 * Same semantics as the SQL facets (FILTERS / facetSql), which remain the fallback and the reference
 * implementation (tests assert identical results). Text matching still happens in Postgres (GIN); the
 * matched id set is passed in.
 *
 * Freshness: a full snapshot of open jobs is rebuilt every `rebuildMs`; changes made through this process
 * (or announced by other instances) are applied immediately through an overlay.
 */
import { sql } from "drizzle-orm";
import { POSTED_WITHIN_MS, type FacetBucket, type Facets, type SearchQuery, type SortBy } from "@easyjobs/contract";
import type { Executor } from "../client";
import { getListItems } from "../queries";
import { textArray } from "../sql-util";
import { FACET_DEFS, relevanceScore, textCondition, toBuckets, type TextMatch } from "./engine";
import { FILTERS, type FacetKey, type MatchableJob } from "./filters";

type ScalarKey = "type" | "level" | "mode" | "category" | "company";
type ArrayKey = "location" | "ctype" | "skills" | "batch" | "source" | "tag" | "country";
const SCALARS: readonly ScalarKey[] = ["type", "level", "mode", "category", "company"];
const ARRAYS: readonly ArrayKey[] = ["location", "ctype", "skills", "batch", "source", "tag", "country"];

class Dict {
  readonly values: string[] = [];
  private readonly map = new Map<string, number>();
  code(v: string): number {
    let c = this.map.get(v);
    if (c === undefined) {
      c = this.values.length;
      this.values.push(v);
      this.map.set(v, c);
    }
    return c;
  }
  get(v: string): number | undefined {
    return this.map.get(v);
  }
  get size(): number {
    return this.values.length;
  }
}

interface Snapshot {
  n: number;
  ids: string[];
  slotOf: Map<string, number>;
  dicts: Record<ScalarKey | ArrayKey, Dict>;
  scalar: Record<ScalarKey, Uint32Array>;
  arr: Record<ArrayKey, { off: Uint32Array; codes: Uint32Array }>;
  official: Uint8Array;
  postedMs: Float64Array;
  salary: Float64Array;
  expMin: Float64Array;
  expMax: Float64Array;
  rankBase: Float64Array;
  /** 0 when the slot was superseded by the overlay (changed or closed since the snapshot). */
  alive: Uint8Array;
  labels: { company: Map<string, string>; source: Map<string, string> };
  builtAt: number;
}

interface OverlayJob {
  id: string;
  match: MatchableJob;
  values: Record<FacetKey, string[]>;
  rankBase: number;
  postedMs: number;
  /** coalesce(max, min) or NaN */
  salary: number;
}

interface Row {
  id: string;
  posted: number;
  off: boolean;
  type: string;
  level: string;
  mode: string | null;
  category: string;
  company: string;
  location: string[];
  ctype: string[];
  skills: string[];
  batch: string[];
  source: string[];
  tag: string[];
  country: string[];
  salary: number | null;
  emin: number | null;
  emax: number | null;
  rank: number;
}

const NULL_CODE = 0; // code 0 of every scalar dict is reserved for SQL NULL (only `mode` can be null)

function valuesOf(m: MatchableJob): Record<FacetKey, string[]> {
  return {
    type: [m.jobType],
    level: [m.experienceLevel],
    mode: m.workMode ? [m.workMode] : [],
    category: [m.category],
    company: [m.companySlug],
    location: [...m.cities, ...(m.isRemote ? ["Remote"] : [])],
    ctype: [...m.companyTags],
    skills: [...m.skills],
    batch: m.batches.map(String),
    source: [...m.sourceIds],
    tag: [...m.tags],
  };
}

/** Per-filter evaluators on the snapshot; must cover FILTERS exactly (checked at construction). */
type SlotTest = (s: Snapshot, i: number) => boolean;
interface Compiled {
  facet: FacetKey | null;
  test: SlotTest;
}

function anyAllowed(a: { off: Uint32Array; codes: Uint32Array }, i: number, allowed: Uint8Array): boolean {
  for (let k = a.off[i]!; k < a.off[i + 1]!; k++) if (allowed[a.codes[k]!]) return true;
  return false;
}

function mask(dict: Dict, values: readonly string[]): Uint8Array {
  const m = new Uint8Array(dict.size + 1);
  for (const v of values) {
    const c = dict.get(v);
    if (c !== undefined) m[c] = 1;
  }
  return m;
}

const SCALAR_FILTER: Partial<Record<keyof SearchQuery, ScalarKey>> = { type: "type", level: "level", mode: "mode", category: "category", company: "company" };
const ARRAY_FILTER: Partial<Record<keyof SearchQuery, ArrayKey>> = {
  location: "location",
  country: "country",
  ctype: "ctype",
  skills: "skills",
  batch: "batch",
  source: "source",
  tag: "tag",
};
const OTHER_FILTERS = new Set<keyof SearchQuery>(["official", "posted", "salaryMin", "exp"]);

function compile(q: SearchQuery, s: Snapshot, now: Date): Compiled[] {
  const out: Compiled[] = [];
  for (const f of FILTERS) {
    if (!f.active(q)) continue;
    const scalar = SCALAR_FILTER[f.key];
    const array = ARRAY_FILTER[f.key];
    if (scalar) {
      const m = mask(s.dicts[scalar], (q[f.key] as unknown[]).map(String));
      if (scalar === "mode") m[NULL_CODE] = 0;
      const col = s.scalar[scalar];
      out.push({ facet: f.facet, test: (_s, i) => m[col[i]!] === 1 });
    } else if (array) {
      const vals = (q[f.key] as unknown[]).map(String).map((v) => (f.key === "location" && v.toLowerCase() === "remote" ? "Remote" : v));
      const m = mask(s.dicts[array], vals);
      const col = s.arr[array];
      out.push({ facet: f.facet, test: (_s, i) => anyAllowed(col, i, m) });
    } else if (f.key === "official") {
      out.push({ facet: null, test: (ss, i) => ss.official[i] === 1 });
    } else if (f.key === "posted") {
      const cutoff = now.getTime() - (POSTED_WITHIN_MS[q.posted] ?? 0);
      out.push({ facet: null, test: (ss, i) => ss.postedMs[i]! >= cutoff });
    } else if (f.key === "salaryMin") {
      const min = q.salaryMin!;
      out.push({ facet: null, test: (ss, i) => ss.salary[i]! >= min }); // NaN (no salary) fails, like SQL NULL
    } else if (f.key === "exp") {
      const e = q.exp!;
      out.push({ facet: null, test: (ss, i) => !(ss.expMin[i]! > e) && !(ss.expMax[i]! < e) }); // NaN bounds are open
    } else {
      throw new Error(`facet index has no evaluator for filter "${String(f.key)}"`);
    }
  }
  return out;
}

/** Relevance scores of the open jobs matching a text query (parallel arrays: cheap to build and to convert). */
export interface TextScores {
  readonly ids: readonly string[];
  readonly scores: Float64Array;
  readonly size: number;
}

export interface FacetIndexOptions {
  /** Full rebuild interval (default 120 s). */
  rebuildMs?: number;
  /** Rebuild early once this many jobs sit in the overlay (default 5000). */
  maxOverlay?: number;
}

export class FacetIndex {
  private snap: Snapshot | null = null;
  private overlay = new Map<string, OverlayJob | null>();
  private building: Promise<void> | null = null;
  private pendingChanges: Promise<void> = Promise.resolve();
  private readonly rebuildMs: number;
  private readonly maxOverlay: number;
  /** Slot-aligned scores per (memoised) TextScores object, valid for one snapshot. */
  private readonly converted = new WeakMap<TextScores, { snap: Snapshot; bySlot: Float64Array; byId: Map<string, number> }>();
  builds = 0;

  constructor(
    private readonly db: Executor,
    opts: FacetIndexOptions = {},
  ) {
    this.rebuildMs = opts.rebuildMs ?? 120_000;
    this.maxOverlay = opts.maxOverlay ?? 5000;
    for (const f of FILTERS) {
      if (!SCALAR_FILTER[f.key] && !ARRAY_FILTER[f.key] && !OTHER_FILTERS.has(f.key)) throw new Error(`facet index: unsupported filter ${String(f.key)}`);
    }
  }

  get ready(): boolean {
    return this.snap !== null;
  }

  get stats(): { jobs: number; overlay: number; ageMs: number; builds: number } {
    return { jobs: this.snap?.n ?? 0, overlay: this.overlay.size, ageMs: this.snap ? Date.now() - this.snap.builtAt : -1, builds: this.builds };
  }

  /** Build now (coalesced). */
  rebuild(): Promise<void> {
    if (!this.building) {
      this.building = this.build().finally(() => {
        this.building = null;
      });
    }
    return this.building;
  }

  /** Build on first use; afterwards rebuild in the background when old or the overlay is large. */
  async ensure(): Promise<void> {
    if (!this.snap) return this.rebuild();
    if (Date.now() - this.snap.builtAt > this.rebuildMs || this.overlay.size > this.maxOverlay) void this.rebuild().catch(() => {});
  }

  private async build(): Promise<void> {
    const startedAt = Date.now();
    // Changes that land while we read the snapshot must survive the swap: remember them and re-apply.
    const changedDuringBuild = new Set<string>();
    const unhook = this.trackChanges((ids) => ids.forEach((id) => changedDuringBuild.add(id)));
    try {
      const [rows, companies, sources] = await Promise.all([
        this.db.query<Row>(sql`
          SELECT j.id, (extract(epoch FROM j.posted_at) * 1000)::float8 AS posted, j.is_official AS off,
                 j.job_type AS type, j.experience_level AS level, j.work_mode AS mode, j.category, j.company_slug AS company,
                 (j.cities || CASE WHEN j.is_remote THEN ARRAY['Remote']::text[] ELSE ARRAY[]::text[] END) AS location,
                 j.company_tags AS ctype, j.skills, j.batches::text[] AS batch, j.source_ids AS source, j.tags AS tag, j.countries AS country,
                 coalesce(j.salary_inr_yearly_max, j.salary_inr_yearly_min) AS salary, j.experience_min AS emin, j.experience_max AS emax,
                 j.rank_base AS rank
          FROM jobs j WHERE j.status = 'open'`),
        this.db.query<{ slug: string; name: string }>(sql`SELECT slug, name FROM companies`),
        this.db.query<{ id: string; name: string }>(sql`SELECT id, name FROM sources`),
      ]);
      const n = rows.length;
      const dicts = Object.fromEntries([...SCALARS, ...ARRAYS].map((k) => [k, new Dict()])) as Record<ScalarKey | ArrayKey, Dict>;
      for (const k of SCALARS) dicts[k].code("\u0000null");
      const scalar = Object.fromEntries(SCALARS.map((k) => [k, new Uint32Array(n)])) as Record<ScalarKey, Uint32Array>;
      const offs = Object.fromEntries(ARRAYS.map((k) => [k, new Uint32Array(n + 1)])) as Record<ArrayKey, Uint32Array>;
      const codeLists = Object.fromEntries(ARRAYS.map((k) => [k, [] as number[]])) as Record<ArrayKey, number[]>;
      const official = new Uint8Array(n);
      const postedMs = new Float64Array(n);
      const salary = new Float64Array(n);
      const expMin = new Float64Array(n);
      const expMax = new Float64Array(n);
      const rankBase = new Float64Array(n);
      const ids = new Array<string>(n);
      const slotOf = new Map<string, number>();
      for (let i = 0; i < n; i++) {
        const r = rows[i]!;
        ids[i] = r.id;
        slotOf.set(r.id, i);
        for (const k of SCALARS) {
          const v = r[k];
          scalar[k][i] = v === null ? NULL_CODE : dicts[k].code(v);
        }
        for (const k of ARRAYS) {
          offs[k][i] = codeLists[k].length;
          for (const v of r[k] ?? []) codeLists[k].push(dicts[k].code(v));
        }
        official[i] = r.off ? 1 : 0;
        postedMs[i] = r.posted;
        salary[i] = r.salary ?? NaN;
        expMin[i] = r.emin ?? NaN;
        expMax[i] = r.emax ?? NaN;
        rankBase[i] = r.rank;
      }
      const arr = {} as Snapshot["arr"];
      for (const k of ARRAYS) {
        offs[k][n] = codeLists[k].length;
        arr[k] = { off: offs[k], codes: Uint32Array.from(codeLists[k]) };
      }
      const snap: Snapshot = {
        n,
        ids,
        slotOf,
        dicts,
        scalar,
        arr,
        official,
        postedMs,
        salary,
        expMin,
        expMax,
        rankBase,
        alive: new Uint8Array(n).fill(1),
        labels: { company: new Map(companies.map((c) => [c.slug, c.name])), source: new Map(sources.map((s) => [s.id, s.name])) },
        builtAt: startedAt,
      };
      this.snap = snap;
      this.overlay = new Map();
      this.builds++;
    } finally {
      unhook();
    }
    if (changedDuringBuild.size > 0) await this.applyChanges([...changedDuringBuild]);
  }

  private listeners = new Set<(ids: readonly string[]) => void>();
  private trackChanges(fn: (ids: readonly string[]) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Jobs changed (created, updated, closed): refetch them into the overlay. Serialised. */
  applyChanges(ids: readonly string[]): Promise<void> {
    if (ids.length === 0) return this.pendingChanges;
    for (const l of this.listeners) l(ids);
    this.pendingChanges = this.pendingChanges
      .catch(() => undefined)
      .then(async () => {
        if (!this.snap) return;
        const unique = [...new Set(ids)];
        const [items, ranks] = await Promise.all([
          getListItems(this.db, unique),
          this.db.query<{ id: string; rank: number }>(sql`SELECT id, rank_base AS rank FROM jobs WHERE id = ANY(${textArray(unique)})`),
        ]);
        const fresh = new Map(items.map((e) => [e.item.id, e.match]));
        const rankOf = new Map(ranks.map((r) => [r.id, r.rank]));
        const snap = this.snap;
        for (const id of unique) {
          const slot = snap.slotOf.get(id);
          if (slot !== undefined) snap.alive[slot] = 0;
          const m = fresh.get(id);
          this.overlay.set(
            id,
            m && m.status === "open"
              ? { id, match: m, values: valuesOf(m), rankBase: rankOf.get(id) ?? 0, postedMs: Date.parse(m.postedAt), salary: m.salaryInrYearlyMax ?? m.salaryInrYearlyMin ?? NaN }
              : null,
          );
        }
        // labels for new companies / sources
        const newCompanies = unique.map((id) => fresh.get(id)?.companySlug).filter((s): s is string => !!s && !snap.labels.company.has(s));
        if (newCompanies.length > 0) {
          for (const c of await this.db.query<{ slug: string; name: string }>(sql`SELECT slug, name FROM companies WHERE slug = ANY(${textArray(newCompanies)})`)) {
            snap.labels.company.set(c.slug, c.name);
          }
        }
      });
    return this.pendingChanges;
  }

  /**
   * One pass: disjunctive facets, total and the requested page (ids, in the same order as the SQL ORDER BY).
   * `scores` = relevance score of every open job matching the free text (null without text).
   * Returns null when the index is not built yet (callers fall back to SQL).
   */
  async search(
    q: SearchQuery,
    scores: TextScores | null,
    now: Date,
    page: { offset: number; limit: number },
  ): Promise<{ facets: Facets; total: number; pageIds: string[] } | null> {
    await this.pendingChanges.catch(() => undefined);
    const s = this.snap;
    if (!s) return null;
    const compiled = compile(q, s, now);
    const global = compiled.filter((c) => c.facet === null);
    const facetFilters = compiled.filter((c) => c.facet !== null);
    const facetIdx = new Map<FacetKey, number>(FACET_DEFS.map((f, k) => [f.key, k]));
    const counts: Int32Array[] = FACET_DEFS.map((f) => new Int32Array(s.dicts[f.key as ScalarKey | ArrayKey].size + 1));
    const failIdx = facetFilters.map((c) => facetIdx.get(c.facet!)!);
    let textScore: Float64Array | null = null;
    let scoreById: Map<string, number> | null = null;
    if (scores) {
      let conv = this.converted.get(scores);
      if (!conv || conv.snap !== s) {
        const bySlot = new Float64Array(s.n).fill(NaN);
        const byId = new Map<string, number>(); // only ids outside the snapshot (new since the last rebuild)
        for (let x = 0; x < scores.size; x++) {
          const slot = s.slotOf.get(scores.ids[x]!);
          if (slot !== undefined) bySlot[slot] = scores.scores[x]!;
          else byId.set(scores.ids[x]!, scores.scores[x]!);
        }
        conv = { snap: s, bySlot, byId };
        this.converted.set(scores, conv);
      }
      textScore = conv.bySlot;
      scoreById = conv.byId;
    }
    const overlayScore = (id: string): number | undefined => {
      if (!scores) return undefined;
      const hit = scoreById!.get(id);
      if (hit !== undefined) return hit;
      const slot = s.slotOf.get(id); // changed job that is also in the snapshot
      return slot !== undefined && !Number.isNaN(textScore![slot]!) ? textScore![slot]! : undefined;
    };
    // page candidates: sort keys exactly like orderBy() in engine.ts
    const sort: SortBy = q.sort;
    const k = page.offset + page.limit;
    const top = new TopK(k);
    const overlayJobs: OverlayJob[] = [];
    const key1 = (slot: number): number => {
      if (slot < 0) {
        const o = overlayJobs[-1 - slot]!;
        if (sort === "newest") return o.postedMs;
        if (sort === "salary") return Number.isNaN(o.salary) ? -Infinity : o.salary;
        return scores ? overlayScore(o.id)! : o.rankBase;
      }
      if (sort === "newest") return s.postedMs[slot]!;
      if (sort === "salary") return Number.isNaN(s.salary[slot]!) ? -Infinity : s.salary[slot]!;
      return textScore ? textScore[slot]! : s.rankBase[slot]!;
    };
    const key2 = (slot: number): number => (sort === "salary" ? (slot < 0 ? overlayJobs[-1 - slot]!.rankBase : s.rankBase[slot]!) : 0);
    const idOf = (slot: number): string => (slot < 0 ? overlayJobs[-1 - slot]!.id : s.ids[slot]!);
    const better = (a: number, b: number): boolean => {
      const a1 = key1(a);
      const b1 = key1(b);
      if (a1 !== b1) return a1 > b1;
      const a2 = key2(a);
      const b2 = key2(b);
      if (a2 !== b2) return a2 > b2;
      return idOf(a) < idOf(b);
    };

    // Pass 1 — per slot: 0 = excluded, 1 = passes every filter, 2 + f = fails only facet f's own filter.
    const state = new Uint8Array(s.n);
    let total = 0;
    outer: for (let i = 0; i < s.n; i++) {
      if (s.alive[i] === 0) continue;
      if (textScore && Number.isNaN(textScore[i]!)) continue;
      for (const g of global) if (!g.test(s, i)) continue outer;
      let fails = 0;
      let failed = -1;
      for (let f = 0; f < facetFilters.length; f++) {
        if (!facetFilters[f]!.test(s, i)) {
          if (++fails > 1) continue outer;
          failed = failIdx[f]!;
        }
      }
      if (fails === 0) {
        state[i] = 1;
        total++;
        if (k > 0) top.offer(i, better);
      } else {
        state[i] = 2 + failed;
      }
    }
    // Pass 2 — column-major counting: one tight loop per facet over its typed arrays.
    FACET_DEFS.forEach((f, x) => {
      const c = counts[x]!;
      const own = 2 + x;
      if ((SCALARS as readonly string[]).includes(f.key)) {
        const col = s.scalar[f.key as ScalarKey];
        for (let i = 0; i < s.n; i++) {
          const st = state[i]!;
          if (st === 1 || st === own) c[col[i]!]!++;
        }
        c[NULL_CODE] = 0;
      } else {
        const { off, codes } = s.arr[f.key as ArrayKey];
        for (let i = 0; i < s.n; i++) {
          const st = state[i]!;
          if (st === 1 || st === own) for (let y = off[i]!, end = off[i + 1]!; y < end; y++) c[codes[y]!]!++;
        }
      }
    });

    // Overlay (changed since the snapshot): same logic with the JS predicates.
    const extra = FACET_DEFS.map(() => new Map<string, number>());
    const activeFacetFilters = FILTERS.filter((f) => f.active(q) && f.facet !== null);
    const activeGlobal = FILTERS.filter((f) => f.active(q) && f.facet === null);
    for (const [id, job] of this.overlay) {
      if (!job) continue;
      if (scores && overlayScore(id) === undefined) continue;
      if (!activeGlobal.every((f) => f.test(job.match, q, now))) continue;
      const failing = activeFacetFilters.filter((f) => !f.test(job.match, q, now));
      if (failing.length > 1) continue;
      const targets = failing.length === 0 ? FACET_DEFS.map((_, x) => x) : [facetIdx.get(failing[0]!.facet!)!];
      if (failing.length === 0) {
        total++;
        overlayJobs.push(job);
        if (k > 0) top.offer(-overlayJobs.length, better);
      }
      for (const x of targets) for (const v of job.values[FACET_DEFS[x]!.key]) extra[x]!.set(v, (extra[x]!.get(v) ?? 0) + 1);
    }

    const facets = {} as Record<FacetKey, FacetBucket[]>;
    FACET_DEFS.forEach((f, x) => {
      const dict = s.dicts[f.key as ScalarKey | ArrayKey];
      const merged = new Map<string, number>(extra[x]);
      const c = counts[x]!;
      for (let code = 0; code < dict.size; code++) {
        if (c[code]! > 0) merged.set(dict.values[code]!, (merged.get(dict.values[code]!) ?? 0) + c[code]!);
      }
      // same cut as SQL: ORDER BY count DESC, value COLLATE "C" (code-point order), top N + selected values
      const all = [...merged].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
      const selected = new Set(f.selected(q));
      const kept = f.top === null ? all : all.filter((e, idx) => idx < f.top! || selected.has(e[0]));
      const labels = f.labelJoin === "companies" ? s.labels.company : f.labelJoin === "sources" ? s.labels.source : null;
      facets[f.key] = toBuckets(f, kept.map(([value, count]) => ({ value, count, label: labels?.get(value) ?? null })), q);
    });
    const pageIds = top
      .sorted(better)
      .slice(page.offset, page.offset + page.limit)
      .map(idOf);
    return { facets: facets as Facets, total, pageIds };
  }
}

/** Bounded selection of the k best candidates (binary heap with the worst on top). */
class TopK {
  private readonly heap: number[] = [];
  constructor(private readonly k: number) {}
  offer(x: number, better: (a: number, b: number) => boolean): void {
    const h = this.heap;
    if (h.length < this.k) {
      h.push(x);
      let i = h.length - 1;
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (!better(h[p]!, h[i]!)) break; // parent must be worse than child
        [h[p], h[i]] = [h[i]!, h[p]!];
        i = p;
      }
      return;
    }
    if (!better(x, h[0]!)) return;
    h[0] = x;
    let i = 0;
    for (;;) {
      const l = 2 * i + 1;
      const r = l + 1;
      let worst = i;
      if (l < h.length && better(h[worst]!, h[l]!)) worst = l;
      if (r < h.length && better(h[worst]!, h[r]!)) worst = r;
      if (worst === i) break;
      [h[worst], h[i]] = [h[i]!, h[worst]!];
      i = worst;
    }
  }
  sorted(better: (a: number, b: number) => boolean): number[] {
    return [...this.heap].sort((a, b) => (better(a, b) ? -1 : better(b, a) ? 1 : 0));
  }
}

/** Relevance score of every open job matching the free text (one GIN statement), for FacetIndex.search. */
export async function textScores(db: Executor, text: TextMatch): Promise<TextScores | null> {
  const cond = textCondition(text);
  if (!cond) return null;
  const [row] = await db.queryIndexed<{ s: string | null }>(sql`
    SELECT string_agg(j.id || ' ' || (${relevanceScore(text)})::text, ',') AS s FROM jobs j WHERE j.status = 'open' AND ${cond}`);
  if (!row?.s) return { ids: [], scores: new Float64Array(0), size: 0 };
  const pairs = row.s.split(",");
  const ids = new Array<string>(pairs.length);
  const scores = new Float64Array(pairs.length);
  for (let x = 0; x < pairs.length; x++) {
    const pair = pairs[x]!;
    const sp = pair.indexOf(" ");
    ids[x] = pair.slice(0, sp);
    scores[x] = +pair.slice(sp + 1);
  }
  return { ids, scores, size: pairs.length };
}
