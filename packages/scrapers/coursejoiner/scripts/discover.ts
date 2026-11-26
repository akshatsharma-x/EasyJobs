/**
 * Vet a WordPress job blog before adding it to src/sites.ts:
 *   pnpm --filter @easyjobs/scraper-coursejoiner discover kickcharm.com www.freshersvoice.com
 * Prints robots.txt verdicts for the exact URLs the scraper requests, REST availability (+ post totals, freshness),
 * the feed status and Content-Signal lines. Polite: a handful of requests per host, ≥ 1 s apart.
 */
import { createHttpClient, createLogger, DEFAULT_USER_AGENT, isPathAllowed, parseRobots } from "@easyjobs/contract/node";
import { politeHttp } from "../src/util/polite";

const UA = process.env.SCRAPER_USER_AGENT ?? DEFAULT_USER_AGENT;
const log = createLogger("discover");
const http = politeHttp(createHttpClient({ log, robots: false }), 1100); // robots evaluated explicitly below
const PATHS = {
  rest: "/wp-json/wp/v2/posts?per_page=100&page=1&orderby=date&order=desc&after=2026-01-01T00:00:00Z&_fields=id",
  restInclude: "/wp-json/wp/v2/posts?include=1,2&per_page=2&_fields=id,content",
  terms: "/wp-json/wp/v2/categories?include=1&per_page=100&_fields=id,slug,name",
  feed: "/feed/",
  sitemap: "/sitemap_index.xml",
  post: "/some-post-slug/",
};

for (const host of process.argv.slice(2)) {
  const origin = `https://${host.replace(/^https?:\/\//, "").replace(/\/+$/, "")}`;
  const lines: string[] = [`## ${origin}`];
  try {
    const robotsRes = await http.fetch(`${origin}/robots.txt`);
    const robotsTxt = robotsRes.ok ? await robotsRes.text() : "";
    const rules = parseRobots(robotsTxt, UA);
    lines.push(`robots.txt ${robotsRes.status}; disallow for our UA: ${JSON.stringify(rules.disallow)}`);
    const signals = robotsTxt.split(/\r?\n/).filter((l) => /^content-signal:/i.test(l.trim()));
    if (signals.length > 0) lines.push(`content signals: ${signals.join(" | ")} → set llm: false`);
    for (const [k, p] of Object.entries(PATHS)) lines.push(`  ${isPathAllowed(rules, p) ? "ALLOW" : "DENY "} ${k.padEnd(11)} ${p}`);
    // Only probe what robots.txt allows (verdicts above are computed without fetching).
    const restProbe = "/wp-json/wp/v2/posts?per_page=5&_fields=id,date_gmt,title,categories";
    if (isPathAllowed(rules, restProbe)) {
      const rest = await http.fetch(`${origin}${restProbe}`);
      const type = rest.headers.get("content-type") ?? "";
      if (rest.ok && type.includes("json")) {
        const posts = (await rest.json()) as { id: number; date_gmt: string; title: { rendered: string } }[];
        lines.push(`REST ok — total ${rest.headers.get("x-wp-total") ?? "?"} posts; latest: ${posts.map((p) => `${p.date_gmt.slice(0, 10)} ${p.title.rendered.slice(0, 50)}`).join(" || ")}`);
      } else lines.push(`REST unavailable (${rest.status} ${type})`);
    } else lines.push("REST not probed: disallowed by robots.txt");
    if (isPathAllowed(rules, PATHS.feed)) {
      const feed = await http.fetch(`${origin}/feed/`);
      const xml = feed.ok ? await feed.text() : "";
      lines.push(`feed ${feed.status}: ${(xml.match(/<item>/g) ?? []).length} items, full content: ${xml.includes("content:encoded") ? "yes" : "no"}, etag: ${feed.headers.get("etag") ? "yes" : "no"}`);
    } else lines.push("feed not probed: disallowed by robots.txt");
  } catch (e) {
    lines.push(`error: ${e instanceof Error ? e.message : String(e)}`);
  }
  console.log(lines.join("\n"));
}
