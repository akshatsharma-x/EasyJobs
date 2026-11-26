import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { detectAts } from "../src/ats";
import type { FixtureCase } from "../scripts/make-fixtures";

const DIR = fileURLToPath(new URL("./fixtures/html/", import.meta.url));
const cases = JSON.parse(readFileSync(join(DIR, "manifest.json"), "utf8")) as FixtureCase[];

describe("detect-ats on saved careers pages", () => {
  it("has fixtures for many ATS families", () => {
    expect(cases.length).toBeGreaterThanOrEqual(15);
    expect(new Set(cases.map((c) => c.expected.ats)).size).toBeGreaterThanOrEqual(10);
  });

  it.each(cases.map((c) => [c.file, c] as const))("%s", (_file, c) => {
    const html = readFileSync(join(DIR, c.file), "utf8");
    const best = detectAts({ url: c.url, html })[0];
    expect(best, `no detection in ${c.file}`).toBeDefined();
    expect({ ats: best!.ats, token: best!.token }).toEqual(c.expected);
  });

  it("finds nothing on a careers page without an ATS", () => {
    const html = `<!doctype html><html><head><title>Careers at Acme</title></head><body>
      <h1>Join us</h1><p>Email jobs@acme.example to apply.</p><a href="/about">About</a>
      <a href="https://www.linkedin.com/company/acme/jobs">LinkedIn</a></body></html>`;
    expect(detectAts({ url: "https://acme.example/careers", html })).toEqual([]);
  });
});
