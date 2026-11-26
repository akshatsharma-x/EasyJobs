import { defineConfig } from "@playwright/test";

/** Visual review: `pnpm --filter @easyjobs/web screenshots` → apps/web/screenshots/*.png */
const port = Number(process.env.E2E_PORT ?? 3005);
const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${port}`;

export default defineConfig({
  testDir: "./e2e/screens",
  outputDir: "./test-results/screens",
  fullyParallel: true,
  workers: 4,
  timeout: 90_000,
  reporter: [["list"]],
  use: { baseURL, browserName: "chromium", reducedMotion: "reduce" },
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: `pnpm exec next build && pnpm exec next start --port ${port}`,
        url: baseURL,
        reuseExistingServer: true,
        timeout: 600_000,
        env: { NEXT_PUBLIC_USE_MOCKS: "1", NEXT_PUBLIC_SITE_URL: baseURL },
      },
});
