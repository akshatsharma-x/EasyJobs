import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { validateJobInput, type JobInput } from "@easyjobs/contract";

const pkg = join(dirname(fileURLToPath(import.meta.url)), "..");
const tsx = join(pkg, "node_modules", ".bin", "tsx");
const tmp = mkdtempSync(join(tmpdir(), "normalize-cli-"));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

function run(args: string[], input?: string): { status: number | null; stdout: string; stderr: string } {
  const r = spawnSync(tsx, ["src/cli.ts", ...args], { cwd: pkg, encoding: "utf8", input, env: { ...process.env, INIT_CWD: pkg, ANTHROPIC_API_KEY: "" } });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

describe("cli", () => {
  it("normalizes RawJob JSONL to JobInput JSONL on stdout and prints distributions on stderr", () => {
    const r = run(["test/fixtures/raw-jobs.jsonl", "--now", "2026-11-26T00:00:00Z"]);
    expect(r.status).toBe(0);
    const lines = r.stdout.trim().split("\n");
    expect(lines).toHaveLength(15);
    for (const l of lines) expect(validateJobInput(JSON.parse(l) as JobInput)).toEqual([]);
    expect(r.stderr).toMatch(/normalized 15 jobs from 1 file\(s\)/);
    for (const label of ["jobType", "level", "workMode", "category", "fill rates", "top cities", "top skills", "batches", "degrees", "quality"]) {
      expect(r.stderr).toContain(label);
    }
  }, 60_000);

  it("counts unparseable lines, reads stdin, supports --stats-only and --out", () => {
    const fixture = readFileSync(join(pkg, "test/fixtures/raw-jobs.jsonl"), "utf8").split("\n")[0] as string;
    const r = run(["-", "--stats-only", "--now", "2026-11-26T00:00:00Z"], `${fixture}\n{not json\n\n${fixture}\n`);
    expect(r.status).toBe(0);
    expect(r.stdout).toBe("");
    expect(r.stderr).toMatch(/normalized 2 jobs .* 1 unparseable lines/);
    expect(r.stderr).toMatch(/fingerprint\s+k 2/);

    const input = join(tmp, "in.jsonl");
    const out = join(tmp, "out.jsonl");
    writeFileSync(input, `${fixture}\n`);
    const r2 = run([input, "--out", out]);
    expect(r2.status).toBe(0);
    expect(readFileSync(out, "utf8").trim().split("\n")).toHaveLength(1);
  }, 60_000);

  it("fails clearly on a missing file or unknown option", () => {
    const missing = run(["nope.jsonl"]);
    expect(missing.status).toBe(2);
    expect(missing.stderr).toMatch(/File not found: nope\.jsonl/);
    expect(run(["test/fixtures/raw-jobs.jsonl", "--bogus"]).status).toBe(2);
    const help = run(["--help"]);
    expect(help.status).toBe(0);
    expect(help.stdout).toMatch(/Usage:/);
    expect(help.stdout).toContain("--llm-max");
  }, 60_000);

  it("--llm is a no-op without ANTHROPIC_API_KEY and validates --llm-max", () => {
    const r = run(["test/fixtures/raw-jobs.jsonl", "--stats-only", "--llm", "--llm-max", "5"]);
    expect(r.status).toBe(0);
    expect(r.stderr).toContain("ANTHROPIC_API_KEY is not set");
    expect(r.stderr).not.toMatch(/llm: \d+ request/);
    const bad = run(["test/fixtures/raw-jobs.jsonl", "--llm", "--llm-max", "-1"]);
    expect(bad.status).toBe(2);
    expect(bad.stderr).toMatch(/--llm-max must be a non-negative integer/);
  }, 60_000);
});
