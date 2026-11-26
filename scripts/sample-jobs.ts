/**
 * `pnpm sample-jobs <level> [n=50] [seed]` — prints a random sample of open jobs of one experience level as compact
 * rows (title | company | type | exp | batches | salary | source) for manual classification review (W2).
 */
import { createDatabase, loadRootEnv, sql } from "@easyjobs/db";

loadRootEnv();
const [level = "intern", nArg = "50", seed = "0.42"] = process.argv.slice(2);
const db = await createDatabase({});
try {
  await db.query(sql`SELECT setseed(${Number(seed)})`);
  const rows = await db.query<{ id: string; title: string; company: string; job_type: string; experience_min: number | null; experience_max: number | null; batches: number[]; salary: { min: number | null; max: number | null; currency: string; period: string } | null; src: string }>(sql`
    SELECT j.id, j.title, j.company, j.job_type, j.experience_min, j.experience_max, j.batches, j.salary, j.source_ids[1] AS src
    FROM jobs j WHERE j.status = 'open' AND j.experience_level = ${level} ORDER BY random() LIMIT ${Number(nArg)}`);
  for (const r of rows) {
    const exp = r.experience_min === null && r.experience_max === null ? "" : `${r.experience_min ?? ""}-${r.experience_max ?? ""}y`;
    const pay = r.salary ? `${r.salary.currency} ${r.salary.min ?? ""}-${r.salary.max ?? ""}/${r.salary.period}` : "";
    console.log([r.id, r.title.slice(0, 70), r.company.slice(0, 24), r.job_type, exp, r.batches.join(","), pay, r.src].join(" | "));
  }
} finally {
  await db.close();
}
