import { defineConfig, devices } from "@playwright/test";

/**
 * E2E against the REAL API (W2): builds the app with NEXT_PUBLIC_USE_MOCKS=0 pointed at E2E_API_URL (default: the
 * root .env API_URL, else http://localhost:4000) and starts it on E2E_PORT (default 3011). The API must be running
 * (`pnpm dev`, or `pnpm --filter @easyjobs/api dev`) with real data (`pnpm scrape:once`).
 *   pnpm --filter @easyjobs/web e2e:real
 * Runs the data-agnostic mock-mode specs (e2e/) plus the real-data specs (e2e-real/).
 */
const port = Number(process.env.E2E_PORT ?? 3011);
const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${port}`;
const apiURL = (process.env.E2E_API_URL ?? process.env.API_URL ?? "http://localhost:4000").replace(/\/+$/, "");
process.env.E2E_API_URL = apiURL;

export default defineConfig({
  testDir: ".",
  testMatch: ["e2e/**/*.spec.ts", "e2e-real/**/*.spec.ts"],
  testIgnore: ["e2e/screens/**"],
  outputDir: "./test-results/e2e-real",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : 4,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report-real" }]],
  use: { baseURL, trace: "retain-on-failure", screenshot: "only-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } }, testIgnore: ["e2e/screens/**", "**/*.mobile.spec.ts"] },
    { name: "mobile", use: { ...devices["Pixel 7"], browserName: "chromium" }, testMatch: ["**/*.mobile.spec.ts"] },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: `pnpm exec next build && pnpm exec next start --port ${port}`,
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 600_000,
        env: { NEXT_PUBLIC_USE_MOCKS: "0", NEXT_PUBLIC_API_URL: apiURL, API_URL: apiURL, NEXT_PUBLIC_SITE_URL: baseURL },
      },
});
