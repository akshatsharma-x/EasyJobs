/**
 * Dev tool: politely fetch Internshala pages into .cache/discovery/ for inspection.
 * Uses the contract HTTP client (robots.txt enforced, one request per host every ≥1.5 s).
 *
 *   tsx scripts/fetch-pages.ts <name>=<path-or-url> [<name>=<path-or-url> …]
 *
 * Existing files are not re-fetched (pass --force to refetch).
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHttpClient, createLogger } from "@easyjobs/contract/node";

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, "..", ".cache", "discovery");
mkdirSync(outDir, { recursive: true });

const args = process.argv.slice(2);
const force = args.includes("--force");
const log = createLogger("fetch-pages");
const http = createHttpClient({ log, perHostConcurrency: 1, perHostDelayMs: 1500 });

for (const arg of args.filter((a) => !a.startsWith("--"))) {
  const eq = arg.indexOf("=");
  if (eq <= 0) throw new Error(`Expected <name>=<path-or-url>, got "${arg}"`);
  const name = arg.slice(0, eq).replace(/[^a-z0-9._-]/gi, "_");
  const target = arg.slice(eq + 1);
  const url = /^https?:\/\//.test(target) ? target : `https://internshala.com${target}`;
  const file = join(outDir, `${name}.html`);
  if (existsSync(file) && !force) {
    log.info(`cached  ${name}`);
    continue;
  }
  try {
    const res = await http.fetch(url, { headers: { accept: "text/html" } });
    const body = await res.text();
    writeFileSync(file, body);
    log.info(`fetched ${name}`, { status: res.status, bytes: body.length, finalUrl: res.url });
  } catch (e) {
    log.error(`failed  ${name}`, { url, error: e instanceof Error ? e.message : String(e) });
  }
}
