/**
 * Live-pill smoke test against the real stack: open /jobs, ingest new jobs with a manual worker run,
 * expect the "N new jobs match your filters" pill, click it, expect the new cards on top.
 *   BASE_URL=http://localhost:3000 node scripts/live-pill-check.mjs <scraper> <target>
 */
import { spawn } from "node:child_process";
import { chromium } from "@playwright/test";

const base = process.env.BASE_URL ?? "http://localhost:3000";
const [source = "greenhouse", target = "agility-robotics"] = process.argv.slice(2);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(`${base}/jobs`, { waitUntil: "networkidle" });
const firstBefore = await page.locator("[data-testid=job-title]").first().innerText();
console.log(`page open; first card: "${firstBefore}" — starting worker once --source ${source} --target ${target}`);
const t0 = Date.now();
const worker = spawn("pnpm", ["worker", "once", "--source", source, "--target", target, "--limit", "15"], { cwd: new URL("../../..", import.meta.url).pathname, stdio: ["ignore", "pipe", "pipe"] });
let workerOut = "";
worker.stdout.on("data", (d) => (workerOut += d));
worker.stderr.on("data", (d) => (workerOut += d));
const workerDone = new Promise((r) => worker.on("close", r)); // attach now: the run may finish before the pill shows
const pill = page.getByTestId("live-pill");
await pill.waitFor({ state: "visible", timeout: 120_000 });
const pillText = await pill.innerText();
const latency = ((Date.now() - t0) / 1000).toFixed(1);
await pill.click();
await page.waitForTimeout(600);
const firstAfter = await page.locator("[data-testid=job-title]").first().innerText();
await page.screenshot({ path: "screenshots/live-pill-real-api.png" });
await workerDone;
const summary = workerOut.split("\n").find((l) => / (ok|partial|error) +\S+ +[\d.]+m?s/.test(l)) ?? "";
console.log(`pill: "${pillText.replace(/\s+/g, " ")}" after ${latency}s · first card now: "${firstAfter}"`);
console.log(`worker: ${summary.replace(/^.*\] /, "").slice(0, 160)}`);
await browser.close();
process.exit(firstAfter !== firstBefore ? 0 : 1);
