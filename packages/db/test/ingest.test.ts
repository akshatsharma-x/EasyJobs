import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { validateJobInput } from "@easyjobs/contract";
import { createRepository, type Repository } from "../src/repository";
import { jobInputSchema, validateJob } from "../src/validate";
import { sanitizeDescription, summarizeText } from "../src/sanitize";
import { createTestDb, daysAgo, makeJob, OFFICIAL_URL, type TestDb } from "./helpers";

const NOW = new Date("2026-11-20T12:00:00.000Z");
let t: TestDb;
let repo: Repository;

beforeAll(async () => {
  t = await createTestDb();
  repo = createRepository(t.db);
});
afterAll(async () => {
  await t.cleanup();
});

const jobRow = async (fingerprint: string) =>
  (await t.db.query<Record<string, unknown>>(sql`SELECT * FROM jobs WHERE fingerprint = ${fingerprint}`))[0];

describe("validation (zod, item by item)", () => {
  it("accepts a valid JobInput and normalises soft fields", () => {
    const res = validateJob({
      ...makeJob({ key: "v1" }),
      title: "  Backend Engineer  ",
      skills: ["Go", "go", "Rust", "", 5],
      companyTags: ["mnc", "not-a-tag"],
      batches: [2026, 2025, 2025, 1800],
      companyDomain: "https://www.Acme.com/careers",
      companyLogoUrl: "javascript:alert(1)",
      validThrough: "not a date",
      summary: "x".repeat(400),
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.job.title).toBe("Backend Engineer");
    expect(res.job.skills).toEqual(["Go", "Rust"]);
    expect(res.job.companyTags).toEqual(["mnc"]);
    expect(res.job.batches).toEqual([2025, 2026]);
    expect(res.job.companyDomain).toBe("acme.com");
    expect(res.job.companyLogoUrl).toBeNull();
    expect(res.job.validThrough).toBeNull();
    expect(res.job.summary).toHaveLength(280);
    expect(validateJobInput(res.job)).toEqual([]);
  });

  it("fills missing optional fields with null/[]/{} instead of rejecting", () => {
    const full = makeJob({ key: "v2" });
    const partial: Record<string, unknown> = { ...full };
    for (const k of ["target", "companyDomain", "companyLogoUrl", "salary", "department", "descriptionHtml", "descriptionText", "summary", "validThrough", "extra", "experienceMin", "experienceMax", "salaryInrYearlyMin", "salaryInrYearlyMax"]) {
      delete partial[k];
    }
    const res = validateJob(partial);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.job.extra).toEqual({});
  });

  it("rejects contract violations with a readable error", () => {
    const cases: [Record<string, unknown>, RegExp][] = [
      [{ ...makeJob(), title: "   " }, /title/],
      [{ ...makeJob(), applyUrl: "ftp://x" }, /applyUrl/],
      [{ ...makeJob(), sourceKind: "blog" }, /sourceKind/],
      [{ ...makeJob(), jobType: "gig" }, /jobType/],
      [{ ...makeJob(), experienceLevel: "guru" }, /experienceLevel/],
      [{ ...makeJob(), workMode: "moon" }, /workMode/],
      [{ ...makeJob(), postedAt: "yesterday" }, /postedAt/],
      [{ ...makeJob(), qualityScore: 101 }, /qualityScore/],
      [{ ...makeJob(), isRemote: "yes" }, /isRemote/],
      [{ ...makeJob(), skills: "React" }, /skills/],
      [{ ...makeJob(), category: "astrology" }, /category/],
    ];
    for (const [input, re] of cases) {
      const r = validateJob(input);
      expect(r.ok, JSON.stringify(input).slice(0, 80)).toBe(false);
      if (!r.ok) expect(r.error).toMatch(re);
    }
    expect(validateJob(null)).toEqual({ ok: false, error: "not an object" });
    expect(validateJob([1])).toEqual({ ok: false, error: "not an object" });
  });

  it("schema is the contract type (runtime sanity)", () => {
    expect(jobInputSchema.safeParse(makeJob()).success).toBe(true);
  });
});

describe("sanitising (API trust boundary)", () => {
  it("keeps the allow-list, strips scripts/styles/handlers/iframes/images, hardens links", () => {
    const out = sanitizeDescription(
      `<h1>Title</h1><div style="color:red" onclick="x()">Hi <b>there</b><script>alert(1)</script></div>` +
        `<iframe src="https://evil"></iframe><img src="https://t.example/p.gif"><p></p><a href="javascript:alert(1)">bad</a>` +
        `<a href="https://ok.example/x">ok</a><table><tr><td colspan="2">c</td></tr></table>`,
    )!;
    expect(out).toContain("<h2>Title</h2>");
    expect(out).toContain("<b>there</b>");
    expect(out).not.toMatch(/script|onclick|style=|iframe|<img|javascript:/i);
    expect(out).toContain('<a href="https://ok.example/x" rel="nofollow noopener noreferrer" target="_blank">ok</a>');
    expect(out).not.toContain("<p></p>");
    expect(out).toContain('<td colspan="2">c</td>');
  });
  it("decodes entity-escaped HTML (Greenhouse style)", () => {
    expect(sanitizeDescription("&lt;p&gt;Hello &amp;amp; welcome&lt;/p&gt;")).toBe("<p>Hello &amp; welcome</p>");
  });
  it("returns null for empty output and summarises at sentence boundaries", () => {
    expect(sanitizeDescription("<script>x</script>")).toBeNull();
    const s = summarizeText(`${"Sentence one is here. ".repeat(10)}${"word ".repeat(80)}`);
    expect(s.length).toBeLessThanOrEqual(280);
    expect(s.endsWith(".")).toBe(true);
  });
});

describe("upsert + merge rules (§0.4)", () => {
  it("rejects bad items one at a time and inserts the rest", async () => {
    const res = await repo.upsertJobs([makeJob({ key: "a1" }), { nope: 1 }, makeJob({ key: "a2", applyUrl: "not-a-url" }), makeJob({ key: "a3" })], { now: NOW });
    expect(res.inserted).toBe(2);
    expect(res.rejected.map((r) => r.index)).toEqual([1, 2]);
    expect(res.rejected[1]!.error).toMatch(/applyUrl/);
  });

  it("stores a sanitised description and derives text/summary when missing", async () => {
    await repo.upsertJobs([makeJob({ key: "s1", descriptionHtml: "<p>Great role.<script>x()</script></p><ul><li>Ship</li></ul>", descriptionText: null, summary: null })], { now: NOW });
    const row = (await jobRow(makeJob({ key: "s1" }).fingerprint))!;
    expect(row.description_html).toBe("<p>Great role.</p><ul><li>Ship</li></ul>");
    expect(row.description_text).toContain("Great role.");
    expect(row.summary).toContain("Great role.");
  });

  it("higher-priority source wins scalars; never overwritten with null; arrays unioned; earliest dates; most official applyUrl", async () => {
    const fp = "k:merge-1";
    const board = makeJob({
      key: "m-board",
      fingerprint: fp,
      source: "coursejoiner",
      sourceName: "CourseJoiner",
      sourceKind: "job_board",
      sourceJobId: "cj-1",
      sourceUrl: "https://coursejoiner.com/p/1",
      target: null,
      applyUrl: "https://coursejoiner.com/p/1/apply",
      title: "Acme Off Campus Drive | SDE",
      skills: ["Java", "SQL", "DSA"],
      batches: [2024, 2025],
      tags: ["off-campus"],
      salary: { min: 400000, max: 600000, currency: "INR", period: "year", raw: "4-6 LPA" },
      salaryInrYearlyMin: 400000,
      salaryInrYearlyMax: 600000,
      department: null,
      postedAt: daysAgo(3, NOW),
      qualityScore: 40,
    });
    const ats = makeJob({
      key: "m-ats",
      fingerprint: fp,
      sourceJobId: "gh-1",
      applyUrl: OFFICIAL_URL("gh-1"),
      title: "Software Engineer I",
      skills: ["TypeScript", "React", "Java"],
      batches: [2025, 2026],
      salary: null,
      salaryInrYearlyMin: null,
      salaryInrYearlyMax: null,
      department: "Platform",
      postedAt: daysAgo(1, NOW),
      qualityScore: 85,
    });
    const r1 = await repo.upsertJobs([board], { now: new Date(NOW.getTime() - 2 * 86_400_000) });
    expect(r1).toMatchObject({ inserted: 1, merged: 0, updated: 0 });
    const r2 = await repo.upsertJobs([ats], { now: NOW });
    expect(r2).toMatchObject({ inserted: 0, merged: 1, updated: 0 });
    const r3 = await repo.upsertJobs([{ ...board, title: "Changed by board", department: "Board dept" }], { now: NOW });
    expect(r3).toMatchObject({ updated: 1 });

    const row = (await jobRow(fp))!;
    expect(row.title).toBe("Software Engineer I"); // ATS wins, board can't take it back
    expect(row.department).toBe("Platform");
    expect(row.apply_url).toBe(OFFICIAL_URL("gh-1")); // most official source
    expect((row.salary as { raw: string }).raw).toBe("4-6 LPA"); // never overwritten with null
    expect(row.salary_inr_yearly_max).toBe(600000);
    expect(row.skills).toEqual(["TypeScript", "React", "Java", "SQL", "DSA"]); // union, official first
    expect(row.batches).toEqual([2024, 2025, 2026]);
    expect(row.tags).toEqual(["off-campus"]);
    expect(new Date(row.posted_at as string).toISOString()).toBe(daysAgo(3, NOW)); // earliest postedAt
    expect(new Date(row.first_seen_at as string).getTime()).toBe(NOW.getTime() - 2 * 86_400_000); // earliest firstSeenAt
    expect(row.quality_score).toBe(85);
    expect(row.is_official).toBe(true);
    expect(row.best_source_kind).toBe("ats");
    expect(row.source_ids).toEqual(["greenhouse", "coursejoiner"]);
    expect((row.sources as { id: string }[]).map((s) => s.id)).toEqual(["greenhouse", "coursejoiner"]);
    const n = await t.db.query<{ n: number }>(sql`SELECT count(*)::int AS n FROM job_sources s JOIN jobs j ON j.id = s.job_id WHERE j.fingerprint = ${fp}`);
    expect(n[0]!.n).toBe(2);
  });

  it("an equal-priority source refreshes scalars; a lower one only fills empty fields", async () => {
    const fp = "k:merge-2";
    await repo.upsertJobs([makeJob({ key: "p1", fingerprint: fp, title: "First", workMode: null })], { now: NOW });
    await repo.upsertJobs([makeJob({ key: "p1", fingerprint: fp, title: "Renamed by ATS", workMode: null })], { now: NOW });
    await repo.upsertJobs([makeJob({ key: "p-agg", fingerprint: fp, source: "adzuna", sourceName: "Adzuna", sourceKind: "aggregator", title: "Aggregator title", workMode: "remote" })], { now: NOW });
    const row = (await jobRow(fp))!;
    expect(row.title).toBe("Renamed by ATS");
    expect(row.work_mode).toBe("remote"); // was null → filled by a lower-priority source
  });

  it("de-duplicates within one batch and counts inserted/updated/merged", async () => {
    const fp = "k:batch-dup";
    const res = await repo.upsertJobs(
      [makeJob({ key: "b1", fingerprint: fp }), makeJob({ key: "b1", fingerprint: fp }), makeJob({ key: "b2", fingerprint: fp, source: "linkedin", sourceName: "LinkedIn", sourceKind: "job_board" })],
      { now: NOW },
    );
    expect(res).toMatchObject({ inserted: 1, updated: 1, merged: 1 });
  });

  it("emits 'job created' events only for new open rows (after commit)", async () => {
    const seen: string[] = [];
    const off = repo.events.on((evs) => seen.push(...evs.map((e) => e.item.title)));
    await repo.upsertJobs([makeJob({ key: "e1", title: "Event One" }), makeJob({ key: "e2", title: "Event Two", validThrough: daysAgo(1, NOW) })], { now: NOW });
    await repo.upsertJobs([makeJob({ key: "e1", title: "Event One" })], { now: NOW });
    off();
    expect(seen).toEqual(["Event One"]); // e2 is born closed (validThrough past); the re-sighting is not new
  });

  it("any sighting re-opens a swept job", async () => {
    const j = makeJob({ key: "reopen", target: "reopen-co" });
    await repo.upsertJobs([j], { now: NOW });
    expect(await repo.sweep({ source: "greenhouse", target: "reopen-co", seenSourceJobIds: [] }, { now: NOW })).toEqual({ closed: 1, removed: 1 });
    expect((await jobRow(j.fingerprint))!.status).toBe("closed");
    const res = await repo.upsertJobs([j], { now: new Date(NOW.getTime() + 60_000) });
    expect(res.updated).toBe(1);
    const row = (await jobRow(j.fingerprint))!;
    expect(row.status).toBe("open");
    expect(row.closed_at).toBeNull();
  });

  it("moves a (source, sourceJobId) whose fingerprint changed and closes the orphaned job", async () => {
    await repo.upsertJobs([makeJob({ key: "mv", fingerprint: "t:old-title", title: "Old title" })], { now: NOW });
    const res = await repo.upsertJobs([makeJob({ key: "mv", fingerprint: "t:new-title", title: "New title" })], { now: NOW });
    expect(res).toMatchObject({ inserted: 1, merged: 0 });
    expect((await jobRow("t:old-title"))!.status).toBe("closed");
    expect((await jobRow("t:new-title"))!.status).toBe("open");
  });

  it("upserts companies with open-job counts, official names and unioned tags", async () => {
    await repo.upsertJobs(
      [
        makeJob({ key: "c1", companySlug: "zeta", company: "Zeta (via board)", companyTags: ["startup"], sourceKind: "job_board", source: "naukri", sourceName: "Naukri", companyDomain: null }),
        makeJob({ key: "c2", companySlug: "zeta", company: "Zeta", companyTags: ["fintech"], companyDomain: "zeta.tech" }),
      ],
      { now: NOW },
    );
    const c = await repo.getCompany("zeta");
    expect(c).toMatchObject({ slug: "zeta", name: "Zeta", domain: "zeta.tech", openJobs: 2 });
    expect([...c!.tags].sort()).toEqual(["fintech", "startup"]);
  });

  it("light records (extra.light) never downgrade description-derived fields", async () => {
    const full = makeJob({ key: "light-1", experienceLevel: "mid", experienceMin: 2, experienceMax: 5, category: "data_ai", summary: "Full summary from the description." });
    await repo.upsertJobs([full], { now: NOW });
    const light = {
      ...full,
      title: "Data Engineer II",
      descriptionHtml: null,
      descriptionText: null,
      summary: "Short.",
      experienceLevel: "entry" as const,
      experienceMin: 0,
      experienceMax: 2,
      category: "software_engineering" as const,
      extra: { light: true },
    };
    expect((await repo.upsertJobs([light], { now: NOW })).updated).toBe(1);
    const row = (await jobRow(full.fingerprint))!;
    expect(row).toMatchObject({ experience_level: "mid", experience_min: 2, experience_max: 5, category: "data_ai", summary: "Full summary from the description." });
    expect(row.description_html).toBe("<p>Build things.</p>");
    expect(row.title).toBe("Data Engineer II"); // non-derived scalars still refresh
    expect(row.extra).toEqual({}); // the flag itself is not stored
    // a light record for a brand-new job is stored as-is (nothing better known)
    await repo.upsertJobs([{ ...makeJob({ key: "light-new" }), extra: { light: true, keep: 1 } }], { now: NOW });
    expect((await jobRow(makeJob({ key: "light-new" }).fingerprint))!.extra).toEqual({ keep: 1 });
  });

  it("skips rewriting unchanged rows on re-sighting (write amplification guard)", async () => {
    const j = makeJob({ key: "quiet" });
    await repo.upsertJobs([j], { now: NOW });
    const before = (await jobRow(j.fingerprint))!;
    await repo.upsertJobs([j], { now: new Date(NOW.getTime() + 10 * 60_000) }); // 10 min later: no change, no write
    const after = (await jobRow(j.fingerprint))!;
    expect(after.updated_at).toEqual(before.updated_at);
    expect(after.last_seen_at).toEqual(before.last_seen_at);
    await repo.upsertJobs([j], { now: new Date(NOW.getTime() + 2 * 3_600_000) }); // 2 h later: last_seen refresh only
    const later = (await jobRow(j.fingerprint))!;
    expect(new Date(later.last_seen_at as string).getTime()).toBe(NOW.getTime() + 2 * 3_600_000);
  });
});
