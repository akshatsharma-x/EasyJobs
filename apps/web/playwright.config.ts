import { defineConfig, devices } from "@playwright/test";

/**
 * E2E (mock mode). Builds and starts the app on E2E_PORT (default 3005), or reuses E2E_BASE_URL.
 *   pnpm --filter @easyjobs/web e2e
 */
const port = Number(process.env.E2E_PORT ?? 3005);
const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${port}`;

export default defineConfig({
  testDir: "./e2e",
  testIgnore: ["screens/**"],
  outputDir: "./test-results/e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : 4,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  use: { baseURL, trace: "retain-on-failure", screenshot: "only-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } }, testIgnore: ["screens/**", "**/*.mobile.spec.ts"] },
    { name: "mobile", use: { ...devices["Pixel 7"], browserName: "chromium" }, testMatch: ["**/*.mobile.spec.ts"] },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: `pnpm exec next build && pnpm exec next start --port ${port}`,
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 600_000,
        env: { NEXT_PUBLIC_USE_MOCKS: "1", NEXT_PUBLIC_SITE_URL: baseURL },
      },
});
