import { chromium } from "@playwright/test";
const base = process.env.BASE_URL ?? "http://localhost:3000";
const browser = await chromium.launch();
for (const path of (process.argv[2] ?? "/,/jobs").split(",")) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto(base + path, { waitUntil: "load" });
  await page.waitForTimeout(2500);
  const t = await page.evaluate(() => {
    const paints = Object.fromEntries(performance.getEntriesByType("paint").map((p) => [p.name, Math.round(p.startTime)]));
    const nav = performance.getEntriesByType("navigation")[0];
    const lcp = new Promise((resolve) => {
      new PerformanceObserver((list) => { const e = list.getEntries().at(-1); resolve({ lcp: Math.round(e.startTime), el: e.element?.tagName + "." + String(e.element?.className).slice(0, 40) }); }).observe({ type: "largest-contentful-paint", buffered: true });
    });
    return lcp.then((l) => ({ ...paints, ...l, dcl: Math.round(nav.domContentLoadedEventEnd), load: Math.round(nav.loadEventEnd) }));
  });
  console.log(path, JSON.stringify(t));
  await page.close();
}
await browser.close();
