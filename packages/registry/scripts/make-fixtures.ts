/**
 * Build test/fixtures/html/* from the HTTP cache (no network): for each ATS type, take up to 2 careers pages
 * where detect-ats found that ATS, strip styles/SVGs/data URIs, trim around the evidence, and record the
 * expected {ats, token} in test/fixtures/html/manifest.json.
 *
 *   pnpm --filter @easyjobs/registry exec tsx scripts/make-fixtures.ts [--per-ats 2]
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { AtsType } from "@easyjobs/contract";
import { detectAts } from "../src/ats";
import { DETECT_FILE, loadDiscovery } from "./lib/discovery";
import { CACHE_DIR, parseArgs, PKG_ROOT, type FetchResult } from "./lib/fetcher";

export interface FixtureCase {
  file: string;
  url: string;
  slug: string;
  expected: { ats: AtsType; token: string };
}

const OUT = join(PKG_ROOT, "test", "fixtures", "html");
const MAX = 40_000;
const HEAD = 6_000;

export function trimHtml(html: string, needle: string): string {
  let s = html
    .replace(/<style\b[\s\S]*?<\/style>/gi, "<style></style>")
    .replace(/<svg\b[\s\S]*?<\/svg>/gi, "<svg></svg>")
    .replace(/data:[a-z/+.-]+;base64,[A-Za-z0-9+/=]{100,}/g, "data:,")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n");
  if (s.length <= MAX) return s;
  const at = Math.max(0, s.toLowerCase().indexOf(needle.toLowerCase()));
  const head = s.slice(0, HEAD);
  const start = Math.max(HEAD, at - 12_000);
  return `${head}\n<!-- … trimmed … -->\n${s.slice(start, start + MAX - HEAD)}`;
}

function cachedPages(): Map<string, FetchResult> {
  const byUrl = new Map<string, FetchResult>();
  const dir = join(CACHE_DIR, "http");
  for (const f of readdirSync(dir)) {
    try {
      const r = JSON.parse(readFileSync(join(dir, f), "utf8")) as FetchResult;
      if (r.status === 200 && /<html|<!doctype/i.test(r.body.slice(0, 3000))) {
        byUrl.set(r.finalUrl, r);
        byUrl.set(r.url, r);
      }
    } catch {
      /* skip unreadable cache entries */
    }
  }
  return byUrl;
}

function main(): void {
  const { flags } = parseArgs(process.argv.slice(2));
  const perAts = Number(flags.get("per-ats") ?? 2);
  const detect = loadDiscovery(DETECT_FILE);
  const pages = cachedPages();
  const cases: FixtureCase[] = [];
  const count = new Map<string, number>();
  mkdirSync(OUT, { recursive: true });
  for (const rec of Object.values(detect)) {
    const top = rec.proposals[0];
    if (!top || !rec.careersUrl) continue;
    // Prefer fixtures whose board plausibly belongs to the company (token-style ATSs only).
    const tok = top.token.replace(/^eu:/, "").toLowerCase().replace(/[^a-z0-9]/g, "");
    const slug = rec.slug.replace(/-/g, "");
    if (!/^https?:/.test(top.token) && !tok.includes(slug.slice(0, 4)) && !slug.includes(tok.slice(0, 4))) continue;
    if ((count.get(top.ats) ?? 0) >= perAts) continue;
    const page = pages.get(rec.careersUrl);
    if (!page) continue;
    // Only keep pages whose HTML alone reproduces the detection (not redirect-only or bundle-only evidence).
    const again = detectAts({ url: page.finalUrl, html: page.body })[0];
    if (!again || again.ats !== top.ats || again.token !== top.token) continue;
    const needle = top.token.split("|")[0]!.replace(/^https:\/\//, "").split("/")[0]!;
    const html = trimHtml(page.body, top.ats === "phenom" || top.ats === "successfactors" ? (top.ats === "phenom" ? "phApp" : "successfactors") : needle);
    const check = detectAts({ url: page.finalUrl, html })[0];
    if (!check || check.ats !== top.ats || check.token !== top.token) continue; // trimming lost the evidence
    const file = `${top.ats}-${rec.slug}.html`;
    writeFileSync(join(OUT, file), `<!-- fixture: ${page.finalUrl} (fetched ${page.fetchedAt.slice(0, 10)}, trimmed) -->\n${html}`);
    cases.push({ file, url: page.finalUrl, slug: rec.slug, expected: { ats: top.ats, token: top.token } });
    count.set(top.ats, (count.get(top.ats) ?? 0) + 1);
  }
  cases.sort((a, b) => a.file.localeCompare(b.file));
  writeFileSync(join(OUT, "manifest.json"), JSON.stringify(cases, null, 2) + "\n");
  console.log(`wrote ${cases.length} fixtures:`, Object.fromEntries(count));
}

main();
