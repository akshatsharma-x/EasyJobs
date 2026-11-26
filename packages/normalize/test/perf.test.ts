import { cpus, loadavg } from "node:os";
import { describe, expect, it } from "vitest";
import type { RawJob } from "@easyjobs/contract";
import * as N from "../src/index";
import { bestWindow, loadCorpus, TARGET_JOBS_PER_SEC } from "../scripts/bench";

/**
 * Adversarial inputs for regex-heavy code. A super-linear (catastrophic) regex turns these 60–120 KB strings into
 * seconds or minutes; linear code handles each in a few milliseconds.
 */
const BIG = 60_000;
const ADVERSARIAL: string[] = [
  "a".repeat(BIG * 2),
  "1".repeat(BIG * 2),
  "1-".repeat(BIG),
  `${"1 ".repeat(BIG)}years`,
  "<".repeat(BIG * 2),
  "<p>".repeat(BIG / 2),
  "<a href='".repeat(BIG / 4),
  "&lt;p&gt;".repeat(BIG / 4),
  " ".repeat(BIG * 2),
  "\n".repeat(BIG * 2),
  "₹1,".repeat(BIG / 2),
  "B.".repeat(BIG),
  "2024/".repeat(BIG / 3),
  "Bangalore/".repeat(BIG / 6),
  "go, ".repeat(BIG / 3),
  "-".repeat(BIG * 2),
  "(".repeat(BIG * 2),
  "a@".repeat(BIG),
  "Hiring ".repeat(BIG / 5),
  ".".repeat(BIG * 2),
  "remote ".repeat(BIG / 5),
  "<!--".repeat(BIG / 3),
  "<script>".repeat(BIG / 6),
  "&".repeat(BIG * 2),
  `${"x".repeat(BIG)}@gmail.com`,
  "https://".repeat(BIG / 6),
  "fee ".repeat(BIG / 3),
  "Experience: ".repeat(BIG / 10),
  "Salary: 1".repeat(BIG / 8),
  "- ".repeat(BIG),
  "| ".repeat(BIG),
  "Senior ".repeat(BIG / 6),
];

const STRING_FUNCTIONS: [string, (s: string) => unknown][] = [
  ["parseExperience", (s) => N.parseExperience(s)],
  ["parseExperience strict", (s) => N.parseExperience(s, { strict: true })],
  ["parseSalary", (s) => N.parseSalary(s)],
  ["parseSalary strict", (s) => N.parseSalary(s, { strict: true })],
  ["normalizeLocations", (s) => N.normalizeLocations([s])],
  ["detectWorkMode", (s) => N.detectWorkMode({ title: s, description: s, locations: [s] })],
  ["extractSkills", (s) => N.extractSkills({ title: s.slice(0, 500), description: s })],
  ["extractBatches", (s) => N.extractBatches(s)],
  ["extractDegrees", (s) => N.extractDegrees(s)],
  ["categorize", (s) => N.categorize({ title: s, department: s })],
  ["cleanTitle", (s) => N.cleanTitle(s, { company: "Acme" })],
  ["cleanCompanyName", (s) => N.cleanCompanyName(s)],
  ["canonicalJobKey", (s) => N.canonicalJobKey(`https://example.com/${s}`)],
  ["canonicalUrl", (s) => N.canonicalUrl(`https://example.com/?q=${s}`)],
  ["sanitizeDescription", (s) => N.sanitizeDescription(s)],
  ["htmlToText", (s) => N.htmlToText(s)],
  ["summarize", (s) => N.summarize(s)],
  ["parsePostedAt", (s) => N.parsePostedAt(s)],
  ["detectTags", (s) => N.detectTags({ title: s, description: s })],
  ["classifyLevel", (s) => N.classifyLevel({ title: s, description: s })],
  ["detectJobType", (s) => N.detectJobType({ title: s, description: s, employmentTypeRaw: s })],
];

describe("perf: no catastrophic regexes", () => {
  it.each(STRING_FUNCTIONS)("%s stays linear on adversarial input", (_name, fn) => {
    for (const input of ADVERSARIAL) {
      const t0 = performance.now();
      fn(input);
      const ms = performance.now() - t0;
      // Linear work on ≤120 KB takes milliseconds; the generous budget only catches super-linear blow-ups.
      expect(ms, `${JSON.stringify(input.slice(0, 20))}… took ${ms.toFixed(0)} ms`).toBeLessThan(1500);
    }
  });

  it("normalizeJob stays fast with adversarial content in every field", () => {
    const now = new Date("2026-11-26T00:00:00Z");
    for (const s of ADVERSARIAL) {
      const raw: RawJob = {
        source: "x",
        sourceKind: "aggregator",
        sourceJobId: "1",
        sourceUrl: "https://example.com/jobs/1",
        target: null,
        applyUrl: `https://example.com/${s.slice(0, 2000)}`,
        title: s.slice(0, 1000),
        company: s.slice(0, 500),
        locations: [s.slice(0, 2000)],
        descriptionHtml: s,
        postedAt: s.slice(0, 200),
        experienceRaw: s.slice(0, 1000),
        salaryRaw: s.slice(0, 1000),
      };
      const t0 = performance.now();
      N.normalizeJob(raw, { now });
      expect(performance.now() - t0).toBeLessThan(3000);
    }
  });
});

/**
 * Default floor: far below the ~7k jobs/s a healthy machine measures, so only a gross regression fails it, even on a
 * machine that is swapping or oversubscribed by parallel test runs (both were observed while other sessions ran).
 * The 5k target is gated by `pnpm --filter @easyjobs/normalize run bench` (exit 1 below it) or by setting
 * PERF_MIN_JOBS_PER_SEC=5000 for this test.
 */
const SANITY_FLOOR = 500;

describe("perf: throughput", () => {
  it("normalizes realistic jobs fast: reports the 5k target, asserts PERF_MIN_JOBS_PER_SEC (default: sanity floor)", () => {
    const { best, windows } = bestWindow(loadCorpus(600, 0.33));
    const forced = process.env.PERF_MIN_JOBS_PER_SEC?.trim();
    const min = forced ? Number(forced) : SANITY_FLOOR;
    console.log(
      `throughput: best ${best} jobs per main-thread CPU-second (windows ${windows.join(", ")}) · ` +
        `${best >= TARGET_JOBS_PER_SEC ? "meets" : "BELOW"} the ${TARGET_JOBS_PER_SEC} target · asserted floor ${min} · ` +
        `load ${(loadavg()[0] ?? 0).toFixed(1)} on ${cpus().length} cores`,
    );
    expect(best).toBeGreaterThanOrEqual(min);
  }, 120_000);
});
