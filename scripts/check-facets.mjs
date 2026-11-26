#!/usr/bin/env node
/**
 * `node scripts/check-facets.mjs` — facet counts must equal the filtered totals (against the running API):
 * samples buckets of every facet group, checks disjunctive semantics and stats ↔ facets consistency.
 */
import { apiUrl, loadRootEnv } from "./env.mjs";

loadRootEnv();
const API = apiUrl();
const get = async (q) => (await fetch(`${API}/v1/jobs?${q}`)).json();
const base = await get("pageSize=1");
let checked = 0;
const mismatches = [];
for (const [key, buckets] of Object.entries(base.facets)) {
  const rest = buckets.slice(4);
  const sample = [...buckets.slice(0, 4), ...rest.sort(() => Math.random() - 0.5).slice(0, 3)];
  for (const b of sample) {
    const r = await get(`${key}=${encodeURIComponent(b.value)}&pageSize=1`);
    checked++;
    if (r.total !== b.count) mismatches.push(`${key}=${b.value}: facet ${b.count} vs total ${r.total}`);
  }
}
const lv = await get("level=intern&pageSize=1");
const same = JSON.stringify(lv.facets.level) === JSON.stringify(base.facets.level);
const stats = await (await fetch(`${API}/v1/stats`)).json();
const statsOk = base.facets.level.every((b) => stats.byLevel[b.value] === b.count) && stats.totalOpen === base.total;
console.log(`total open ${base.total} · ${checked} buckets checked, ${mismatches.length} mismatches · disjunctive level facet: ${same} · stats consistent: ${statsOk}`);
for (const m of mismatches) console.log(`  ✗ ${m}`);
process.exit(mismatches.length === 0 && same && statsOk ? 0 : 1);
