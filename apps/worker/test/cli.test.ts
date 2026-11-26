import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterAll, describe, expect, it } from "vitest";
import { validateJobInput, type JobInput } from "@easyjobs/contract";
import { WORKER_DIR } from "../src/paths";
import { cleanupTempDirs, tempDir } from "./helpers";

const exec = promisify(execFile);
const TSX = join(WORKER_DIR, "node_modules", ".bin", "tsx");
afterAll(cleanupTempDirs);

function cliEnv(extra: Record<string, string>): NodeJS.ProcessEnv {
  const base = tempDir("p05-cli-");
  return {
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    WORKER_REPO_ROOT: tempDir("p05-cli-repo-"),
    WORKER_STATE_DIR: join(base, ".state"),
    WORKER_SPOOL_DIR: join(base, ".spool"),
    WORKER_OUT_DIR: join(base, "out"),
    API_URL: "http://127.0.0.1:9",
    ...extra,
  };
}

// Each case spawns `tsx` child processes (cold transpile); allow for a loaded machine.
describe("cli", { timeout: 90_000 }, () => {
  it("once --source demo --dry-run writes valid JobInputs to out/demo.jsonl", async () => {
    const env = cliEnv({});
    const { stdout } = await exec(TSX, ["src/cli.ts", "once", "--source", "demo", "--dry-run"], { cwd: WORKER_DIR, env });
    expect(stdout).toMatch(/ok\s+demo .*30 read, 30 valid, 0 invalid/);
    const lines = readFileSync(join(env.WORKER_OUT_DIR!, "demo.jsonl"), "utf8").trim().split("\n");
    expect(lines).toHaveLength(30);
    for (const line of lines) expect(validateJobInput(JSON.parse(line) as JobInput)).toEqual([]);
  });

  it("once --limit stops early; unknown sources are a usage error (exit 2)", async () => {
    const env = cliEnv({});
    const { stdout } = await exec(TSX, ["src/cli.ts", "once", "-s", "demo", "--limit", "5", "--dry-run"], { cwd: WORKER_DIR, env });
    expect(stdout).toMatch(/5 read, 5 valid/);
    await expect(exec(TSX, ["src/cli.ts", "once", "--source", "nope"], { cwd: WORKER_DIR, env })).rejects.toMatchObject({ code: 2, stderr: expect.stringMatching(/unknown source "nope"\. Available: demo/) });
  });

  it("list --json shows scrapers, the registry choice and tasks", async () => {
    const env = cliEnv({ WORKER_DEMO: "1" });
    const { stdout } = await exec(TSX, ["src/cli.ts", "list", "--json"], { cwd: WORKER_DIR, env });
    const out = JSON.parse(stdout) as { scrapers: { id: string }[]; registry: { kind: string; companies: number }; tasks: { id: string; next: string }[] };
    expect(out.scrapers.map((s) => s.id)).toEqual(["demo"]);
    expect(out.registry).toMatchObject({ kind: "fallback", companies: 10 });
    expect(out.tasks).toEqual([expect.objectContaining({ id: "demo", next: expect.stringMatching(/^on start/) })]);
  });
});
