import { chromium } from "@playwright/test";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const logs = [];
page.on("console", (m) => { if (["error", "warning"].includes(m.type())) logs.push(`[${m.type()}] ${m.text().slice(0, 400)}`); });
page.on("pageerror", (e) => logs.push(`[pageerror] ${e.message.slice(0, 400)}`));
// Resolve a real job page from the live list (works for mock and real data).
const probe = await browser.newPage();
await probe.goto(`${process.env.BASE_URL ?? "http://localhost:3000"}/jobs`, { waitUntil: "networkidle" });
const jobHref = (await probe.locator("[data-testid=job-title]").first().getAttribute("href")) ?? "/jobs";
await probe.close();
for (const path of ["/", "/jobs?level=intern,fresher&mode=hybrid,remote", jobHref, "/companies", "/saved", "/about"]) {
  logs.push(`--- ${path}`);
  await page.goto(`${process.env.BASE_URL ?? "http://localhost:3000"}${path}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
}
console.log(logs.join("\n"));
await browser.close();
