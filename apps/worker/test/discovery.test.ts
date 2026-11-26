import { afterAll, describe, expect, it } from "vitest";
import { join } from "node:path";
import { discoverAll, discoverNormalizer, discoverRegistry, discoverScrapers, validateScraper, type ScraperCache } from "../src/discovery";
import { buildTasks } from "../src/tasks";
import { cleanupTempDirs, fakeScraper, memoryLogger, sampleRegistry, tempDir, writeFiles } from "./helpers";

const PKG = (name: string): string => JSON.stringify({ name: `@easyjobs/scraper-${name}`, type: "module", main: "./src/index.ts" });

/** Self-contained scraper module source (no imports, so it runs from a temp dir). */
const scraperSource = (id: string, extra = ""): string => `{
  id: ${JSON.stringify(id)}, name: ${JSON.stringify(`Fake ${id}`)}, kind: "job_board", intervalMinutes: 30, ${extra}
  async *scrape() { yield { source: ${JSON.stringify(id)}, sourceKind: "job_board", sourceJobId: "1", sourceUrl: "https://x.test/1", target: null, applyUrl: null, title: "T", company: "C", locations: [], descriptionHtml: null, postedAt: null }; },
}`;

function fakeRepo(): string {
  const root = tempDir("p05-repo-");
  const counter = `(globalThis.__p05Imports ??= {})`;
  writeFiles(root, {
    "packages/scrapers/alpha/package.json": PKG("alpha"),
    "packages/scrapers/alpha/src/index.ts": `${counter}.alpha = (${counter}.alpha ?? 0) + 1;
export const scrapers = [${scraperSource("alpha")}, ${scraperSource("alpha-ats", 'handlesAts: ["greenhouse", "lever", "not-an-ats"],')}];
export default scrapers;\n`,
    "packages/scrapers/broken-syntax/package.json": PKG("broken-syntax"),
    "packages/scrapers/broken-syntax/src/index.ts": "export const scrapers = [ { id: 'x', ;\n",
    "packages/scrapers/throws/package.json": PKG("throws"),
    "packages/scrapers/throws/src/index.ts": "throw new Error('kaboom at import time');\nexport const scrapers = [];\n",
    "packages/scrapers/wrong-shape/package.json": PKG("wrong-shape"),
    "packages/scrapers/wrong-shape/src/index.ts": "export const foo = 1;\n",
    "packages/scrapers/partial/package.json": PKG("partial"),
    "packages/scrapers/partial/src/index.ts": `export const scrapers = [${scraperSource("partial-ok")}, { id: "Bad ID", name: "x", kind: "ats", intervalMinutes: 5, scrape() {} }, { id: "no-scrape", name: "x", kind: "ats", intervalMinutes: 5 }, ${scraperSource("partial-ok")}];\n`,
    "packages/scrapers/default-only/package.json": PKG("default-only"),
    "packages/scrapers/default-only/src/helper.ts": `export const scraper = ${scraperSource("default-only")};\n`,
    "packages/scrapers/default-only/src/index.ts": "import { scraper } from './helper';\nexport default [scraper];\n",
    "packages/scrapers/dup/package.json": PKG("dup"),
    "packages/scrapers/dup/src/index.ts": `export const scrapers = [${scraperSource("alpha")}];\n`,
    "packages/scrapers/hangs/package.json": PKG("hangs"),
    "packages/scrapers/hangs/src/index.ts": "await new Promise(() => {});\nexport const scrapers = [];\n",
    "packages/scrapers/no-entry/package.json": PKG("no-entry"),
    "packages/scrapers/no-entry/README.md": "work in progress\n",
  });
  return root;
}

describe("discovery", () => {
  afterAll(cleanupTempDirs);

  it("loads valid scraper packages and reports (never throws on) broken ones", async () => {
    const root = fakeRepo();
    const log = memoryLogger();
    const d = await discoverScrapers({ scrapersDir: join(root, "packages", "scrapers"), importTimeoutMs: 1500, log });
    expect(d.scrapers.map((s) => s.scraper.id).sort()).toEqual(["alpha", "alpha-ats", "default-only", "partial-ok"]);
    const byDir = Object.fromEntries(d.packages.map((p) => [p.dir.split("/").pop(), p]));
    expect(byDir["alpha"]?.status).toBe("loaded");
    expect(byDir["broken-syntax"]?.status).toBe("broken");
    expect(byDir["broken-syntax"]?.problems[0]).toMatch(/import failed/);
    expect(byDir["throws"]?.problems[0]).toMatch(/kaboom at import time/);
    expect(byDir["wrong-shape"]?.problems[0]).toMatch(/neither `scrapers` nor a default/);
    expect(byDir["hangs"]?.problems[0]).toMatch(/timed out/);
    expect(byDir["no-entry"]?.status).toBe("no-entry");
    expect(byDir["partial"]?.status).toBe("loaded");
    expect(byDir["partial"]?.problems.join(" ")).toMatch(/"Bad ID" invalid: id must be a kebab-case/);
    expect(byDir["partial"]?.problems.join(" ")).toMatch(/"no-scrape" invalid: scrape must be a function/);
    expect(byDir["partial"]?.problems.join(" ")).toMatch(/duplicate id within package/);
    expect(d.warnings.join("\n")).toMatch(/duplicate scraper id "alpha" in @easyjobs\/scraper-dup/);
    // unknown ATS values are dropped, known ones kept
    expect(d.scrapers.find((s) => s.scraper.id === "alpha-ats")?.handlesAts).toEqual(["greenhouse", "lever"]);
    expect(log.lines.some((l) => l.level === "warn" && /broken-syntax/.test(l.msg))).toBe(true);
    expect(d.demo.scraper.id).toBe("demo");
  });

  it("re-scans: picks up new packages and fixed packages, without re-importing unchanged ones", async () => {
    const root = fakeRepo();
    const scrapersDir = join(root, "packages", "scrapers");
    const cache: ScraperCache = new Map();
    const g = globalThis as { __p05Imports?: Record<string, number> };
    const before = g.__p05Imports?.alpha ?? 0;
    const first = await discoverScrapers({ scrapersDir, importTimeoutMs: 1000, log: memoryLogger(), cache });
    expect(first.scrapers.map((s) => s.scraper.id)).not.toContain("late");
    writeFiles(root, {
      "packages/scrapers/late/package.json": PKG("late"),
      "packages/scrapers/late/src/index.ts": `export const scrapers = [${scraperSource("late")}];\n`,
      "packages/scrapers/broken-syntax/src/index.ts": `export const scrapers = [${scraperSource("fixed")}];\n`,
    });
    const second = await discoverScrapers({ scrapersDir, importTimeoutMs: 1000, log: memoryLogger(), cache });
    const ids = second.scrapers.map((s) => s.scraper.id);
    expect(ids).toContain("late");
    expect(ids).toContain("fixed");
    expect(g.__p05Imports?.alpha).toBe(before + 1); // imported once across both scans
  });

  it("validates the Scraper shape", () => {
    expect(validateScraper(fakeScraper({ id: "ok" })).problems).toEqual([]);
    expect(validateScraper(null).problems).toEqual(["not an object"]);
    const v = validateScraper({ id: "x", name: "", kind: "nope", intervalMinutes: 0, scrape: 1, isEnabled: "yes", handlesAts: "greenhouse" });
    expect(v.scraper).toBeNull();
    expect(v.problems).toHaveLength(6);
  });

  it("uses packages/normalize when it loads and passes the smoke test, else the fallback", async () => {
    const log = memoryLogger();
    const none = await discoverNormalizer({ repoRoot: tempDir(), importTimeoutMs: 1000, log });
    expect(none.kind).toBe("fallback");

    const good = tempDir("p05-norm-");
    writeFiles(good, {
      "packages/normalize/package.json": JSON.stringify({ name: "@easyjobs/normalize", type: "module" }),
      "packages/normalize/src/index.ts": `export function normalizeJob(raw, opts = {}) {
  return { fingerprint: "k:" + raw.sourceJobId, source: raw.source, sourceName: opts.sourceName ?? raw.source, sourceKind: raw.sourceKind,
    sourceJobId: raw.sourceJobId, sourceUrl: raw.sourceUrl, target: raw.target, applyUrl: raw.applyUrl ?? raw.sourceUrl, title: raw.title,
    company: opts.company?.name ?? raw.company, companySlug: "acme", companyDomain: null, companyLogoUrl: null, companyTags: [], locations: [],
    workMode: null, isRemote: false, jobType: "full_time", experienceLevel: "mid", experienceMin: null, experienceMax: null, batches: [],
    degrees: [], salary: null, salaryInrYearlyMin: null, salaryInrYearlyMax: null, skills: [], category: "other", department: null,
    descriptionHtml: null, descriptionText: null, summary: null, postedAt: raw.postedAt ?? new Date().toISOString(), validThrough: null,
    qualityScore: 50, tags: ["from-package"], extra: {} };
}\n`,
    });
    const real = await discoverNormalizer({ repoRoot: good, importTimeoutMs: 2000, log });
    expect(real.kind).toBe("package");
    const out = await real.normalize(fakeRawForNormalize(), { sourceName: "X" });
    expect(out.tags).toEqual(["from-package"]);

    const bad = tempDir("p05-norm-bad-");
    writeFiles(bad, {
      "packages/normalize/package.json": JSON.stringify({ name: "@easyjobs/normalize", type: "module" }),
      "packages/normalize/src/index.ts": "export function normalizeJob() { return { title: 'missing everything' }; }\n",
    });
    const smokeFail = await discoverNormalizer({ repoRoot: bad, importTimeoutMs: 2000, log });
    expect(smokeFail.kind).toBe("fallback");
    expect(smokeFail.note).toMatch(/smoke test/);

    const throws = tempDir("p05-norm-throws-");
    writeFiles(throws, { "packages/normalize/src/index.ts": "export const normalizeJob = () => { throw new Error('nope'); };\n", "packages/normalize/package.json": "{\"type\":\"module\"}" });
    expect((await discoverNormalizer({ repoRoot: throws, importTimeoutMs: 2000, log })).kind).toBe("fallback");
  });

  it("uses packages/registry when it exports companies, else the 10-entry sample", async () => {
    const log = memoryLogger();
    const fallback = await discoverRegistry({ repoRoot: tempDir(), importTimeoutMs: 1000, log });
    expect(fallback.kind).toBe("fallback");
    expect(fallback.companies).toHaveLength(10);
    expect(new Set(fallback.companies.map((c) => c.ats))).toEqual(new Set(["greenhouse", "lever", "ashby", "workday"]));
    expect(new Set(fallback.companies.map((c) => c.priority))).toEqual(new Set([1, 2, 3]));
    expect(fallback.find("NVIDIA Corporation")?.slug).toBe("nvidia");
    expect(fallback.find("https://careers.paytm.com/jobs")?.slug).toBe("paytm");
    expect(fallback.get("mongodb")?.ats).toBe("greenhouse");

    const repo = tempDir("p05-reg-");
    writeFiles(repo, {
      "packages/registry/package.json": JSON.stringify({ name: "@easyjobs/registry", type: "module" }),
      "packages/registry/src/index.ts": `export const companies = [
  { slug: "acme", name: "Acme", domain: "acme.test", ats: "greenhouse", token: "acme", careersUrl: "https://acme.test", tags: ["startup"], hq: null, indiaPresence: true, priority: 1 },
  { slug: "bad", ats: "nope", token: "x" },
];
export function findCompany(q) { return /tata/i.test(q) ? companies[0] : undefined; }\n`,
    });
    const real = await discoverRegistry({ repoRoot: repo, importTimeoutMs: 2000, log });
    expect(real.kind).toBe("package");
    expect(real.companies.map((c) => c.slug)).toEqual(["acme"]);
    expect(real.note).toMatch(/1 invalid entries skipped/);
    expect(real.find("Tata Consultancy Services")?.slug).toBe("acme"); // package's fuzzy finder
    expect(real.find("acme.test")?.slug).toBe("acme"); // local fallback matching

    const junk = tempDir("p05-reg-junk-");
    writeFiles(junk, { "packages/registry/src/index.ts": "export const companies = 'nope';\n", "packages/registry/package.json": "{\"type\":\"module\"}" });
    expect((await discoverRegistry({ repoRoot: junk, importTimeoutMs: 2000, log })).kind).toBe("fallback");
  });

  it("discoverAll + buildTasks: one task per feed scraper, one per (ATS scraper, target); demo only when nothing else exists", async () => {
    const root = fakeRepo();
    const d = await discoverAll({ repoRoot: root, importTimeoutMs: 1000, log: memoryLogger() });
    const plan = buildTasks({ ...d, config: { priorityIntervalsMs: { 1: 15 * 60_000, 2: 60 * 60_000, 3: 1440 * 60_000 }, minIntervalMs: 5 * 60_000, demo: "auto" }, env: {} });
    expect(plan.demoScheduled).toBe(false);
    const ats = plan.tasks.filter((t) => t.scraperId === "alpha-ats");
    expect(ats.map((t) => t.target?.slug).sort()).toEqual(["databricks", "inmobi", "meesho", "mongodb", "paytm"]);
    expect(ats.find((t) => t.target?.slug === "inmobi")?.intervalMs).toBe(15 * 60_000);
    expect(ats.find((t) => t.target?.slug === "mongodb")?.intervalMs).toBe(60 * 60_000);
    expect(plan.tasks.find((t) => t.id === "alpha")?.intervalMs).toBe(30 * 60_000);

    const empty = await discoverAll({ repoRoot: tempDir(), importTimeoutMs: 1000, log: memoryLogger() });
    const demoPlan = buildTasks({ ...empty, config: { priorityIntervalsMs: { 1: 1, 2: 2, 3: 3 }, minIntervalMs: 0, demo: "auto" }, env: {} });
    expect(demoPlan.demoScheduled).toBe(true);
    expect(demoPlan.tasks.map((t) => t.id)).toEqual(["demo"]);
    expect(buildTasks({ ...empty, config: { priorityIntervalsMs: { 1: 1, 2: 2, 3: 3 }, minIntervalMs: 0, demo: "off" }, env: {} }).tasks).toEqual([]);
  });

  it("buildTasks respects isEnabled(env) and gives each ATS to exactly one scraper", () => {
    const registry = sampleRegistry();
    const mk = (id: string, extra: Parameters<typeof fakeScraper>[0] = {}) => ({ scraper: fakeScraper({ id, ...extra }), handlesAts: extra.handlesAts ?? null, packageName: id, packageDir: null, internal: false });
    const plan = buildTasks({
      scrapers: [
        mk("gh-a", { handlesAts: ["greenhouse"] }),
        mk("gh-b", { handlesAts: ["greenhouse", "ashby"] }),
        mk("linkedin", { isEnabled: (env) => env.ENABLE_LINKEDIN === "1" }),
        mk("explodes", { isEnabled: () => { throw new Error("bad flag"); } }),
      ],
      demo: { scraper: fakeScraper({ id: "demo" }), handlesAts: null, packageName: "(internal)", packageDir: null, internal: true },
      registry,
      config: { priorityIntervalsMs: { 1: 1, 2: 2, 3: 3 }, minIntervalMs: 0, demo: "auto" },
      env: {},
    });
    expect(plan.tasks.filter((t) => t.scraperId === "gh-a")).toHaveLength(3);
    expect(plan.tasks.filter((t) => t.scraperId === "gh-b").map((t) => t.target?.ats)).toEqual(["ashby", "ashby"]);
    expect(plan.notes.join(" ")).toMatch(/claimed by both gh-a and gh-b/);
    expect(plan.tasks.find((t) => t.id === "linkedin")?.enabled).toBe(false);
    expect(plan.tasks.find((t) => t.id === "explodes")?.disabledReason).toMatch(/threw: bad flag/);
  });
});

function fakeRawForNormalize() {
  return {
    source: "x", sourceKind: "ats" as const, sourceJobId: "1", sourceUrl: "https://x.test/1", target: null, applyUrl: null,
    title: "T", company: "C", locations: [], descriptionHtml: null, postedAt: null,
  };
}
