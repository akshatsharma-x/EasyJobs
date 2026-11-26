import {
  DEFAULT_SEARCH_QUERY,
  type FacetBucket,
  type Facets,
  type JobListItem,
  type JobsSearchResponse,
  type SearchQuery,
  type StreamEvent,
} from "@easyjobs/contract";
import { describe, expect, it } from "vitest";
import { createMockApi } from "@/lib/api/mock";
import {
  BASE_JOB_COUNT,
  CLOSED_JOB_COUNT,
  MOCK_COMPANIES,
  decodeLiveId,
  encodeLiveId,
  getBaseSpecs,
  salaryToInrYearly,
} from "@/lib/api/mock-data";

const NOW = Date.parse("2026-11-26T06:30:00.000Z");
const HOUR = 3_600_000;
const api = createMockApi({ now: () => NOW, latencyMs: 0, stream: false });

const query = (over: Partial<SearchQuery> = {}): SearchQuery => ({ ...DEFAULT_SEARCH_QUERY, pageSize: 50, ...over });
const search = (over: Partial<SearchQuery> = {}): Promise<JobsSearchResponse> => api.searchJobs(query(over));

async function everything(over: Partial<SearchQuery> = {}): Promise<JobListItem[]> {
  const first = await search({ ...over, page: 1 });
  const out = [...first.data];
  for (let page = 2; page <= first.totalPages; page++) out.push(...(await search({ ...over, page })).data);
  return out;
}

const inrOf = (job: JobListItem): number | null => {
  const inr = salaryToInrYearly(job.salary);
  return inr.max ?? inr.min;
};
const bucket = (facets: Facets, key: keyof Facets, value: string): FacetBucket | undefined => facets[key].find((b) => b.value === value);
const sum = (buckets: FacetBucket[]): number => buckets.reduce((n, b) => n + b.count, 0);

const PREDICATES: Record<keyof Facets, (job: JobListItem, value: string) => boolean> = {
  type: (j, v) => j.jobType === v,
  level: (j, v) => j.experienceLevel === v,
  mode: (j, v) => j.workMode === v,
  category: (j, v) => j.category === v,
  location: (j, v) => (v === "Remote" ? j.isRemote : j.locations.some((l) => l.startsWith(`${v},`))),
  company: (j, v) => j.company.slug === v,
  ctype: (j, v) => j.company.tags.includes(v),
  skills: (j, v) => j.skills.some((s) => s.toLowerCase() === v.toLowerCase()),
  batch: (j, v) => j.batches.includes(Number(v)),
  source: (j, v) => j.sources.some((s) => s.id === v),
  tag: (j, v) => j.tags.includes(v),
};

describe("dataset", () => {
  it("has ~400 open jobs, deterministic across instances", async () => {
    const res = await search();
    expect(res.total).toBe(BASE_JOB_COUNT);
    expect(res.data).toHaveLength(50);
    expect(res.tookMs).toBeGreaterThanOrEqual(1);
    const other = createMockApi({ now: () => NOW + 5 * HOUR, latencyMs: 0, stream: false });
    const a = (await search({ sort: "newest" })).data.map((j) => j.id);
    const b = (await other.searchJobs(query({ sort: "newest" }))).data.map((j) => j.id);
    expect(b).toEqual(a);
  });

  it("materialises times relative to now", async () => {
    const jobs = await everything();
    const ages = jobs.map((j) => NOW - Date.parse(j.postedAt));
    expect(Math.min(...ages)).toBeGreaterThan(0);
    expect(Math.max(...ages)).toBeLessThanOrEqual(30 * 24 * HOUR);
    expect(ages.filter((a) => a < 24 * HOUR).length).toBeGreaterThan(60);
  });

  it("produces realistic, valid list items", async () => {
    for (const job of await everything()) {
      expect(job.slug).toMatch(/^[a-z0-9-]+$/);
      expect(job.skills.length).toBeLessThanOrEqual(8);
      expect(job.sources.length).toBeGreaterThan(0);
      expect(job.applyUrl).toMatch(/^https:\/\//);
      expect(job.summary?.length ?? 0).toBeLessThanOrEqual(280);
      expect(job.isOfficial).toBe(job.sources.some((s) => s.kind === "ats" || s.kind === "career_site"));
      if (job.jobType === "internship") expect(job.experienceLevel).toBe("intern");
      if (job.isRemote) expect(job.workMode).toBe("remote");
      if (job.sources.length > 1) {
        const rank = { career_site: 4, ats: 3, job_board: 2, aggregator: 1 } as const;
        const order = job.sources.map((s) => rank[s.kind]);
        expect(order).toEqual([...order].sort((x, y) => y - x));
      }
    }
  });
});

describe("text search", () => {
  it("prefix-matches title, company and skills (AND)", async () => {
    const react = await everything({ q: "react" });
    expect(react.length).toBeGreaterThan(0);
    for (const j of react) {
      const hay = `${j.title} ${j.company.name} ${j.skills.join(" ")}`.toLowerCase();
      expect(hay).toMatch(/(^|[^a-z])react/);
    }
    const both = await everything({ q: "data analyst" });
    expect(both.length).toBeGreaterThan(0);
    for (const j of both) expect(`${j.title} ${j.skills.join(" ")}`.toLowerCase()).toMatch(/data/);
    // "google" matches the company and skills such as "Google Analytics" / "Google Ads".
    const google = await everything({ q: "google" });
    expect(google.some((j) => j.company.slug === "google")).toBe(true);
    expect(google.every((j) => j.company.slug === "google" || j.skills.some((s) => s.toLowerCase().startsWith("google")))).toBe(true);
    // Company matches rank above skill-only matches.
    expect(google[0]?.company.slug).toBe("google");
  });

  it("keeps symbols such as c++", async () => {
    const res = await everything({ q: "c++" });
    expect(res.length).toBeGreaterThan(0);
    expect(res.every((j) => j.skills.includes("C++"))).toBe(true);
  });

  it("returns an empty page for nonsense", async () => {
    const res = await search({ q: "zzqqxx" });
    expect(res).toMatchObject({ total: 0, totalPages: 0, data: [] });
  });
});

describe("filters", () => {
  it("every facet value narrows to exactly its facet count", async () => {
    const base = await search();
    for (const key of Object.keys(PREDICATES) as (keyof Facets)[]) {
      const top = base.facets[key][0];
      expect(top, `facet ${key} is empty`).toBeDefined();
      if (!top) continue;
      const value = key === "batch" ? [Number(top.value)] : [top.value];
      const res = await everything({ [key]: value } as Partial<SearchQuery>);
      expect(res.length, `${key}=${top.value}`).toBe(top.count);
      expect(res.every((j) => PREDICATES[key](j, top.value)), `${key}=${top.value}`).toBe(true);
    }
  });

  it("ORs values within a key and ANDs across keys", async () => {
    const base = await search();
    const intern = bucket(base.facets, "level", "intern")?.count ?? 0;
    const fresher = bucket(base.facets, "level", "fresher")?.count ?? 0;
    expect((await search({ level: ["intern", "fresher"] })).total).toBe(intern + fresher);
    const combo = await everything({ level: ["intern"], location: ["Bengaluru"] });
    expect(combo.length).toBeGreaterThan(0);
    expect(combo.every((j) => j.experienceLevel === "intern" && PREDICATES.location(j, "Bengaluru"))).toBe(true);
  });

  it("matches locations case-insensitively and Remote via isRemote", async () => {
    expect((await search({ location: ["bengaluru"] })).total).toBe((await search({ location: ["Bengaluru"] })).total);
    const remote = await everything({ location: ["Remote"] });
    expect(remote.length).toBeGreaterThan(0);
    expect(remote.every((j) => j.isRemote)).toBe(true);
  });

  it("applies official, posted, salaryMin, exp and country", async () => {
    const total = (await search()).total;
    const official = await everything({ official: true });
    expect(official.length).toBeGreaterThan(0);
    expect(official.length).toBeLessThan(total);
    expect(official.every((j) => j.isOfficial)).toBe(true);

    const day = await everything({ posted: "24h" });
    expect(day.every((j) => NOW - Date.parse(j.postedAt) <= 24 * HOUR)).toBe(true);
    const hour = await everything({ posted: "1h" });
    expect(hour.length).toBeLessThan(day.length);

    const rich = await everything({ salaryMin: 2_000_000 });
    expect(rich.length).toBeGreaterThan(0);
    expect(rich.every((j) => (inrOf(j) ?? 0) >= 2_000_000)).toBe(true);
    expect((await search({ salaryMin: 0 })).total).toBe(total);

    const exp = await everything({ exp: 3 });
    expect(exp.length).toBeGreaterThan(0);
    expect(exp.every((j) => (j.experienceMin ?? 0) <= 3 && 3 <= (j.experienceMax ?? Number.POSITIVE_INFINITY))).toBe(true);

    const us = await everything({ country: ["US"] });
    expect(us.every((j) => j.locations.some((l) => l.endsWith(", US")))).toBe(true);
    const india = (await search({ country: ["in"] })).total;
    expect(india).toBeGreaterThan(total * 0.8);
  });
});

describe("disjunctive facets", () => {
  it("a facet's own selection does not change its counts", async () => {
    const base = await search();
    const intern = await search({ level: ["intern"] });
    expect(intern.facets.level).toEqual(base.facets.level);
    expect(sum(intern.facets.type)).toBe(intern.total);
    expect(intern.facets.type).not.toEqual(base.facets.type);
    expect(bucket(intern.facets, "type", "internship")?.count).toBe(intern.total);
  });

  it("other selections do change the counts", async () => {
    const blr = await search({ location: ["Bengaluru"] });
    const both = await search({ level: ["intern"], location: ["Bengaluru"] });
    const intern = await search({ level: ["intern"] });
    expect(both.facets.level).toEqual(blr.facets.level);
    expect(both.facets.location).toEqual(intern.facets.location);
    expect(bucket(both.facets, "level", "intern")?.count).toBe(both.total);
  });

  it("keeps selected values with zero matches and labels buckets", async () => {
    const res = await search({ company: ["acme-unknown"] });
    expect(res.total).toBe(0);
    expect(bucket(res.facets, "company", "acme-unknown")).toMatchObject({ count: 0 });
    const base = await search();
    expect(bucket(base.facets, "level", "intern")?.label).toBe("Internship");
    expect(bucket(base.facets, "source", "coursejoiner")?.label).toBe("CourseJoiner");
    expect(bucket(base.facets, "company", "google")?.label).toBe("Google");
    expect(base.facets.skills.length).toBeLessThanOrEqual(40);
    for (const key of Object.keys(base.facets) as (keyof Facets)[]) {
      const counts = base.facets[key].map((b) => b.count);
      expect(counts).toEqual([...counts].sort((a, b) => b - a));
      expect(counts.every((c) => c > 0)).toBe(true);
    }
  });
});

describe("sorting and pagination", () => {
  it("sorts by newest", async () => {
    const times = (await everything({ sort: "newest" })).map((j) => Date.parse(j.postedAt));
    expect(times).toEqual([...times].sort((a, b) => b - a));
  });

  it("sorts by salary with nulls last", async () => {
    const values = (await everything({ sort: "salary" })).map(inrOf);
    const firstNull = values.indexOf(null);
    expect(firstNull).toBeGreaterThan(0);
    expect(values.slice(firstNull).every((v) => v === null)).toBe(true);
    const numbers = values.slice(0, firstNull) as number[];
    expect(numbers).toEqual([...numbers].sort((a, b) => b - a));
  });

  it("ranks title matches first for relevance", async () => {
    const res = await search({ q: "data analyst" });
    expect(res.data[0]?.title.toLowerCase()).toContain("data analyst");
    const plain = await search();
    expect(plain.data.length).toBe(50);
  });

  it("paginates without overlap", async () => {
    const p1 = await search({ pageSize: 20, page: 1 });
    const p2 = await search({ pageSize: 20, page: 2 });
    expect(p1.totalPages).toBe(Math.ceil(p1.total / 20));
    const ids = new Set(p1.data.map((j) => j.id));
    expect(p2.data.some((j) => ids.has(j.id))).toBe(false);
    const beyond = await search({ page: 99 });
    expect(beyond.data).toEqual([]);
    expect(beyond.total).toBe(p1.total);
  });
});

describe("jobs, similar, closed", () => {
  it("resolves details with rich descriptions", async () => {
    const [first] = (await search()).data;
    const detail = await api.getJob(first?.id ?? "");
    expect(detail?.status).toBe("open");
    expect(detail?.descriptionHtml).toContain("<h3>About the role</h3>");
    expect(detail?.descriptionHtml).toContain("<h3>Perks &amp; benefits</h3>");
    expect(detail?.descriptionHtml).not.toMatch(/<(script|style|img|iframe)/i);
    expect(await api.getJob("does-not-exist")).toBeNull();
  });

  it("keeps closed jobs resolvable but out of search", async () => {
    const closed = getBaseSpecs().filter((s) => s.status === "closed");
    expect(closed).toHaveLength(CLOSED_JOB_COUNT);
    const openIds = new Set((await everything()).map((j) => j.id));
    for (const spec of closed) {
      expect(openIds.has(spec.id)).toBe(false);
      const detail = await api.getJob(spec.id);
      expect(detail?.status).toBe("closed");
      expect(detail && detail.validThrough !== null ? Date.parse(detail.validThrough) < NOW : true).toBe(true);
    }
  });

  it("returns similar open jobs, excluding the job itself", async () => {
    const [first] = (await search({ level: ["intern"] })).data;
    const id = first?.id ?? "";
    const similar = await api.similar(id);
    expect(similar.data.length).toBeGreaterThan(0);
    expect(similar.data.length).toBeLessThanOrEqual(6);
    expect(similar.data.some((j) => j.id === id)).toBe(false);
    expect((await api.similar(id, 3)).data.length).toBeLessThanOrEqual(3);
    expect((await api.similar(id, 50)).data.length).toBeLessThanOrEqual(12);
    expect((await api.similar("nope")).data).toEqual([]);
  });
});

describe("suggest, stats, companies", () => {
  it("suggests titles, companies, locations and skills", async () => {
    const goo = await api.suggest("goo");
    expect(goo.companies[0]?.slug).toBe("google");
    expect(goo.companies[0]?.openJobs).toBeGreaterThan(0);
    expect((await api.suggest("bang")).locations).toContain("Bengaluru");
    expect((await api.suggest("gurgaon")).locations).toContain("Gurugram");
    const analyst = await api.suggest("analyst");
    expect(analyst.titles.length).toBeGreaterThan(0);
    expect(analyst.titles.every((t) => t.toLowerCase().includes("analyst"))).toBe(true);
    expect((await api.suggest("react")).skills).toContain("React");
    const empty = await api.suggest("");
    for (const list of [empty.titles, empty.companies, empty.locations, empty.skills]) {
      expect(list.length).toBeGreaterThan(0);
      expect(list.length).toBeLessThanOrEqual(8);
    }
  });

  it("reports stats consistent with search", async () => {
    const stats = await api.stats();
    expect(stats.totalOpen).toBe(BASE_JOB_COUNT);
    expect(Object.values(stats.byLevel).reduce((a, b) => a + b, 0)).toBe(stats.totalOpen);
    expect(Object.values(stats.byType).reduce((a, b) => a + b, 0)).toBe(stats.totalOpen);
    expect(Object.keys(stats.byLevel)).toHaveLength(7);
    expect(Object.keys(stats.byType)).toHaveLength(7);
    expect(stats.newLast24h).toBe((await search({ posted: "24h" })).total);
    expect(stats.newLastHour).toBe((await search({ posted: "1h" })).total);
    expect(stats.companies).toBe((await search()).facets.company.length);
    const opens = stats.sources.map((s) => s.open);
    expect(opens).toEqual([...opens].sort((a, b) => b - a));
    expect(stats.sources.find((s) => s.id === "coursejoiner")?.kind).toBe("aggregator");
    expect(stats.lastUpdatedAt).toBe(new Date(NOW - 2 * 60_000).toISOString());
  });

  it("lists companies by open jobs", async () => {
    const res = await api.companies();
    expect(res.pageSize).toBe(24);
    expect(res.total).toBe(MOCK_COMPANIES.length);
    const counts = res.data.map((c) => c.openJobs);
    expect(counts).toEqual([...counts].sort((a, b) => b - a));
    const it = await api.companies({ ctype: ["indian_it"], pageSize: 100 });
    expect(it.data.length).toBeGreaterThan(0);
    expect(it.data.every((c) => c.tags.includes("indian_it"))).toBe(true);
    expect((await api.companies({ q: "goldman" })).data.map((c) => c.slug)).toEqual(["goldman-sachs"]);
    const page2 = await api.companies({ page: 2, pageSize: 10 });
    expect(page2.data).toHaveLength(10);
    const razorpay = await api.company("razorpay");
    expect(razorpay?.openJobs).toBe((await search({ company: ["razorpay"] })).total);
    expect(razorpay?.careersUrl).toMatch(/^https:\/\//);
    expect(await api.company("nope")).toBeNull();
  });
});

describe("live stream", () => {
  it("encodes and decodes self-describing live ids", () => {
    const id = encodeLiveId(NOW, 123_456_789, { level: 0, city: 3, salaryFloorLpa: 12, exp: 25 });
    expect(id).toMatch(/^lv-[0-9a-z]+-[0-9a-z]+-[0-9a-z_]+$/);
    expect(decodeLiveId(id)).toEqual({ postedAtMs: NOW, seed: 123_456_789, choices: { level: 0, city: 3, salaryFloorLpa: 12, exp: 25 } });
    expect(decodeLiveId(encodeLiveId(NOW, 7, {}))).toEqual({ postedAtMs: NOW, seed: 7, choices: {} });
    for (const bad of ["lv-", "lv-zz", "lv-abc-def-q1", "lv-abc-def-c1_c2", "ej0001", "lv-abc-def-c-1"]) expect(decodeLiveId(bad)).toBeNull();
  });

  it("emits biased jobs that any process can regenerate from the id", async () => {
    const live = createMockApi({ now: () => NOW, latencyMs: 0, stream: true, streamIntervalMs: [5, 15] });
    const filters: Partial<SearchQuery> = { level: ["intern"], location: ["Pune"], salaryMin: 300_000 };
    const events: StreamEvent[] = [];
    const job = await new Promise<JobListItem>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("no live job within 3 s")), 3000);
      const stop = live.subscribe(filters, (event) => {
        events.push(event);
        if (event.type === "job") {
          clearTimeout(timeout);
          stop();
          resolve(event.job);
        }
      });
    });
    expect(job.id.startsWith("lv-")).toBe(true);
    expect(job.experienceLevel).toBe("intern");
    expect(job.locations.some((l) => l.startsWith("Pune,"))).toBe(true);
    expect(inrOf(job) ?? 0).toBeGreaterThanOrEqual(300_000);
    expect(job.postedAt).toBe(new Date(NOW).toISOString());

    // The live job is now part of this instance's dataset…
    expect((await live.searchJobs(query())).total).toBe(BASE_JOB_COUNT + 1);
    expect((await live.stats()).totalOpen).toBe(BASE_JOB_COUNT + 1);
    // …and a fresh instance (another process) regenerates the identical detail from the id alone.
    const elsewhere = createMockApi({ now: () => NOW, latencyMs: 0, stream: false });
    const a = await live.getJob(job.id);
    const b = await elsewhere.getJob(job.id);
    expect(b).not.toBeNull();
    expect(b).toEqual(a);
    expect((await elsewhere.similar(job.id)).data.length).toBeGreaterThan(0);
  });

  it("sends stats to every subscriber and stops after unsubscribe", async () => {
    const live = createMockApi({ now: () => NOW, latencyMs: 0, stream: true, streamIntervalMs: [5, 10] });
    const seen: StreamEvent["type"][] = [];
    const stop = live.subscribe({ level: ["executive"], company: ["tcs"], mode: ["remote"] }, (e) => seen.push(e.type));
    await new Promise((r) => setTimeout(r, 80));
    stop();
    const count = seen.length;
    expect(seen).toContain("stats");
    await new Promise((r) => setTimeout(r, 60));
    expect(seen.length).toBe(count);
  });

  it("is a no-op when the stream is disabled (server)", () => {
    const calls: StreamEvent[] = [];
    const stop = api.subscribe({}, (e) => calls.push(e));
    stop();
    expect(calls).toEqual([]);
  });
});

describe("latency", () => {
  it("rejects with AbortError when aborted", async () => {
    const slow = createMockApi({ now: () => NOW, latencyMs: 200, stream: false });
    const controller = new AbortController();
    const pending = slow.searchJobs(query(), { signal: controller.signal });
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    const pre = new AbortController();
    pre.abort();
    await expect(slow.stats({ signal: pre.signal })).rejects.toMatchObject({ name: "AbortError" });
  });
});
