/**
 * Dev-only discovery tool: open a careers page in the locally installed Chrome and log the
 * XHR/fetch calls the page itself makes (method, status, content-type, URL, POST body),
 * saving JSON response bodies to .cache/capture/<host>/ for inspection.
 *
 *   npx tsx scripts/capture.ts <url> [--wait 8000] [--all] [--headful]
 *
 * Not used at runtime — production scrapers use createHttpClient from @easyjobs/contract/node.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright-core";

const argv = process.argv.slice(2);
const url = argv.find((a) => /^https?:\/\//.test(a));
if (!url) {
  console.error("usage: tsx scripts/capture.ts <url> [--wait ms] [--all] [--headful]");
  process.exit(2);
}
const flag = (name: string): string | undefined => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
};
const waitMs = Number(flag("wait") ?? 8000);
const all = argv.includes("--all");
const host = new URL(url).host;
const dir = join(process.cwd(), ".cache", "capture", host);
mkdirSync(dir, { recursive: true });

const browser = await chromium.launch({ channel: "chrome", headless: !argv.includes("--headful") });
const page = await browser.newPage();
let n = 0;
page.on("response", async (res) => {
  const req = res.request();
  const type = req.resourceType();
  if (!all && type !== "xhr" && type !== "fetch" && type !== "document") return;
  const ct = res.headers()["content-type"] ?? "";
  const line = `${req.method()} ${res.status()} [${type}] ${ct.split(";")[0]} ${res.url()}`;
  console.log(line);
  const post = req.postData();
  if (post) console.log(`    body: ${post.slice(0, 600)}`);
  if (/json|javascript/.test(ct) || type === "document") {
    try {
      const body = await res.text();
      const file = join(dir, `${String(++n).padStart(3, "0")}.${/json/.test(ct) ? "json" : type === "document" ? "html" : "txt"}`);
      writeFileSync(file, `// ${line}\n// body: ${post ?? ""}\n${body}`);
      console.log(`    saved ${file} (${body.length} bytes)`);
    } catch {
      /* redirects have no body */
    }
  }
});
try {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 });
} catch (e) {
  console.error("goto failed:", e instanceof Error ? e.message : e);
}
await page.waitForTimeout(waitMs);
writeFileSync(join(dir, "final.html"), await page.content());
console.log(`final DOM → ${join(dir, "final.html")}`);
await browser.close();
