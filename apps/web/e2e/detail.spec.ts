import { expect, test } from "@playwright/test";

test.describe("job detail", () => {
  test("split preview opens on click and keyboard moves selection", async ({ page }) => {
    await page.goto("/jobs");
    const cards = page.getByTestId("job-card");
    await expect(cards.nth(1)).toBeVisible();
    const secondTitle = (await cards.nth(1).getByTestId("job-title").innerText()).trim();
    await cards.nth(1).getByTestId("job-title").click();
    await expect(page).toHaveURL(/[?&]job=/);
    await expect(page.getByTestId("job-preview")).toContainText(secondTitle);

    await page.locator("body").press("j");
    const thirdTitle = (await cards.nth(2).getByTestId("job-title").innerText()).trim();
    await expect(page.getByTestId("job-preview")).toContainText(thirdTitle);
    await page.keyboard.press("k");
    await expect(page.getByTestId("job-preview")).toContainText(secondTitle);
  });

  test("job page renders with JSON-LD, canonical and apply CTA", async ({ page }) => {
    await page.goto("/jobs");
    const href = await page.getByTestId("job-card").first().getByTestId("job-title").getAttribute("href");
    expect(href).toBeTruthy();
    await page.goto(href ?? "/");
    await expect(page.getByTestId("job-page")).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByRole("link", { name: /Apply on/ }).first()).toHaveAttribute("target", "_blank");
    const jsonLd = await page.locator('script[type="application/ld+json"]').first().textContent();
    expect(JSON.parse(jsonLd ?? "{}")["@type"]).toBe("JobPosting");
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", new RegExp(`${href}$`));
    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute("content", /\/og\/jobs\//);
  });

  test("unknown job is a 404, wrong slug redirects to canonical", async ({ page, request }) => {
    const missing = await request.get("/jobs/does-not-exist/x", { maxRedirects: 0 });
    expect(missing.status()).toBe(404);
    await page.goto("/jobs");
    const href = (await page.getByTestId("job-card").first().getByTestId("job-title").getAttribute("href")) ?? "";
    const id = href.split("/")[2] ?? "";
    const res = await request.get(`/jobs/${id}/wrong-slug`, { maxRedirects: 0 });
    expect(res.status()).toBe(308);
    expect(res.headers().location).toContain(href);
  });

  test("a saved job persists after reload and shows in the tracker", async ({ page }) => {
    await page.goto("/jobs");
    const first = page.getByTestId("job-card").first();
    const title = (await first.getByTestId("job-title").innerText()).trim();
    await first.getByTestId("save-job").click();
    await expect(first.getByTestId("save-job")).toHaveAttribute("aria-pressed", "true");
    await page.reload();
    await expect(page.getByTestId("job-card").first().getByTestId("save-job")).toHaveAttribute("aria-pressed", "true");
    await page.goto("/saved");
    await expect(page.getByTestId("saved-row").first()).toContainText(title);
    await page.getByTestId("status-menu").first().click();
    await page.getByRole("menuitemradio", { name: "Applied" }).click();
    await page.reload();
    await expect(page.getByTestId("status-menu").first()).toContainText("Applied");
    const download = page.waitForEvent("download");
    await page.getByTestId("export-csv").click();
    expect((await download).suggestedFilename()).toMatch(/easyjobs-tracker-.*\.csv/);
  });
});
