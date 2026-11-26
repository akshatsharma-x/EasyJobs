/**
 * Dev tool: turn saved Internshala pages into small, faithful test fixtures.
 *
 *   tsx scripts/capture-fixtures.ts                 # from .cache/discovery/*.html (see scripts/fetch-pages.ts)
 *
 * Listing pages keep only: the pinned-ids script variable, the H1, a selection of cards (chosen to cover every
 * variant: pinned, WFH, unpaid, lump sum, weekly, performance-based, part-time, PPO, hybrid, multi-city, fresher,
 * international, no logo) and the #pagination block. Detail pages keep: the JSON-LD scripts, the
 * internship_id/employment_type script variables and the .detail_view container (minus sign-up modals).
 * The retained markup is copied verbatim, so the parsers see real Internshala HTML.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as cheerio from "cheerio";
import { parseListingPage } from "../src/parse/listing";
import type { ListingCard } from "../src/types";

const here = dirname(fileURLToPath(import.meta.url));
const srcDir = join(here, "..", ".cache", "discovery");
const outDir = join(here, "..", "test", "fixtures");
mkdirSync(outDir, { recursive: true });

const LISTINGS: Record<string, string> = {
  "listing-internships": "internships",
  "listing-internships-page-2": "internships-page-2",
  "listing-internships-wfh": "internships-wfh",
  "listing-jobs": "jobs",
  "listing-jobs-wfh": "jobs-wfh",
};
const DETAILS: Record<string, string> = {
  "detail-internship": "detail-internship-1",
  "detail-internship-wfh-unpaid": "detail-internship-wfh-unpaid",
  "detail-internship-lumpsum": "detail-internship-lumpsum",
  "detail-internship-weekly": "detail-internship-weekly",
  "detail-internship-performance": "detail-internship-performance",
  "detail-job-ctc": "detail-job-1",
  "detail-job-hybrid-fresher": "detail-job-hybrid-fresher",
  "detail-job-no-jsonld": "detail-job-multi-location",
};

const FEATURES: [string, (c: ListingCard) => boolean][] = [
  ["pinned", (c) => c.pinned],
  ["wfh", (c) => c.isWfh],
  ["unpaid", (c) => /unpaid/i.test(c.salaryText ?? "")],
  ["lump", (c) => /lump/i.test(c.salaryText ?? "")],
  ["week", (c) => /week/i.test(c.salaryText ?? "") || /week/i.test(c.durationText ?? "")],
  ["performance", (c) => /performance/i.test(c.salaryText ?? "")],
  ["part-time", (c) => c.labels.some((l) => /part time/i.test(l))],
  ["ppo-amount", (c) => /₹/.test(c.ppoText ?? "")],
  ["ppo-plain", (c) => !!c.ppoText && !/₹/.test(c.ppoText)],
  ["hybrid", (c) => c.isHybrid],
  ["multi-city", (c) => c.locations.length > 2],
  ["fresher", (c) => c.labels.some((l) => /fresher/i.test(l))],
  ["experience", (c) => /year/i.test(c.experienceText ?? "")],
  ["international", (c) => c.labels.some((l) => /international/i.test(l))],
  ["no-logo", (c) => c.logoUrl === null],
  ["few-hours", (c) => /few hours/i.test(c.postedText ?? "")],
  ["weeks-ago", (c) => /weeks? ago/i.test(c.postedText ?? "")],
];

function pickCards(cards: ListingCard[], max: number, mustKeep: Set<string>): Set<string> {
  // Cards that have a detail fixture are always kept, so tests can map card + detail together.
  const picked = new Set<string>(cards.filter((c) => mustKeep.has(c.id)).map((c) => c.id));
  for (const [, test] of FEATURES) {
    if (picked.size >= max) break;
    if (cards.some((x) => picked.has(x.id) && test(x))) continue; // already covered
    const c = cards.find((x) => !picked.has(x.id) && test(x));
    if (c) picked.add(c.id);
  }
  for (const c of cards) if (picked.size < Math.min(max, 6)) picked.add(c.id); // a few plain ones too
  return picked;
}

function trimListing(html: string, mustKeep: Set<string>, max = 16): string {
  const $ = cheerio.load(html);
  const parsed = parseListingPage(html);
  const keep = pickCards(parsed.cards, max, mustKeep);
  // Page N wraps its cards in #internship_list_container_N.
  const container = $("#internship_list_container > [id^=internship_list_container_]").first();
  container.children(".individual_internship").each((_, el) => {
    if (!keep.has($(el).attr("internshipid") ?? "")) $(el).remove();
  });
  container.children(":not(.individual_internship)").remove();
  const pinned = html.match(/var pinned_internship_ids\s*=\s*"[^"]*";/)?.[0] ?? "";
  return [
    "<!DOCTYPE html>",
    `<html lang="en"><head><meta charset="utf-8"><title>${$("title").first().text().trim()}</title></head><body>`,
    `<script>${pinned}</script>`,
    $.html($("h1").first()),
    `<div class="internship_list_container with_breadcrumbs" id="internship_list_container">${$.html(container)}</div>`,
    `<nav>${$.html($("#pagination").first())}</nav>`,
    "</body></html>",
    "",
  ].join("\n");
}

function trimDetail(html: string): string {
  const $ = cheerio.load(html);
  const ld = $('script[type="application/ld+json"]')
    .toArray()
    .map((el) => `<script type="application/ld+json">${$(el).html() ?? ""}</script>`);
  const vars = ["internship_id", "employment_type"]
    .map((v) => html.match(new RegExp(`var ${v}\\s*=\\s*[^;\\n]*;`))?.[0])
    .filter(Boolean)
    .join(" ");
  const view = $(".detail_view").first();
  view.find(".modal, script, style, svg, form").remove();
  const status = view.find("#status").length > 0 ? "" : $.html($("#status").first());
  return [
    "<!DOCTYPE html>",
    `<html lang="en"><head><meta charset="utf-8"><title>${$("title").first().text().trim()}</title>`,
    ...ld,
    "</head><body>",
    `<script>${vars}</script>`,
    $.html(view),
    status,
    "</body></html>",
    "",
  ].join("\n");
}

const detailIds = new Set(
  Object.values(DETAILS)
    .map((src) => join(srcDir, `${src}.html`))
    .filter((file) => existsSync(file))
    .map((file) => readFileSync(file, "utf8").match(/internshipId="(\d+)"/)?.[1])
    .filter((id): id is string => !!id),
);

for (const [name, src] of Object.entries({ ...LISTINGS, ...DETAILS })) {
  const file = join(srcDir, `${src}.html`);
  if (!existsSync(file)) {
    console.warn(`skip ${name}: ${file} missing (fetch it with scripts/fetch-pages.ts)`);
    continue;
  }
  const html = readFileSync(file, "utf8");
  const out = name in LISTINGS ? trimListing(html, detailIds) : trimDetail(html);
  writeFileSync(join(outDir, `${name}.html`), out);
  console.log(`${name}.html  ${(out.length / 1024).toFixed(1)} KB  (from ${(html.length / 1024).toFixed(0)} KB)`);
}
