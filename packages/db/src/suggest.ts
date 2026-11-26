/**
 * Type-ahead suggestions from an in-memory index (titles, companies, cities, skills) rebuilt from the DB
 * at most every `ttlMs` (stale-while-revalidate). Also provides the value dictionary used to canonicalise
 * filter values ("bangalore" → "Bengaluru", "react" → "React").
 */
import { sql } from "drizzle-orm";
import type { SuggestResponse } from "@easyjobs/contract";
import type { Executor } from "./client";
import { CITY_ALIASES, type FilterDictionary } from "./search/filters";

const MAX_PER_LIST = 8;

interface Entry {
  text: string;
  norm: string;
  words: string[];
  count: number;
}
interface CompanyEntry extends Entry {
  slug: string;
  logoUrl: string | null;
}

export const normalizeForSuggest = (s: string): string =>
  s.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
const wordsOf = (norm: string): string[] => norm.split(/[^a-z0-9+#.]+/).filter(Boolean);
const entry = (text: string, count: number): Entry => {
  const norm = normalizeForSuggest(text);
  return { text, norm, words: wordsOf(norm), count };
};

function trigrams(s: string): Set<string> {
  const padded = `  ${s} `;
  const out = new Set<string>();
  for (let i = 0; i < padded.length - 2; i++) out.add(padded.slice(i, i + 3));
  return out;
}
function similarity(a: string, b: string): number {
  const ta = trigrams(a);
  const tb = trigrams(b);
  let common = 0;
  for (const t of ta) if (tb.has(t)) common++;
  return common / (ta.size + tb.size - common || 1);
}

/** 2 = whole string starts with q · 1 = every query token prefixes a word · 0 = no match. */
function matchScore(e: Entry, qNorm: string, qTokens: readonly string[]): number {
  if (qTokens.length === 0) return 1;
  if (e.norm.startsWith(qNorm)) return 2;
  return qTokens.every((t) => e.words.some((w) => w.startsWith(t))) ? 1 : 0;
}

function rank<T extends Entry>(list: readonly T[], qNorm: string, qTokens: readonly string[], limit = MAX_PER_LIST): T[] {
  const scored: { e: T; s: number }[] = [];
  for (const e of list) {
    const s = matchScore(e, qNorm, qTokens);
    if (s > 0) scored.push({ e, s });
  }
  scored.sort((a, b) => b.s - a.s || b.e.count - a.e.count || a.e.text.localeCompare(b.e.text));
  return scored.slice(0, limit).map((x) => x.e);
}

export class SuggestIndex {
  private titles: Entry[] = [];
  private companies: CompanyEntry[] = [];
  private locations: Entry[] = [];
  private skills: Entry[] = [];
  private dict: FilterDictionary = {};
  private builtAt = 0;
  private building: Promise<void> | null = null;

  constructor(
    private readonly db: Executor,
    private readonly ttlMs = 60_000,
  ) {}

  /** Rebuild now (coalesces concurrent calls). */
  refresh(): Promise<void> {
    if (!this.building) {
      this.building = this.build().finally(() => {
        this.building = null;
      });
    }
    return this.building;
  }

  /** Build on first use; afterwards refresh in the background when stale and serve the current data. */
  async ready(): Promise<void> {
    if (this.builtAt === 0) return this.refresh();
    if (Date.now() - this.builtAt > this.ttlMs) void this.refresh().catch(() => {});
  }

  /** New data arrived: refresh soon, but not more often than every 15 s (rebuilds read all open jobs). */
  invalidate(): void {
    if (this.builtAt === 0) return;
    this.builtAt = Math.min(this.builtAt, Date.now() - this.ttlMs + 15_000);
  }

  private async build(): Promise<void> {
    const [titles, companies, locations, skills, tags, sources] = await Promise.all([
      this.db.query<{ text: string; count: number }>(sql`
        SELECT title AS text, count(*)::int AS count FROM jobs WHERE status = 'open'
        GROUP BY title ORDER BY count DESC, title LIMIT 25000`),
      this.db.query<{ slug: string; name: string; logoUrl: string | null; openJobs: number }>(sql`
        SELECT slug, name, logo_url AS "logoUrl", open_jobs AS "openJobs" FROM companies
        WHERE open_jobs > 0 ORDER BY open_jobs DESC, name LIMIT 25000`),
      this.db.query<{ text: string; count: number }>(sql`
        SELECT u.v AS text, count(*)::int AS count FROM jobs j CROSS JOIN LATERAL unnest(j.cities) AS u(v)
        WHERE j.status = 'open' GROUP BY 1 ORDER BY 2 DESC LIMIT 5000`),
      this.db.query<{ text: string; count: number }>(sql`
        SELECT u.v AS text, count(*)::int AS count FROM jobs j CROSS JOIN LATERAL unnest(j.skills) AS u(v)
        WHERE j.status = 'open' GROUP BY 1 ORDER BY 2 DESC LIMIT 10000`),
      this.db.query<{ text: string }>(sql`
        SELECT DISTINCT u.v AS text FROM jobs j CROSS JOIN LATERAL unnest(j.tags) AS u(v) WHERE j.status = 'open' LIMIT 2000`),
      this.db.query<{ id: string }>(sql`SELECT id FROM sources`),
    ]);
    this.titles = titles.map((r) => entry(r.text, r.count));
    this.companies = companies.map((r) => ({ ...entry(r.name, r.openJobs), slug: r.slug, logoUrl: r.logoUrl, words: wordsOf(normalizeForSuggest(`${r.name} ${r.slug.replace(/-/g, " ")}`)) }));
    this.locations = locations.map((r) => entry(r.text, r.count));
    this.skills = skills.map((r) => entry(r.text, r.count));
    const lookup = (xs: readonly string[]): Map<string, string> => new Map(xs.map((x) => [x.toLowerCase(), x]));
    this.dict = {
      cities: lookup(locations.map((r) => r.text)),
      skills: lookup(skills.map((r) => r.text)),
      tags: lookup(tags.map((r) => r.text)),
      sources: lookup(sources.map((r) => r.id)),
    };
    this.builtAt = Date.now();
  }

  dictionary(): FilterDictionary {
    return this.dict;
  }

  suggest(q: string): SuggestResponse {
    const qNorm = normalizeForSuggest(q).slice(0, 100);
    const tokens = wordsOf(qNorm);

    let companies = rank(this.companies, qNorm, tokens);
    if (companies.length < 3 && qNorm.length >= 4) {
      // typo tolerance for company names ("amazn" → Amazon)
      const fuzzy = this.companies
        .filter((c) => !companies.includes(c))
        .map((c) => ({ c, s: Math.max(similarity(qNorm, c.norm), ...c.words.map((w) => similarity(qNorm, w))) }))
        .filter((x) => x.s >= 0.4)
        .sort((a, b) => b.s - a.s || b.c.count - a.c.count)
        .slice(0, MAX_PER_LIST - companies.length)
        .map((x) => x.c);
      companies = [...companies, ...fuzzy];
    }

    // Locations: direct matches + aliases (bangalore → Bengaluru) + "Remote".
    const locs = rank(this.locations, qNorm, tokens).map((e) => e.text);
    if (qNorm.length >= 2) {
      for (const [alias, canonical] of Object.entries(CITY_ALIASES)) {
        if (alias.startsWith(qNorm) && !locs.includes(canonical) && this.locations.some((l) => l.text === canonical)) locs.push(canonical);
      }
    }
    if (qNorm.length >= 2 && ["remote", "wfh", "work from home"].some((r) => r.startsWith(qNorm)) && !locs.includes("Remote")) locs.unshift("Remote");

    return {
      titles: rank(this.titles, qNorm, tokens).map((e) => e.text),
      companies: companies.slice(0, MAX_PER_LIST).map((c) => ({ slug: c.slug, name: c.text, logoUrl: c.logoUrl, openJobs: c.count })),
      locations: locs.slice(0, MAX_PER_LIST),
      skills: rank(this.skills, qNorm, tokens).map((e) => e.text),
    };
  }
}
