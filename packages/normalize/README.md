# @easyjobs/normalize

Turns any `RawJob` (from any scraper) into a clean, consistent `JobInput` (prompts.md §0.4). It is pure, synchronous and
deterministic given `now`, and makes no network calls, except for the optional, async `enrichWithLLM`.

```ts
import { normalizeJob, enrichWithLLM } from "@easyjobs/normalize";

const job = normalizeJob(raw, { company: registryEntry, now: new Date() }); // never throws; always passes validateJobInput
job.fingerprint;            // "k:…" (official, job-specific apply URL) or "t:…" (company | title | city | jobType)
job.extra.normalize;        // { version, fingerprintRule, confidence, sources, defaulted?, warnings? }

const better = await enrichWithLLM(job); // no-op without ANTHROPIC_API_KEY or when the record is confident
```

Each step is also exported and unit-tested on its own:

```ts
classifyLevel({ title: "SDE II" });                        // "mid"
parseExperience("3-5 yrs exp");                            // { min: 3, max: 5 }
parseSalary("4-6 LPA");                                    // { min: 400000, max: 600000, currency: "INR", period: "year", raw: "4-6 LPA" }
toInrYearly({ min: 25000, max: null, currency: "INR", period: "month", raw: null }); // { min: 300000, max: null }
normalizeLocations("Hybrid - Pune / Bangalore");           // Pune + Bengaluru, workMode "hybrid"
extractSkills({ title: "Backend Engineer (Go)", description: "Let's go! Go, K8s, PostgreSQL" }); // ["Go", "Kubernetes", "PostgreSQL"]
extractBatches("2024/2025/2026 batch, company since 2005"); // [2024, 2025, 2026]
canonicalJobKey("https://razorpay.com/jobs/?gh_jid=4012345&utm_source=x"); // "greenhouse:4012345"
```

## What `normalizeJob` does

1. **Identity:** cleans `source`/`sourceJobId` and normalizes `sourceUrl`/`applyUrl` (relative links are resolved
   against the source URL, tracking params are dropped). Garbage URLs become `https://unknown.invalid/<source>/<id>`,
   so the output stays valid; `isOfficialHost` treats `.invalid` as non-official.
2. **Company and title:** `resolveCompany` maps legal entities and aliases ("Tata Consultancy Services Ltd." → TCS,
   "Bundl Technologies" → Swiggy). `opts.company` (the registry entry) wins for name, slug, domain and tags.
   `cleanTitle` strips noise ("Hiring!!", "Urgent", "Off Campus Drive 2026", "| Apply Now", emoji, the company name).
3. **Description:** `sanitizeDescription` (sanitize-html allowlist, unescapes double-escaped HTML, drops
   styles/scripts/iframes/pixels and empty paragraphs, adds `rel`/`target` to links), `htmlToText`, and `summarize`
   (≤ 280 chars, sentence-aware, prefers the "About the role" section).
4. **Facts, where hints win:** RawJob hints are trusted after cleaning (`jobType`, `experienceLevel`, `salary`,
   `workMode`, `batches`, `skills`, `degrees`). Otherwise each value is derived from the title, then the description:
   job type, experience years, level (§0.4 precedence), salary + INR yearly, locations + workMode/isRemote, skills,
   batches, degrees and category.
5. **Dates, tags, scoring:** `parsePostedAt` (falls back to `now`), `validThrough`, `detectTags` (incl. `suspicious`),
   `fingerprint` (§0.4) and `qualityScore` (0–100).
6. **Metadata in `extra.normalize`:** confidence (level/category), where each value came from, `defaulted` (fields
   holding a default rather than evidence) and `warnings` (repaired input). Light records (`extra.light: true`, or no
   description at all) are marked so the API merge can keep stored description-derived fields.

If anything unexpected throws, a minimal valid `JobInput` is returned with `extra.normalize.error`. The fuzz test
asserts this path is never taken.

## API

| Area | Exports |
|---|---|
| Entry | `normalizeJob`, `NORMALIZER_VERSION`, types `NormalizeOptions`, `NormalizeMeta` |
| Level and type | `classifyLevel`, `classifyLevelDetailed` (level + confidence + source), `levelFromTitle`, `levelFromYears`, `detectJobType`, `detectJobTypeDetailed`, `jobTypeFromEmploymentType`, `jobTypeFromTitle` |
| Experience and salary | `parseExperience` (`{ strict }` for free text), `parseSalary`, `cleanSalaryHint`, `toInrYearly`, `detectCurrency`, `INR_PER_UNIT`, `FX_RATES_AS_OF`, `HOURS_PER_YEAR` |
| Locations | `normalizeLocations`, `parseLocation`, `lookupCity`, `dedupeLocations`, `isLocationOnly`, `detectWorkMode`, `workModeFromText`, `currencyForCountry`, `countryName`, `CITY_COUNTS` |
| Skills, batches, degrees, category | `extractSkills`, `extractSkillsDetailed`, `canonicalizeSkill`, `cleanSkillList`, `skillGroupOf`, `SKILL_COUNT`, `MAX_SKILLS` · `extractBatches`, `cleanBatches` · `extractDegrees`, `cleanDegreeList`, `DEGREES` · `categorize`, `categorizeDetailed` |
| Title and company | `cleanTitle`, `titleKey`, `cleanCompanyName`, `resolveCompany`, `companyKey`, `companyLogoUrl`, `cleanDomain`, `deriveCompanyDomain`, `COMPANY_ALIAS_COUNT` |
| URLs and dedupe | `canonicalJobKey`, `canonicalUrl`, `stripTracking`, `isJobSpecificUrl`, `isOfficialHost`, `isAtsHost`, `isJobBoardHost`, `isNonOfficialHost`, `isAtsJobKey`, `parseHttpUrl`, `normalizeHttpUrl`, `registrableDomain`, `companyDomainFromUrl`, `fingerprint`, `fingerprintDetailed`, `sha1` |
| Text | `sanitizeDescription`, `htmlToText`, `summarize`, `textToHtml` |
| Dates, tags, quality | `parsePostedAt`, `parseDate`, `detectTags`, `detectScamSignals`, `qualityScore` |
| LLM | `enrichWithLLM`, `enrichManyWithLLM`, `needsEnrichment`, `validateFields`, `applyFields`, `resetLlmState`, `ENRICH_TOOL`, `DEFAULT_LLM_MODEL` |

`normalizeJob` and the step functions never throw on odd values in any argument (`null`, numbers, wrong shapes,
invalid `now`). The list is in `test/fuzz.test.ts`, and it covers every function the P03 prompt names, plus their
`*Detailed`/`clean*` variants and `needsEnrichment`. Low-level utilities (`lookupCity`, `registrableDomain`,
`is*Host`, `sha1`, `applyFields`, …) expect their declared types.

## CLI

```bash
pnpm --filter @easyjobs/normalize run cli packages/scrapers/coursejoiner/out/coursejoiner.jsonl > normalized.jsonl
pnpm -s --filter @easyjobs/normalize run cli a.jsonl b.jsonl --stats-only --now 2026-11-26T00:00:00Z
cat raw.jsonl | pnpm -s --filter @easyjobs/normalize run cli - --out /tmp/jobs.jsonl
```

JobInput JSONL goes to stdout (or `--out`), and field distributions go to stderr: counts by source/jobType/level/
workMode/category, fill rates, quality percentiles, top cities/countries/skills/companies/tags/batches/degrees, and
shared fingerprints. Options: `--now <ISO>`, `--source-name <name>`, `--llm`, `--llm-max <n>`, `--stats-only`,
`--out <file>`, `--top <n>`, `--help`.

- Relative paths resolve from where you ran pnpm, then the package, then the repo root.
- Exit code 1 means at least one output failed `validateJobInput`; exit code 2 means bad arguments or an unreadable
  file.

## LLM enrichment (optional)

`enrichWithLLM(job)` fills level, experience, batches, degrees, skills and category for **low-confidence records only**
(`needsEnrichment`: defaulted level, low-confidence or `other` category, or no skills, and ≥ 120 chars of text).

- **Request:** `claude-haiku-5-5` (override with `NORMALIZE_LLM_MODEL`), one forced tool call with `strict: true`
  and `effort: "low"`.
- **Validation:** answers are re-validated with `validateFields` (enums, year bounds, canonical skill and degree
  labels). Only weak or empty fields are filled.
- **Never changed:** `title`, `company`, `applyUrl` and `fingerprint`.
- **Cache:** on disk by fingerprint and model (`NORMALIZE_LLM_CACHE_DIR`, default `.cache/llm`).
- **Failures:** without `ANTHROPIC_API_KEY` it does nothing. Refusals, truncation, invalid output and API errors
  return the job unchanged. An authentication error disables enrichment for the rest of the process.
- **Budgets:** `cacheOnly: true` applies cached answers without calling the API. The CLI's `--llm` uses it once
  `--llm-max` requests (default 100) have been made.

## Env vars

| Variable | Default | Effect |
|---|---|---|
| `LOGO_DEV_TOKEN` | unset | `companyLogoUrl` → `https://img.logo.dev/<domain>?token=…&size=128`; otherwise a stable source logo or the Google favicon |
| `ANTHROPIC_API_KEY` | unset | enables `enrichWithLLM` |
| `NORMALIZE_LLM_MODEL` | `claude-haiku-5-5` | model for enrichment |
| `NORMALIZE_LLM_CACHE_DIR` | `packages/normalize/.cache/llm` | enrichment cache |
| `NORMALIZE_LLM_MAX_CALLS` | `100` | CLI `--llm` request budget |
| `PERF_MIN_JOBS_PER_SEC` | `500` (sanity floor) | throughput the perf test asserts; set `5000` to enforce the target |

See `.env.example`. The library reads `process.env` at call time. The CLI also loads `packages/normalize/.env` and
`<repo>/.env`; variables already set in the shell win.

## Tests and benchmark

```bash
pnpm --filter @easyjobs/normalize typecheck
pnpm --filter @easyjobs/normalize test      # offline, about 880 table-driven cases incl. fuzz and perf
pnpm --filter @easyjobs/normalize run bench # throughput; exits 1 when the best window is below 5,000 jobs/s
```

- `test/fixtures/raw-jobs.jsonl` holds 15 RawJobs covering every source kind. The aggregator post and the
  Greenhouse record share a fingerprint on purpose.
- `test/perf.test.ts` feeds 32 pathological strings of 60–120K chars to the 21 text-processing step functions and
  to `normalizeJob` (< 1.5 s per function, < 3 s per job). They include digit, space, `<`, `<p>`, entity, separator and keyword
  runs.
- The throughput test takes the best of six 300 ms windows on main-thread CPU. It always reports whether the
  5k target is met, but by default asserts only a 500 jobs/s sanity floor. On a shared machine the same code measured
  7.5k and, while the machine was swapping, 1.6k. `run bench` and `PERF_MIN_JOBS_PER_SEC=5000` enforce the target.

## Extending the reference data

Tables live in `src/data/`:

| File | Contents |
|---|---|
| `locations.ts` | cities, states, countries and currencies |
| `skills.ts` | `Name :: alias\|alias`, with context markers `~` capitalized, `=` upper-case and `!` list context |
| `companies.ts` | company aliases |
| `hosts.ts` | ATS, job-board and non-official hosts |
| `fx.ts` | static INR rates |

Add a test case next to every new entry. Keep regexes linear: bound repetitions, anchor runs with a lookbehind, and
cap input lengths. The perf suite fails on super-linear patterns.
