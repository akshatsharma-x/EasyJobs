import path from "node:path";
import { loadEnvConfig } from "@next/env";
import type { NextConfig } from "next";

// Load the repo-root .env (prompts.md §0.7). `next` runs with cwd = apps/web.
const repoRoot = path.resolve(process.cwd(), "../..");
loadEnvConfig(repoRoot);

const nextConfig: NextConfig = {
  transpilePackages: ["@easyjobs/contract"],
  reactStrictMode: true,
  poweredByHeader: false,
  turbopack: { root: repoRoot },
  experimental: {
    optimizePackageImports: ["radix-ui", "motion"],
    // Fewer, larger chunks per route: first visits on mobile are dominated by request count, not cache reuse.
    turbopackChunking: { minChunkSize: 120_000, maxChunkCountPerGroup: 10 },
  },
};

export default nextConfig;
