import { expect, test } from "@playwright/test";

test.describe("mobile", () => {
  test("filter sheet applies filters", async ({ page }) => {
    await page.goto("/jobs");
    await page.getByTestId("mobile-filters").click();
    const sheet = page.getByTestId("filter-sheet");
    await expect(sheet).toBeVisible();
    await sheet.getByRole("button", { name: "2026", exact: false }).first().click();
    await expect(page).toHaveURL(/batch=2026/);
    await sheet.getByTestId("apply-filters").click();
    await expect(sheet).toBeHidden();
    await expect(page.getByTestId("mobile-filters")).toContainText("1");
    await expect(page.getByTestId("active-filters")).toContainText("2026 batch");
  });

  test("tapping a card opens the full job page", async ({ page }) => {
    await page.goto("/jobs");
    await page.getByTestId("job-card").first().getByTestId("job-title").click();
    await expect(page).toHaveURL(/\/jobs\/[^/]+\/[^/?]+$/);
    await expect(page.getByTestId("job-page")).toBeVisible();
  });
});
