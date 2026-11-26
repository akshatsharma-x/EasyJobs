import { describe, expect, it } from "vitest";
import { validateJobInput, type RawJob } from "@easyjobs/contract";
import * as N from "../src/index";
import { normalizeJob } from "../src/index";

/** Deterministic PRNG (mulberry32) so failures are reproducible. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const STRINGS = [
  "", " ", "\n\t", "null", "undefined", "NaN", "0", "-1", "1e309", "🚀🔥💼", "\u{202E}gnp.exe", "\u{200B}\u{FEFF}", "Ñandú Zürich São Paulo",
  "<script>alert(1)</script>", "<p>unclosed", "</p></div>", "&lt;p&gt;escaped&lt;/p&gt;", "&amp;amp;lt;", "<a href='javascript:x'>x</a>",
  "https://boards.greenhouse.io/x/jobs/123", "http://", "https://", "//cdn.x.com/a", "www.example.com/jobs/1", "javascript:alert(1)",
  "mailto:a@b.c", "ftp://x.com", "https://wa.me/919999999999", "https://unknown.invalid/a", "https://ex ample.com",
  "Bangalore/Hyderabad/Pune", "Remote - India", "IN, KA, Bangalore", "Pan India", "Multiple Locations", "CA", "IN", "NYC",
  "0-2 Yrs", "Freshers", "2+ years", "4-6 LPA", "₹ 4,00,000 - 6,00,000 /year", "$120,000 – $150,000", "Unpaid", "₹1 Cr", "9".repeat(40),
  "2024/2025/2026 batch", "Posted on 12 Nov 2025", "30+ Days Ago", "2 days ago", "1763971200", "2026-02-30", "9999-99-99",
  "Hiring!! Software Engineer Intern | Apply Now", "Senior Director, Head of VP Chief Staff Intern", "SDE-1", "L4", "Go, R, C",
  "B.E/B.Tech, MBA, Any graduate", "Pay a registration fee of Rs 999 on WhatsApp +91 9999999999 hr@gmail.com",
  "a".repeat(5000), "<p>x</p>".repeat(500), "1-".repeat(2000), "(".repeat(3000), "B.".repeat(2000), "₹1,".repeat(1500),
];

function value(r: () => number, depth = 0): unknown {
  const k = Math.floor(r() * 14);
  switch (k) {
    case 0:
      return undefined;
    case 1:
      return null;
    case 2:
      return r() < 0.5;
    case 3:
      return [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 1e20, 1763971200000, 42][Math.floor(r() * 8)];
    case 4:
    case 5:
    case 6:
    case 7:
      return STRINGS[Math.floor(r() * STRINGS.length)];
    case 8:
      return String.fromCodePoint(...Array.from({ length: Math.floor(r() * 40) }, () => Math.floor(r() * 0xffff)).filter((c) => c < 0xd800 || c > 0xdfff));
    case 9:
      return depth > 2 ? [] : Array.from({ length: Math.floor(r() * 6) }, () => value(r, depth + 1));
    case 10:
      return depth > 2 ? {} : { min: value(r, depth + 1), max: value(r, depth + 1), currency: value(r, depth + 1), period: value(r, depth + 1), raw: value(r, depth + 1) };
    case 11:
      return new Date(r() < 0.5 ? Number.NaN : 1763971200000);
    case 12:
      return () => "fn";
    default:
      return Symbol("s");
  }
}

const FIELDS = [
  "source", "sourceKind", "sourceJobId", "sourceUrl", "target", "applyUrl", "title", "company", "locations", "descriptionHtml",
  "postedAt", "companySlug", "companyDomain", "companyLogoUrl", "descriptionText", "validThrough", "department",
  "employmentTypeRaw", "experienceRaw", "salaryRaw", "jobType", "experienceLevel", "experienceMin", "experienceMax", "workMode",
  "isRemote", "salary", "batches", "degrees", "skills", "tags", "extra",
] as const;

const VALID: RawJob = {
  source: "greenhouse",
  sourceKind: "ats",
  sourceJobId: "1",
  sourceUrl: "https://boards.greenhouse.io/acme/jobs/1",
  target: "acme",
  applyUrl: null,
  title: "Software Engineer",
  company: "Acme",
  locations: ["Bangalore"],
  descriptionHtml: "<p>Build things in Go.</p>",
  postedAt: "2026-11-20T00:00:00Z",
};

describe("fuzz: normalizeJob never throws and always returns a valid JobInput", () => {
  const now = new Date("2026-11-26T00:00:00Z");
  // CPU-heavy (2,500 iterations): the 5 s default is too tight when the suite runs alongside others.
  it("random garbage RawJobs", { timeout: 60_000 }, () => {
    const r = rng(20261126);
    for (let i = 0; i < 2500; i++) {
      const raw: Record<string, unknown> = {};
      for (const f of FIELDS) if (r() < 0.7) raw[f] = value(r);
      const job = normalizeJob(raw as unknown as RawJob, { now: r() < 0.9 ? now : undefined });
      const errs = validateJobInput(job);
      if (errs.length > 0 || "error" in (job.extra.normalize as object)) {
        throw new Error(`case ${i}: ${errs.join(", ")} ${JSON.stringify((job.extra.normalize as { error?: string }).error)} raw=${String(JSON.stringify(raw, (_k, v) => (typeof v === "symbol" || typeof v === "function" ? String(v) : v))).slice(0, 400)}`);
      }
      expect(() => JSON.stringify(job)).not.toThrow();
    }
  });
  it("valid RawJobs with one or two corrupted fields", () => {
    const r = rng(7);
    for (let i = 0; i < 2500; i++) {
      const raw: Record<string, unknown> = { ...VALID };
      for (let k = 0; k < 1 + Math.floor(r() * 2); k++) raw[FIELDS[Math.floor(r() * FIELDS.length)] as string] = value(r);
      const job = normalizeJob(raw as unknown as RawJob, { now });
      expect(validateJobInput(job)).toEqual([]);
      expect("error" in (job.extra.normalize as object)).toBe(false);
    }
  });
  it("non-object inputs", () => {
    for (const raw of [null, undefined, 42, "job", [], [VALID], true, () => VALID]) {
      const job = normalizeJob(raw as unknown as RawJob, { now });
      expect(validateJobInput(job)).toEqual([]);
    }
  });
});

describe("fuzz: options and helper inputs from untyped callers", () => {
  const now = new Date("2026-11-26T00:00:00Z");
  it("normalizeJob tolerates null, non-object and half-valid options", () => {
    for (const opts of [null, 42, "x", [], { now: "yesterday" }, { now: new Date(Number.NaN) }, { company: 42 }, { company: "acme", sourceName: 7 }]) {
      const job = normalizeJob(VALID as unknown as RawJob, opts as never);
      expect(validateJobInput(job)).toEqual([]);
      expect("error" in (job.extra.normalize as object)).toBe(false);
    }
    expect(normalizeJob(VALID as unknown as RawJob, { now }).postedAt).toBe(normalizeJob(VALID as unknown as RawJob, { now, company: null }).postedAt);
  });

  it("the documented helpers never throw on odd values in any argument", () => {
    const helpers: Record<string, (...args: never[]) => unknown> = {
      classifyLevel: N.classifyLevel, classifyLevelDetailed: N.classifyLevelDetailed, parseExperience: N.parseExperience,
      detectJobType: N.detectJobType, detectJobTypeDetailed: N.detectJobTypeDetailed, parseSalary: N.parseSalary, toInrYearly: N.toInrYearly,
      cleanSalaryHint: N.cleanSalaryHint, normalizeLocations: N.normalizeLocations, parseLocation: N.parseLocation, detectWorkMode: N.detectWorkMode,
      extractSkills: N.extractSkills, cleanSkillList: N.cleanSkillList, canonicalizeSkill: N.canonicalizeSkill, extractBatches: N.extractBatches,
      cleanBatches: N.cleanBatches, extractDegrees: N.extractDegrees, cleanDegreeList: N.cleanDegreeList, categorize: N.categorize,
      categorizeDetailed: N.categorizeDetailed, cleanTitle: N.cleanTitle, titleKey: N.titleKey, cleanCompanyName: N.cleanCompanyName,
      resolveCompany: N.resolveCompany, companyLogoUrl: N.companyLogoUrl, canonicalJobKey: N.canonicalJobKey, canonicalUrl: N.canonicalUrl,
      stripTracking: N.stripTracking, isJobSpecificUrl: N.isJobSpecificUrl, fingerprint: N.fingerprint, fingerprintDetailed: N.fingerprintDetailed,
      sanitizeDescription: N.sanitizeDescription, htmlToText: N.htmlToText, summarize: N.summarize, textToHtml: N.textToHtml,
      parsePostedAt: N.parsePostedAt, parseDate: N.parseDate, detectTags: N.detectTags, detectScamSignals: N.detectScamSignals,
      qualityScore: N.qualityScore, needsEnrichment: N.needsEnrichment,
    };
    const odd: unknown[] = [null, undefined, 42, Number.NaN, true, "", "x", [], [null, 42, {}], {}, { title: 5, description: {}, locations: 7, tags: "x", now: "x" }, () => 1];
    const failures: string[] = [];
    for (const [name, fn] of Object.entries(helpers)) {
      for (const a of odd) {
        for (const b of [undefined, a]) {
          try {
            (fn as (x: unknown, y: unknown) => unknown)(a, b);
          } catch (error) {
            failures.push(`${name}(${String(a)}, ${String(b)}): ${(error as Error).message}`);
          }
        }
      }
    }
    expect(failures).toEqual([]);
    expect(N.parsePostedAt("garbage", new Date(Number.NaN))).toMatch(/^\d{4}-\d\d-\d\dT/);
    expect(N.qualityScore({} as N.QualityInput)).toBe(0);
  });
});
