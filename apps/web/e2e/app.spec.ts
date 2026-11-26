import { expect, test } from "@playwright/test";

test.describe("app chrome", () => {
  test("dark mode toggle persists", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto("/");
    await expect(page.locator("html")).not.toHaveClass(/dark/);
    await page.getByTestId("theme-toggle").click();
    await expect(page.locator("html")).toHaveClass(/dark/);
    await page.reload();
    await expect(page.locator("html")).toHaveClass(/dark/);
  });

  test("⌘K palette: open, run a preset, toggle theme", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto("/");
    await page.keyboard.press("ControlOrMeta+k");
    const palette = page.getByTestId("command-palette");
    await expect(palette).toBeVisible();
    await palette.getByRole("combobox").fill("remote intern");
    await palette.getByRole("option", { name: /Remote internships/ }).click();
    await expect(page).toHaveURL(/level=intern/);
    await expect(page).toHaveURL(/mode=remote/);

    await page.keyboard.press("ControlOrMeta+k");
    await expect(palette).toBeVisible();
    await palette.getByRole("combobox").fill("dark");
    await palette.getByRole("option", { name: /Dark theme/ }).click();
    await expect(page.locator("html")).toHaveClass(/dark/);
  });

  test("“/” focuses search", async ({ page }) => {
    await page.goto("/jobs");
    await page.locator("body").click({ position: { x: 5, y: 300 } });
    await page.keyboard.press("/");
    await expect(page.getByTestId("search-what")).toBeFocused();
  });

  test("preset landing pages and companies", async ({ page }) => {
    await page.goto("/internships");
    await expect(page.getByRole("heading", { level: 1, name: "Internships" })).toBeVisible();
    await expect(page.getByTestId("job-card").first()).toContainText("Internship");
    await page.goto("/companies");
    await expect(page.getByTestId("companies-grid").locator("a").first()).toBeVisible();
    await page.getByTestId("companies-grid").locator("a").first().click();
    await expect(page).toHaveURL(/\/companies\/[a-z0-9-]+/);
    await expect(page.getByTestId("job-card").first()).toBeVisible();
  });

  test("sitemap, robots and 404 page", async ({ page, request }) => {
    expect((await request.get("/sitemap.xml")).status()).toBe(200);
    expect(await (await request.get("/robots.txt")).text()).toContain("Sitemap:");
    const res = await page.goto("/definitely-not-a-page");
    expect(res?.status()).toBe(404);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("isn't hiring");
  });
});
