import { test, type Page } from "@playwright/test";

const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "mobile", width: 390, height: 844 },
] as const;
const THEMES = ["light", "dark"] as const;
const OUT = "screenshots";

async function settle(page: Page): Promise<void> {
  await page.waitForLoadState("networkidle").catch(() => undefined);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
}

async function seedSaved(page: Page): Promise<void> {
  await page.goto("/jobs");
  await settle(page);
  const buttons = page.locator("[data-testid=job-card] [data-testid=save-job]");
  for (let i = 0; i < 5; i++) await buttons.nth(i).click();
  await page.evaluate(() => {
    const raw = localStorage.getItem("easyjobs:saved");
    if (!raw) return;
    const data = JSON.parse(raw) as { state: { entries: Record<string, { status: string; notes: string }>; order: string[] } };
    const statuses = ["interviewing", "applied", "saved", "offer", "applied"];
    data.state.order.forEach((id, i) => {
      const entry = data.state.entries[id];
      if (!entry) return;
      entry.status = statuses[i] ?? "saved";
      if (i === 0) entry.notes = "Referral from Ananya · system design round on Friday";
    });
    localStorage.setItem("easyjobs:saved", JSON.stringify(data));
  });
}

for (const vp of VIEWPORTS) {
  for (const theme of THEMES) {
    test.describe(`${vp.name} ${theme}`, () => {
      test.use({ viewport: { width: vp.width, height: vp.height }, colorScheme: theme, deviceScaleFactor: 1 });
      const shot = (page: Page, name: string, fullPage = false) =>
        page.screenshot({ path: `${OUT}/${name}-${vp.name}-${theme}.png`, fullPage });

      test("home", async ({ page }) => {
        await page.goto("/");
        await settle(page);
        await shot(page, "home", vp.name === "desktop");
      });

      test("jobs with filters", async ({ page }) => {
        await page.goto("/jobs?level=intern,fresher&mode=hybrid,remote&location=Bengaluru,Remote&sort=newest");
        await settle(page);
        await shot(page, "jobs");
      });

      test("job page", async ({ page }) => {
        await page.goto("/jobs?level=intern");
        await settle(page);
        const href = await page.locator("[data-testid=job-card] [data-testid=job-title]").first().getAttribute("href");
        await page.goto(href ?? "/jobs");
        await settle(page);
        await shot(page, "job", vp.name === "desktop");
      });

      test("companies", async ({ page }) => {
        await page.goto("/companies");
        await settle(page);
        await shot(page, "companies");
      });

      test("saved", async ({ page }) => {
        await seedSaved(page);
        await page.goto("/saved");
        await settle(page);
        await shot(page, "saved");
      });
    });
  }
}
