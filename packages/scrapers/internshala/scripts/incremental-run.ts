/**
 * Dev tool: a worker-style incremental run against the live site.
 * Ids found in previous CLI output count as "known" (like GET /v1/ingest/known), so this shows what a
 * steady-state 20-minute run costs: requests made, pages per feed, new vs. known jobs.
 *
 *   tsx scripts/incremental-run.ts out/internshala-internships.jsonl out/internshala-jobs.jsonl
 */
import { readFileSync } from "node:fs";
import type { RawJob } from "@easyjobs/contract";
import { createHttpClient, createLogger, createScrapeContext, type HttpClient } from "@easyjobs/contract/node";
import { createInternshalaScrapers } from "../src/scrapers";

const files = process.argv.slice(2);
const known = new Map<string, Set<string>>();
for (const file of files) {
  for (const line of readFileSync(file, "utf8").split("\n").filter(Boolean)) {
    const job = JSON.parse(line) as RawJob;
    if (!known.has(job.source)) known.set(job.source, new Set());
    known.get(job.source)?.add(job.sourceJobId);
  }
}

const log = createLogger("incremental");
const base = createHttpClient({ log });
const requests: string[] = [];
const http: HttpClient = {
  fetch: (url, init) => {
    requests.push(url);
    return base.fetch(url, init);
  },
  json: (url, init) => base.json(url, init),
  text: (url, init) => base.text(url, init),
};

for (const scraper of createInternshalaScrapers()) {
  const ids = known.get(scraper.id) ?? new Set<string>();
  const before = requests.length;
  const t0 = Date.now();
  let fresh = 0;
  let light = 0;
  const ctx = createScrapeContext({ http, log: log.child(scraper.id), isKnown: (id) => ids.has(id) });
  for await (const job of scraper.scrape(ctx)) {
    if (ids.has(job.sourceJobId)) light++;
    else fresh++;
  }
  const made = requests.slice(before);
  console.log(
    JSON.stringify({
      scraper: scraper.id,
      knownIds: ids.size,
      emittedNew: fresh,
      emittedKnown: light,
      requests: made.length,
      listingRequests: made.filter((u) => !u.includes("/detail/")).map((u) => u.replace("https://internshala.com", "")),
      detailRequests: made.filter((u) => u.includes("/detail/")).length,
      seconds: Math.round((Date.now() - t0) / 100) / 10,
    }),
  );
}
