/**
 * Test helpers: an isolated database per test file — in-memory PGlite by default, or a throw-away
 * database on a real server when TEST_DATABASE_URL is set (same suite, both drivers).
 */
import { createHash, randomBytes } from "node:crypto";
import postgres from "postgres";
import type { JobInput, SourceKind } from "@easyjobs/contract";
import { createDatabase, type Database } from "../src/client";
import { runMigrations } from "../src/migrate";

export interface TestDb {
  db: Database;
  cleanup(): Promise<void>;
}

export async function createTestDb(): Promise<TestDb> {
  const serverUrl = process.env.TEST_DATABASE_URL?.trim();
  if (!serverUrl) {
    const db = await createDatabase({ url: null, pgliteDir: "memory://" });
    await runMigrations(db);
    return { db, cleanup: () => db.close() };
  }
  const name = `easyjobs_test_${randomBytes(5).toString("hex")}`;
  const admin = postgres(serverUrl, { max: 1, onnotice: () => {} });
  await admin.unsafe(`CREATE DATABASE ${name}`);
  const url = new URL(serverUrl);
  url.pathname = `/${name}`;
  const db = await createDatabase({ url: url.toString(), poolMax: 8, appName: "easyjobs-test" });
  await runMigrations(db);
  return {
    db,
    async cleanup() {
      await db.close();
      await admin.unsafe(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
      await admin.end();
    },
  };
}

const sha1 = (s: string): string => createHash("sha1").update(s).digest("hex");

export const OFFICIAL_URL = (n: number | string): string => `https://boards.greenhouse.io/acme/jobs/${n}`;

/** Fixed reference time for deterministic tests. */
export const TEST_NOW = new Date("2026-11-20T12:00:00.000Z");

/** A valid JobInput with sensible defaults; override anything. */
export function makeJob(over: Partial<JobInput> & { key?: string } = {}): JobInput {
  const { key, ...rest } = over;
  const k = key ?? rest.sourceJobId ?? randomBytes(4).toString("hex");
  const sourceKind: SourceKind = rest.sourceKind ?? "ats";
  const base: JobInput = {
    fingerprint: `k:${sha1(`greenhouse:${k}`)}`,
    source: "greenhouse",
    sourceName: "Greenhouse",
    sourceKind,
    sourceJobId: k,
    sourceUrl: OFFICIAL_URL(k),
    target: "acme",
    applyUrl: OFFICIAL_URL(k),
    title: "Software Engineer",
    company: "Acme",
    companySlug: "acme",
    companyDomain: "acme.com",
    companyLogoUrl: null,
    companyTags: ["startup"],
    locations: [{ raw: "Bengaluru, Karnataka, India", city: "Bengaluru", state: "Karnataka", country: "IN" }],
    workMode: "onsite",
    isRemote: false,
    jobType: "full_time",
    experienceLevel: "entry",
    experienceMin: 0,
    experienceMax: 2,
    batches: [],
    degrees: ["B.Tech"],
    salary: null,
    salaryInrYearlyMin: null,
    salaryInrYearlyMax: null,
    skills: ["TypeScript", "React"],
    category: "software_engineering",
    department: "Engineering",
    descriptionHtml: "<p>Build things.</p>",
    descriptionText: "Build things.",
    summary: "Build things.",
    postedAt: new Date(TEST_NOW.getTime() - 3_600_000).toISOString(),
    validThrough: null,
    qualityScore: 70,
    tags: [],
    extra: {},
  };
  return { ...base, ...rest };
}

export const daysAgo = (d: number, from: Date = new Date()): string => new Date(from.getTime() - d * 86_400_000).toISOString();
