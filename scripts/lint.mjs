#!/usr/bin/env node
/**
 * `pnpm lint` — strict TypeScript lint over every workspace package (no extra tool or config):
 * unused locals/imports, switch fallthrough, unreachable code, unused labels, implicit returns.
 * Runs packages in parallel; exits 1 if any package has a finding.
 */
import { spawn } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const FLAGS = ["--noEmit", "--noUnusedLocals", "--noFallthroughCasesInSwitch", "--allowUnreachableCode", "false", "--allowUnusedLabels", "false", "--noImplicitReturns"];
const dirs = ["apps", "packages", "packages/scrapers"].flatMap((d) =>
  readdirSync(join(root, d), { withFileTypes: true })
    .filter((e) => e.isDirectory() && existsSync(join(root, d, e.name, "tsconfig.json")))
    .map((e) => join(d, e.name)),
);

const run = (dir) =>
  new Promise((resolve) => {
    const tsc = join(root, dir, "node_modules", ".bin", "tsc");
    const child = spawn(existsSync(tsc) ? tsc : "tsc", ["-p", ".", ...FLAGS], { cwd: join(root, dir) });
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (out += d));
    child.on("close", (code) => resolve({ dir, code, out }));
  });

const results = [];
for (let i = 0; i < dirs.length; i += 4) results.push(...(await Promise.all(dirs.slice(i, i + 4).map(run))));
let failed = 0;
for (const r of results) {
  if (r.code === 0) console.log(`✓ ${r.dir}`);
  else {
    failed++;
    console.log(`✗ ${r.dir}\n${r.out.trim().replace(/^/gm, "    ")}`);
  }
}
console.log(failed ? `\nlint: ${failed} package(s) with findings` : `\nlint: ${results.length} packages clean`);
process.exit(failed ? 1 : 0);
