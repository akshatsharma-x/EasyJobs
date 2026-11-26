/**
 * `pnpm reclassify [--dry-run]` — re-applies the current normalize level / job-type / non-job rules to stored jobs
 * (stored rows keep the classification of the normalizer version that ingested them, and light re-sightings never
 * overwrite description-derived fields). Structured hints are re-fed to the classifier. Stop `pnpm dev` (PGlite).
 */
import { createDatabase, loadRootEnv, sql } from "@easyjobs/db";
import { classifyLevelDetailed, detectTags, jobTypeFromTitle, parseExperience } from "@easyjobs/normalize";
import type { ExperienceLevel, JobType } from "@easyjobs/contract";

loadRootEnv();
const dryRun = process.argv.includes("--dry-run");
/** Hints we no longer trust (W2): Capgemini's "Executives" employee grade. */
const UNTRUSTED_HINT = (source: string, level: string): boolean => source === "capgemini" && level === "executive";

interface Row {
  id: string;
  title: string;
  company: string;
  description_text: string | null;
  job_type: JobType;
  experience_level: ExperienceLevel;
  experience_min: number | null;
  experience_max: number | null;
  batches: number[];
  tags: string[];
  src: string;
  level_source: string | null;
  exp_source: string | null;
}

const db = await createDatabase({});
const changes = { level: new Map<string, number>(), jobType: 0, closed: 0, years: 0, scanned: 0 };
try {
  const rows = await db.query<Row>(sql`
    SELECT id, title, company, description_text, job_type, experience_level, experience_min, experience_max, batches, tags,
           source_ids[1] AS src, extra->'normalize'->'sources'->>'level' AS level_source,
           extra->'normalize'->'sources'->>'experience' AS exp_source
    FROM jobs WHERE status = 'open'`);
  for (const r of rows) {
    changes.scanned++;
    let jobType = r.job_type;
    if ((jobType === "full_time" || jobType === "contract" || jobType === "temporary") && jobTypeFromTitle(r.title) === "internship") jobType = "internship";
    // Stored hints go back through the classifier, which applies the current hint rules (e.g. "executive" needs the title).
    const hint = r.level_source === "hint" && !UNTRUSTED_HINT(r.src, r.experience_level) ? r.experience_level : undefined;
    // Stored years are evidence only when normalize recorded where they came from; otherwise they were derived from
    // the level (interns get 0) and must not be fed back as "explicit years".
    const EVIDENCE = ["hint", "raw", "title", "description"] as const;
    let expSource = (EVIDENCE as readonly string[]).includes(r.exp_source ?? "") ? (r.exp_source as (typeof EVIDENCE)[number]) : null;
    let expMin = expSource ? r.experience_min : null;
    let expMax = expSource ? r.experience_max : null;
    // Description years are re-parsed with the current parser ("200,000 years of audio" used to read as 0 years).
    if (expSource === "description") {
      const parsed = r.description_text ? parseExperience(r.description_text, { strict: true }) : null;
      expMin = parsed?.min ?? null;
      expMax = parsed?.max ?? null;
      if (!parsed) expSource = null;
    }
    const detail = classifyLevelDetailed({
      title: r.title,
      description: r.description_text,
      jobType,
      hint,
      experienceMin: expMin,
      experienceMax: expMax,
      experienceSource: expSource,
      batches: r.batches,
      tags: r.tags,
      company: r.company,
    });
    const level = detail.level;
    // Without stated years, intern / fresher imply 0 (as normalizeJob does); other levels imply nothing.
    if (!expSource) {
      expMin = level === "intern" || level === "fresher" ? 0 : null;
      expMax = null;
    }
    const extraTags = detectTags({ title: r.title }).filter((t) => t === "test-posting" || t === "general-application");
    const tags = [...new Set([...r.tags, ...extraTags])];
    const nonJob = tags.includes("test-posting") ? "test_posting" : tags.includes("general-application") ? "not_a_job" : null;
    const levelChanged = level !== r.experience_level;
    const yearsChanged = expMin !== r.experience_min || expMax !== r.experience_max;
    if (!levelChanged && !yearsChanged && jobType === r.job_type && tags.length === r.tags.length) continue;
    if (yearsChanged) changes.years++;
    if (levelChanged) changes.level.set(`${r.experience_level}→${level}`, (changes.level.get(`${r.experience_level}→${level}`) ?? 0) + 1);
    if (jobType !== r.job_type) changes.jobType++;
    if (nonJob) changes.closed++;
    if (dryRun) continue;
    await db.query(sql`
      UPDATE jobs SET experience_level = ${level}, job_type = ${jobType}, tags = ARRAY(SELECT jsonb_array_elements_text(${JSON.stringify(tags)}::jsonb)),
        experience_min = ${expMin}, experience_max = ${expMax},
        extra = jsonb_set(jsonb_set(coalesce(extra, '{}'::jsonb), '{normalize,sources,level}', to_jsonb(${detail.source}::text), true),
                          '{normalize,sources,experience}', coalesce(to_jsonb(${expSource}::text), 'null'::jsonb), true),
        status = CASE WHEN ${nonJob}::text IS NULL THEN status ELSE 'closed' END,
        closed_reason = CASE WHEN ${nonJob}::text IS NULL THEN closed_reason ELSE ${nonJob}::text END,
        updated_at = now()
      WHERE id = ${r.id}`);
  }
  const top = [...changes.level.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, v]) => `${k} ${v}`).join(", ");
  console.log(`${dryRun ? "[dry run] " : ""}scanned ${changes.scanned} open jobs · level changes: ${[...changes.level.values()].reduce((a, b) => a + b, 0)} (${top}) · years re-parsed: ${changes.years} · job type → internship: ${changes.jobType} · closed as non-jobs: ${changes.closed}`);
} finally {
  await db.close();
}
