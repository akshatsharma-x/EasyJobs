/**
 * W2 · Web E2E against the real API (playwright.real.config.ts). Every filter group is cross-checked against
 * GET /v1/jobs for the same URL, the job page's JSON-LD is validated, the apply link must open the official URL,
 * the live pill must react to a real ingest, and axe must find no serious/critical violations.
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const API = process.env.E2E_API_URL ?? "http://localhost:4000";
const INGEST_KEY = process.env.INGEST_API_KEY ?? "dev-ingest-key";

type ApiJob = { id: string; slug: string; title: string; applyUrl: string; isOfficial: boolean; company: { name: string } };

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, init);
  if (!res.ok) throw new Error(`${path} → ${res.status}`);
  return (await res.json()) as T;
}

/** The API's total for the page's current URL (the URL is the search state). */
async function apiTotalFor(page: Page): Promise<number> {
  const qs = new URL(page.url()).searchParams;
  qs.delete("job");
  qs.set("pageSize", "1");
  return (await api<{ total: number }>(`/v1/jobs?${qs.toString()}`)).total;
}
const uiTotal = async (page: Page): Promise<number> => Number((await page.getByTestId("result-total").innerText()).replace(/\D/g, ""));

async function expectTotalsAgree(page: Page): Promise<void> {
  await expect.poll(async () => (await uiTotal(page)) === (await apiTotalFor(page)), { timeout: 15_000 }).toBe(true);
}

async function openSection(page: Page, title: string): Promise<void> {
  const details = page.getByTestId("filter-panel").locator("details", { has: page.locator("summary", { hasText: title }) }).first();
  if ((await details.getAttribute("open")) === null) await details.locator("summary").click();
  await expect(details).toHaveAttribute("open", "");
}
const section = (page: Page, title: string) => page.getByTestId("filter-panel").locator("details", { has: page.locator("summary", { hasText: title }) }).first();

test.describe("real API · filters", () => {
  test("every filter group changes the URL and the UI total equals the API total", async ({ page }) => {
    await page.goto("/jobs");
    await expect(page.getByTestId("job-card").first()).toBeVisible();
    await expectTotalsAgree(page);

    // checkbox groups: tick the first option, check, untick
    for (const [title, key] of [
      ["Job type", "type"],
      ["Experience level", "level"],
      ["Work mode", "mode"],
      ["Location", "location"],
      ["Company", "company"],
      ["Category", "category"],
      ["Source", "source"],
    ] as const) {
      await openSection(page, title);
      const box = section(page, title).getByRole("checkbox").first();
      await box.check();
      await expect(page, title).toHaveURL(new RegExp(`[?&]${key}=`));
      await expectTotalsAgree(page);
      await box.uncheck();
      await expect(page, title).not.toHaveURL(new RegExp(`[?&]${key}=`));
    }

    // chip groups (aria-pressed buttons)
    for (const [title, key] of [
      ["Your experience", "exp"],
      ["Batch", "batch"],
      ["Company type", "ctype"],
      ["Tags", "tag"],
    ] as const) {
      await openSection(page, title);
      const chip = section(page, title).locator("button[aria-pressed]").first();
      if ((await chip.count()) === 0) continue; // e.g. no batch facets in the current data
      await chip.click();
      await expect(page, title).toHaveURL(new RegExp(`[?&]${key}=`));
      await expectTotalsAgree(page);
      await chip.click();
      await expect(page, title).not.toHaveURL(new RegExp(`[?&]${key}=`));
    }

    // posted within (radio), salary, official-only, sort
    await openSection(page, "Posted within");
    await section(page, "Posted within").getByRole("radio").first().check();
    await expect(page).toHaveURL(/[?&]posted=/);
    await expectTotalsAgree(page);

    await openSection(page, "Minimum salary");
    const salary = section(page, "Minimum salary").getByRole("button").first();
    if ((await salary.count()) > 0) {
      await salary.click();
      await expect(page).toHaveURL(/[?&]salaryMin=/);
      await expectTotalsAgree(page);
    }

    await page.getByTestId("official-switch").first().click();
    await expect(page).toHaveURL(/official=1/);
    await expectTotalsAgree(page);

    await page.getByTestId("sort-select").selectOption("newest");
    await expect(page).toHaveURL(/sort=newest/);
    await expectTotalsAgree(page);
  });

  test("level tabs and a shared URL reproduce the same results; back restores", async ({ page, context }) => {
    await page.goto("/jobs");
    await page.getByTestId("level-tabs").getByRole("tab", { name: /Fresher/ }).click();
    await expect(page).toHaveURL(/level=fresher/);
    await expectTotalsAgree(page);
    const shared = page.url();
    const firstTitle = (await page.getByTestId("job-card").first().getByTestId("job-title").innerText()).trim();

    const other = await context.newPage();
    await other.goto(shared);
    await expect(other.getByTestId("job-card").first().getByTestId("job-title")).toHaveText(firstTitle);
    expect(await uiTotal(other)).toBe(await uiTotal(page));
    await other.close();

    await page.goBack();
    await expect(page).not.toHaveURL(/level=/);
    await expectTotalsAgree(page);
  });

  test("smart chips: 'remote fresher jobs' becomes filters the API agrees with", async ({ page }) => {
    await page.goto("/jobs");
    const what = page.getByTestId("search-what");
    await what.fill("remote fresher jobs");
    await what.press("Enter");
    await expect(page).toHaveURL(/level=fresher/);
    await expect(page).toHaveURL(/mode=remote/);
    await expectTotalsAgree(page);
  });
});

test.describe("real API · job page", () => {
  test("JSON-LD is a valid JobPosting and the apply link opens the official URL", async ({ page, context }) => {
    const list = await api<{ data: ApiJob[] }>("/v1/jobs?official=1&sort=newest&pageSize=1");
    const job = list.data[0]!;
    expect(job.isOfficial).toBe(true);
    await page.goto(`/jobs/${job.id}/${job.slug}`);
    await expect(page.getByTestId("job-page")).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(job.title);

    const raw = await page.locator('script[type="application/ld+json"]').allTextContents();
    const posting = raw.map((r) => JSON.parse(r) as Record<string, unknown>).find((d) => d["@type"] === "JobPosting");
    expect(posting, "JobPosting JSON-LD").toBeTruthy();
    // Google for Jobs required properties + the ones we always emit
    expect(posting!["@context"]).toBe("https://schema.org");
    expect(posting!.title).toBe(job.title);
    expect(String(posting!.description ?? "").length).toBeGreaterThan(20);
    expect(Number.isNaN(Date.parse(String(posting!.datePosted)))).toBe(false);
    expect((posting!.hiringOrganization as { name?: string }).name).toBe(job.company.name);
    const remote = posting!.jobLocationType === "TELECOMMUTE";
    if (remote) expect(posting!.applicantLocationRequirements).toBeTruthy();
    else expect(posting!.jobLocation).toBeTruthy();
    if (posting!.validThrough) expect(Number.isNaN(Date.parse(String(posting!.validThrough)))).toBe(false);
    if (posting!.baseSalary) expect((posting!.baseSalary as { currency?: string }).currency).toMatch(/^[A-Z]{3}$/);

    // The apply link opens the job's official URL in a new tab. External hosts are stubbed so the test makes no
    // request to the employer's site.
    await context.route(/^https?:\/\/(?!localhost|127\.0\.0\.1)/, (route) => route.fulfill({ status: 200, contentType: "text/html", body: "<title>stub</title>" }));
    const apply = page.getByRole("link", { name: /Apply/ }).first();
    await expect(apply).toHaveAttribute("href", job.applyUrl);
    await expect(apply).toHaveAttribute("target", "_blank");
    const [popup] = await Promise.all([page.waitForEvent("popup"), apply.click()]);
    await popup.waitForLoadState("domcontentloaded");
    expect(popup.url()).toBe(new URL(job.applyUrl).toString());
    await popup.close();
  });

  test("save → tracker works with a real job", async ({ page }) => {
    await page.goto("/jobs?level=intern");
    const first = page.getByTestId("job-card").first();
    const title = (await first.getByTestId("job-title").innerText()).trim();
    await first.getByTestId("save-job").click();
    await page.goto("/saved");
    await expect(page.getByTestId("saved-row").first()).toContainText(title);
  });
});

test.describe("real API · live pill", () => {
  test("a job ingested while /jobs is open shows the “new jobs” pill", async ({ page }) => {
    const key = `e2e-live-${Date.now()}`;
    await page.goto("/jobs?level=fresher");
    await expect(page.getByTestId("job-card").first()).toBeVisible();
    await page.waitForTimeout(1500); // EventSource connects after hydration
    const now = new Date().toISOString();
    const job = {
      fingerprint: `e2e|${key}`,
      source: "e2e-test",
      sourceName: "E2E test",
      sourceKind: "job_board",
      sourceJobId: key,
      sourceUrl: `https://example.com/jobs/${key}`,
      target: "e2e",
      applyUrl: `https://example.com/jobs/${key}`,
      title: `E2E Live Pill Probe ${key}`,
      company: "EasyJobs QA",
      companySlug: "easyjobs-qa",
      companyDomain: null,
      companyLogoUrl: null,
      companyTags: [],
      locations: [{ raw: "Bengaluru", city: "Bengaluru", state: "Karnataka", country: "IN" }],
      workMode: "onsite",
      isRemote: false,
      jobType: "full_time",
      experienceLevel: "fresher",
      experienceMin: 0,
      experienceMax: 0,
      batches: [],
      degrees: [],
      salary: null,
      salaryInrYearlyMin: null,
      salaryInrYearlyMax: null,
      skills: [],
      category: "software_engineering",
      department: null,
      descriptionHtml: "<p>Synthetic job used by the W2 end-to-end test. It is closed again right after the test.</p>",
      descriptionText: "Synthetic job used by the W2 end-to-end test. It is closed again right after the test.",
      summary: null,
      postedAt: now,
      validThrough: null,
      qualityScore: 0.5,
      tags: [],
      extra: {},
    };
    const headers = { "content-type": "application/json", "x-ingest-key": INGEST_KEY };
    const ingest = await fetch(`${API}/v1/ingest/jobs`, { method: "POST", headers, body: JSON.stringify({ source: "e2e-test", runId: key, jobs: [job] }) });
    try {
      expect(ingest.status).toBe(200);
      const result = (await ingest.json()) as { inserted: number; rejected: unknown[] };
      expect(result.rejected).toEqual([]);
      await expect(page.getByTestId("live-pill")).toBeVisible({ timeout: 20_000 });
      await page.getByTestId("live-pill").click();
      await expect(page.getByTestId("job-card").filter({ hasText: key }).first()).toBeVisible();
    } finally {
      // close the probe again: a sweep of its (source, target) with nothing seen
      await fetch(`${API}/v1/ingest/sweep`, { method: "POST", headers, body: JSON.stringify({ source: "e2e-test", target: "e2e", seenSourceJobIds: [] }) });
    }
  });
});

test.describe("real API · accessibility (axe)", () => {
  for (const theme of ["light", "dark"] as const) {
    test(`no serious or critical violations on /, /jobs, a job page, /companies and /saved (${theme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: theme });
      await page.addInitScript((t) => localStorage.setItem("theme", t), theme);
      const list = await api<{ data: ApiJob[] }>("/v1/jobs?pageSize=1");
      const job = list.data[0]!;
      for (const path of ["/", "/jobs", `/jobs/${job.id}/${job.slug}`, "/companies", "/saved"]) {
        await page.goto(path);
        await page.waitForLoadState("networkidle");
        const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
        const bad = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
        expect(bad.map((v) => `${path}: ${v.id} (${v.impact}) ×${v.nodes.length} — ${v.nodes[0]?.target.join(" ")}`), path).toEqual([]);
      }
    });
  }
});
