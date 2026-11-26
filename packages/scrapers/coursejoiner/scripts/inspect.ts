/**
 * Dev aid: see what the parser does with fixtures.
 *   tsx scripts/inspect.ts [--lines] [--desc] [--debug] test/fixtures/<site>/<id>.json …
 *   --lines  print the line model (sections, KV-ish lines, links)
 *   --desc   print the cleaned descriptionHtml
 *   --debug  print apply-link and company candidates
 */
import { readFileSync } from "node:fs";
import { buildContentModel } from "../src/parse/dom";
import { parsePost } from "../src/parse/post";
import { postFromFixture } from "../src/wp/rest";
import { getSite, SITES } from "../src/sites";
import { blogHosts } from "../src/wp/scraper";
import type { PostFixture } from "../src/wp/types";

const flags = new Set(process.argv.slice(2).filter((a) => a.startsWith("--")));
const files = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const hosts = blogHosts(SITES);

for (const file of files) {
  const fx = JSON.parse(readFileSync(file, "utf8")) as PostFixture;
  const site = getSite(fx.site);
  if (!site) throw new Error(`unknown site ${fx.site}`);
  const post = postFromFixture(fx);
  const res = parsePost(post, { site, extraBlogHosts: hosts });
  console.log(`${res.status === "jobs" ? "✓" : "✗"} ${fx.site}/${post.id} [${fx.shape ?? ""}] ${post.title}  conf=${res.confidence}${res.reason ? `  SKIP: ${res.reason}` : ""}`);
  if (flags.has("--lines")) {
    for (const l of buildContentModel(post.contentHtml, post.link).lines) {
      const links = l.links.map((x) => `${x.href.slice(0, 70)}«${x.text.slice(0, 30)}»`).join(" ; ");
      console.log(`  ${String(l.idx).padStart(3)} ${l.tag.padEnd(3)} ${l.inFaq ? "F" : " "} [${l.section.slice(0, 24)}] ${l.text.slice(0, 110)}${links ? `  → ${links}` : ""}`);
    }
  }
  for (const j of res.jobs) {
    console.log(`    ${j.sourceJobId} | ${j.company} | ${j.title} | ${j.locations.join(" / ")} | ${j.jobType}/${j.experienceLevel ?? "-"} | exp=${j.experienceRaw ?? "-"} | sal=${j.salaryRaw ?? "-"} | batch=${(j.batches ?? []).join(",")} | deg=${(j.degrees ?? []).join(",")} | until=${j.validThrough?.slice(0, 10) ?? "-"} | tags=${(j.tags ?? []).join(",")}`);
    console.log(`      apply=${j.applyUrl} (${String(j.extra?.applyLinkKind)} ${String(j.extra?.applyLinkScore)}) company<-${String(j.extra?.companySource)} role<-${String(j.extra?.roleSource)}`);
  }
  if (flags.has("--desc")) console.log((res.jobs[0]?.descriptionHtml ?? "(none)").replace(/></g, ">\n<"));
  if (flags.has("--debug")) {
    console.log("    apply candidates:", JSON.stringify(res.debug?.apply, null, 1));
    console.log("    company candidates:", JSON.stringify(res.debug?.company?.candidates));
  }
}
