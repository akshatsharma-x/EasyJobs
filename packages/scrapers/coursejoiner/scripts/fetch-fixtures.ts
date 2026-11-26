/**
 * Saves real posts as offline test fixtures (raw WP REST post + its terms).
 *
 *   pnpm --filter @easyjobs/scraper-coursejoiner fixtures <siteId> <postId>[:shape] [<postId>[:shape] …]
 *   pnpm --filter @easyjobs/scraper-coursejoiner fixtures <siteId> --search "walk-in" [--n 3]
 *
 * Polite: uses the contract HTTP client (robots.txt, retries) plus a ≥1 s per-host gap.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHttpClient, createLogger } from "@easyjobs/contract/node";
import { getSite } from "../src/sites";
import { politeHttp } from "../src/util/polite";
import type { PostFixture, WpRestPost, WpRestTerm } from "../src/wp/types";

const FIELDS = "id,date_gmt,modified_gmt,link,title,content,categories,tags";
const log = createLogger("fixtures");
const http = politeHttp(createHttpClient({ log }), 1100);

const argv = process.argv.slice(2);
const siteId = argv[0];
const site = siteId ? getSite(siteId) : undefined;
if (!site) {
  console.error("usage: fetch-fixtures <siteId> <postId[:shape]>… | --search <q> [--n N]");
  process.exit(1);
}
const api = `${site.baseUrl.replace(/\/+$/, "")}/wp-json/wp/v2`;
const outDir = fileURLToPath(new URL(`../test/fixtures/${site.id}/`, import.meta.url));
mkdirSync(outDir, { recursive: true });

async function terms(kind: "categories" | "tags", ids: number[]): Promise<WpRestTerm[]> {
  if (ids.length === 0) return [];
  return http.json<WpRestTerm[]>(`${api}/${kind}?include=${ids.join(",")}&per_page=100&_fields=id,slug,name`);
}

async function save(post: WpRestPost, shape?: string): Promise<void> {
  const fixture: PostFixture = {
    site: site!.id,
    fetchedAt: new Date().toISOString(),
    ...(shape ? { shape } : {}),
    post,
    terms: { categories: await terms("categories", post.categories ?? []), tags: await terms("tags", post.tags ?? []) },
  };
  const file = join(outDir, `${post.id}.json`);
  writeFileSync(file, JSON.stringify(fixture, null, 2) + "\n");
  log.info(`saved ${file}`, { title: post.title.rendered.slice(0, 80), shape });
}

const searchIdx = argv.indexOf("--search");
if (searchIdx >= 0) {
  const q = argv[searchIdx + 1] ?? "";
  const n = Number(argv[argv.indexOf("--n") + 1]) || 3;
  const posts = await http.json<WpRestPost[]>(`${api}/posts?search=${encodeURIComponent(q)}&per_page=${n}&_fields=${FIELDS}`);
  for (const p of posts) await save(p, `search:${q}`);
} else {
  const specs = argv.slice(1).map((s) => {
    const [id, shape] = s.split(":");
    return { id: Number(id), shape };
  });
  const ids = specs.map((s) => s.id).filter((n) => Number.isInteger(n) && n > 0);
  if (ids.length === 0) throw new Error("no post ids given");
  const posts = await http.json<WpRestPost[]>(`${api}/posts?include=${ids.join(",")}&per_page=${ids.length}&_fields=${FIELDS}`);
  for (const p of posts) await save(p, specs.find((s) => s.id === p.id)?.shape);
  const missing = ids.filter((id) => !posts.some((p) => p.id === id));
  if (missing.length > 0) log.warn("not found", { missing });
}
