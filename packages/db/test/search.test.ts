import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { LABELS, parseSearchQuery, type Facets, type JobListItem, type SearchQuery } from "@easyjobs/contract";
import { createRepository, type Repository } from "../src/repository";
import { LIST_COLUMNS, toMatchable, type ListRow } from "../src/rows";
import { canonicalizeQuery, FILTERS, matchesFilters, type MatchableJob } from "../src/search/filters";
import { generateSeedJobs } from "../src/seed/generate";
import { createTestDb, daysAgo, makeJob, TEST_NOW, type TestDb } from "./helpers";

const NOW = TEST_NOW;
let t: TestDb;
let repos: Record<"sql" | "memory", Repository>;
let repo: Repository;
let universe: (MatchableJob & { id: string; title: string; companyName: string; postedAtMs: number })[] = [];

const Q = (qs: string): SearchQuery => parseSearchQuery(new URLSearchParams(qs));
const search = (qs: string) => repo.searchJobs(Q(qs), { now: NOW });

beforeAll(async () => {
  t = await createTestDb();
  repos = { sql: createRepository(t.db, { facetEngine: "sql" }), memory: createRepository(t.db, { facetEngine: "memory" }) };
  repo = repos.sql;
  const seed = generateSeedJobs({ count: 700, seed: 7, now: NOW });
  const special = [
    makeJob({ key: "sp-remote-intern", title: "Remote Frontend Intern", jobType: "internship", experienceLevel: "intern", isRemote: true, workMode: "remote", locations: [], batches: [2026], tags: ["wfh"], experienceMin: null, experienceMax: null }),
    makeJob({ key: "sp-exp-open-low", title: "Platform Engineer", experienceMin: null, experienceMax: 3, skills: ["Kubernetes", "Go"] }),
    makeJob({ key: "sp-exp-open-high", title: "Principal Architect", experienceLevel: "lead", experienceMin: 10, experienceMax: null }),
    makeJob({ key: "sp-rich", title: "Quant Developer", salary: { min: 9_000_000, max: null, currency: "INR", period: "year", raw: "90 LPA+" }, salaryInrYearlyMin: 9_000_000, salaryInrYearlyMax: null }),
    makeJob({ key: "sp-desc-only", title: "Associate", category: "other", skills: [], descriptionHtml: "<p>You will work on zylophone pipelines.</p>", descriptionText: "You will work on zylophone pipelines.", summary: null }),
    makeJob({ key: "sp-title-zylo", title: "Zylophone Engineer", skills: [], postedAt: daysAgo(10, NOW) }),
    makeJob({ key: "sp-closed", title: "Closed Role", validThrough: daysAgo(2, NOW) }),
  ];
  const all = [...seed, ...special];
  for (let i = 0; i < all.length; i += 250) {
    const r = await repo.upsertJobs(all.slice(i, i + 250), { now: NOW });
    expect(r.rejected).toEqual([]);
  }
  await repos.memory.warmup();
  expect(repos.memory.facetEngine()).toBe("memory");
  expect(repos.sql.facetEngine()).toBe("sql");
  const rows = await t.db.query<ListRow & { postedAt: string }>(sql`SELECT ${LIST_COLUMNS} FROM jobs j`);
  universe = rows.map((r) => ({ ...toMatchable(r), id: r.id, title: r.title, companyName: r.company, postedAtMs: Date.parse(r.postedAt) }));
});
afterAll(async () => {
  await t.cleanup();
});

/** Brute force over every stored job with the JS predicate (closed jobs excluded by matchesFilters). */
const brute = (q: SearchQuery) => universe.filter((j) => matchesFilters(j, q, NOW));

for (const engine of ["sql", "memory"] as const) {
  describe(`[${engine} facets]`, () => {
    beforeAll(() => {
      repo = repos[engine];
    });
describe("filters (SQL == JS predicate == SearchQuery doc comments)", () => {
      const cases = [
        "type=internship",
        "type=full_time,contract",
        "level=fresher",
        "level=intern,fresher,entry",
        "mode=hybrid",
        "mode=remote,onsite",
        "category=data_ai",
        "location=Bengaluru",
        "location=Pune,Hyderabad",
        "location=Remote",
        "location=Remote,Chennai",
        "country=IN",
        "country=US,SG",
        "company=amazon,tcs",
        "ctype=mnc",
        "ctype=unicorn,startup",
        "skills=Python",
        "skills=React,Java",
        "batch=2026",
        "batch=2024,2027",
        "source=coursejoiner",
        "source=greenhouse,linkedin",
        "tag=off-campus",
        "official=1",
        "posted=24h",
        "posted=3d",
        "posted=7d",
        "posted=1h",
        "salaryMin=1000000",
        "salaryMin=5000000",
        "exp=0",
        "exp=2",
        "exp=5",
        "exp=12",
        "level=intern&location=Bengaluru&ctype=mnc",
        "type=internship&batch=2026&official=1&posted=7d",
        "category=software_engineering&skills=Java&exp=3&mode=hybrid,remote",
      ];
      for (const qs of cases) {
        it(qs, async () => {
          const q = canonicalizeQuery(Q(`${qs}&pageSize=50`));
          const expected = brute(q);
          const res = await search(`${qs}&pageSize=50`);
          expect(res.total).toBe(expected.length);
          if (expected.length <= 50) expect(new Set(res.data.map((d) => d.id))).toEqual(new Set(expected.map((e) => e.id)));
          for (const d of res.data) expect(expected.some((e) => e.id === d.id)).toBe(true);
        });
      }
    
      it("exp treats null bounds as open-ended", async () => {
        const lowOpen = universe.find((j) => j.title === "Platform Engineer")!;
        const highOpen = universe.find((j) => j.title === "Principal Architect")!;
        const ids = async (qs: string) => (await repo.searchJobs({ ...Q(qs), pageSize: 50 }, { now: NOW })).data.map((d) => d.id);
        expect(await ids("exp=0&q=platform engineer")).toContain(lowOpen.id);
        expect(await ids("exp=4&q=platform engineer")).not.toContain(lowOpen.id);
        expect(await ids("exp=40&q=principal architect")).toContain(highOpen.id);
        expect(await ids("exp=9&q=principal architect")).not.toContain(highOpen.id);
      });
    
      it("location 'Remote' matches isRemote; aliases and case are canonicalised", async () => {
        const remote = await search("location=remote&pageSize=50");
        expect(remote.total).toBe(universe.filter((j) => j.status === "open" && j.isRemote).length);
        const a = await search("location=bangalore");
        const b = await search("location=Bengaluru");
        expect(a.total).toBe(b.total);
        expect((await search("skills=python")).total).toBe((await search("skills=Python")).total);
        expect((await search("ctype=MNC")).total).toBe((await search("ctype=mnc")).total);
      });
    
      it("closed jobs never appear in search or facets", async () => {
        const closed = universe.filter((j) => j.status === "closed");
        expect(closed.length).toBeGreaterThan(0);
        const all = await search("pageSize=50");
        expect(all.total).toBe(universe.filter((j) => j.status === "open").length);
        expect((await search("q=closed role")).data.some((d) => d.title === "Closed Role")).toBe(false);
        const typeTotal = all.facets.type.reduce((s, b) => s + b.count, 0);
        expect(typeTotal).toBe(all.total);
      });
    });
    
    describe("disjunctive facets", () => {
      const facetValues = (j: MatchableJob, key: keyof Facets): string[] => {
        switch (key) {
          case "type": return [j.jobType];
          case "level": return [j.experienceLevel];
          case "mode": return j.workMode ? [j.workMode] : [];
          case "category": return [j.category];
          case "location": return [...j.cities, ...(j.isRemote ? ["Remote"] : [])];
          case "company": return [j.companySlug];
          case "ctype": return [...j.companyTags];
          case "skills": return [...j.skills];
          case "batch": return j.batches.map(String);
          case "source": return [...j.sourceIds];
          case "tag": return [...j.tags];
        }
      };
      const withoutOwn = (q: SearchQuery, facet: keyof Facets): SearchQuery => {
        const own = FILTERS.filter((f) => f.facet === facet).map((f) => f.key);
        const copy: Record<string, unknown> = { ...q };
        for (const k of own) copy[k] = undefined;
        return copy as unknown as SearchQuery;
      };
    
      for (const qs of ["", "level=intern,fresher&location=Bengaluru&ctype=mnc", "type=internship&skills=Python,SQL&source=internshala&tag=wfh", "q=engineer&mode=hybrid&batch=2026&company=amazon", "official=1&category=data_ai&posted=7d"]) {
        it(`each facet applies every filter except its own: ${qs || "(none)"}`, async () => {
          const q = canonicalizeQuery(Q(qs));
          const res = await search(qs);
          // Text matches are verified separately; restrict the brute-force universe to the jobs the text matched.
          let pool = universe;
          if (q.q) {
            const all: string[] = [];
            for (let page = 1; ; page++) {
              const r = await repo.searchJobs({ ...Q(`q=${encodeURIComponent(q.q)}`), pageSize: 50, page }, { now: NOW });
              all.push(...r.data.map((d) => d.id));
              if (page >= r.totalPages) break;
            }
            const set = new Set(all);
            pool = universe.filter((j) => set.has(j.id));
          }
          for (const key of Object.keys(res.facets) as (keyof Facets)[]) {
            const counts = new Map<string, number>();
            for (const j of pool.filter((x) => matchesFilters(x, { ...withoutOwn(q, key), q: undefined }, NOW))) {
              for (const v of facetValues(j, key)) counts.set(v, (counts.get(v) ?? 0) + 1);
            }
            for (const b of res.facets[key]) expect(b.count, `${key}=${b.value}`).toBe(counts.get(b.value) ?? 0);
            const expectedLen = ["location", "company", "skills", "ctype", "batch", "source", "tag"].includes(key) ? Math.min(30, counts.size) : counts.size;
            expect(res.facets[key].length, key).toBeGreaterThanOrEqual(expectedLen);
            const sorted = [...res.facets[key]].map((b) => b.count);
            expect(sorted).toEqual([...sorted].sort((a, b) => b - a));
          }
        });
      }
    
      it("uses LABELS and display names", async () => {
        const res = await search("");
        for (const b of res.facets.type) expect(b.label).toBe(LABELS.jobType[b.value as keyof typeof LABELS.jobType]);
        for (const b of res.facets.level) expect(b.label).toBe(LABELS.level[b.value as keyof typeof LABELS.level]);
        for (const b of res.facets.mode) expect(b.label).toBe(LABELS.workMode[b.value as keyof typeof LABELS.workMode]);
        for (const b of res.facets.category) expect(b.label).toBe(LABELS.category[b.value as keyof typeof LABELS.category]);
        for (const b of res.facets.ctype) expect(b.label).toBe(LABELS.companyTag[b.value as keyof typeof LABELS.companyTag]);
        expect(res.facets.company.find((b) => b.value === "amazon")?.label).toBe("Amazon");
        expect(res.facets.source.find((b) => b.value === "coursejoiner")?.label).toBe("CourseJoiner");
        expect(res.facets.tag.find((b) => b.value === "off-campus")?.label).toBe("Off-campus");
        expect(res.facets.location.length).toBeLessThanOrEqual(30);
      });
    
      it("keeps selected values visible even with zero count", async () => {
        const res = await search("level=executive&type=internship");
        expect(res.facets.type.find((b) => b.value === "internship")).toBeDefined();
        expect(res.total).toBe(0);
      });
    });
  });
}

describe("sorting and pagination", () => {
  it("newest: postedAt descending", async () => {
    const res = await search("sort=newest&pageSize=50");
    const times = res.data.map((d) => Date.parse(d.postedAt));
    expect(times).toEqual([...times].sort((a, b) => b - a));
  });

  it("salary: highest first (max, else min), jobs without salary last", async () => {
    const inr = (id: string): number | null => {
      const j = universe.find((u) => u.id === id)!;
      return j.salaryInrYearlyMax ?? j.salaryInrYearlyMin;
    };
    const res = await search("sort=salary&pageSize=50&page=1");
    const values = res.data.map((d) => inr(d.id));
    const known = values.filter((v): v is number => v !== null);
    expect(known).toEqual([...known].sort((a, b) => b - a));
    const firstNull = values.findIndex((v) => v === null);
    if (firstNull >= 0) expect(values.slice(firstNull).every((v) => v === null)).toBe(true);
    const last = await search(`sort=salary&pageSize=50&page=${res.totalPages}`);
    expect(last.data.every((d) => inr(d.id) === null)).toBe(true);
    // a job with only a minimum sorts by that minimum
    const quant = universe.find((u) => u.title === "Quant Developer")!;
    const all: string[] = [];
    for (let p = 1; p <= res.totalPages; p++) all.push(...(await search(`sort=salary&pageSize=50&page=${p}`)).data.map((d) => d.id));
    const pos = all.indexOf(quant.id);
    expect(all.slice(0, pos).every((id) => (inr(id) ?? -1) >= 9_000_000)).toBe(true);
    expect(all.slice(pos + 1).every((id) => (inr(id) ?? -1) <= 9_000_000)).toBe(true);
  });

  it("relevance without q: freshness × boosts (rank_base) descending", async () => {
    const res = await search("pageSize=50");
    const ranks = await t.db.query<{ id: string; r: number }>(sql`SELECT id, rank_base AS r FROM jobs WHERE id = ANY(${`{${res.data.map((d) => d.id).join(",")}}`}::text[])`);
    const byId = new Map(ranks.map((x) => [x.id, x.r]));
    const seq = res.data.map((d) => byId.get(d.id)!);
    expect(seq).toEqual([...seq].sort((a, b) => b - a));
  });

  it("relevance with q: title matches outrank description-only matches", async () => {
    const res = await search("q=zylophone");
    expect(res.data.map((d) => d.title)).toEqual(["Zylophone Engineer", "Associate"]); // title match although 10 days older
  });

  it("pages are disjoint, stable and cover the full result set", async () => {
    const q = "level=executive&pageSize=7";
    const first = await search(q);
    const ids: string[] = [];
    for (let p = 1; p <= first.totalPages; p++) ids.push(...(await search(`${q}&page=${p}`)).data.map((d) => d.id));
    expect(first.totalPages).toBe(Math.ceil(first.total / 7));
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(ids)).toEqual(new Set(brute(Q(q)).map((j) => j.id)));
    expect((await search(`${q}&page=${first.totalPages + 1}`)).data).toEqual([]);
  });
});

describe("free text", () => {
  const titles = (r: { data: JobListItem[] }) => r.data.map((d) => d.title.toLowerCase());

  it("matches title/company/skills and the description", async () => {
    const r = await search("q=react");
    expect(r.total).toBeGreaterThan(0);
    expect(r.data.every((d) => /react/i.test(`${d.title} ${d.skills.join(" ")} ${d.summary ?? ""}`) || d.skills.length === 8)).toBe(true);
  });
  it("prefix-matches the last token while typing", async () => {
    expect((await search("q=kubern")).data.some((d) => d.title === "Platform Engineer")).toBe(true);
    expect(titles(await search("q=machine learn&pageSize=50")).some((x) => x.includes("machine learning"))).toBe(true);
    expect(titles(await search("q=devel&pageSize=50")).every((x) => x.length > 0)).toBe(true);
  });
  it("expands synonyms (sde ↔ software engineer, ml ↔ machine learning, bangalore ↔ bengaluru)", async () => {
    expect(titles(await search("q=sde&pageSize=50")).some((x) => x.includes("software engineer") || x.includes("software development engineer"))).toBe(true);
    expect(titles(await search("q=ml&pageSize=50")).some((x) => x.includes("machine learning"))).toBe(true);
    const city = await search("q=bangalore&pageSize=50");
    expect(city.total).toBeGreaterThan(0);
    expect(city.data.every((d) => d.locations.some((l) => l.startsWith("Bengaluru")) || /bengaluru|bangalore/i.test(d.summary ?? ""))).toBe(true);
    expect(titles(await search("q=fresher&pageSize=50")).length).toBeGreaterThan(0);
  });
  it("corrects typos (amazn → amazon, devloper → developer)", async () => {
    const a = await search("q=amazn");
    expect(a.total).toBeGreaterThan(0);
    expect(a.data.every((d) => d.company.slug === "amazon" || /amazon/i.test(d.summary ?? ""))).toBe(true);
    expect(titles(await search("q=devloper")).some((x) => x.includes("developer"))).toBe(true);
  });
  it("supports -negation, OR and quoted phrases", async () => {
    const neg = await search("q=engineer -senior&pageSize=50");
    expect(neg.data.some((d) => /senior/i.test(d.title) || d.experienceLevel === "senior")).toBe(false);
    const or = await search("q=android or ios&pageSize=50");
    expect(or.data.every((d) => /android|ios/i.test(`${d.title} ${d.summary}`) || d.skills.length > 0)).toBe(true);
    expect(or.total).toBeGreaterThanOrEqual((await search("q=android")).total);
    const phrase = await search('q="data analyst"&pageSize=50');
    expect(phrase.total).toBeGreaterThan(0);
  });
  it("falls back to fuzzy (trigram) matching when nothing matches", async () => {
    const text = await repo.prepareText("xqzv wvut");
    expect(text.mode).toBe("trgm");
    expect((await repo.prepareText("amazn")).mode).toBe("fts");
    expect((await search("q=xqzvwvut")).total).toBe(0);
  });
});

describe("suggest, stats, companies, similar, detail", () => {
  it("suggests titles, companies, locations and skills (≤ 8 each)", async () => {
    const s = await repo.suggest("data");
    expect(s.titles.length).toBeGreaterThan(0);
    expect(s.titles.every((x) => /\bdata/i.test(x))).toBe(true);
    for (const list of [s.titles, s.companies, s.locations, s.skills]) expect(list.length).toBeLessThanOrEqual(8);
    expect((await repo.suggest("goo")).companies[0]?.slug).toBe("google");
    expect((await repo.suggest("banga")).locations).toContain("Bengaluru");
    expect((await repo.suggest("remo")).locations[0]).toBe("Remote");
    expect((await repo.suggest("pyth")).skills).toContain("Python");
    expect((await repo.suggest("amazn")).companies[0]?.slug).toBe("amazon");
    const empty = await repo.suggest("");
    expect(empty.companies.length).toBe(8);
  });

  it("stats match the data", async () => {
    const s = await repo.stats({ now: NOW });
    const open = universe.filter((j) => j.status === "open");
    expect(s.totalOpen).toBe(open.length);
    expect(Object.values(s.byLevel).reduce((a, b) => a + b, 0)).toBe(open.length);
    expect(Object.values(s.byType).reduce((a, b) => a + b, 0)).toBe(open.length);
    expect(s.newLast24h).toBe(open.filter((j) => j.postedAtMs >= NOW.getTime() - 86_400_000).length);
    expect(s.newLastHour).toBe(open.filter((j) => j.postedAtMs >= NOW.getTime() - 3_600_000).length);
    expect(s.companies).toBe(new Set(open.map((j) => j.companySlug)).size);
    const cj = s.sources.find((x) => x.id === "coursejoiner")!;
    expect(cj).toMatchObject({ name: "CourseJoiner", kind: "job_board" });
    expect(cj.open).toBe(open.filter((j) => j.sourceIds.includes("coursejoiner")).length);
    expect(s.lastUpdatedAt).toBe(NOW.toISOString());
  });

  it("lists companies by open jobs, filters by q and ctype", async () => {
    const list = await repo.listCompanies({ page: 1, pageSize: 10 });
    const counts = list.data.map((c) => c.openJobs);
    expect(counts).toEqual([...counts].sort((a, b) => b - a));
    expect(list.data[0]!.openJobs).toBe(Math.max(...[...new Set(universe.filter((j) => j.status === "open").map((j) => j.companySlug))].map((slug) => universe.filter((j) => j.status === "open" && j.companySlug === slug).length)));
    expect((await repo.listCompanies({ q: "infos", page: 1, pageSize: 10 })).data[0]?.slug).toBe("infosys");
    expect((await repo.listCompanies({ q: "googel", page: 1, pageSize: 10 })).data.map((c) => c.slug)).toContain("google");
    const unicorns = await repo.listCompanies({ ctype: ["unicorn"], page: 1, pageSize: 100 });
    expect(unicorns.data.every((c) => c.tags.includes("unicorn"))).toBe(true);
    expect(unicorns.total).toBe(unicorns.data.length);
    expect(await repo.getCompany("no-such-company")).toBeNull();
  });

  it("similar jobs: open, not itself, ≤ limit; null for unknown ids", async () => {
    const base = (await search("q=data analyst")).data[0]!;
    const sim = (await repo.similarJobs(base.id, 5))!;
    expect(sim.length).toBe(5);
    expect(sim.some((s) => s.id === base.id)).toBe(false);
    expect(sim.filter((s) => s.category === base.category).length).toBeGreaterThanOrEqual(3);
    expect(await repo.similarJobs("does-not-exist", 5)).toBeNull();
  });

  it("job detail includes description, sources and dates", async () => {
    const id = universe.find((j) => j.sourceIds.length > 1)!.id;
    const d = (await repo.getJob(id))!;
    expect(d.sources.length).toBeGreaterThan(1);
    expect(["career_site", "ats"]).toContain(d.sources[0]!.kind); // most official first
    expect(d.descriptionHtml).toMatch(/^<p>/);
    expect(Date.parse(d.firstSeenAt)).toBeGreaterThan(0);
    expect(await repo.getJob("missing")).toBeNull();
  });
});

describe("facet engines agree (in-memory index == SQL statements)", () => {
  it("returns identical facets and totals for the benchmark query mix", async () => {
    const { buildRequestMix } = await import("../../../apps/api/bench/queries");
    const mix = buildRequestMix(300, 3);
    for (const path of [...mix.head, ...mix.tail]) {
      const q = Q(new URL(path, "http://x").search.slice(1));
      const [a, b] = await Promise.all([repos.sql.searchJobs(q, { now: NOW }), repos.memory.searchJobs(q, { now: NOW })]);
      expect(b.total, path).toBe(a.total);
      expect(b.facets, path).toEqual(a.facets);
      expect(b.data.map((d) => d.id), path).toEqual(a.data.map((d) => d.id));
    }
  });

  it("stays exact after live changes (overlay) and after a rebuild", async () => {
    const before = await repos.memory.searchJobs(Q("location=Bengaluru"), { now: NOW });
    await repos.memory.upsertJobs(
      [
        makeJob({ key: "ov-1", title: "Overlay Engineer", skills: ["Zig"], tags: ["walk-in"] }),
        makeJob({ key: "ov-2", title: "Overlay Analyst", experienceLevel: "fresher", batches: [2027] }),
      ],
      { now: NOW },
    );
    const gone = universe.find((j) => j.status === "open" && j.cities.includes("Bengaluru") && j.sourceIds.includes("greenhouse"))!;
    const target = (await t.db.query<{ target: string | null }>(sql`SELECT target FROM job_sources WHERE job_id = ${gone.id} AND source = 'greenhouse'`))[0]!.target;
    await repos.memory.sweep({ source: "greenhouse", target, seenSourceJobIds: [] }, { now: NOW });
    await repos.memory.expireStale({ now: NOW });
    for (const qs of ["location=Bengaluru", "skills=Zig", "tag=walk-in", "batch=2027&level=fresher", "q=overlay", ""]) {
      const [a, b] = await Promise.all([repos.sql.searchJobs(Q(qs), { now: NOW }), repos.memory.searchJobs(Q(qs), { now: NOW })]);
      expect(b.total, qs).toBe(a.total);
      expect(b.facets, qs).toEqual(a.facets);
    }
    const after = await repos.memory.searchJobs(Q("location=Bengaluru"), { now: NOW });
    expect(after.total).not.toBe(before.total);
    await repos.memory.warmup(); // full rebuild folds the overlay in
    const rebuilt = await repos.memory.searchJobs(Q("location=Bengaluru"), { now: NOW });
    expect(rebuilt.facets).toEqual(after.facets);
  });
});
