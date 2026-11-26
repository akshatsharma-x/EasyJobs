import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    // Live smoke tests (LIVE=1) talk to real APIs through the polite client.
    testTimeout: process.env.LIVE === "1" ? 180_000 : 10_000,
  },
});
