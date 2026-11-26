import { expect, test } from "@playwright/test";

test.describe("search", () => {
  test("home search → results", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Every internship and job");
    await page.getByTestId("search-what").fill("engineer");
    await page.getByTestId("search-where").fill("bangalore");
    await page.getByTestId("search-submit").click();
    await expect(page).toHaveURL(/\/jobs\?/);
    const url = new URL(page.url());
    expect(url.searchParams.get("q")).toBe("engineer");
    expect(url.searchParams.get("location")).toBe("Bengaluru");
    await expect(page.getByTestId("job-card").first()).toBeVisible();
    await expect(page.getByTestId("result-count")).toContainText(/\d+\s*jobs?/);
    await expect(page.getByTestId("active-filters")).toContainText("Bengaluru");
  });

  test("smart search turns tokens into filter chips (with undo)", async ({ page }) => {
    await page.goto("/jobs");
    const what = page.getByTestId("search-what");
    await what.fill("react intern in bangalore");
    await what.press("Enter");
    await expect(page).toHaveURL(/level=intern/);
    await expect(page).toHaveURL(/location=Bengaluru/);
    await expect(what).toHaveValue("react");
    await expect(page.getByText("Smart filters applied")).toBeVisible();
    await page.getByRole("button", { name: "Undo" }).click();
    await expect(page).not.toHaveURL(/level=intern/);
    await expect(what).toHaveValue("react intern in bangalore");
  });

  test("level tabs and sidebar filters update results and URL; back restores", async ({ page }) => {
    await page.goto("/jobs");
    const count = page.getByTestId("result-total");
    await expect(count).toHaveText(/\d/);
    const allText = await count.innerText();

    await page.getByTestId("level-tabs").getByRole("tab", { name: /Internships/ }).click();
    await expect(page).toHaveURL(/level=intern/);
    await expect(count).not.toHaveText(allText);
    const internText = await count.innerText();
    for (const card of await page.getByTestId("job-card").all().then((c) => c.slice(0, 5))) {
      await expect(card).toContainText("Internship");
    }

    await page.getByTestId("filter-panel").getByLabel("Remote").first().click();
    await expect(page).toHaveURL(/mode=remote/);
    await expect(count).not.toHaveText(internText);

    await page.getByTestId("official-switch").first().click();
    await expect(page).toHaveURL(/official=1/);
    await expect(page.getByTestId("active-filters")).toContainText("Official sites only");

    await page.goBack();
    await expect(page).not.toHaveURL(/official=1/);
    await expect(page).toHaveURL(/mode=remote/);
    await page.goBack();
    await expect(page).not.toHaveURL(/mode=remote/);
    await expect(count).toHaveText(internText);
    await page.goBack();
    await expect(page).not.toHaveURL(/level=/);
    await expect(count).toHaveText(allText);
  });

  test("removing a chip and clear all", async ({ page }) => {
    await page.goto("/jobs?level=fresher&location=Pune&sort=newest");
    const chips = page.getByTestId("active-filters");
    await expect(chips).toContainText("Pune");
    await chips.getByRole("button", { name: "Remove filter: Pune" }).click();
    await expect(page).not.toHaveURL(/location=/);
    await chips.getByRole("button", { name: "Clear all" }).click();
    await expect(page).not.toHaveURL(/level=/);
    await expect(page).toHaveURL(/sort=newest/);
  });

  test("sort menu writes to the URL", async ({ page }) => {
    await page.goto("/jobs");
    await page.getByTestId("sort-select").selectOption("salary");
    await expect(page).toHaveURL(/sort=salary/);
  });

  test("empty state suggests relaxations", async ({ page }) => {
    await page.goto("/jobs?q=zzzzqqq");
    await expect(page.getByTestId("empty-state")).toBeVisible();
    await page.getByTestId("empty-state").getByRole("button", { name: /Clear search/ }).click();
    await expect(page.getByTestId("job-card").first()).toBeVisible();
  });
});
